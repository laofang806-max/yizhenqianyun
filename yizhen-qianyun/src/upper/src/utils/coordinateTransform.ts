import type { FrameSize, PositionMm } from "../types/embroidery";

export type ImageSizeMm = { width: number; height: number };

export function getImageSizeMm(
  sourceWidth: number,
  sourceHeight: number,
  frame: FrameSize,
  scale: number,
): ImageSizeMm {
  const fitScale = Math.min(frame.width / sourceWidth, frame.height / sourceHeight) * scale;
  return { width: sourceWidth * fitScale, height: sourceHeight * fitScale };
}

export function imagePixelToFrameMm(
  pixelX: number,
  pixelY: number,
  rasterWidth: number,
  rasterHeight: number,
  imageSize: ImageSizeMm,
  frame: FrameSize,
  position: PositionMm,
  rotationDegrees: number,
): { x: number; y: number } {
  const localX = ((pixelX / rasterWidth) - 0.5) * imageSize.width;
  const localY = ((pixelY / rasterHeight) - 0.5) * imageSize.height;
  const radians = (rotationDegrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: frame.width / 2 + position.x + localX * cosine - localY * sine,
    y: frame.height / 2 + position.y + localX * sine + localY * cosine,
  };
}

export function isImageOutsideFrame(
  size: ImageSizeMm,
  frame: FrameSize,
  position: PositionMm,
  rotationDegrees: number,
): boolean {
  const radians = (rotationDegrees * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  const halfWidth = (size.width * cosine + size.height * sine) / 2;
  const halfHeight = (size.width * sine + size.height * cosine) / 2;
  return (
    position.x - halfWidth < -frame.width / 2 ||
    position.x + halfWidth > frame.width / 2 ||
    position.y - halfHeight < -frame.height / 2 ||
    position.y + halfHeight > frame.height / 2
  );
}
