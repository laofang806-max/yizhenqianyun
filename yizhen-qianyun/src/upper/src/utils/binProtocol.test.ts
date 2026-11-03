import { describe, expect, it } from "vitest";
import {
  decodeEmbroideryBin,
  encodeEmbroideryBin,
  BIN_PROTOCOL,
} from "./binProtocol";
import { standardizePaths, serializeEmbroideryJson } from "./pathExport";
import type { PathSet } from "../types/embroidery";

const frame = { width: 20, height: 20 };
const metadata = {
  image: { name: "sample.png", width: 640, height: 480 },
  generation: {
    tolerance: 20,
    scale: 0.8,
    rotationDegrees: 0,
    positionXmm: 0,
    positionYmm: 0,
  },
};
const paths: PathSet = {
  black: { color: "black", segments: [], points: [], lengthMm: 0 },
  red: {
    color: "red",
    segments: [{ start: { x: 1.234, y: 2.345, color: "red" }, end: { x: 3.456, y: 4.567, color: "red" } }],
    points: [],
    lengthMm: 0,
  },
  yellow: { color: "yellow", segments: [], points: [], lengthMm: 0 },
  blue: {
    color: "blue",
    segments: [{ start: { x: 19.99, y: 0, color: "blue" }, end: { x: 20, y: 20, color: "blue" } }],
    points: [],
    lengthMm: 0,
  },
};

function createStandardData() {
  return standardizePaths(paths, frame, ["black", "red", "yellow", "blue"], metadata);
}

describe("EMBR v1 binary protocol", () => {
  it("writes the fixed header, little-endian values, and exact total length", () => {
    const bytes = encodeEmbroideryBin(createStandardData());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("EMBR");
    expect(view.getUint16(4, true)).toBe(1);
    expect(view.getUint16(6, true)).toBe(BIN_PROTOCOL.headerSize);
    expect(view.getUint32(8, true)).toBe(bytes.length);
    expect(view.getUint32(12, true)).toBe(2000);
    expect(view.getUint32(16, true)).toBe(2000);
    expect(view.getUint8(20)).toBe(1);
    expect(view.getUint8(21)).toBe(4);
    expect(view.getUint32(24, true)).toBe(4);
    expect(view.getUint32(28, true) + view.getUint32(32, true) + 40).toBe(bytes.length);
  });

  it("encodes execution order, color IDs, 0.01 mm coordinates, and actions", () => {
    const bytes = encodeEmbroideryBin(createStandardData());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const metadataLength = view.getUint32(28, true);
    const records = 40 + metadataLength;
    expect(view.getUint8(records)).toBe(4);
    expect(view.getUint8(records + 9)).toBe(1);
    expect(view.getUint32(records + 18, true)).toBe(123);
    expect(view.getUint32(records + 22, true)).toBe(235);
    expect(view.getUint8(records + 26)).toBe(1);
    expect(view.getUint32(records + 27, true)).toBe(346);
    expect(view.getUint32(records + 31, true)).toBe(457);
    expect(view.getUint8(records + 35)).toBe(2);
    expect(view.getUint8(records + 36)).toBe(2);
    expect(view.getUint8(records + 45)).toBe(3);
    expect(view.getUint32(records + 54, true)).toBe(1999);
  });

  it("decodes to data equivalent to the shared JSON standard object", () => {
    const data = createStandardData();
    const decoded = decodeEmbroideryBin(encodeEmbroideryBin(data));
    expect(decoded).toEqual(data);
    expect(JSON.parse(serializeEmbroideryJson(data))).toEqual(decoded);
  });

  it("rejects empty paths and coordinates outside the frame", () => {
    const emptyPaths: PathSet = {
      black: { ...paths.black, segments: [] },
      red: { ...paths.red, segments: [] },
      yellow: { ...paths.yellow, segments: [] },
      blue: { ...paths.blue, segments: [] },
    };
    expect(() => standardizePaths(
      emptyPaths,
      frame,
      ["black", "red", "yellow", "blue"],
      metadata,
    )).toThrow(/没有有效针迹路径/);
    const outside: PathSet = {
      ...paths,
      red: {
        ...paths.red,
        segments: [{ start: { x: -0.01, y: 0, color: "red" }, end: { x: 1, y: 1, color: "red" } }],
      },
    };
    expect(() => standardizePaths(outside, frame, ["black", "red", "yellow", "blue"], metadata))
      .toThrow(/超出画框范围/);
  });

  it("rejects an execution order other than black, red, yellow, blue", () => {
    expect(() => standardizePaths(paths, frame, ["red", "black", "yellow", "blue"], metadata))
      .toThrow(/固定为 black、red、yellow、blue/);
  });

  it("rejects corruption, invalid actions, and invalid file lengths", () => {
    const valid = encodeEmbroideryBin(createStandardData());
    const corrupt = valid.slice();
    corrupt[corrupt.length - 1] ^= 0xff;
    expect(() => decodeEmbroideryBin(corrupt)).toThrow(/CRC32/);
    const invalidLength = valid.slice();
    new DataView(invalidLength.buffer).setUint32(8, valid.length + 1, true);
    expect(() => decodeEmbroideryBin(invalidLength)).toThrow(/文件长度/);
    const invalidAction = valid.slice();
    const view = new DataView(invalidAction.buffer);
    const records = 40 + view.getUint32(28, true);
    const firstSegmentPointOffset = records + 18;
    invalidAction[firstSegmentPointOffset + 8] = 255;
    let crc = 0xffff_ffff;
    for (const byte of invalidAction.subarray(40)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb8_8320 : 0);
      }
    }
    new DataView(invalidAction.buffer).setUint32(36, (crc ^ 0xffff_ffff) >>> 0, true);
    expect(() => decodeEmbroideryBin(invalidAction)).toThrow(/动作编码无效/);
  });
});
