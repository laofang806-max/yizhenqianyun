import { COLOR_ORDER, type EmbroideryColor } from "../types/embroidery";
import type {
  ExportPoint,
  StandardizedEmbroidery,
  StitchAction,
} from "../types/exportData";
import {
  COORDINATE_SCALE,
  MAX_UINT32,
  validateStandardizedEmbroidery,
} from "./pathExport";

export const BIN_PROTOCOL = {
  magic: "EMBR",
  version: 1,
  headerSize: 40,
  coordinateScale: COORDINATE_SCALE,
  unitCode: 1,
  colorIds: { red: 1, yellow: 2, blue: 3, black: 4 } satisfies Record<EmbroideryColor, number>,
  actionIds: { jump: 1, stitch: 2 } satisfies Record<StitchAction, number>,
  colorRecordHeaderSize: 9,
  pointRecordSize: 9,
} as const;

const COLOR_BY_ID = new Map<number, EmbroideryColor>(
  Object.entries(BIN_PROTOCOL.colorIds).map(([color, id]) => [id, color as EmbroideryColor]),
);
const ACTION_BY_ID = new Map<number, StitchAction>(
  Object.entries(BIN_PROTOCOL.actionIds).map(([action, id]) => [id, action as StitchAction]),
);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function checkedCoordinate(value: number): number {
  const encoded = Math.round(value * BIN_PROTOCOL.coordinateScale);
  if (!Number.isSafeInteger(encoded) || encoded < 0 || encoded > MAX_UINT32) {
    throw new Error(`坐标 ${value} mm 超出 BIN 编码范围。`);
  }
  return encoded;
}

export function encodeEmbroideryBin(data: StandardizedEmbroidery): Uint8Array {
  validateStandardizedEmbroidery(data);
  const metadataBytes = new TextEncoder().encode(JSON.stringify(data.metadata));
  if (metadataBytes.length > MAX_UINT32) throw new Error("BIN 元数据长度超出协议支持范围。");
  const orderedColors = data.executionOrder;
  const recordSizes = orderedColors.map((color) => {
    const path = data.paths[color];
    if (!path || path.color !== color) throw new Error(`BIN 缺少 ${color} 路径数据。`);
    return BIN_PROTOCOL.colorRecordHeaderSize +
      path.segments.reduce((sum, segment) => sum + segment.points.length * BIN_PROTOCOL.pointRecordSize, 0);
  });
  const payloadSize = recordSizes.reduce((sum, size) => sum + size, 0);
  const fileSize = BIN_PROTOCOL.headerSize + metadataBytes.length + payloadSize;
  if (!Number.isSafeInteger(fileSize) || fileSize > MAX_UINT32) {
    throw new Error("BIN 文件长度超出协议支持范围。");
  }
  const bytes = new Uint8Array(fileSize);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < BIN_PROTOCOL.magic.length; index += 1) {
    bytes[index] = BIN_PROTOCOL.magic.charCodeAt(index);
  }
  view.setUint16(4, BIN_PROTOCOL.version, true);
  view.setUint16(6, BIN_PROTOCOL.headerSize, true);
  view.setUint32(8, fileSize, true);
  view.setUint32(12, checkedCoordinate(data.frame.width), true);
  view.setUint32(16, checkedCoordinate(data.frame.height), true);
  view.setUint8(20, BIN_PROTOCOL.unitCode);
  view.setUint8(21, orderedColors.length);
  view.setUint16(22, 0, true);
  view.setUint32(24, data.statistics.totalCommandPointCount, true);
  view.setUint32(28, metadataBytes.length, true);
  view.setUint32(32, payloadSize, true);
  bytes.set(metadataBytes, BIN_PROTOCOL.headerSize);

  let offset = BIN_PROTOCOL.headerSize + metadataBytes.length;
  for (const color of orderedColors) {
    const path = data.paths[color];
    const pointCount = path.segments.reduce((sum, segment) => sum + segment.points.length, 0);
    view.setUint8(offset, BIN_PROTOCOL.colorIds[color]);
    view.setUint32(offset + 1, path.segments.length, true);
    view.setUint32(offset + 5, pointCount, true);
    offset += BIN_PROTOCOL.colorRecordHeaderSize;
    for (const segment of path.segments) {
      for (const point of segment.points) {
        view.setUint32(offset, checkedCoordinate(point.x), true);
        view.setUint32(offset + 4, checkedCoordinate(point.y), true);
        view.setUint8(offset + 8, BIN_PROTOCOL.actionIds[point.action]);
        offset += BIN_PROTOCOL.pointRecordSize;
      }
    }
  }
  view.setUint32(36, crc32(bytes.subarray(BIN_PROTOCOL.headerSize)), true);
  return bytes;
}

