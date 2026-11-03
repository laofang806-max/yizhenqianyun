import {
  COLOR_ORDER,
  type EmbroideryColor,
  type FrameSize,
  type PathSet,
} from "../types/embroidery";
import type {
  ExportColorPath,
  ExportMetadata,
  ExportPoint,
  StandardizedEmbroidery,
} from "../types/exportData";

export const COORDINATE_SCALE = 100;
export const MAX_UINT32 = 0xffff_ffff;

function toCoordinateUnits(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 必须是有效数值。`);
  }
  const encoded = Math.round(value * COORDINATE_SCALE);
  if (!Number.isSafeInteger(encoded) || encoded < 0 || encoded > MAX_UINT32) {
    throw new Error(`${label} 超出 BIN 坐标编码范围。`);
  }
  return encoded / COORDINATE_SCALE;
}

function validateFrame(frame: FrameSize): void {
  if (
    !Number.isFinite(frame.width) ||
    !Number.isFinite(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    throw new Error("画框宽高必须为大于 0 的有效数值。");
  }
  toCoordinateUnits(frame.width, "画框宽度");
  toCoordinateUnits(frame.height, "画框高度");
}

function standardizePoint(
  point: { x: number; y: number; color: EmbroideryColor },
  frame: FrameSize,
  action: ExportPoint["action"],
): ExportPoint {
  if (!COLOR_ORDER.includes(point.color)) {
    throw new Error("路径包含不支持的颜色，仅允许 black、red、yellow、blue。");
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("路径坐标必须是有效数值。");
  }
  if (point.x < 0 || point.y < 0 || point.x > frame.width || point.y > frame.height) {
    throw new Error(`路径点 (${point.x}, ${point.y}) mm 超出画框范围。`);
  }
  return {
    x: toCoordinateUnits(point.x, "X 坐标"),
    y: toCoordinateUnits(point.y, "Y 坐标"),
    action,
  };
}

export function standardizePaths(
  paths: PathSet,
  frame: FrameSize,
  executionOrder: EmbroideryColor[],
  metadata: ExportMetadata,
): StandardizedEmbroidery {
  validateFrame(frame);
  if (
    executionOrder.length !== COLOR_ORDER.length ||
    new Set(executionOrder).size !== COLOR_ORDER.length ||
    executionOrder.some((color, index) => color !== COLOR_ORDER[index])
  ) {
    throw new Error("颜色执行顺序固定为 black、red、yellow、blue。");
  }

  const normalizedPaths = {} as Record<EmbroideryColor, ExportColorPath>;
  const pathCountByColor = { black: 0, red: 0, yellow: 0, blue: 0 };
  const stitchPointCountByColor = { black: 0, red: 0, yellow: 0, blue: 0 };
  let totalCommandPointCount = 0;

  for (const color of COLOR_ORDER) {
    const colorPath = paths[color];
    if (!colorPath || colorPath.color !== color || !Array.isArray(colorPath.segments)) {
      throw new Error(`缺少有效的 ${color} 路径数据。`);
    }
    const segments = colorPath.segments.map((segment) => ({
      points: [
        standardizePoint(segment.start, frame, "jump"),
        standardizePoint(segment.end, frame, "stitch"),
      ] as [ExportPoint, ExportPoint],
    }));
    normalizedPaths[color] = { color, segments };
    pathCountByColor[color] = segments.length;
    stitchPointCountByColor[color] = segments.length;
    totalCommandPointCount += segments.length * 2;
  }

  if (totalCommandPointCount === 0) {
    throw new Error("没有有效针迹路径，无法导出。");
  }
  if (!Number.isSafeInteger(totalCommandPointCount) || totalCommandPointCount > MAX_UINT32) {
    throw new Error("路径点总数超出文件格式支持范围。");
  }

  const standardized: StandardizedEmbroidery = {
    version: 1,
    frame: { width: toCoordinateUnits(frame.width, "画框宽度"), height: toCoordinateUnits(frame.height, "画框高度"), origin: "top-left" },
    unit: "mm",
    coordinatePrecisionMm: 0.01,
    colors: [...COLOR_ORDER],
    executionOrder: [...executionOrder],
    paths: normalizedPaths,
    statistics: {
      pathCountByColor,
      stitchPointCountByColor,
      totalStitchPointCount: COLOR_ORDER.reduce(
        (sum, color) => sum + stitchPointCountByColor[color],
        0,
      ),
      totalCommandPointCount,
    },
    metadata,
  };
  validateStandardizedEmbroidery(standardized);
  return standardized;
}

export function validateStandardizedEmbroidery(data: StandardizedEmbroidery): void {
  if (data.version !== 1 || data.unit !== "mm" || data.coordinatePrecisionMm !== 0.01 ||
    data.frame.origin !== "top-left") {
    throw new Error("标准路径对象的版本、单位、精度或坐标原点无效。");
  }
  validateFrame(data.frame);
  if (
    data.colors.length !== COLOR_ORDER.length ||
    COLOR_ORDER.some((color) => !data.colors.includes(color)) ||
    data.executionOrder.length !== COLOR_ORDER.length ||
    data.executionOrder.some((color, index) => color !== COLOR_ORDER[index])
  ) {
    throw new Error("标准路径对象的颜色集合或固定执行顺序无效。");
  }
  const counts = { black: 0, red: 0, yellow: 0, blue: 0 };
  let pointCount = 0;
  for (const color of COLOR_ORDER) {
    const path = data.paths[color];
    if (!path || path.color !== color || !Array.isArray(path.segments)) {
      throw new Error(`标准路径对象缺少有效的 ${color} 路径。`);
    }
    counts[color] = path.segments.length;
    for (const segment of path.segments) {
      if (segment.points.length !== 2) throw new Error("每条路径段必须包含两个坐标点。");
      segment.points.forEach((point, index) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
          point.x < 0 || point.y < 0 || point.x > data.frame.width || point.y > data.frame.height) {
          throw new Error("路径包含非数值坐标或超出画框的坐标。");
        }
        if (
          Math.abs(point.x * COORDINATE_SCALE - Math.round(point.x * COORDINATE_SCALE)) > 1e-7 ||
          Math.abs(point.y * COORDINATE_SCALE - Math.round(point.y * COORDINATE_SCALE)) > 1e-7
        ) {
          throw new Error("路径坐标必须按 0.01 mm 精度标准化。");
        }
        if (point.action !== (index === 0 ? "jump" : "stitch")) {
          throw new Error("路径包含协议未定义的动作类型或动作顺序。");
        }
        pointCount += 1;
      });
    }
  }
  const expectedStitches = COLOR_ORDER.reduce((sum, color) => sum + counts[color], 0);
  if (
    pointCount === 0 ||
    data.statistics.totalCommandPointCount !== pointCount ||
    data.statistics.totalStitchPointCount !== expectedStitches ||
    COLOR_ORDER.some((color) =>
      data.statistics.pathCountByColor[color] !== counts[color] ||
      data.statistics.stitchPointCountByColor[color] !== counts[color],
    )
  ) {
    throw new Error("路径统计与标准路径数据不一致，拒绝导出。");
  }
}

export function serializeEmbroideryJson(data: StandardizedEmbroidery): string {
  validateStandardizedEmbroidery(data);
  return `${JSON.stringify(data, null, 2)}\n`;
}
