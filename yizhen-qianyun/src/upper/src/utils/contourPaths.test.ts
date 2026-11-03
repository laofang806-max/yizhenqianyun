import {describe,it,expect} from "vitest";
import {generateContourPaths,traceMaskContours} from "./contourPaths";
import {buildThreadPreview} from "./routePreview";
import {standardizePaths} from "./pathExport";
import {buildColorText} from "./deviceProtocol";
import {COLOR_ORDER,type ColorAnalysis} from "../types/embroidery";
function analysis(mask:Uint8Array,w=64):ColorAnalysis {
  return {width:w,height:w,sourceWidth:w,sourceHeight:w,masks:Object.fromEntries(COLOR_ORDER.map(c=>[c,{data:c==="black"?mask:new Uint8Array(w*w),regions:[]}])) as unknown as ColorAnalysis['masks']};
}
const area=(p:{x:number;y:number}[])=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a.x*b.y-b.x*a.y;},0)/2;
const frame={width:32,height:32};
describe("counterclockwise contour thread planning",()=>{
 it("finishes the main contour before the separate circle, with just one connecting thread",()=>{
  const mask=new Uint8Array(64*64);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)if((x>=8&&x<=30&&y>=8&&y<=48)||(x-48)**2+(y-16)**2<=5**2)mask[y*64+x]=1;
  const paths=generateContourPaths(analysis(mask),frame,{x:0,y:0},1,0,4);
  const p=paths.black,thread=buildThreadPreview(p);
  expect(thread.trimCount).toBe(1);
  const anchors=p.segments.map((s,i)=>s.start.x===s.end.x&&s.start.y===s.end.y?i:-1).filter(i=>i>=0);
  expect(anchors).toHaveLength(2);
  expect(p.segments[anchors[1]-1].end).toEqual(p.segments[0].end);
  expect(p.segments.at(-1)!.end).toEqual(p.segments[anchors[1]].end);
  expect(area(p.segments.slice(0,anchors[1]).map(s=>s.end))).toBeLessThan(0);
  for(const s of p.segments)expect(Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y)).toBeLessThanOrEqual(4.000001);
  const data=standardizePaths(paths,frame,[...COLOR_ORDER],{image:{name:"test",width:64,height:64},generation:{tolerance:20,scale:1,rotationDegrees:0,positionXmm:0,positionYmm:0}});
  expect(buildColorText(data,"black",1600).split('\n').filter(l=>l.startsWith('S,')).length).toBe(p.segments.length);
 });
 it("retains both outer and hole outlines without row filling",()=>{
  const mask=new Uint8Array(64*64);
  for(let y=8;y<56;y++)for(let x=8;x<56;x++)if(!(x>=24&&x<40&&y>=24&&y<40))mask[y*64+x]=1;
  expect(traceMaskContours(mask,64,64)).toHaveLength(2);
  const p=generateContourPaths(analysis(mask),frame,{x:0,y:0},1,0).black;
  expect(buildThreadPreview(p).trimCount).toBe(1);
  for(const s of p.segments) {
    const m={x:(s.start.x+s.end.x)/2,y:(s.start.y+s.end.y)/2};
    expect([4,12,20,28].includes(m.x)||[4,12,20,28].includes(m.y)).toBe(true);
  }
 });
 it("keeps diagonal contacts as two contours, handles frame edges and tiny dots",()=>{
  const mask=new Uint8Array([1,0,0,1]);
  expect(traceMaskContours(mask,2,2)).toHaveLength(2);
  const p=generateContourPaths(analysis(mask,2),frame,{x:0,y:0},0.5,90).black;
  expect(p.segments.length).toBeGreaterThan(2);
  expect(p.points.every(p=>p.x>=0&&p.y>=0&&p.x<=32&&p.y<=32)).toBe(true);
 });
 it("has no phantom thread on an empty mask and validates spacing",()=>{
  const a=analysis(new Uint8Array(64*64));
  expect(generateContourPaths(a,frame,{x:0,y:0},1,0).black.segments).toEqual([]);
  for(const n of [0,-1,NaN,Infinity])expect(()=>generateContourPaths(a,frame,{x:0,y:0},1,0,n)).toThrow();
 });
});
