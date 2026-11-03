export const CAMERA_STREAM = {
  magic: [0x4f, 0x56, 0x35, 0x36],
  version: 1,
  headerSize: 20,
  width: 640,
  height: 480,
  pixelFormatYuyv: 1,
  frameType: 1,
  captureType: 2,
  statusType: 3,
  registersType: 4,
  activityType: 5,
  bytesPerFrame: 640 * 480 * 2,
} as const;

export type CameraPacket =
  | { type: "frame"; sequence: number; pixels: Uint8Array }
  | { type: "capture"; sequence: number }
  | { type: "status"; flags: number }
  | { type: "registers"; values: number }
  | { type: "activity"; values: number };

export class CameraStreamDecoder {
  private pending = new Uint8Array(0);

  push(chunk: Uint8Array): CameraPacket[] {
    const combined = new Uint8Array(this.pending.length + chunk.length);
    combined.set(this.pending);
    combined.set(chunk, this.pending.length);
    this.pending = combined;
    const packets: CameraPacket[] = [];

    while (this.pending.length >= CAMERA_STREAM.headerSize) {
      const magicOffset = this.findMagic();
      if (magicOffset < 0) {
        this.pending = this.pending.slice(-3);
        break;
      }
      if (magicOffset > 0) this.pending = this.pending.slice(magicOffset);
      if (this.pending.length < CAMERA_STREAM.headerSize) break;

      const view = new DataView(this.pending.buffer, this.pending.byteOffset, this.pending.byteLength);
      const payloadSize = view.getUint32(16, true);
      const type = view.getUint8(5);
      const validHeader = view.getUint8(4) === CAMERA_STREAM.version &&
        view.getUint16(6, true) === CAMERA_STREAM.width &&
        view.getUint16(8, true) === CAMERA_STREAM.height &&
        view.getUint16(10, true) === CAMERA_STREAM.pixelFormatYuyv &&
        ((type === CAMERA_STREAM.frameType && payloadSize === CAMERA_STREAM.bytesPerFrame) ||
         ((type === CAMERA_STREAM.captureType || type === CAMERA_STREAM.statusType || type === CAMERA_STREAM.registersType || type === CAMERA_STREAM.activityType) && payloadSize === 0));
      if (!validHeader) {
        this.pending = this.pending.slice(1);
        continue;
      }
      const packetSize = CAMERA_STREAM.headerSize + payloadSize;
      if (this.pending.length < packetSize) break;
      packets.push(decodeCameraPacket(this.pending.subarray(0, packetSize)));
      this.pending = this.pending.slice(packetSize);
    }
    return packets;
  }

  private findMagic(): number {
    for (let offset = 0; offset <= this.pending.length - CAMERA_STREAM.magic.length; offset += 1) {
      if (CAMERA_STREAM.magic.every((byte, index) => this.pending[offset + index] === byte)) {
        return offset;
      }
    }
    return -1;
  }
}

export function decodeCameraPacket(packet: Uint8Array): CameraPacket {
  if (packet.length < CAMERA_STREAM.headerSize) {
    throw new Error("摄像头数据包头不完整。");
  }
  if (!CAMERA_STREAM.magic.every((byte, index) => packet[index] === byte)) {
    throw new Error("摄像头数据包标识无效。");
  }
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  if (view.getUint8(4) !== CAMERA_STREAM.version) {
    throw new Error("不支持的摄像头数据协议版本。");
  }
  if (
    view.getUint16(6, true) !== CAMERA_STREAM.width ||
    view.getUint16(8, true) !== CAMERA_STREAM.height ||
    view.getUint16(10, true) !== CAMERA_STREAM.pixelFormatYuyv
  ) {
    throw new Error("摄像头画面尺寸或像素格式不匹配。");
  }

  const sequence = view.getUint32(12, true);
  const payloadSize = view.getUint32(16, true);
  const type = view.getUint8(5);
  if ((type === CAMERA_STREAM.registersType || type === CAMERA_STREAM.activityType) && payloadSize === 0 && packet.length === CAMERA_STREAM.headerSize) {
    return { type: type === CAMERA_STREAM.registersType ? "registers" : "activity", values: sequence };
  }
  if (type === CAMERA_STREAM.statusType && payloadSize === 0 && packet.length === CAMERA_STREAM.headerSize) {
    return { type: "status", flags: sequence };
  }
  if (type === CAMERA_STREAM.captureType && payloadSize === 0 && packet.length === CAMERA_STREAM.headerSize) {
    return { type: "capture", sequence };
  }
  if (
    type !== CAMERA_STREAM.frameType ||
    payloadSize !== CAMERA_STREAM.bytesPerFrame ||
    packet.length !== CAMERA_STREAM.headerSize + payloadSize
  ) {
    throw new Error("摄像头帧长度或数据类型无效。");
  }
  return {
    type: "frame",
    sequence,
    pixels: packet.subarray(CAMERA_STREAM.headerSize),
  };
}

