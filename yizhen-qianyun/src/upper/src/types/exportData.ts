import type { EmbroideryColor, FrameSize } from "./embroidery";

export type StitchAction = "jump" | "stitch";

export type ExportPoint = {
  x: number;
  y: number;
  action: StitchAction;
};

export type ExportSegment = {
  points: [ExportPoint, ExportPoint];
};

export type ExportColorPath = {
  color: EmbroideryColor;
  segments: ExportSegment[];
};

export type ExportMetadata = {
  thread?: { id:string; label:string; hex:string; index:number; total:number; mergeDistance:number };
  image: {
    name: string;
    width: number;
    height: number;
  };
  generation: {
    tolerance: number;
    scale: number;
    rotationDegrees: number;
    positionXmm: number;
    positionYmm: number;
  };
};

export type StandardizedEmbroidery = {
  version: 1;
  frame: FrameSize & { origin: "top-left" };
  unit: "mm";
  coordinatePrecisionMm: 0.01;
  colors: EmbroideryColor[];
  executionOrder: EmbroideryColor[];
  paths: Record<EmbroideryColor, ExportColorPath>;
  statistics: {
    pathCountByColor: Record<EmbroideryColor, number>;
    stitchPointCountByColor: Record<EmbroideryColor, number>;
    totalStitchPointCount: number;
    totalCommandPointCount: number;
  };
  metadata: ExportMetadata;
};
