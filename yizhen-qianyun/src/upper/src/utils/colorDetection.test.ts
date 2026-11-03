import { describe, expect, it, vi } from "vitest";

const { rasterizeImageMock } = vi.hoisted(() => ({ rasterizeImageMock: vi.fn() }));

vi.mock("./imageProcessing", () => ({ rasterizeImage: rasterizeImageMock }));

import { detectColorRegions } from "./colorDetection";

function fillSquare(
  pixels: Uint8ClampedArray,
  width: number,
  left: number,
  top: number,
  color: [number, number, number],
) {
  for (let y = top; y < top + 2; y += 1) {
    for (let x = left; x < left + 2; x += 1) {
      const offset = (y * width + x) * 4;
      pixels.set([...color, 255], offset);
    }
  }
}

describe("four-color image detection", () => {
  it("detects dark pixels as black and keeps the three chromatic colors", () => {
    const width = 12;
    const height = 8;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
      pixels.set([255, 255, 255, 255], offset);
    }
    fillSquare(pixels, width, 0, 0, [20, 20, 20]);
    fillSquare(pixels, width, 4, 0, [220, 30, 30]);
    fillSquare(pixels, width, 8, 0, [240, 210, 20]);
    fillSquare(pixels, width, 0, 4, [30, 80, 220]);
    rasterizeImageMock.mockReturnValue({ width, height, pixels: { data: pixels } });

    const analysis = detectColorRegions({} as HTMLImageElement, 20);

    expect(analysis.masks.black.regions).toHaveLength(1);
    expect(analysis.masks.red.regions).toHaveLength(1);
    expect(analysis.masks.yellow.regions).toHaveLength(1);
    expect(analysis.masks.blue.regions).toHaveLength(1);
  });
});