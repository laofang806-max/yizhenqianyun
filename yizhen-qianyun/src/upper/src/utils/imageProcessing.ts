export type RasterizedImage = {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pixels: ImageData;
};

export function rasterizeImage(
  image: HTMLImageElement,
  maxDimension = 360,
): RasterizedImage {
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("图片尚未完成加载，无法读取像素。");
  }

  const ratio = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("当前浏览器无法创建图片处理 Canvas。");
  }

  context.drawImage(image, 0, 0, width, height);
  try {
    return { canvas, width, height, pixels: context.getImageData(0, 0, width, height) };
  } catch {
    throw new Error("无法读取图片像素，请确认所选图片可在浏览器中解码。");
  }
}
