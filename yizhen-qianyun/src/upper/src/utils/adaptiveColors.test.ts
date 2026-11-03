import {describe,it,expect} from 'vitest';
import {mergeThreadColors} from './adaptiveColors';
function fixture(colors:number[][]){const pixels=new Uint8ClampedArray(colors.length*16*4);colors.forEach((c,block)=>{for(let n=0;n<16;n++)pixels.set([...c,255],(block*16+n)*4);});return pixels;}
describe('adaptive thread palette',()=>{
 it('creates no thread layer for pure white or neutral near-white backgrounds',()=>{
  const pixels=fixture([[255,255,255],[246,245,248],[235,235,235],[240,234,232]]);
  expect(mergeThreadColors(pixels,16,4,22,16)).toEqual([]);
 });
 it('keeps light colored threads while excluding surrounding white pixels',()=>{
  const layers=mergeThreadColors(fixture([[255,255,255],[255,220,232],[255,245,175],[195,220,250]]),16,4,8,16);
  expect(layers).toHaveLength(3);
  expect(layers.reduce((n,l)=>n+l.pixels,0)).toBe(48);
  for(const layer of layers)expect([...layer.analysis.masks.black.data.slice(0,16)]).toEqual(Array(16).fill(0));
 });
 it('preserves colors outside the old four-color palette',()=>{
  const colors=[[0,160,70],[255,120,0],[160,35,180],[245,105,170],[0,160,180],[30,45,200]];
  const layers=mergeThreadColors(fixture(colors),16,6,8,16);
  expect(layers.length).toBe(6);expect(new Set(layers.map(l=>l.hex)).size).toBe(6);
  expect(layers.reduce((n,l)=>n+l.pixels,0)).toBe(96);
 });
 it('merges similar shades and ignores white background',()=>{
  const layers=mergeThreadColors(fixture([[220,80,125],[224,83,128],[255,255,255]]),16,3,15,16);
  expect(layers.length).toBe(1);expect(layers[0].pixels).toBe(32);
 });
 it('bounds thread count and rejects malformed inputs',()=>{
  expect(mergeThreadColors(fixture([[20,20,20],[255,0,0],[0,255,0],[0,0,255]]),16,4,6,2).length).toBeLessThanOrEqual(2);
  expect(()=>mergeThreadColors(new Uint8ClampedArray(2),2,2)).toThrow();
 });
});