export function decodeEmbroideryBin(input: Uint8Array): StandardizedEmbroidery {
  const bytes = new Uint8Array(input);
  if (bytes.length < BIN_PROTOCOL.headerSize) throw new Error("BIN 文件头不完整。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== BIN_PROTOCOL.magic) throw new Error("BIN 文件标识无效。");
  if (view.getUint16(4, true) !== BIN_PROTOCOL.version) throw new Error("不支持的 BIN 协议版本。");
  if (view.getUint16(6, true) !== BIN_PROTOCOL.headerSize) throw new Error("BIN 文件头长度无效。");
  if (view.getUint32(8, true) !== bytes.length) throw new Error("BIN 文件长度校验失败。");
  if (view.getUint8(20) !== BIN_PROTOCOL.unitCode) throw new Error("BIN 坐标单位不受支持。");
  if (view.getUint8(21) !== COLOR_ORDER.length || view.getUint16(22, true) !== 0) {
    throw new Error("BIN 颜色数或保留字段无效。");
  }
  const metadataLength = view.getUint32(28, true);
  const payloadLength = view.getUint32(32, true);
  if (BIN_PROTOCOL.headerSize + metadataLength + payloadLength !== bytes.length) {
    throw new Error("BIN 元数据或路径数据长度校验失败。");
  }
  if (crc32(bytes.subarray(BIN_PROTOCOL.headerSize)) !== view.getUint32(36, true)) {
    throw new Error("BIN CRC32 校验失败，文件可能已损坏。");
  }

  let offset = BIN_PROTOCOL.headerSize;
  let metadata: StandardizedEmbroidery["metadata"];
  try {
    metadata = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(offset, offset + metadataLength)),
    ) as StandardizedEmbroidery["metadata"];
  } catch {
    throw new Error("BIN 元数据不是有效的 UTF-8 JSON。");
  }
  offset += metadataLength;
  const executionOrder: EmbroideryColor[] = [];
  const paths = {} as StandardizedEmbroidery["paths"];
  const pathCountByColor = { black: 0, red: 0, yellow: 0, blue: 0 };
  const stitchPointCountByColor = { black: 0, red: 0, yellow: 0, blue: 0 };
  let totalCommandPointCount = 0;
  const payloadEnd = offset + payloadLength;

  for (let colorIndex = 0; colorIndex < COLOR_ORDER.length; colorIndex += 1) {
    if (offset + BIN_PROTOCOL.colorRecordHeaderSize > payloadEnd) {
      throw new Error("BIN 颜色路径记录不完整。");
    }
    const color = COLOR_BY_ID.get(view.getUint8(offset));
    if (!color || executionOrder.includes(color)) throw new Error("BIN 颜色编码无效或重复。");
    const segmentCount = view.getUint32(offset + 1, true);
    const pointCount = view.getUint32(offset + 5, true);
    if (pointCount !== segmentCount * 2) throw new Error("BIN 针迹点数量与路径段数量不匹配。");
    offset += BIN_PROTOCOL.colorRecordHeaderSize;
    if (offset + pointCount * BIN_PROTOCOL.pointRecordSize > payloadEnd) {
      throw new Error("BIN 路径点记录超出文件范围。");
    }
    const segments: StandardizedEmbroidery["paths"][EmbroideryColor]["segments"] = [];
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      const points: ExportPoint[] = [];
      for (let pointIndex = 0; pointIndex < 2; pointIndex += 1) {
        const x = view.getUint32(offset, true) / BIN_PROTOCOL.coordinateScale;
        const y = view.getUint32(offset + 4, true) / BIN_PROTOCOL.coordinateScale;
        const action = ACTION_BY_ID.get(view.getUint8(offset + 8));
        if (!action || action !== (pointIndex === 0 ? "jump" : "stitch")) {
          throw new Error("BIN 针迹动作编码无效。");
        }
        points.push({ x, y, action });
        offset += BIN_PROTOCOL.pointRecordSize;
      }
      segments.push({ points: points as [ExportPoint, ExportPoint] });
    }
    executionOrder.push(color);
    pathCountByColor[color] = segmentCount;
    stitchPointCountByColor[color] = segmentCount;
    totalCommandPointCount += pointCount;
    paths[color] = { color, segments };
  }

  if (offset !== payloadEnd || totalCommandPointCount !== view.getUint32(24, true)) {
    throw new Error("BIN 总点数或路径数据长度校验失败。");
  }
  const decoded: StandardizedEmbroidery = {
    version: 1,
    frame: {
      width: view.getUint32(12, true) / BIN_PROTOCOL.coordinateScale,
      height: view.getUint32(16, true) / BIN_PROTOCOL.coordinateScale,
      origin: "top-left",
    },
    unit: "mm",
    coordinatePrecisionMm: 0.01,
    colors: [...COLOR_ORDER],
    executionOrder,
    paths,
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
  validateStandardizedEmbroidery(decoded);
  return decoded;
}
