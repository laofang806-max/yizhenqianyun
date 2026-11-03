import {describe,it,expect} from "vitest";
import {generateOneStrokePaths,thinMask} from "./oneStrokePaths";
import {buildThreadPreview} from "./routePreview";
import {COLOR_ORDER,type ColorAnalysis} from "../types/embroidery";
import {standardizePaths} from "./pathExport";
import {buildColorText} from "./deviceProtocol";
function fixture(w=96,separate=true) {
 const mask=new Uint8Array(w*w);
 for(let y=0;y<w;y++)for(let x=0;x<w;x++) {
  const dx=x-w/2,dy=y-w/2,r=Math.hypot(dx,dy),radius=w*.42;
  let black=r<=radius&&r>=radius-3; // thin outer ring
  if(r<radius) {
   let lobe=x>=w/2;
   if(dx*dx+(y-w*.29)**2<=(w*.21)**2)lobe=true;
   if(dx*dx+(y-w*.71)**2<=(w*.21)**2)lobe=false;
   if(dx*dx+(y-w*.29)**2<(w*.06)**2)lobe=false;
   if(separate&&dx*dx+(y-w*.71)**2<(w*.06)**2)lobe=true;
   black ||= lobe;
  }
  mask[y*w+x]=black?1:0;
 }
 const analysis:ColorAnalysis={width:w,height:w,sourceWidth:w,sourceHeight:w,masks:Object.fromEntries(COLOR_ORDER.map(c=>[c,{data:c==="black"?mask:new Uint8Array(w*w),regions:[]}])) as unknown as ColorAnalysis['masks']};
 return {analysis,mask,w};
}
const density={stitchSpacingMm:4,rowSpacingMm:3};
describe("single stroke with connected fill",()=>{
 it("joins the ring, curves and fill inside the ink, leaving only one bridge to the separate eye",()=>{
  const {analysis,mask,w}=fixture();
  const paths=generateOneStrokePaths(analysis,{width:48,height:48},{x:0,y:0},1,0,density);
  const thread=buildThreadPreview(paths.black);
  expect(thread.trimCount).toBe(1);
  const anchors=paths.black.segments.filter(s=>s.start.x===s.end.x&&s.start.y===s.end.y);
  expect(anchors).toHaveLength(2);
  let horizontalFill=0;
  for(const s of paths.black.segments) {
   const d=Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y);
   expect(d).toBeLessThanOrEqual(4.00001);
   if(s.start.y===s.end.y&&d>2)horizontalFill++;
   for(let i=0,n=Math.max(1,Math.ceil(d*16));i<=n;i++) {
    const px=(s.start.x+(s.end.x-s.start.x)*i/n)*2,py=(s.start.y+(s.end.y-s.start.y)*i/n)*2;
    const x=Math.floor(px),y=Math.floor(py);
    // A zero-width contact at a raster cell boundary belongs to either ink
    // cell. Interior samples must always lie on black, never inside white.
    const xs=Math.abs(px-Math.round(px))<1e-8?[Math.round(px)-1,Math.round(px)]:[x];
    const ys=Math.abs(py-Math.round(py))<1e-8?[Math.round(py)-1,Math.round(py)]:[y];
    expect(xs.some(xx=>ys.some(yy=>xx>=0&&yy>=0&&xx<w&&yy<w&&mask[yy*w+xx])),`white interior at ${px},${py}`).toBe(true);
   }
  }
  expect(horizontalFill).toBeGreaterThan(5);
  const data=standardizePaths(paths,{width:48,height:48},[...COLOR_ORDER],{image:{name:"taiji",width:w,height:w},generation:{tolerance:20,scale:1,rotationDegrees:0,positionXmm:0,positionYmm:0}});
  expect(buildColorText(data,"black",1600).split('\n').filter(l=>l.startsWith('S,')).length).toBe(thread.needlePoints.length);
 });
 it("does not invent cuts within a connected figure and preserves every disconnected dot",()=>{
  const {analysis}=fixture(64,false);
  const paths=generateOneStrokePaths(analysis,{width:32,height:32},{x:0,y:0},1,0,density);
  expect(buildThreadPreview(paths.black).trimCount).toBe(0);
  const data=new Uint8Array(16*16);data[0]=data[255]=1;
  const a={...analysis,width:16,height:16,sourceWidth:16,sourceHeight:16,masks:{...analysis.masks,black:{data,regions:[]}}};
  for(const c of COLOR_ORDER)if(c!=="black")a.masks[c]={data:new Uint8Array(256),regions:[]};
  const p=generateOneStrokePaths(a,{width:32,height:32},{x:0,y:0},1,0,density).black;
  expect(p.segments).toHaveLength(2);
  expect(buildThreadPreview(p).trimCount).toBe(1);
 });
 it("thins a thick ring to a single track and keeps input unchanged",()=>{
  const w=32,mask=new Uint8Array(w*w);
  for(let y=4;y<28;y++)for(let x=4;x<28;x++)if(x<7||x>=25||y<7||y>=25)mask[y*w+x]=1;
  const before=mask.slice(),thin=thinMask(mask,w,w);
  expect(mask).toEqual(before);
  expect(thin.reduce((n,v)=>n+v,0)).toBeLessThan(mask.reduce((n,v)=>n+v,0)*.5);
  expect(thin[16*w+16]).toBe(0);
 });
});
