import {describe,it,expect} from 'vitest';
import {generateBirdPreset,BIRD_NEEDLE_COUNT} from './birdPreset';
import {standardizePaths} from './pathExport';
import {buildColorText} from './deviceProtocol';
import {COLOR_ORDER} from '../types/embroidery';
import {keepNeedlesInsideFrame} from './needleEditing';
describe('reviewed bird stitch preset',()=>{
 // The current saved route is the reviewed 1307-drop open traversal, replacing
 // the old 1830-drop closed traversal. Check its authored endpoints and eye anchors.
 it('preserves the reviewed open sequence, continuity and 12 eye anchors',()=>{
  const p=generateBirdPreset({width:100,height:100},{x:0,y:0},.85,0).black;
  expect(BIRD_NEEDLE_COUNT).toBe(1307);expect(p.segments).toHaveLength(1307);
  for(let i=1;i<p.segments.length;i++)expect(p.segments[i].start).toEqual(p.segments[i-1].end);
  expect(p.segments[0].end.x).toBeCloseTo(73.90625);
  expect(p.segments[0].end.y).toBeCloseTo(71.515625);
  expect(p.segments.at(-1)!.end.x).toBeCloseTo(42.03125);
  expect(p.segments.at(-1)!.end.y).toBeCloseTo(54.940625);
  const cx=(100-599*85/800)/2+395*85/800,cy=7.5+276*85/800;
  expect(p.segments.filter(s=>Math.hypot(s.end.x-cx,s.end.y-cy)<.55)).toHaveLength(12);
 });
 it('exports inside 100mm frame and the 4096-command limit without losing drops',()=>{
  const frame={width:100,height:100},paths=generateBirdPreset(frame,{x:0,y:0},.85,0);
  const data=standardizePaths(paths,frame,COLOR_ORDER,{image:{name:'bird.jpg',width:599,height:800},generation:{scale:.85,tolerance:20,rotationDegrees:0,positionXmm:0,positionYmm:0}});
  const text=buildColorText(data,'black',1600),lines=text.trim().split('\n');
  expect(lines.filter(s=>s.startsWith('S,'))).toHaveLength(1307);expect(lines.length-1).toBeLessThanOrEqual(4096);
 });
 it('transforms with the artwork and crops out-of-frame drops',()=>{
  const a=generateBirdPreset({width:100,height:100},{x:0,y:0},.85,0).black;
  const b=generateBirdPreset({width:100,height:100},{x:10,y:5},.85,90).black;
  expect(b.segments[0].end.x).toBeCloseTo(60-(a.segments[0].end.y-50));
  const cropped=keepNeedlesInsideFrame(generateBirdPreset({width:100,height:100},{x:70,y:0},.85,0),{width:100,height:100});
  expect(cropped.removed).toBeGreaterThan(0);
  for(const s of cropped.paths.black.segments){expect(s.end.x).toBeLessThanOrEqual(100);expect(s.end.x).toBeGreaterThanOrEqual(0);}
 });
});
