import { describe,it,expect,vi } from "vitest";
const { rasterizeImageMock }=vi.hoisted(()=>({rasterizeImageMock:vi.fn()}));
vi.mock("./imageProcessing",()=>({rasterizeImage:rasterizeImageMock}));
import { detectColorRegions } from "./colorDetection";
import { generateEmbroideryPaths, STITCH_DENSITIES } from "./pathGenerator";
import { buildRoutePreview } from "./routePreview";
import { standardizePaths } from "./pathExport";
import { buildColorText } from "./deviceProtocol";
import { COLOR_ORDER, type ColorPath } from "../types/embroidery";
const frame={width:32,height:32};
const meta={image:{name:"taiji.png",width:64,height:64},generation:{tolerance:20,scale:1,rotationDegrees:0,positionXmm:0,positionYmm:0}};
function fixture(kind:"taiji"|"rectangle") {
  const width=64,height=64,pixels=new Uint8ClampedArray(width*height*4).fill(255);
  const mask=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const dx=x-32,dy=y-32;
    let black=kind==="rectangle" ? x>=8&&x<=55&&y>=8&&y<=55 : dx*dx+dy*dy<=26*26;
    if(kind==="taiji" && black){
      black=x>=32;
      if(dx*dx+(y-19)**2<=13**2)black=true;
      if(dx*dx+(y-45)**2<=13**2)black=false;
      if(dx*dx+(y-19)**2<=3**2)black=false;
      if(dx*dx+(y-45)**2<=3**2)black=true;
    }
    if(black){mask[y*width+x]=1;pixels.set([23,25,28,255],(y*width+x)*4);}
  }
  rasterizeImageMock.mockReturnValue({width,height,pixels:{data:pixels}});
  const a=detectColorRegions({naturalWidth:width,naturalHeight:height} as HTMLImageElement,20,{preserveSmallDetails:true});
  return {analysis:a,mask};
}
describe("continuous route and real needle markers",()=>{
  it("reduces actual exported needle actions while retaining separate regions and avoiding white holes",()=>{
    const {analysis,mask}=fixture("taiji");
    const counts:number[]=[];
    for(const name of ["detailed","simple","sparse"] as const) {
      const density=STITCH_DENSITIES[name];
      const paths=generateEmbroideryPaths(analysis,frame,{x:0,y:0},1,0,density);
      const regions=new Set<number>();
      for(const s of paths.black.segments) {
        const d=Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y);
        expect(d).toBeLessThanOrEqual(density.stitchSpacingMm+1e-6);
        const samples=Math.max(1,Math.ceil(d*16));
        for(let i=0;i<=samples;i++) {
          const x=Math.floor((s.start.x+(s.end.x-s.start.x)*i/samples)*2);
          const y=Math.floor((s.start.y+(s.end.y-s.start.y)*i/samples)*2);
          expect(mask[y*64+x],`${name} crosses white at ${x},${y}`).toBe(1);
          regions.add(analysis.masks.black.labels![y*64+x]);
        }
      }
      expect(regions.size).toBe(analysis.masks.black.regions.length);
      const data=standardizePaths(paths,frame,[...COLOR_ORDER],meta);
      const actions=buildColorText(data,"black",1600).split("\n").filter(line=>line.startsWith("S,")).length;
      expect(actions).toBe(paths.black.segments.length);
      counts.push(actions);
    }
    expect(counts[1]).toBeLessThan(counts[0]*0.5);
    expect(counts[2]).toBeLessThan(counts[1]*0.6);
  });
  it("rejects invalid density rather than hanging or producing invalid commands",()=>{
    const {analysis}=fixture("rectangle");
    for(const spacing of [0,-1,NaN,Infinity]) {
      expect(()=>generateEmbroideryPaths(analysis,frame,{x:0,y:0},1,0,{stitchSpacingMm:spacing,rowSpacingMm:3})).toThrow();
      expect(()=>generateEmbroideryPaths(analysis,frame,{x:0,y:0},1,0,{stitchSpacingMm:4,rowSpacingMm:spacing})).toThrow();
    }
  });
  it("draws the whole executed route, including lifts and automatic return, with S-only dots",()=>{
    const p:ColorPath={color:"black",segments:[
      {start:{x:1,y:1,color:"black"},end:{x:3,y:1,color:"black"}},
      {start:{x:5,y:2,color:"black"},end:{x:5,y:2,color:"black"}},
    ],points:[],lengthMm:2};
    const route=buildRoutePreview(p,{x:0,y:0});
    expect(route.moves.map(m=>m.action)).toEqual(["jump","stitch","jump","stitch","jump"]);
    expect(route.needlePoints).toEqual([{x:3,y:1},{x:5,y:2}]);
    expect(route.moves[4].returning).toBe(true);
    for(let i=1;i<route.moves.length;i++)expect(route.moves[i].from).toEqual(route.moves[i-1].to);
  });
  it("makes a filled rectangle into continuous serpentine stitches, with a first anchor",()=>{
    const {analysis}=fixture("rectangle");
    const p=generateEmbroideryPaths(analysis,frame,{x:0,y:0},1,0).black;
    expect(p.segments.length).toBeGreaterThan(30);
    expect(p.segments[0].start).toEqual(p.segments[0].end);
    for(let i=1;i<p.segments.length;i++)expect(p.segments[i].start).toEqual(p.segments[i-1].end);
    expect(buildRoutePreview(p,{x:16,y:16}).moves.filter(m=>m.action==="jump")).toHaveLength(2);
  });
  it("keeps every stitch inside the taiji black region and never sews across its white eye",()=>{
    const {analysis,mask}=fixture("taiji");
    const paths=generateEmbroideryPaths(analysis,frame,{x:0,y:0},1,0);
    for(const s of paths.black.segments) {
      const distance=Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y);
      expect(distance).toBeLessThanOrEqual(2.000001);
      const samples=Math.max(1,Math.ceil(distance*16));
      for(let i=0;i<=samples;i++) {
        const x=Math.floor((s.start.x+(s.end.x-s.start.x)*i/samples)*2);
        const y=Math.floor((s.start.y+(s.end.y-s.start.y)*i/samples)*2);
        expect(mask[y*64+x],`white stitch at ${x},${y}`).toBe(1);
      }
    }
    const route=buildRoutePreview(paths.black,{x:16,y:16});
    expect(route.moves.filter(m=>m.action==="jump").length).toBeGreaterThan(2);
    const data=standardizePaths(paths,frame,[...COLOR_ORDER],meta);
    const text=buildColorText(data,"black",1600);
    expect(text.split("\n").filter(l=>l.startsWith("S,")).length).toBe(route.needlePoints.length);
    expect(data.statistics.totalStitchPointCount).toBe(route.needlePoints.length);
    expect(data.statistics.totalCommandPointCount).toBeLessThanOrEqual(4096);
  });
  it("rounds preview to the same 0.01mm precision as exported commands",()=>{
    const p:ColorPath={color:"red",segments:[{start:{x:1.234,y:2.346,color:"red"},end:{x:3.456,y:4.567,color:"red"}}],points:[],lengthMm:0};
    expect(buildRoutePreview(p,{x:0,y:0}).needlePoints).toEqual([{x:3.46,y:4.57}]);
  });
});
