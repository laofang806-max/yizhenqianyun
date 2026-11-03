export type EmbroideryColor = "black" | "red" | "yellow" | "blue";
export type PreviewMode = "original" | "path";
export type CanvasTool = "move" | "zoom" | "rotate";

export type FrameSize = {
  width: number;
  height: number;
};

export type PositionMm = {
  x: number;
  y: number;
};

export type PointMm = PositionMm & {
  color: EmbroideryColor;
};

export type PathSegment = {
  start: PointMm;
  end: PointMm;
};

export type ColorRegion = {
  id: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  pixelCount: number;
};

export type ColorMask = {
  labels?: Int32Array;
  data: Uint8Array;
  regions: ColorRegion[];
};

export type ColorAnalysis = {
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  masks: Record<EmbroideryColor, ColorMask>;
};

export type ColorPath = {
  color: EmbroideryColor;
  segments: PathSegment[];
  points: PointMm[];
  lengthMm: number;
};

export type PathSet = Record<EmbroideryColor, ColorPath>;

export const COLOR_ORDER: EmbroideryColor[] = ["black", "red", "yellow", "blue"];

export const COLOR_META: Record<
  EmbroideryColor,
  { label: string; english: string; hex: string; rgb: [number, number, number] }
> = {
  black: { label: "黑色", english: "Black", hex: "#17191c", rgb: [23, 25, 28] },
  red: { label: "红色", english: "Red", hex: "#f0444b", rgb: [240, 68, 75] },
  yellow: { label: "黄色", english: "Yellow", hex: "#ffd84d", rgb: [255, 216, 77] },
  blue: { label: "蓝色", english: "Blue", hex: "#2788ff", rgb: [39, 136, 255] },
};
