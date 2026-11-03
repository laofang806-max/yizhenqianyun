import { describe, it, expect } from "vitest";
import { buildThreadPreview, buildRoutePreview } from "./routePreview";
import type { ColorPath } from "../types/embroidery";
const point=(x:number,y:number)=>({x,y,color:"black" as const});
describe("one physical thread per color",()=>{
  it("joins separated components with a solid thread link until the user cuts it",()=>{
    const path:ColorPath={color:"black",segments:[
      {start:point(1,1),end:point(1,1)},
      {start:point(1,1),end:point(3,1)},
      {start:point(8,1),end:point(8,1)},
      {start:point(8,1),end:point(8,3)},
    ],points:[],lengthMm:4};
    const thread=buildThreadPreview(path);
    expect(thread.needlePoints).toEqual([{x:1,y:1},{x:3,y:1},{x:8,y:1},{x:8,y:3}]);
    expect(thread.links.map(link=>link.trim)).toEqual([false,true,false]);
    expect(thread.lengthMm).toBe(9);
    expect(thread.trimCount).toBe(1);
    for(let i=1;i<thread.links.length;i++)expect(thread.links[i].from).toEqual(thread.links[i-1].to);
    // Drawing the thread must not add needle drops in the white gap or change moves.
    expect(buildRoutePreview(path,{x:0,y:0}).moves.filter(m=>m.action==="stitch")).toHaveLength(4);
  });
  it("connects actual needle anchors, excluding unanchored positioning and return",()=>{
    const p:ColorPath={color:"black",segments:[{start:point(1,1),end:point(3,1)},
      {start:point(5,2),end:point(7,2)}],points:[],lengthMm:4};
    expect(buildThreadPreview(p).links).toEqual([{from:{x:3,y:1},to:{x:7,y:2},trim:true}]);
    expect(buildThreadPreview({...p,segments:[]})).toEqual({links:[],needlePoints:[],lengthMm:0,trimCount:0});
    expect(buildThreadPreview({...p,segments:[p.segments[0]]}).links).toEqual([]);
  });
  it("uses the export precision and retains repeated real needle actions",()=>{
    const p:ColorPath={color:"black",segments:[
      {start:point(1.234,2.346),end:point(1.234,2.346)},
      {start:point(1.234,2.346),end:point(1.234,2.346)},
    ],points:[],lengthMm:0};
    expect(buildThreadPreview(p).needlePoints).toEqual([{x:1.23,y:2.35},{x:1.23,y:2.35}]);
    expect(buildThreadPreview(p).trimCount).toBe(0);
  });
});
