import {describe,it,expect} from 'vitest';
import {ARTWORK_PRESETS,resolvePromptPreset} from './artworkPresets';
import {generateBirdPreset} from './birdPreset';
import route from '../data/butterfly-route.json';
import {standardizePaths} from './pathExport';
import {buildColorText} from './deviceProtocol';
import {decodeEmbroideryBin,encodeEmbroideryBin} from './binProtocol';
import {COLOR_ORDER} from '../types/embroidery';
describe('isolated butterfly preset',()=>{
 it('selects butterfly while retaining rabbit and existing artwork',()=>{
  expect(resolvePromptPreset('蝴蝶')).toBe('butterfly');expect(resolvePromptPreset('蝴蝶路径')).toBe('butterfly');
  expect(resolvePromptPreset('butterfly')).toBe('butterfly');expect(resolvePromptPreset('兔子')).toBe('rabbit');
  expect(resolvePromptPreset('花鸟')).toBe('full');
 });
 it('maps every traced stroke separately without sewn connectors across white',()=>{
  const paths=generateBirdPreset({width:100,height:100},{x:0,y:0},ARTWORK_PRESETS.butterfly.scale,0,'butterfly');
  expect(paths.black.segments).toHaveLength(302);
  expect(route.needlePoints).toHaveLength(302);
  paths.black.points.forEach((point,index)=>{
    expect(point.x).toBeCloseTo(5+route.needlePoints[index][0]*90/512,8);
    expect(point.y).toBeCloseTo(5+route.needlePoints[index][1]*90/512,8);
  });
  let offset=0;
  for(const stroke of route.strokes){
   expect(paths.black.segments[offset].start).toEqual(paths.black.segments[offset].end);
   for(let i=1;i<stroke.length;i++)expect(paths.black.segments[offset+i].start).toEqual(paths.black.segments[offset+i-1].end);
   offset+=stroke.length;
  }
  for(const s of paths.black.segments)expect(Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y)).toBeLessThan(2.801);
  expect(route.summary.tracedEdges).toBe(route.summary.skeletonEdges);
 });
 it('uses one closed stored sequence and needs no nonzero jumps at default placement',()=>{
  expect(route.strokes).toHaveLength(1);
  expect(route.needlePoints[0]).toEqual(route.needlePoints.at(-1));
  const frame={width:100,height:100};
  const paths=generateBirdPreset(frame,ARTWORK_PRESETS.butterfly.position,.9,0,'butterfly');
  const data=standardizePaths(paths,frame,COLOR_ORDER,{image:{name:'蝴蝶.png',width:1254,height:1254},generation:{tolerance:20,scale:.9,rotationDegrees:0,positionXmm:ARTWORK_PRESETS.butterfly.position.x,positionYmm:ARTWORK_PRESETS.butterfly.position.y}});
  const first=data.paths.black.segments[0].points[1];
  const last=data.paths.black.segments.at(-1)!.points[1];
  expect(first).toEqual({x:50,y:50,action:'stitch'});expect(last).toEqual(first);
  const jumps=buildColorText(data,'black',1600).trim().split('\n').filter(line=>line.startsWith('J,'));
  expect(jumps).toHaveLength(302);expect(jumps.every(line=>line==='J,0,0')).toBe(true);
 });
 it('retains real needle targets through JSON/BIN and bounded UART encoding',()=>{
  const frame={width:100,height:100},paths=generateBirdPreset(frame,{x:0,y:0},.9,0,'butterfly');
  const data=standardizePaths(paths,frame,COLOR_ORDER,{image:{name:'蝴蝶.png',width:1254,height:1254},generation:{tolerance:20,scale:.9,rotationDegrees:0,positionXmm:0,positionYmm:0}});
  expect(decodeEmbroideryBin(encodeEmbroideryBin(data)).paths).toEqual(data.paths);
  const lines=buildColorText(data,'black',1600).trim().split('\n');expect(lines.length-1).toBeLessThanOrEqual(4096);
  let x=80000,y=80000;const actual=[];
  for(const line of lines.slice(1)){
   const [action,dx,dy]=line.split(',');expect(Math.abs(Number(dx))).toBeLessThanOrEqual(32767);expect(Math.abs(Number(dy))).toBeLessThanOrEqual(32767);
   x+=Number(dx);y+=Number(dy);if(action==='S')actual.push([x,y]);
  }
  expect(actual).toEqual(data.paths.black.segments.map(s=>[Math.round(s.points[1].x*1600),Math.round(s.points[1].y*1600)]));
 });
});
