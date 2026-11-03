import {describe,it,expect,vi} from "vitest";
const {rasterizeImageMock}=vi.hoisted(()=>({rasterizeImageMock:vi.fn()}));
vi.mock("./imageProcessing",()=>({rasterizeImage:rasterizeImageMock}));
import flower from "./fixtures/flower-line.json";
import {generateGraphStrokePaths} from "./graphStrokePaths";
import {detectColorRegions} from "./colorDetection";
import {standardizePaths} from "./pathExport";
import {buildColorText} from "./deviceProtocol";
import {buildThreadPreview} from "./routePreview";
import {COLOR_ORDER,type ColorAnalysis} from "../types/embroidery";
function analysis(mask:Uint8Array,w:number,h=w):ColorAnalysis{return {width:w,height:h,sourceWidth:w,sourceHeight:h,masks:Object.fromEntries(COLOR_ORDER.map(c=>[c,{data:c==="black"?mask:new Uint8Array(w*h),regions:[]}])) as unknown as ColorAnalysis['masks']};}
describe("integrated one-stroke flower graph",()=>{
 it("plans the real uploaded flower as one closed thread, with every stamen attached to the centre",()=>{
  const mask=new Uint8Array(flower.width*flower.height);for(const [start,length] of flower.runs)mask.fill(1,start,start+length);
  const paths=generateGraphStrokePaths(analysis(mask,flower.width,flower.height),{width:100,height:100},{x:0,y:0},.85,0,3);
  const p=paths.black,route=buildThreadPreview(p);
  expect(p.segments.length).toBeGreaterThan(200);expect(p.segments.length).toBeLessThan(700);
  expect(route.trimCount).toBe(0);expect(p.segments.at(-1)!.end).toEqual(p.segments[0].end);
  for(let i=1;i<p.segments.length;i++)expect(p.segments[i].start).toEqual(p.segments[i-1].end);
  const k=85/flower.width,top=(100-flower.height*k)/2;
  for(const [a,b] of flower.bridges){
   const wanted=[{x:7.5+a[0]*k,y:top+a[1]*k},{x:7.5+b[0]*k,y:top+b[1]*k}];
   for(const point of wanted)expect(p.segments.some(s=>Math.hypot(s.end.x-point.x,s.end.y-point.y)<.001)).toBe(true);
  }
  const meta={image:{name:"flower.png",width:flower.width,height:flower.height},generation:{tolerance:20,scale:.85,rotationDegrees:0,positionXmm:0,positionYmm:0}};
  const text=buildColorText(standardizePaths(paths,{width:100,height:100},[...COLOR_ORDER],meta),"black",1600);
  expect(text.split('\n').filter(l=>l.startsWith('S,')).length).toBe(p.segments.length);
  expect(text.split('\n').length-2).toBeLessThanOrEqual(4096);
 });
 it("supports separate strokes without a central contour, colours, transforms and isolated dots",()=>{
  const mask=new Uint8Array(32*32);for(let x=2;x<12;x++)mask[4*32+x]=1;for(let x=18;x<28;x++)mask[26*32+x]=1;
  const a=analysis(mask,32);a.masks.red.data=mask;
  const paths=generateGraphStrokePaths(a,{width:100,height:100},{x:1,y:-2},.5,45,4);
  for(const c of ['black','red'] as const){expect(buildThreadPreview(paths[c]).trimCount).toBe(0);expect(paths[c].segments.at(-1)!.end).toEqual(paths[c].segments[0].end);}
  const one=new Uint8Array(16);one[5]=1;
  expect(generateGraphStrokePaths(analysis(one,4),{width:100,height:100},{x:0,y:0},1,0).black.segments).toHaveLength(1);
  expect(generateGraphStrokePaths(analysis(new Uint8Array(16),4),{width:100,height:100},{x:0,y:0},1,0).black.segments).toEqual([]);
  expect(()=>generateGraphStrokePaths(a,{width:100,height:100},{x:0,y:0},1,0,0)).toThrow();
 });
 it("preserves grey antialiasing and native raster size only in the new line-art mode",()=>{
  const w=8,pixels=new Uint8ClampedArray(w*w*4).fill(255);pixels.set([90,90,90,255],(3*w+3)*4);
  rasterizeImageMock.mockReturnValue({width:w,height:w,pixels:{data:pixels}});
  const image={naturalWidth:w,naturalHeight:w} as HTMLImageElement;
  expect(detectColorRegions(image,20,{lineArt:true}).masks.black.data[3*w+3]).toBe(1);
  expect(rasterizeImageMock).toHaveBeenLastCalledWith(image,1280);
  expect(detectColorRegions(image,20,{preserveSmallDetails:true}).masks.black.data[3*w+3]).toBe(0);
 });
});
