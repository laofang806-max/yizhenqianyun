import { COLOR_ORDER, type ColorPath, type EmbroideryColor, type FrameSize, type PathSegment, type PathSet, type PointMm, type PositionMm } from "../types/embroidery";
export type NeedleSelection={color:EmbroideryColor;index:number};
export type NeedleEditMode="off"|"move"|"add"|"delete";
export type NeedleEdit=
 | {kind:"move";selection:NeedleSelection;point:PositionMm}
 | {kind:"delete";selection:NeedleSelection}
 | {kind:"add";color:EmbroideryColor;after:number;point:PositionMm};
const same=(a:PositionMm,b:PositionMm)=>a.x===b.x&&a.y===b.y;
const rebuild=(color:EmbroideryColor,segments:PathSegment[]):ColorPath=>({color,segments,points:segments.flatMap(s=>[s.start,s.end]),lengthMm:segments.reduce((n,s)=>n+Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y),0)});

// Work on real S endpoints, never just on painted canvas circles. Keep explicit
// inter-component jumps; moving one vertex updates its connected outgoing edge.
export function editNeedle(paths:PathSet,edit:NeedleEdit):PathSet {
 const color=edit.kind==="add"?edit.color:edit.selection.color;
 const segments=paths[color].segments.map(s=>({start:{...s.start},end:{...s.end}}));
 if(edit.kind!=="delete"&&(!Number.isFinite(edit.point.x)||!Number.isFinite(edit.point.y)))throw new Error("落针点坐标无效。");
 if(edit.kind==="add") {
  if(!Number.isInteger(edit.after)||edit.after < -1||edit.after>=segments.length)throw new Error("插入位置已变化，请重新选择落针点。");
  const point:PointMm={...edit.point,color},previous=segments[edit.after],next=segments[edit.after+1];
  const connected=next&&previous&&same(next.start,previous.end);
  segments.splice(edit.after+1,0,{start:previous?previous.end:point,end:point});
  if(next&&(connected||!previous))next.start=point;
 } else {
  const i=edit.selection.index,current=segments[i];if(!current)throw new Error("该落针点已变化，请重新选择。");
  const next=segments[i+1],previous=segments[i-1],outgoing=next&&same(next.start,current.end);
  if(edit.kind==="move") {
   const point:PointMm={...edit.point,color};
   if(same(current.start,current.end))current.start=point;
   current.end=point;if(outgoing)next.start=point;
  } else {
   if(outgoing)next.start=previous&&same(current.start,previous.end)?previous.end:next.end;
   segments.splice(i,1);
  }
 }
 if(segments.length>2048)throw new Error("该颜色超过2048个落针点，请删减后再添加。");
 return {...paths,[color]:rebuild(color,segments)};
}

// Drop outside needle targets instead of pinning them to the frame edge. On
// re-entry make an anchor at the first surviving endpoint: no outside S or J
// coordinate can leak into the preview, exports or serial commands.
export function keepNeedlesInsideFrame(paths:PathSet,frame:FrameSize) {
 const inside=(p:PositionMm)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<=frame.width&&p.y<=frame.height;
 let removed=0;
 const result={} as PathSet;
 for(const color of COLOR_ORDER) {
  const segments:PathSegment[]=[];
  for(const s of paths[color].segments) {
   if(!inside(s.end)){removed++;continue;}
   segments.push({start:inside(s.start)?s.start:s.end,end:s.end});
  }
  result[color]=rebuild(color,segments);
 }
 return {paths:result,removed};
}
