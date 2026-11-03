import { describe, expect, it } from "vitest";
import type { PathSet } from "../types/embroidery";
import { standardizePaths } from "./pathExport";
import { buildColorText, getNextDeviceColor } from "./deviceProtocol";

const metadata = {
  image: { name: "test.png", width: 100, height: 100 },
  generation: {
    tolerance: 20,
    scale: 1,
    rotationDegrees: 0,
    positionXmm: 0,
    positionYmm: 0,
  },
};

function createData(
  frame: { width: number; height: number },
  redSegments: Array<{
    start: { x: number; y: number; color: "red" };
    end: { x: number; y: number; color: "red" };
  }>,
) {
  const paths: PathSet = {
    black: { color: "black", segments: [], points: [], lengthMm: 0 },
    red: { color: "red", segments: redSegments, points: [], lengthMm: 0 },
    blue: { color: "blue", segments: [], points: [], lengthMm: 0 },
    yellow: { color: "yellow", segments: [], points: [], lengthMm: 0 },
  };
  return standardizePaths(paths, frame, ["black", "red", "yellow", "blue"], metadata);
}

describe("FPGA serial motion protocol", () => {
  it("converts frame coordinates to relative steps from the centered software origin", () => {
    const data = createData(
      { width: 300, height: 300 },
      [{
        start: { x: 150, y: 150, color: "red" },
        end: { x: 160, y: 150, color: "red" },
      }],
    );

    expect(buildColorText(data, "red", 800))
      .toBe("COLOR red 2\nJ,0,0\nS,8000,0\n");
  });

  it("encodes negative travel and allows an empty color path", () => {
    const data = createData(
      { width: 300, height: 200 },
      [{
        start: { x: 140, y: 90, color: "red" },
        end: { x: 130, y: 80, color: "red" },
      }],
    );

    expect(buildColorText(data, "red", 800))
      .toBe("COLOR red 2\nJ,-8000,-8000\nS,-8000,-8000\n");
    expect(buildColorText(data, "blue", 800)).toBe("COLOR blue 0\n");
  });

  it("splits long moves without adding intermediate needle drops", () => {
    const data = createData(
      { width: 300, height: 300 },
      [{
        start: { x: 0, y: 150, color: "red" },
        end: { x: 10, y: 150, color: "red" },
      }],
    );

    expect(buildColorText(data, "red", 800)).toBe(
      "COLOR red 5\nJ,-30000,0\nJ,-30000,0\nJ,-30000,0\nJ,-30000,0\nS,8000,0\n",
    );

    const longStitch = createData(
      { width: 300, height: 300 },
      [{
        start: { x: 150, y: 150, color: "red" },
        end: { x: 200, y: 150, color: "red" },
      }],
    );
    expect(buildColorText(longStitch,"red",800)).toBe("COLOR red 3\nJ,0,0\nJ,20000,0\nS,20000,0\n");
  });

  it("rejects frame sizes outside the no-homing travel envelope", () => {
    const tooWide = createData(
      { width: 301, height: 300 },
      [{
        start: { x: 150, y: 150, color: "red" },
        end: { x: 160, y: 150, color: "red" },
      }],
    );

    expect(() => buildColorText(tooWide, "red", 800)).toThrow(/300 mm/);
  });

  it("enforces the FPGA action buffer and a positive finite calibration", () => {
    const tooManySegments = Array.from({ length: 2049 }, () => ({
      start: { x: 150, y: 150, color: "red" as const },
      end: { x: 151, y: 150, color: "red" as const },
    }));
    const data = createData({ width: 300, height: 300 }, tooManySegments);

    expect(() => buildColorText(data, "red", 800)).toThrow(/4096 条动作缓存上限/);
    expect(() => buildColorText(data, "red", 0)).toThrow(/step\/mm/);
    expect(() => buildColorText(data, "red", Number.NaN)).toThrow(/step\/mm/);
  });

  it("uses the fixed black, red, yellow, blue device order", () => {
    const order = ["black", "red", "yellow", "blue"] as const;
    expect(getNextDeviceColor([], order)).toBe("black");
    expect(getNextDeviceColor(["black"], order)).toBe("red");
    expect(getNextDeviceColor(["black", "red"], order)).toBe("yellow");
    expect(getNextDeviceColor(["black", "red", "yellow"], order)).toBe("blue");
    expect(getNextDeviceColor(order, order)).toBeNull();
  });
});
