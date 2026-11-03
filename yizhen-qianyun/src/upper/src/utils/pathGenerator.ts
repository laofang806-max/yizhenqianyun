import {
  COLOR_ORDER,
  type ColorAnalysis,
  type ColorPath,
  type EmbroideryColor,
  type FrameSize,
  type PathSegment,
  type PathSet,
  type PositionMm,
  type PointMm,
} from "../types/embroidery";
import { getImageSizeMm, imagePixelToFrameMm } from "./coordinateTransform";

export interface StitchDensity {
  stitchSpacingMm: number;
  rowSpacingMm: number;
}

export const STITCH_DENSITIES = {
  simple: { stitchSpacingMm: 4, rowSpacingMm: 3 },
  sparse: { stitchSpacingMm: 6, rowSpacingMm: 5 },
  detailed: { stitchSpacingMm: 2, rowSpacingMm: 1.4 },
} satisfies Record<string, StitchDensity>;
const MIN_STITCH_LENGTH_MM = 0.45;

function generateColorPath(
  color: EmbroideryColor,
  analysis: ColorAnalysis,
  frame: FrameSize,
  position: PositionMm,
  scale: number,
  rotation: number,
  density: StitchDensity,
): ColorPath {
  const colorMask = analysis.masks[color];
  const mask = colorMask.data;
  const coveredRegions = new Set<number>();
  const imageSize = getImageSizeMm(analysis.sourceWidth, analysis.sourceHeight, frame, scale);
  let lastPixel: {x:number;y:number} | null = null;
  let lastRegion: number | undefined;
  const append = (a: PointMm,b: PointMm) => {
    if (segments.length >= 2048) throw new Error("该颜色针迹超过板卡缓存，请缩小图案后重新生成。");
    segments.push({start:a,end:b});points.push(a,b);
  };
  const run = (a: PointMm,b: PointMm) => {
    const distance=Math.hypot(b.x-a.x,b.y-a.y);
    if(distance<1e-9)return;
    const count=Math.ceil(distance/density.stitchSpacingMm);
    let from=a;
    for(let i=1;i<=count;i++) {
      const to:PointMm=i===count?b:{x:a.x+(b.x-a.x)*i/count,y:a.y+(b.y-a.y)*i/count,color};
      append(from,to);from=to;
    }
  };
  const insideMask = (a:{x:number;y:number},b:{x:number;y:number}) => {
    const samples=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*4));
    for(let i=0;i<=samples;i++) {
      const x=Math.floor(a.x+(b.x-a.x)*i/samples), y=Math.floor(a.y+(b.y-a.y)*i/samples);
      if(x<0||y<0||x>=analysis.width||y>=analysis.height||!mask[y*analysis.width+x])return false;
    }
    return true;
  };
  const connectionPath = (a:{x:number;y:number},b:{x:number;y:number}): {x:number;y:number}[] | null => {
    if(insideMask(a,b))return [b];
    // Walk inside the mask around a stair-stepped edge or white eye, rather than
    // creating a false sewing chord through the white area. Bound the search.
    const pad=Math.max(6,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)));
    const left=Math.max(0,Math.floor(Math.min(a.x,b.x))-pad);
    const right=Math.min(analysis.width-1,Math.floor(Math.max(a.x,b.x))+pad);
    const top=Math.max(0,Math.floor(Math.min(a.y,b.y))-pad);
    const bottom=Math.min(analysis.height-1,Math.floor(Math.max(a.y,b.y))+pad);
    const width=right-left+1,height=bottom-top+1;
    if(width*height>200000)return null;
    const parent=new Int32Array(width*height).fill(-1),queue=new Int32Array(width*height);
    const start=(Math.floor(a.y)-top)*width+Math.floor(a.x)-left;
    const target=(Math.floor(b.y)-top)*width+Math.floor(b.x)-left;
    let size=1,cursor=0;queue[0]=start;parent[start]=start;
    while(cursor<size && cursor<8192 && parent[target]===-1) {
      const index=queue[cursor++],x=index%width,y=Math.floor(index/width);
      for(const next of [x>0?index-1:-1,x+1<width?index+1:-1,y>0?index-width:-1,y+1<height?index+width:-1]) {
        if(next<0||parent[next]!==-1)continue;
        const px=left+next%width,py=top+Math.floor(next/width);
        if(!mask[py*analysis.width+px])continue;
        parent[next]=index;queue[size++]=next;
      }
    }
    if(parent[target]===-1)return null;
    const route:{x:number;y:number}[]=[];
    let index=target;
    while(index!==start) {route.push({x:left+index%width+0.5,y:top+Math.floor(index/width)+0.5});index=parent[index];}
    route.reverse();
    const turns:{x:number;y:number}[]=[];
    let previous=a;
    for(let i=0;i<route.length;i++) {
      const here=route[i],next=route[i+1];
      if(!next || (here.x-previous.x)*(next.y-here.y)!==(here.y-previous.y)*(next.x-here.x))turns.push(here);
      previous=here;
    }
    // Collapse pixel staircases with mask-checked shortcuts. Keep holes and
    // boundaries intact; never replace these by a chord through white pixels.
    const simplified: {x:number;y:number}[] = [];
    let from = a, turnIndex = 0;
    while (turnIndex < turns.length) {
      let next = Math.min(turns.length - 1, turnIndex + 128);
      while (next > turnIndex && !insideMask(from, turns[next])) next--;
      simplified.push(turns[next]);
      from = turns[next];
      turnIndex = next + 1;
    }
    return simplified;
  };
  const rowStep = Math.max(1, Math.round(density.rowSpacingMm / (imageSize.height / analysis.height)));
  const segments: PathSegment[] = [];
  const points: PointMm[] = [];
  let lastPoint = { x: frame.width / 2, y: frame.height / 2 };

  for (let y = Math.floor(rowStep / 2); y < analysis.height; y += rowStep) {
    const rowSegments: (PathSegment & {startPixel:{x:number;y:number};endPixel:{x:number;y:number};region?:number})[] = [];
    let x = 0;
    while (x < analysis.width) {
      while (x < analysis.width && !mask[y * analysis.width + x]) x += 1;
      const start = x;
      while (x < analysis.width && mask[y * analysis.width + x]) x += 1;
      const end = x;
      if (end <= start) continue;

      const widthMm = ((end - start) / analysis.width) * imageSize.width;
      if (widthMm < MIN_STITCH_LENGTH_MM) continue;

      const startPosition = imagePixelToFrameMm(
        start + 0.5,
        y + 0.5,
        analysis.width,
        analysis.height,
        imageSize,
        frame,
        position,
        rotation,
      );
      const endPosition = imagePixelToFrameMm(
        end - 0.5,
        y + 0.5,
        analysis.width,
        analysis.height,
        imageSize,
        frame,
        position,
        rotation,
      );

      const startPoint: PointMm = { ...startPosition, color };
      const endPoint: PointMm = { ...endPosition, color };
      rowSegments.push({ start: startPoint, end: endPoint,
        startPixel:{x:start+0.5,y:y+0.5},endPixel:{x:end-0.5,y:y+0.5},
        region:colorMask.labels?.[y*analysis.width+start],
      });
      if (colorMask.labels) coveredRegions.add(colorMask.labels[y * analysis.width + start]);
      else {
        for (const region of colorMask.regions) {
          if (y >= region.top && y <= region.bottom && start >= region.left && start <= region.right)
            coveredRegions.add(region.id);
        }
      }
    }

    while (rowSegments.length > 0) {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      let reverse = false;
      for (let index = 0; index < rowSegments.length; index += 1) {
        const candidate = rowSegments[index];
        const startDistance =
          (candidate.start.x - lastPoint.x) ** 2 +
          (candidate.start.y - lastPoint.y) ** 2;
        const endDistance =
          (candidate.end.x - lastPoint.x) ** 2 +
          (candidate.end.y - lastPoint.y) ** 2;
        if (startDistance < bestDistance) {
          bestIndex = index;
          bestDistance = startDistance;
          reverse = false;
        }
        if (endDistance < bestDistance) {
          bestIndex = index;
          bestDistance = endDistance;
          reverse = true;
        }
      }

      const [nearest] = rowSegments.splice(bestIndex, 1);
      if (reverse) {
        [nearest.start, nearest.end] = [nearest.end, nearest.start];
        [nearest.startPixel, nearest.endPixel] = [nearest.endPixel, nearest.startPixel];
      }
      const connection=lastPixel && (!colorMask.labels || lastRegion===nearest.region)
        ? connectionPath(lastPixel,nearest.startPixel) : null;
      if(connection) {
        let from:PointMm={...lastPoint,color};
        for(const pixel of connection) {
          const to:PointMm={...imagePixelToFrameMm(pixel.x,pixel.y,analysis.width,analysis.height,imageSize,frame,position,rotation),color};
          run(from,to);from=to;
        }
      } else {
        append(nearest.start,nearest.start); // anchor after each actual lift-and-travel
      }
      run(nearest.start,nearest.end);
      lastPoint = nearest.end;
      lastPixel = nearest.endPixel;
      lastRegion = nearest.region;
    }
  }

  // Every accepted component must produce a stitch, even if the global scan
  // rows miss it or it is smaller than the normal running-stitch length.
  // Use a real pixel from that component, never the empty centre of a bounding box.
  for (const region of colorMask.regions) {
    if (coveredRegions.has(region.id)) continue;
    const centreX = (region.left + region.right) / 2;
    const centreY = (region.top + region.bottom) / 2;
    let bestX = -1, bestY = -1, bestDistance = Infinity;
    for (let y = region.top; y <= region.bottom; y += 1) {
      for (let x = region.left; x <= region.right; x += 1) {
        const index = y * analysis.width + x;
        if (!mask[index] || (colorMask.labels && colorMask.labels[index] !== region.id)) continue;
        const distance = (x-centreX)**2 + (y-centreY)**2;
        if (distance < bestDistance) { bestX=x; bestY=y; bestDistance=distance; }
      }
    }
    if (bestX < 0) continue;
    const location = imagePixelToFrameMm(bestX+0.5, bestY+0.5,
      analysis.width, analysis.height, imageSize, frame, position, rotation);
    const point: PointMm = {...location, color};
    // Export converts this to J(target), S(0,0): move first, then one needle cycle.
    append(point,point);
  }

  const lengthMm = segments.reduce(
    (total, segment) => total + Math.hypot(
      segment.end.x - segment.start.x,
      segment.end.y - segment.start.y,
    ),
    0,
  );

  return { color, segments, points, lengthMm };
}

export function generateEmbroideryPaths(
  analysis: ColorAnalysis,
  frame: FrameSize,
  position: PositionMm,
  scale: number,
  rotation: number,
  density: StitchDensity = STITCH_DENSITIES.detailed,
): PathSet {
  if (![density.stitchSpacingMm, density.rowSpacingMm].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error("针距和填充行距必须大于0。");
  }
  return {
    black: generateColorPath("black", analysis, frame, position, scale, rotation, density),
    red: generateColorPath("red", analysis, frame, position, scale, rotation, density),
    yellow: generateColorPath("yellow", analysis, frame, position, scale, rotation, density),
    blue: generateColorPath("blue", analysis, frame, position, scale, rotation, density),
  };
}

export function arePathsOutsideFrame(paths: PathSet, frame: FrameSize): boolean {
  return COLOR_ORDER.some((color) =>
    paths[color].points.some(
      (point) => point.x < 0 || point.y < 0 || point.x > frame.width || point.y > frame.height,
    ),
  );
}
