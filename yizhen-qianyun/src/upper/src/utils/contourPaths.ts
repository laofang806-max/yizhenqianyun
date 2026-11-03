import { COLOR_ORDER, type ColorAnalysis, type ColorPath, type FrameSize, type PathSet, type PointMm, type PositionMm } from "../types/embroidery";
import { getImageSizeMm, imagePixelToFrameMm } from "./coordinateTransform";
type Pixel = {x:number;y:number};
type Edge = {a:Pixel;b:Pixel;dir:number;used:boolean};
const distance=(a:Pixel,b:Pixel)=>Math.hypot(a.x-b.x,a.y-b.y);
const area=(points:Pixel[])=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0)/2;

// Follow exposed pixel edges. At diagonal contacts turn right to keep the
// contours separate rather than splicing them into a self-crossing figure eight.
export function traceMaskContours(mask:Uint8Array,width:number,height:number):Pixel[][] {
  const edges:Edge[]=[],outgoing=new Map<number,number[]>();
  const key=(p:Pixel)=>p.y*(width+1)+p.x;
  const add=(x:number,y:number,bx:number,by:number,dir:number)=>{
    const a={x,y},b={x:bx,y:by},index=edges.length;
    edges.push({a,b,dir,used:false});
    const list=outgoing.get(key(a));if(list)list.push(index);else outgoing.set(key(a),[index]);
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mask[y*width+x]) {
    if(y===0||!mask[(y-1)*width+x])add(x,y,x+1,y,0);
    if(x===width-1||!mask[y*width+x+1])add(x+1,y,x+1,y+1,1);
    if(y===height-1||!mask[(y+1)*width+x])add(x+1,y+1,x,y+1,2);
    if(x===0||!mask[y*width+x-1])add(x,y+1,x,y,3);
  }
  const loops:Pixel[][]=[];
  for(const first of edges) {
    if(first.used)continue;
    const loop:Pixel[]=[];let edge=first;
    while(!edge.used) {
      edge.used=true;loop.push(edge.a);
      if(key(edge.b)===key(first.a))break;
      const next=(outgoing.get(key(edge.b))??[]).filter(i=>!edges[i].used);
      const preference=[1,0,3,2];
      next.sort((a,b)=>preference.indexOf((edges[a].dir-edge.dir+4)%4)-preference.indexOf((edges[b].dir-edge.dir+4)%4));
      if(!next.length)break;
      edge=edges[next[0]];
    }
    if(loop.length>=3)loops.push(area(loop)>0?loop.reverse():loop);
  }
  return loops;
}

function simplify(points:Pixel[],tolerance:number):Pixel[] {
  if(points.length<=2)return points;
  const a=points[0],b=points[points.length-1],dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
  let maximum=0,index=0;
  for(let i=1;i<points.length-1;i++) {
    const p=points[i],t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
    const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
    if(d>maximum){maximum=d;index=i;}
  }
  if(maximum<=tolerance)return [a,b];
  return [...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)];
}
function simplifyLoop(loop:Pixel[],tolerance:number) {
  let split=1;
  for(let i=2;i<loop.length;i++)if(distance(loop[0],loop[i])>distance(loop[0],loop[split]))split=i;
  const reduced=[...simplify(loop.slice(0,split+1),tolerance).slice(0,-1),...simplify([...loop.slice(split),loop[0]],tolerance).slice(0,-1)];
  return reduced.length>=3?reduced:loop;
}

export function generateContourPaths(analysis:ColorAnalysis,frame:FrameSize,position:PositionMm,scale:number,rotation:number,spacingMm=4):PathSet {
  if(!Number.isFinite(spacingMm)||spacingMm<=0)throw new Error("针距必须大于0。");
  const size=getImageSizeMm(analysis.sourceWidth,analysis.sourceHeight,frame,scale);
  const tolerance=Math.max(0.8,0.3/Math.max(size.width/analysis.width,size.height/analysis.height));
  const result={} as PathSet;
  for(const color of COLOR_ORDER) {
    const loops=traceMaskContours(analysis.masks[color].data,analysis.width,analysis.height)
      .sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)))
      .map(loop=>simplifyLoop(loop,tolerance));
    const segments:ColorPath['segments']=[],points:PointMm[]=[];
    const convert=(p:Pixel):PointMm=>({...imagePixelToFrameMm(p.x,p.y,analysis.width,analysis.height,size,frame,position,rotation),color});
    const append=(a:PointMm,b:PointMm)=>{
      if(segments.length>=2048)throw new Error("该颜色针迹超过板卡缓存，请提高简化程度后重新生成。");
      segments.push({start:a,end:b});points.push(a,b);
    };
    let last:Pixel|null=null;
    while(loops.length) {
      let loopIndex=0,start=0,best=Infinity;
      if(last) {
        // Complete each contour before moving to the next nearest one: no
        // scan-row shuttling back and forth between separate components.
        for(let i=0;i<loops.length;i++)for(let j=0;j<loops[i].length;j++) {
          const d=distance(last,loops[i][j]);
          if(d<best){best=d;loopIndex=i;start=j;}
        }
      } else {
        // Largest contour first; start at its topmost point and go CCW in
        // screen coordinates (negative signed area, y points down).
        for(let j=1;j<loops[0].length;j++)if(loops[0][j].y<loops[0][start].y || (loops[0][j].y===loops[0][start].y&&loops[0][j].x<loops[0][start].x))start=j;
      }
      const loop=loops.splice(loopIndex,1)[0];
      const ordered=[...loop.slice(start),...loop.slice(0,start)];
      const first=convert(ordered[0]);append(first,first);
      for(let i=0;i<ordered.length;i++) {
        const a=convert(ordered[i]),b=convert(ordered[(i+1)%ordered.length]);
        const count=Math.max(1,Math.ceil(distance(a,b)/spacingMm));
        let from=a;
        for(let j=1;j<=count;j++) {
          const to:PointMm=j===count?b:{x:a.x+(b.x-a.x)*j/count,y:a.y+(b.y-a.y)*j/count,color};
          append(from,to);from=to;
        }
      }
      last=ordered[0];
    }
    result[color]={color,segments,points,lengthMm:segments.reduce((n,s)=>n+distance(s.start,s.end),0)};
  }
  return result;
}
