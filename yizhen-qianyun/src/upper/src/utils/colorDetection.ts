import {
  COLOR_META,
  COLOR_ORDER,
  type ColorAnalysis,
  type ColorMask,
  type ColorRegion,
  type EmbroideryColor,
} from "../types/embroidery";
import { rasterizeImage } from "./imageProcessing";

const HUE_TARGETS: Record<EmbroideryColor, number> = {
  black: 0,
  red: 0,
  yellow: 60,
  blue: 230,
};

function hueDistance(first: number, second: number): number {
  const difference = Math.abs(first - second);
  return Math.min(difference, 360 - difference);
}

function classifyPixel(
  red: number,
  green: number,
  blue: number,
  tolerance: number,
  blackThreshold = 58,
): EmbroideryColor | null {
  const max = Math.max(red, green, blue);
  if (max < blackThreshold) return "black";
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  if (chroma < 34 || max === 0) return null;

  const saturation = chroma / max;
  if (saturation < 0.27) return null;

  let hue = 0;
  if (max === red) hue = 60 * (((green - blue) / chroma) % 6);
  else if (max === green) hue = 60 * ((blue - red) / chroma + 2);
  else hue = 60 * ((red - green) / chroma + 4);
  if (hue < 0) hue += 360;

  const redDistance = hueDistance(hue, HUE_TARGETS.red);
  const yellowDistance = hueDistance(hue, HUE_TARGETS.yellow);
  const blueDistance = hueDistance(hue, HUE_TARGETS.blue);
  let nearestColor: EmbroideryColor = "red";
  let nearestDistance = redDistance;
  if (yellowDistance < nearestDistance) {
    nearestColor = "yellow";
    nearestDistance = yellowDistance;
  }
  if (blueDistance < nearestDistance) {
    nearestColor = "blue";
    nearestDistance = blueDistance;
  }
  const hueLimit = Math.min(70, Math.max(4, tolerance));
  return nearestDistance <= hueLimit ? nearestColor : null;
}

function cleanMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const cleaned = new Uint8Array(mask);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const neighbors =
        mask[index - width] +
        mask[index - 1] +
        mask[index + 1] +
        mask[index + width];
      if (mask[index] && neighbors === 0) cleaned[index] = 0;
      else if (!mask[index] && neighbors === 4) cleaned[index] = 1;
    }
  }
  return cleaned;
}

export function findRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  preserveSmallDetails: boolean,
): { regions: ColorRegion[]; mask: Uint8Array; labels: Int32Array } {
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const filteredMask = new Uint8Array(mask.length);
  const labels = new Int32Array(mask.length);
  const minPixels = preserveSmallDetails ? 1 : Math.max(4, Math.round((width * height) / 100_000));
  const regions: ColorRegion[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let stackSize = 1;
    let cursor = 0;
    stack[0] = start;
    visited[start] = 1;
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    let pixelCount = 0;

    while (cursor < stackSize) {
      const index = stack[cursor++];
      const x = index % width;
      const y = Math.floor(index / width);
      pixelCount += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);

      const leftNeighbor = x > 0 ? index - 1 : -1;
      const rightNeighbor = x + 1 < width ? index + 1 : -1;
      const above = y > 0 ? index - width : -1;
      const below = y + 1 < height ? index + width : -1;
      if (leftNeighbor >= 0 && mask[leftNeighbor] && !visited[leftNeighbor]) {
        visited[leftNeighbor] = 1;
        stack[stackSize++] = leftNeighbor;
      }
      if (rightNeighbor >= 0 && mask[rightNeighbor] && !visited[rightNeighbor]) {
        visited[rightNeighbor] = 1;
        stack[stackSize++] = rightNeighbor;
      }
      if (above >= 0 && mask[above] && !visited[above]) {
        visited[above] = 1;
        stack[stackSize++] = above;
      }
      if (below >= 0 && mask[below] && !visited[below]) {
        visited[below] = 1;
        stack[stackSize++] = below;
      }
    }

    if (pixelCount >= minPixels) {
      for (let index = 0; index < stackSize; index += 1) {
        filteredMask[stack[index]] = 1;
        labels[stack[index]] = regions.length + 1;
      }
      regions.push({ id: regions.length + 1, left, top, right, bottom, pixelCount });
    }
  }
  return { regions, mask: filteredMask, labels };
}

export function detectColorRegions(
  image: HTMLImageElement,
  tolerance: number,
  options: { preserveSmallDetails?: boolean; lineArt?: boolean } = {},
): ColorAnalysis {
  const preserveSmallDetails = options.lineArt || (options.preserveSmallDetails ?? false);
  // Keep the native 640px drawing canvas so small brush marks survive rasterization.
  const raster = rasterizeImage(image, preserveSmallDetails ? 1280 : 360);
  const masks: Record<EmbroideryColor, ColorMask> = {
    red: { data: new Uint8Array(raster.width * raster.height), regions: [] },
    black: { data: new Uint8Array(raster.width * raster.height), regions: [] },
    yellow: { data: new Uint8Array(raster.width * raster.height), regions: [] },
    blue: { data: new Uint8Array(raster.width * raster.height), regions: [] },
  };
  const { data } = raster.pixels;

  for (let pixel = 0; pixel < raster.width * raster.height; pixel += 1) {
    const offset = pixel * 4;
    const color = classifyPixel(data[offset], data[offset + 1], data[offset + 2], tolerance, options.lineArt ? 110 : 58);
    if (color && data[offset + 3] > 40) masks[color].data[pixel] = 1;
  }

  for (const color of COLOR_ORDER) {
    if (!preserveSmallDetails) masks[color].data = cleanMask(masks[color].data, raster.width, raster.height);
    const result = findRegions(masks[color].data, raster.width, raster.height, preserveSmallDetails);
    masks[color].labels = result.labels;
    masks[color].data = result.mask;
    masks[color].regions = result.regions;
  }

  return {
    width: raster.width,
    height: raster.height,
    sourceWidth: image.naturalWidth,
    sourceHeight: image.naturalHeight,
    masks,
  };
}

export async function quantizeEmbroideryArtwork(source: Blob): Promise<Blob> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(source);
  } catch {
    throw new Error("豆包返回的图片无法解码，请重试或更换模型。");
  }

  if (image.width * image.height > 40_000_000) {
    image.close();
    throw new Error("豆包生成的图片超过 4000 万像素，无法安全处理。");
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    image.close();
    throw new Error("当前浏览器无法处理豆包生成的图片。");
  }

  try {
    context.drawImage(image, 0, 0);
  } finally {
    image.close();
  }

  let imageData: ImageData;
  try {
    imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    throw new Error("无法读取豆包生成图片的像素数据。");
  }

  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    const color = classifyPixel(
      imageData.data[offset] ?? 0,
      imageData.data[offset + 1] ?? 0,
      imageData.data[offset + 2] ?? 0,
      70,
    );
    const [red, green, blue] = color
      ? COLOR_META[color].rgb
      : [255, 255, 255];
    imageData.data[offset] = red;
    imageData.data[offset + 1] = green;
    imageData.data[offset + 2] = blue;
    imageData.data[offset + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("无法导出处理后的刺绣图片。"));
    }, "image/png");
  });
}
