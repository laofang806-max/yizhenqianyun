import { describe, it, expect } from "vitest";
import { generateOrderedPaths, type OrderedArtwork } from "./orderedPointPaths";
import { standardizePaths } from "./pathExport";
import { buildColorText } from "./deviceProtocol";
import { COLOR_ORDER } from "../types/embroidery";
const square: OrderedArtwork={width:100,height:100,strokes:[{color:"black",closed:true,
  vertices:[{x:40,y:40},{x:60,y:40},{x:60,y:60},{x:40,y:60}]}]};
const frame={width:100,height:100},position={x:0,y:0};
const meta={image:{name:"square.png",width:100,height:100},generation:{tolerance:20,scale:1,rotationDegrees:0,positionXmm:0,positionYmm:0}};
describe("ordered point embroidery",()=>{
  it("uses fewer needles at sparse spacing while retaining every clicked corner and closure",()=>{
    for(const spacing of [4,6]) {
      const p=generateOrderedPaths(square,frame,position,1,0,spacing).black;
      expect(p.segments.length).toBeLessThan(41);
      let cursor=0;
      for(const vertex of [...square.strokes[0].vertices,square.strokes[0].vertices[0]]) {
        const index=p.segments.findIndex((s,i)=>i>=cursor && s.end.x===vertex.x && s.end.y===vertex.y);
        expect(index).toBeGreaterThanOrEqual(cursor);
        cursor=index+1;
      }
      expect(p.lengthMm).toBeCloseTo(80);
      expect(p.segments.at(-1)!.end).toEqual(p.segments[0].start);
    }
  });
  it("anchors at the first point and follows all four edges back to the first point",()=>{
    const p=generateOrderedPaths(square,frame,position,1,0).black;
    expect(p.segments).toHaveLength(41); // first anchor + 4*10 stitches at 2mm
    expect(p.segments[0].start).toEqual({x:40,y:40,color:"black"});
    expect(p.segments[0].end).toEqual(p.segments[0].start);
    expect(p.segments[10].end).toEqual({x:60,y:40,color:"black"});
    expect(p.segments[20].end).toEqual({x:60,y:60,color:"black"});
    expect(p.segments[30].end).toEqual({x:40,y:60,color:"black"});
    expect(p.segments[40].end).toEqual({x:40,y:40,color:"black"});
    expect(p.lengthMm).toBeCloseTo(80);
    for(const s of p.segments.slice(1)) {
      expect(Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y)).toBeLessThanOrEqual(2.000001);
      expect(s.start.x===s.end.x || s.start.y===s.end.y).toBe(true); // no diagonals
    }
  });
  it("exports an initial anchor, no needle during initial travel, and a closed final position",()=>{
    const paths=generateOrderedPaths(square,frame,position,1,0);
    const data=standardizePaths(paths,frame,[...COLOR_ORDER],meta);
    const text=buildColorText(data,"black",1600);
    expect(text.startsWith("COLOR black 82\nJ,-16000,-16000\nS,0,0\n")).toBe(true);
    let x=50*1600,y=50*1600,n=0;
    for(const line of text.trim().split("\n").slice(1)) {
      const [kind,dx,dy]=line.split(",");x+=Number(dx);y+=Number(dy);
      if(kind==="S") {n++;expect([40*1600,60*1600].includes(x)||[40*1600,60*1600].includes(y)).toBe(true);}
    }
    expect(n).toBe(41);expect(x).toBe(40*1600);expect(y).toBe(40*1600);
  });
  it("keeps deliberate click order instead of sorting by raster row or nearest corner",()=>{
    const reverse={...square,strokes:[{...square.strokes[0],vertices:[{x:40,y:40},{x:40,y:60},{x:60,y:60},{x:60,y:40}]}]};
    const p=generateOrderedPaths(reverse,frame,position,1,0).black;
    expect(p.segments[1].end).toEqual({x:40,y:42,color:"black"});
  });
  it("supports open paths and one isolated point",()=>{
    const open={...square,strokes:[{...square.strokes[0],closed:false}]};
    expect(generateOrderedPaths(open,frame,position,1,0).black.segments).toHaveLength(31);
    const one={...square,strokes:[{...square.strokes[0],vertices:[{x:20,y:30}]}]};
    expect(generateOrderedPaths(one,frame,position,1,0).black.segments).toHaveLength(1);
  });
  it("applies scale, translation and rotation to the ordered geometry",()=>{
    const p=generateOrderedPaths(square,frame,{x:3,y:-2},0.5,90).black;
    expect(p.segments[0].start.x).toBeCloseTo(58);
    expect(p.segments[0].start.y).toBeCloseTo(43);
    expect(p.lengthMm).toBeCloseTo(40);
    expect(p.segments[p.segments.length-1].end).toEqual(p.segments[0].start);
  });
  it("anchors each separate stroke and does not join different colors",()=>{
    const a={...square,strokes:[square.strokes[0],{color:"red" as const,closed:false,vertices:[{x:30,y:30},{x:35,y:30}]}]};
    const paths=generateOrderedPaths(a,frame,position,1,0);
    expect(paths.red.segments[0].start).toEqual({x:30,y:30,color:"red"});
    expect(paths.black.segments).toHaveLength(41);
    expect(paths.blue.segments).toHaveLength(0);
  });
  it("rejects invalid coordinates and protects board memory limits",()=>{
    expect(()=>generateOrderedPaths(square,frame,position,1,0,0)).toThrow();
    const invalid={...square,strokes:[{...square.strokes[0],vertices:[{x:-1,y:30}]}]};
    expect(()=>generateOrderedPaths(invalid,frame,position,1,0)).toThrow();
    expect(()=>generateOrderedPaths(square,frame,position,1,0,0.001)).toThrow(/缓存/);
  });
});