export function yuyvToRgba(pixels: Uint8Array): Uint8ClampedArray {
  if (pixels.length !== CAMERA_STREAM.bytesPerFrame) {
    throw new Error("YUYV 帧大小无效。");
  }
  const rgba = new Uint8ClampedArray(CAMERA_STREAM.width * CAMERA_STREAM.height * 4);
  for (let input = 0, output = 0; input < pixels.length; input += 4, output += 8) {
    const luminance0 = Math.max(0, (pixels[input] ?? 0) - 16);
    const chromaU = (pixels[input + 1] ?? 128) - 128;
    const luminance1 = Math.max(0, (pixels[input + 2] ?? 0) - 16);
    const chromaV = (pixels[input + 3] ?? 128) - 128;
    const redOffset = 409 * chromaV;
    const greenOffset = -100 * chromaU - 208 * chromaV;
    const blueOffset = 516 * chromaU;
    const convert = (luminance: number, offset: number, scale: number) =>
      Math.max(0, Math.min(255, (298 * luminance + offset + 128) >> 8)) * scale;

    rgba[output] = convert(luminance0, redOffset, 1);
    rgba[output + 1] = convert(luminance0, greenOffset, 1);
    rgba[output + 2] = convert(luminance0, blueOffset, 1);
    rgba[output + 3] = 255;
    rgba[output + 4] = convert(luminance1, redOffset, 1);
    rgba[output + 5] = convert(luminance1, greenOffset, 1);
    rgba[output + 6] = convert(luminance1, blueOffset, 1);
    rgba[output + 7] = 255;
  }
  return rgba;
}

export function describeCameraStatus(flags: number): string {
  if (flags & 2) {
    const register = (flags >>> 16).toString(16).padStart(4, "0").toUpperCase();
    const byte = ((flags >>> 8) & 3) + 1;
    return `相机初始化无应答：寄存器 0x${register}，第 ${byte} 字节。请核对 SCL、SDA、RST、PWDN 及相机供电。`;
  }
  if (!(flags & 1)) return "正在初始化 OV5640；若持续超过 3 秒，请检查系统复位和时钟。";
  if (!(flags & 4)) return "初始化完成，但未检测到 PCLK 时钟。请检查 PCLK 连线及摄像头模组时钟。";
  if (!(flags & 8)) return "已检测到 PCLK，但未检测到 VSYNC 帧同步。请检查 VSYNC 连线。";
  if (!(flags & 16)) return "已检测到帧同步，但未检测到 HREF 行有效。请检查 HREF 连线。";
  if (flags & 32) return "检测到视频 FIFO 溢出；需检查传输带宽或降低摄像头输出速率。";
  return "已检测到初始化完成与 PCLK、VSYNC、HREF。";
}

export function describeCameraReadback(values: number, activity: number): string {
  if (!(activity & 0x10000)) return "等待传感器寄存器读回。";
  if (activity & 0x20000) return "SCCB 寄存器读回无应答，尚未确认传感器实际配置。";
  const hex = (value: number, width: number) => value.toString(16).padStart(width, "0").toUpperCase();
  const id = values >>> 16;
  const format = (values >>> 8) & 255;
  const mirror = values & 255;
  const dataOr = (activity >>> 8) & 255;
  const dataAnd = activity & 255;
  return `芯片 ID 0x${hex(id, 4)}；格式 0x${hex(format, 2)}；JPEG ${mirror & 32 ? "开启" : "关闭"}；数据 OR/AND 0x${hex(dataOr, 2)}/0x${hex(dataAnd, 2)}${id !== 0x5640 || format !== 0x30 || mirror & 32 ? "。读回值与 OV5640 YUYV 配置不符。" : "。"}`;
}
