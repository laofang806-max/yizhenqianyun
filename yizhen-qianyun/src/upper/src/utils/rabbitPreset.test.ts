import {describe,it,expect} from 'vitest';
import {ARTWORK_PRESETS,resolvePromptPreset} from './artworkPresets';
import {generateBirdPreset} from './birdPreset';
import route from '../data/rabbit-route.json';
import {standardizePaths} from './pathExport';
import {buildColorText} from './deviceProtocol';
import {decodeEmbroideryBin,encodeEmbroideryBin} from './binProtocol';
import {COLOR_ORDER} from '../types/embroidery';
describe('rabbit reference preset',()=>{
 it('loads from Chinese rabbit keywords without model configuration',()=>{
  for(const s of ['兔子','小兔子','兔子黑白图','rabbit'])expect(resolvePromptPreset(s)).toBe('rabbit');
  expect(resolvePromptPreset('花鸟')).toBe('full');
  expect(resolvePromptPreset('太极')).toBe('taiji');
 });
 it('keeps the outer contour, two satin eyes and two mouth strokes separate',()=>{
  const paths=generateBirdPreset({width:100,height:100},{x:0,y:0},ARTWORK_PRESETS.rabbit.scale,0,'rabbit');
  expect(paths.black.segments).toHaveLength(route.needlePoints.length);
  let offset=0;
  for(const stroke of route.strokes){
   expect(paths.black.segments[offset].start).toEqual(paths.black.segments[offset].end);
   for(let i=1;i<stroke.length;i++)expect(paths.black.segments[offset+i].start).toEqual(paths.black.segments[offset+i-1].end);
   offset+=stroke.length;
  }
  const points=paths.black.points;
  const height=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
  expect(height).toBeGreaterThan(59);expect(height).toBeLessThan(61);
 });
 it('preserves every drop and stroke jump through real JSON/BIN/UART encoders',()=>{
  const frame={width:100,height:100};
  const paths=generateBirdPreset(frame,{x:0,y:0},ARTWORK_PRESETS.rabbit.scale,0,'rabbit');
  const data=standardizePaths(paths,frame,COLOR_ORDER,{image:{name:'兔子.png',width:1000,height:1000},generation:{scale:.72,tolerance:20,rotationDegrees:0,positionXmm:0,positionYmm:0}});
  expect(decodeEmbroideryBin(encodeEmbroideryBin(data)).paths).toEqual(data.paths);
  const lines=buildColorText(data,'black',1600).trim().split('\n');
  expect(lines.length-1).toBeLessThanOrEqual(4096);
  const actual=[] as number[][];let x=80000,y=80000;
  for(const line of lines.slice(1)){
   const [action,dx,dy]=line.split(',');
   expect(Math.abs(Number(dx))).toBeLessThanOrEqual(32767);
   expect(Math.abs(Number(dy))).toBeLessThanOrEqual(32767);
   x+=Number(dx);y+=Number(dy);
   if(action==='S')actual.push([x,y]);
  }
  expect(actual).toEqual(data.paths.black.segments.map(s=>[Math.round(s.points[1].x*1600),Math.round(s.points[1].y*1600)]));
  expect(actual).toHaveLength(route.needlePoints.length);
 });
});
