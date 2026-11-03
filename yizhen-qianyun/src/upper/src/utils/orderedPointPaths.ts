import { COLOR_ORDER, type EmbroideryColor, type FrameSize, type PathSet, type PositionMm, type PointMm } from "../types/embroidery";
import { getImageSizeMm, imagePixelToFrameMm } from "./coordinateTransform";

export type OrderedVertex = { x: number; y: number };
export type OrderedStroke = { color: EmbroideryColor; vertices: OrderedVertex[]; closed: boolean };
export type OrderedArtwork = { width: number; height: number; strokes: OrderedStroke[] };

// Keep authoring order. Raster/connected-component order must never reorder vertices.
export function generateOrderedPaths(
  artwork: OrderedArtwork, frame: FrameSize, position: PositionMm,
  scale: number, rotation: number, spacingMm = 2,
): PathSet {
  if (!Number.isFinite(spacingMm) || spacingMm <= 0) throw new Error("针距必须大于0。");
  if (artwork.width <= 0 || artwork.height <= 0) throw new Error("点选画布尺寸无效。");
  const result: PathSet = {
    black:{color:"black",segments:[],points:[],lengthMm:0},
    red:{color:"red",segments:[],points:[],lengthMm:0},
    yellow:{color:"yellow",segments:[],points:[],lengthMm:0},
    blue:{color:"blue",segments:[],points:[],lengthMm:0},
  };
  const size = getImageSizeMm(artwork.width, artwork.height, frame, scale);
  for (const stroke of artwork.strokes) {
    if (!COLOR_ORDER.includes(stroke.color)) throw new Error("点选路径颜色无效。");
    if (!stroke.vertices.length) continue;
    const vertices = stroke.vertices.map(v => {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.x < 0 || v.y < 0 || v.x > artwork.width || v.y > artwork.height)
        throw new Error("点选坐标超出画布。");
      return {...imagePixelToFrameMm(v.x,v.y,artwork.width,artwork.height,size,frame,position,rotation),color:stroke.color};
    });
    const path = result[stroke.color];
    const add = (a: PointMm, b: PointMm) => {
      if(path.segments.length >= 2048) throw new Error("点选针迹超过板卡缓存，请减小图案或增大针距。");
      path.segments.push({start:a,end:b}); path.points.push(a,b);
      path.lengthMm += Math.hypot(b.x-a.x,b.y-a.y);
    };
    // First make an anchor stitch at the first clicked point before moving along an edge.
    add(vertices[0],vertices[0]);
    const targets = vertices.slice(1);
    if (stroke.closed && vertices.length > 2 &&
      (vertices[vertices.length-1].x !== vertices[0].x || vertices[vertices.length-1].y !== vertices[0].y)) targets.push(vertices[0]);
    let previous=vertices[0];
    for (const target of targets) {
      const from=previous;
      const distance=Math.hypot(target.x-from.x,target.y-from.y);
      if(distance < 1e-9) continue;
      const steps=Math.ceil(distance/spacingMm);
      for(let i=1;i<=steps;i++) {
        const next: PointMm = i===steps ? target : {x:from.x+(target.x-from.x)*i/steps,y:from.y+(target.y-from.y)*i/steps,color:stroke.color};
        add(previous,next); previous=next;
      }
    }
  }
  return result;
}
