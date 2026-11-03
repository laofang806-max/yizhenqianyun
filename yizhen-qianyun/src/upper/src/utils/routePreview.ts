import type { ColorPath, PositionMm } from "../types/embroidery";

export type RouteMove = { from: PositionMm; to: PositionMm; action: "jump" | "stitch"; returning?: boolean };
// Follow the same J(start), S(end) sequence as pathExport, at export precision.
// Never mark J targets or automatic return-to-origin as needle drops.
export function buildRoutePreview(path: ColorPath, origin: PositionMm) {
  const q = (p: PositionMm): PositionMm => ({x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100});
  const same=(a:PositionMm,b:PositionMm)=>a.x===b.x&&a.y===b.y;
  let current=q(origin);
  const moves: RouteMove[]=[];
  const needlePoints: PositionMm[]=[];
  for(const segment of path.segments) {
    const start=q(segment.start),end=q(segment.end);
    if(!same(current,start))moves.push({from:current,to:start,action:"jump"});
    moves.push({from:start,to:end,action:"stitch"});
    needlePoints.push(end);current=end;
  }
  if(path.segments.length && !same(current,q(origin))) moves.push({from:current,to:q(origin),action:"jump",returning:true});
  return {moves,needlePoints};
}

// Thread is anchored only at needle drops. A needle-up move does not cut it:
// consecutive anchors remain connected, even across an independent component.
// Initial positioning and return have no new needle anchor, so are not sewn edges.
export function buildThreadPreview(path: ColorPath) {
  const q = (p: PositionMm): PositionMm => ({x:Math.round(p.x*100)/100,y:Math.round(p.y*100)/100});
  const needlePoints=path.segments.map(segment=>q(segment.end));
  const links: {from:PositionMm;to:PositionMm;trim:boolean}[]=[];
  for(let i=1;i<path.segments.length;i++) {
    const from=needlePoints[i-1],to=needlePoints[i],start=q(path.segments[i].start);
    links.push({from,to,trim:from.x!==start.x || from.y!==start.y});
  }
  const lengthMm=links.reduce((sum,link)=>sum+Math.hypot(link.to.x-link.from.x,link.to.y-link.from.y),0);
  return {needlePoints,links,lengthMm,trimCount:links.filter(link=>link.trim).length};
}
