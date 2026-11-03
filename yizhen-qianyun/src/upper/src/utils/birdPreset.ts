import butterflyRoute from '../data/butterfly-route.json';
import rabbitRoute from '../data/rabbit-route.json';
import type { RegisteredImageRoute } from "./recognizeArtwork";
import taijiRoute from '../data/taiji-route.json';
import fullRoute from '../data/bird-route.json';
import soloRoute from '../data/solo-bird-route.json';
import flowerRoute from '../data/flower-route.json';
import type { ArtworkPresetKey } from './artworkPresets';
import { COLOR_ORDER, type PathSet, type PointMm, type FrameSize, type PositionMm } from '../types/embroidery';
import { getImageSizeMm, imagePixelToFrameMm } from './coordinateTransform';

export const BIRD_NEEDLE_COUNT = fullRoute.needlePoints.length;
// Use the reviewed sequence directly; raster tracing would lose the filled eye
// and could reorder the permitted return passes.
export const SOLO_BIRD_NEEDLE_COUNT = soloRoute.needlePoints.length;
export function generateBirdPreset(frame:FrameSize,position:PositionMm,scale:number,rotation:number,variant:ArtworkPresetKey="full",registered?:RegisteredImageRoute):PathSet {
  if((variant==='rabbit'||variant==='butterfly') && !registered){
    const segmentedRoute=variant==='butterfly'?butterflyRoute:rabbitRoute;
    const size=getImageSizeMm(segmentedRoute.width,segmentedRoute.height,frame,scale);
    const strokes=segmentedRoute.strokes.map(stroke=>stroke.map(([x,y])=>({...imagePixelToFrameMm(x,y,segmentedRoute.width,segmentedRoute.height,size,frame,position,rotation),color:'black' as const})));
    const points=strokes.flat();
    // Start every separate feature with a jump, never stitch a connector across white.
    const segments=strokes.flatMap(stroke=>stroke.map((end,i)=>({start:stroke[Math.max(0,i-1)],end})));
    return Object.fromEntries(COLOR_ORDER.map(color=>[color,{color,segments:color==='black'?segments:[],points:color==='black'?points:[],lengthMm:color==='black'?segments.reduce((n,s)=>n+Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y),0):0}])) as PathSet;
  }
  const route=registered ?? (variant==="taiji"?taijiRoute:variant==="solo"?soloRoute:variant==="flower"?flowerRoute:fullRoute);
  const size=getImageSizeMm(route.width,route.height,frame,scale);
  const points:PointMm[]=route.needlePoints.map(([x,y])=>({...imagePixelToFrameMm(x,y,route.width,route.height,size,frame,position,rotation),color:'black'}));
  const segments=points.map((end,i)=>({start:points[Math.max(0,i-1)],end}));
  return Object.fromEntries(COLOR_ORDER.map(color=>[color,{color,segments:color==='black'?segments:[],points:color==='black'?points:[],lengthMm:color==='black'?segments.reduce((n,s)=>n+Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y),0):0}])) as PathSet;
}
