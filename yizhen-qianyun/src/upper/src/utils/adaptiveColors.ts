import type { ColorAnalysis, ColorMask } from '../types/embroidery';
import { findRegions } from './colorDetection';

type RGB = [number,number,number];
type Lab = [number,number,number];
export type ThreadLayer = { id:string; label:string; hex:string; pixels:number; analysis:ColorAnalysis };
function lab(rgb:RGB):Lab {
  const [r,g,b]=rgb.map(c=>{const v=c/255;return v>.04045?((v+.055)/1.055)**2.4:v/12.92;});
  const f=(n:number)=>n>.008856?Math.cbrt(n):7.787*n+16/116;
  const x=f((.4124564*r+.3575761*g+.1804375*b)/.95047), y=f(.2126729*r+.7151522*g+.072175*b), z=f((.0193339*r+.119192*g+.9503041*b)/1.08883);
  return [116*y-16,500*(x-y),200*(y-z)];
}
const distance=(a:Lab,b:Lab)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const hex=(c:RGB)=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const key=(r:number,g:number,b:number)=>((r>>3)<<10)|((g>>3)<<5)|(b>>3);

// Palette colors are sampled from the image, not snapped to four named colors.
export function mergeThreadColors(rgba:Uint8ClampedArray,width:number,height:number,mergeDistance=22,maxColors=16,sourceWidth=width,sourceHeight=height,preserveSmallDetails=false):ThreadLayer[] {
  if(rgba.length!==width*height*4 || !Number.isFinite(mergeDistance) || mergeDistance<1 || mergeDistance>80 || !Number.isInteger(maxColors)||maxColors<1||maxColors>32)throw Error('色层参数无效。');
  const bins=new Map<number,{rgb:RGB;count:number}>();
  // White is the fabric/background, not a thread color. Also ignore neutral
  // near-white pixels from JPEG compression and antialiased white backgrounds.
  const visible=(i:number)=>{
    const minimum=Math.min(rgba[i],rgba[i+1],rgba[i+2]);
    const maximum=Math.max(rgba[i],rgba[i+1],rgba[i+2]);
    const white=minimum>=245 || (minimum>=230 && maximum-minimum<=18);
    return rgba[i+3]>40 && !white;
  };
  for(let i=0;i<rgba.length;i+=4){if(!visible(i))continue;const k=key(rgba[i],rgba[i+1],rgba[i+2]);const bin=bins.get(k);if(bin){for(let c=0;c<3;c++)bin.rgb[c]+=rgba[i+c];bin.count++;}else bins.set(k,{rgb:[rgba[i],rgba[i+1],rgba[i+2]],count:1});}
  const sorted=[...bins.values()].sort((a,b)=>b.count-a.count).map(b=>({rgb:b.rgb.map(v=>v/b.count) as RGB,count:b.count}));
  const centers:{rgb:RGB;lab:Lab;count:number}[]=[];
  for(const bin of sorted){const v=lab(bin.rgb);let best=-1,bestDistance=Infinity;centers.forEach((c,i)=>{const d=distance(c.lab,v);if(d<bestDistance){best=i;bestDistance=d;}});
    if(best<0 || (bestDistance>mergeDistance && centers.length<maxColors))centers.push({...bin,lab:v});
    else {const c=centers[best],n=c.count+bin.count;c.rgb=c.rgb.map((v,i)=>(v*c.count+bin.rgb[i]*bin.count)/n) as RGB;c.count=n;c.lab=lab(c.rgb);}
  }
  // Merge centroids again after weighted updates, so near-identical shades do not survive as separate thread colors.
  for(let changed=true;changed;){changed=false;outer:for(let i=0;i<centers.length;i++)for(let j=i+1;j<centers.length;j++)if(distance(centers[i].lab,centers[j].lab)<=mergeDistance){const a=centers[i],b=centers[j],n=a.count+b.count;a.rgb=a.rgb.map((v,k)=>(v*a.count+b.rgb[k]*b.count)/n) as RGB;a.count=n;a.lab=lab(a.rgb);centers.splice(j,1);changed=true;break outer;}}
  centers.sort((a,b)=>b.count-a.count);
  const assign=new Map<number,number>();
  for(const [k,bin] of bins){const v=lab(bin.rgb.map(n=>n/bin.count) as RGB);let index=0,min=Infinity;centers.forEach((c,i)=>{const d=distance(c.lab,v);if(d<min){index=i;min=d;}});assign.set(k,index);}
  const masks=centers.map(()=>new Uint8Array(width*height));
  for(let pixel=0;pixel<width*height;pixel++){const i=pixel*4;if(visible(i))masks[assign.get(key(rgba[i],rgba[i+1],rgba[i+2]))!][pixel]=1;}
  return centers.map((center,index)=>{
    const result=findRegions(masks[index],width,height,preserveSmallDetails);
    const black:ColorMask={data:result.mask,regions:result.regions,labels:result.labels};
    const empty=():ColorMask=>({data:new Uint8Array(width*height),regions:[]});
    const color=hex(center.rgb);
    return {id:`${index}-${color}`,label:`色层 ${index+1}`,hex:color,pixels:result.regions.reduce((n,r)=>n+r.pixelCount,0),analysis:{width,height,sourceWidth,sourceHeight,masks:{black,red:empty(),yellow:empty(),blue:empty()}}};
  }).filter(layer=>layer.pixels>0);
}
