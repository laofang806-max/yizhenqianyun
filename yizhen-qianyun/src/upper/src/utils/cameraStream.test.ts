import { describe, expect, it } from "vitest";
import { CAMERA_STREAM, CameraStreamDecoder, decodeCameraPacket, describeCameraStatus, describeCameraReadback, yuyvToRgba } from "./cameraStream";

function makeHeader(type: number, sequence: number, payloadSize: number): Uint8Array {
  const packet = new Uint8Array(CAMERA_STREAM.headerSize + payloadSize);
  packet.set(CAMERA_STREAM.magic);
  const view = new DataView(packet.buffer);
  view.setUint8(4, CAMERA_STREAM.version);
  view.setUint8(5, type);
  view.setUint16(6, CAMERA_STREAM.width, true);
  view.setUint16(8, CAMERA_STREAM.height, true);
  view.setUint16(10, CAMERA_STREAM.pixelFormatYuyv, true);
  view.setUint32(12, sequence, true);
  view.setUint32(16, payloadSize, true);
  return packet;
}

it("recovers when junk leaves only a partial magic header", () => {
  const decoder = new CameraStreamDecoder();
  const event = makeHeader(CAMERA_STREAM.captureType, 12, 0);
  const prefix = new Uint8Array(22);
  prefix.fill(0xff);
  prefix.set(event.subarray(0, 4), 18);
  expect(decoder.push(prefix)).toEqual([]);
  expect(decoder.push(event.subarray(4))).toEqual([{ type: "capture", sequence: 12 }]);
});

it("resynchronizes after malformed headers without losing the next packet", () => {
  const bad = makeHeader(CAMERA_STREAM.frameType, 2, 0);
  const good = makeHeader(CAMERA_STREAM.captureType, 3, 0);
  const bytes = new Uint8Array(bad.length + good.length);
  bytes.set(bad);
  bytes.set(good, bad.length);
  expect(new CameraStreamDecoder().push(bytes)).toEqual([{ type: "capture", sequence: 3 }]);
});

describe("camera USB stream protocol", () => {
  it("decodes a fixed-size frame and capture event", () => {
    const frame = makeHeader(CAMERA_STREAM.frameType, 42, CAMERA_STREAM.bytesPerFrame);
    const event = decodeCameraPacket(makeHeader(CAMERA_STREAM.captureType, 42, 0));

    expect(decodeCameraPacket(frame)).toMatchObject({ type: "frame", sequence: 42 });
    expect(event).toEqual({ type: "capture", sequence: 42 });
  });

  it("rejects truncated frames and unsupported dimensions", () => {
    const truncated = makeHeader(CAMERA_STREAM.frameType, 1, CAMERA_STREAM.bytesPerFrame);
    expect(() => decodeCameraPacket(truncated.subarray(0, 100))).toThrow(/长度/);

    const wrongSize = makeHeader(CAMERA_STREAM.captureType, 1, 0);
    new DataView(wrongSize.buffer).setUint16(6, 320, true);
    expect(() => decodeCameraPacket(wrongSize)).toThrow(/尺寸/);
  });

  it("reassembles packets split across USB reads", () => {
    const frame = makeHeader(CAMERA_STREAM.frameType, 8, CAMERA_STREAM.bytesPerFrame);
    const event = makeHeader(CAMERA_STREAM.captureType, 8, 0);
    const stream = new Uint8Array(frame.length + event.length);
    stream.set(frame);
    stream.set(event, frame.length);
    const decoder = new CameraStreamDecoder();

    expect(decoder.push(stream.subarray(0, 7))).toEqual([]);
    expect(decoder.push(stream.subarray(7, CAMERA_STREAM.headerSize + 23))).toEqual([]);
    expect(decoder.push(stream.subarray(CAMERA_STREAM.headerSize + 23))).toMatchObject([
      { type: "frame", sequence: 8 },
      { type: "capture", sequence: 8 },
    ]);
  });

  it("converts neutral YUYV samples to grayscale RGBA", () => {
    const pixels = new Uint8Array(CAMERA_STREAM.bytesPerFrame);
    pixels.set([16, 128, 235, 128]);
    const rgba = yuyvToRgba(pixels);

    expect(Array.from(rgba.slice(0, 8))).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
});


it("reassembles status packets mixed with frames without treating them as captures", () => {
  const status = makeHeader(CAMERA_STREAM.statusType, 0x30080003, 0);
  const frame = makeHeader(CAMERA_STREAM.frameType, 7, CAMERA_STREAM.bytesPerFrame);
  const bytes = new Uint8Array(status.length + frame.length);
  bytes.set(status); bytes.set(frame, status.length);
  const decoder = new CameraStreamDecoder();
  expect(decoder.push(bytes.subarray(0, 13))).toEqual([]);
  expect(decoder.push(bytes.subarray(13))).toMatchObject([
    { type: "status", flags: 0x30080003 }, { type: "frame", sequence: 7 },
  ]);
});

it("reports the failing SCCB register and distinguishes missing DVP signals", () => {
  expect(describeCameraStatus(0x30080103)).toMatch(/0x3008.*第 2 字节/);
  expect(describeCameraStatus(1)).toMatch(/未检测到 PCLK/);
  expect(describeCameraStatus(5)).toMatch(/未检测到 VSYNC/);
  expect(describeCameraStatus(13)).toMatch(/未检测到 HREF/);
  expect(describeCameraStatus(61)).toMatch(/FIFO 溢出/);
});

it("reassembles register and data activity reports between camera packets", () => {
  const registers = makeHeader(4, 0x56403007, 0);
  const activity = makeHeader(5, 0x1ff00, 0);
  const bytes = new Uint8Array(40);
  bytes.set(registers); bytes.set(activity, 20);
  const decoder = new CameraStreamDecoder();
  expect(decoder.push(bytes.subarray(0, 17))).toEqual([]);
  expect(decoder.push(bytes.subarray(17))).toEqual([
    { type: "registers", values: 0x56403007 },
    { type: "activity", values: 0x1ff00 },
  ]);
  expect(describeCameraReadback(0x56403007, 0x1ff00)).toContain("0x5640");
  expect(describeCameraReadback(0x56400027, 0x1ff00)).toContain("读回值与 OV5640 YUYV 配置不符");
  expect(describeCameraReadback(0, 0x30000)).toContain("无应答");
  expect(describeCameraReadback(0, 0)).toContain("等待");
});
