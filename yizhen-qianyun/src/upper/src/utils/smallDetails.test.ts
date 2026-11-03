import { describe, it, expect, vi } from "vitest";
const { rasterizeImageMock } = vi.hoisted(() => ({ rasterizeImageMock: vi.fn() }));
vi.mock("./imageProcessing", () => ({ rasterizeImage: rasterizeImageMock }));
import { detectColorRegions } from "./colorDetection";
import { generateEmbroideryPaths } from "./pathGenerator";
import { standardizePaths } from "./pathExport";
import { buildColorText } from "./deviceProtocol";
import { COLOR_META, COLOR_ORDER, type EmbroideryColor } from "../types/embroidery";

function imageWith(points: [number,number,EmbroideryColor][], size=40) {
  const pixels = new Uint8ClampedArray(size*size*4).fill(255);
  for (const [x,y,color] of points) pixels.set([...COLOR_META[color].rgb,255],(y*size+x)*4);
  rasterizeImageMock.mockReturnValue({width:size,height:size,pixels:{data:pixels}});
  return {naturalWidth:size,naturalHeight:size} as HTMLImageElement;
}
const frame={width:10,height:10};
const position={x:0,y:0};
describe("small drawing dots through recognition, path and upload", () => {
  it.each(COLOR_ORDER)("preserves a single %s pixel and exports one stitch", color => {
    const image=imageWith([[5,1,color]]);
    const analysis=detectColorRegions(image,20,{preserveSmallDetails:true});
    expect(analysis.masks[color].regions).toHaveLength(1);
    const paths=generateEmbroideryPaths(analysis,frame,position,1,0);
    expect(paths[color].segments).toHaveLength(1);
    expect(paths[color].segments[0].start).toEqual(paths[color].segments[0].end);
    expect(paths[color].points[0]).toMatchObject({x:1.375,y:0.375,color});
    const data=standardizePaths(paths,frame,[...COLOR_ORDER],{
      image:{name:"dot.png",width:40,height:40},
      generation:{tolerance:20,scale:1,rotationDegrees:0,positionXmm:0,positionYmm:0},
    });
    expect(data.statistics.totalStitchPointCount).toBe(1);
    expect(buildColorText(data,color,1600)).toMatch(/\nJ,-?\d+,-?\d+\nS,0,0\n$/);
    expect(rasterizeImageMock).toHaveBeenLastCalledWith(image,1280);
  });
  it("keeps photo noise removal when small-detail mode is off", () => {
    const analysis=detectColorRegions(imageWith([[5,1,"red"]]),20);
    expect(analysis.masks.red.regions).toHaveLength(0);
  });
  it("retains separate nearby dots without joining them", () => {
    const analysis=detectColorRegions(imageWith([[4,1,"red"],[6,1,"red"]]),20,{preserveSmallDetails:true});
    const path=generateEmbroideryPaths(analysis,frame,position,1,0).red;
    expect(path.segments).toHaveLength(2);
    expect(path.segments.every(s => s.start.x===s.end.x && s.start.y===s.end.y)).toBe(true);
  });
  it("does not add fallback points for components already covered by scan rows", () => {
    const pixels: [number,number,EmbroideryColor][]=[];
    for(let y=0;y<12;y++)for(let x=0;x<12;x++)pixels.push([x,y,"red"]);
    const analysis=detectColorRegions(imageWith(pixels),20,{preserveSmallDetails:true});
    const path=generateEmbroideryPaths(analysis,frame,position,1,0).red;
    expect(path.segments.length).toBeGreaterThan(0);
    expect(path.segments.filter(s => s.start.x===s.end.x && s.start.y===s.end.y)).toHaveLength(1);
  });
  it("keeps an edge dot inside a rotated and translated image", () => {
    const analysis=detectColorRegions(imageWith([[0,0,"blue"]]),20,{preserveSmallDetails:true});
    const path=generateEmbroideryPaths(analysis,{width:10,height:10},{x:0.3,y:-0.2},0.8,90).blue;
    expect(path.segments).toHaveLength(1);
    expect(path.points[0].x).toBeCloseTo(9.2);
    expect(path.points[0].y).toBeCloseTo(0.9);
  });
  it("does not invent stitches on a blank image", () => {
    const analysis=detectColorRegions(imageWith([]),20,{preserveSmallDetails:true});
    const paths=generateEmbroideryPaths(analysis,frame,position,1,0);
    expect(COLOR_ORDER.reduce((n,c)=>n+paths[c].segments.length,0)).toBe(0);
  });
});

