import {describe,it,expect} from "vitest";
import {editNeedle,keepNeedlesInsideFrame} from "./needleEditing";
import {standardizePaths} from "./pathExport";
import {buildColorText} from "./deviceProtocol";
import {buildThreadPreview} from "./routePreview";
import {COLOR_ORDER,type PathSet,type PositionMm} from "../types/embroidery";
const frame={width:100,height:100};
const point=(x:number,y=10)=>({x,y,color:"black" as const});
function path(vertices:PositionMm[]):PathSet {
 const empty=(color:typeof COLOR_ORDER[number])=>({color,segments:[],points:[],lengthMm:0});
 return {black:{color:"black",segments:vertices.map((p,i)=>({start:{...(vertices[Math.max(0,i-1)]),color:"black"},end:{...p,color:"black"}})),points:[],lengthMm:0},red:empty("red"),yellow:empty("yellow"),blue:empty("blue")};
}
function data(paths:PathSet){return standardizePaths(paths,frame,[...COLOR_ORDER],{image:{name:"edited",width:100,height:100},generation:{tolerance:20,scale:1,rotationDegrees:0,positionXmm:0,positionYmm:0}});}
describe("editing real needle targets and frame filtering",()=>{
 it("moves a real needle endpoint and its outgoing edge without mutating source or another color",()=>{
  const original=path([point(10),point(20),point(30)]),snapshot=JSON.stringify(original);
  const result=editNeedle(original,{kind:"move",selection:{color:"black",index:1},point:{x:25,y:18}});
  expect(result.black.segments[1].end).toEqual(point(25,18));
  expect(result.black.segments[2].start).toEqual(point(25,18));
  expect(buildThreadPreview(result.black).needlePoints).toEqual([{x:10,y:10},{x:25,y:18},{x:30,y:10}]);
  expect(JSON.stringify(original)).toBe(snapshot);expect(result.red).toBe(original.red);
 });
 it("moves the initial anchor and inserts before, between or after existing needles",()=>{
  const a=path([point(10),point(20),point(30)]);
  const moved=editNeedle(a,{kind:"move",selection:{color:"black",index:0},point:{x:5,y:5}});
  expect(moved.black.segments[0].start).toEqual(point(5,5));expect(moved.black.segments[1].start).toEqual(point(5,5));
  for(const after of [-1,0,2]) {
   const added=editNeedle(a,{kind:"add",color:"black",after,point:{x:15,y:12}});
   expect(added.black.segments).toHaveLength(4);
   expect(added.black.segments[after+1].end).toEqual(point(15,12));
   if(after<2)expect(added.black.segments[after+2].start).toEqual(point(15,12));
  }
  expect(editNeedle(a,{kind:"add",color:"red",after:-1,point:{x:8,y:9}}).red.segments).toHaveLength(1);
 });
 it("deletes middle/first/last/single points and reconnects the remaining real needles",()=>{
  const a=path([point(10),point(20),point(30)]);
  const mid=editNeedle(a,{kind:"delete",selection:{color:"black",index:1}});
  expect(mid.black.segments).toHaveLength(2);expect(mid.black.segments[1].start).toEqual(point(10));
  const first=editNeedle(a,{kind:"delete",selection:{color:"black",index:0}});
  expect(first.black.segments[0]).toEqual({start:point(20),end:point(20)});
  expect(editNeedle(a,{kind:"delete",selection:{color:"black",index:2}}).black.segments).toHaveLength(2);
  expect(editNeedle(path([point(10)]),{kind:"delete",selection:{color:"black",index:0}}).black.segments).toEqual([]);
 });
 it("preserves intended inter-component jumps when moving or deleting their anchor",()=>{
  const a=path([point(10),point(20),point(70),point(80)]);a.black.segments[2].start=point(70);
  const moved=editNeedle(a,{kind:"move",selection:{color:"black",index:1},point:point(25)});
  expect(moved.black.segments[2].start).toEqual(point(70));
  const deleted=editNeedle(a,{kind:"delete",selection:{color:"black",index:2}});
  expect(deleted.black.segments[2]).toEqual({start:point(80),end:point(80)});
 });
 it("drops every outside target without piling points on the border and anchors on re-entry",()=>{
  const a=path([point(-20),point(0),point(20),point(120),point(130),point(80),point(100)]);
  const cropped=keepNeedlesInsideFrame(a,frame);
  expect(cropped.removed).toBe(3);
  expect(cropped.paths.black.segments.map(s=>s.end.x)).toEqual([0,20,80,100]);
  expect(cropped.paths.black.segments[2]).toEqual({start:point(80),end:point(80)});
  const text=buildColorText(data(cropped.paths),"black",1600);
  let x=50*1600,y=50*1600,needles=0;
  for(const line of text.trim().split('\n').slice(1)) {
   const [kind,dx,dy]=line.split(',');x+=Number(dx);y+=Number(dy);
   expect(x).toBeGreaterThanOrEqual(0);expect(x).toBeLessThanOrEqual(160000);
   expect(y).toBeGreaterThanOrEqual(0);expect(y).toBeLessThanOrEqual(160000);
   if(kind==='S')needles++;
  }
  expect(needles).toBe(4);
  expect(keepNeedlesInsideFrame(path([point(-10),point(-20)]),frame).paths.black.segments).toEqual([]);
 });
 it("transmits a manually lengthened stitch with intermediate needle-up motion and only one final drop",()=>{
  const a=path([point(10),point(20),point(90)]);
  const changed=editNeedle(a,{kind:"delete",selection:{color:"black",index:1}});
  const text=buildColorText(data(changed),"black",1600),lines=text.trim().split('\n').slice(1);
  expect(lines.filter(l=>l.startsWith('S,'))).toHaveLength(2);
  expect(lines.length).toBeGreaterThan(4);
  for(const l of lines){const [,x,y]=l.split(',').map(Number);expect(Math.abs(x)).toBeLessThanOrEqual(32767);expect(Math.abs(y)).toBeLessThanOrEqual(32767);}
  expect(lines.map(l=>l.split(',')[0]).at(-1)).toBe('S');
 });
 it("keeps border coordinates and rejects invalid edits or excess needle cache",()=>{
  const a=path([point(0,0),point(100,100)]);
  expect(keepNeedlesInsideFrame(a,frame).removed).toBe(0);
  expect(()=>editNeedle(a,{kind:"move",selection:{color:"black",index:1},point:{x:NaN,y:0}})).toThrow();
  expect(()=>editNeedle(a,{kind:"delete",selection:{color:"black",index:4}})).toThrow();
  const full=path(Array.from({length:2048},()=>point(10)));
  expect(()=>editNeedle(full,{kind:"add",color:"black",after:0,point:point(20)})).toThrow(/2048/);
 });
});
