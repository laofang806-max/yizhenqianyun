import { describe, it, expect } from "vitest";
import { parseEncoderLine, encoderDisplacement } from "./encoderTelemetry";
describe("encoder telemetry", () => {
  it("decodes signed words and converts using 500 counts/mm", () => {
    const v = parseEncoderLine("ENC 000003E8 FFFFFE0C")!;
    expect(v.x).toBe(1000); expect(v.y).toBe(-500);
    expect(encoderDisplacement(v.x, 0)).toBe(2);
    expect(encoderDisplacement(v.y, 0)).toBe(-1);
  });
  it("zeros only the display and supports direction and rollover", () => {
    expect(encoderDisplacement(1500,1000)).toBe(1);
    expect(encoderDisplacement(1500,1000,true)).toBe(-1);
    expect(encoderDisplacement(-2147483648,2147483647)).toBe(0.002);
  });
  it("rejects malformed, partial and non-telemetry messages", () => {
    for (const line of ["READY", "ENC 0000000 00000000", "ENC Z0000000 00000000", "ENC 00000000 00000000 junk"])
      expect(parseEncoderLine(line)).toBeNull();
  });
});
