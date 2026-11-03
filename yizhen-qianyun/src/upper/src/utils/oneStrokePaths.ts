import { COLOR_ORDER, type ColorAnalysis, type ColorPath, type FrameSize, type PathSet, type PointMm, type PositionMm } from "../types/embroidery";
import { getImageSizeMm, imagePixelToFrameMm } from "./coordinateTransform";
import { traceMaskContours } from "./contourPaths";
import type { StitchDensity } from "./pathGenerator";
type Pixel={x:number;y:number};
type Target={pixels:number[];kind:"line"|"fill"};

// Zhang-Suen thinning keeps thin drawn strokes as centre lines rather than
// drawing both edges of every pen stroke. Wide areas also receive sparse fill.
export function thinMask(mask:Uint8Array,w:number,h:number):Uint8Array {
  const stride=w+2,grid=new Uint8Array(stride*(h+2));
  for(let y=0;y<h;y++)grid.set(mask.subarray(y*w,(y+1)*w),(y+1)*stride+1);
  let changed=true;
  while(changed) {
    changed=false;
    for(let phase=0;phase<2;phase++) {
      const remove:number[]=[];
      for(let y=1;y<=h;y++)for(let x=1;x<=w;x++) {
        const i=y*stride+x;if(!grid[i])continue;
        const n=[grid[i-stride],grid[i-stride+1],grid[i+1],grid[i+stride+1],grid[i+stride],grid[i+stride-1],grid[i-1],grid[i-stride-1]];
        const count=n.reduce((a,b)=>a+b,0);if(count<2||count>6)continue;
        let transitions=0;for(let j=0;j<8;j++)if(!n[j]&&n[(j+1)%8])transitions++;
        if(transitions!==1)continue;
        if(phase===0 ? n[0]*n[2]*n[4] || n[2]*n[4]*n[6] : n[0]*n[2]*n[6] || n[0]*n[4]*n[6])continue;
        remove.push(i);
      }
      if(remove.length)changed=true;
      for(const i of remove)grid[i]=0;
    }
  }
  const result=new Uint8Array(mask.length);
  for(let y=0;y<h;y++)result.set(grid.subarray((y+1)*stride+1,(y+1)*stride+1+w),y*w);
  return result;
}

export function generateOneStrokePaths(analysis:ColorAnalysis,frame:FrameSize,position:PositionMm,scale:number,rotation:number,density:StitchDensity):PathSet {
  if(![density.stitchSpacingMm,density.rowSpacingMm].every(n=>Number.isFinite(n)&&n>0))throw new Error("针距和行距必须大于0。");
  const w=analysis.width,h=analysis.height,size=getImageSizeMm(analysis.sourceWidth,analysis.sourceHeight,frame,scale);
  const rowStep=Math.max(1,Math.round(density.rowSpacingMm/(size.height/h)));
  const result={} as PathSet;
  const neighbours=(i:number)=>{
    const x=i%w,y=Math.floor(i/w),out:number[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if((dx||dy)&&x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)out.push(i+dy*w+dx);
    return out;
  };
  const pixel=(i:number):Pixel=>({x:i%w+0.5,y:Math.floor(i/w)+0.5});
  for(const color of COLOR_ORDER) {
    const mask=analysis.masks[color].data,labels=new Int32Array(mask.length),components:number[][]=[];
    // Relabel ourselves with the same connectivity used by path search. An old
    // scan-row region label must not invent cuts within a diagonal pen stroke.
    for(let i=0;i<mask.length;i++)if(mask[i]&&!labels[i]) {
      const list=[i],id=components.length+1;labels[i]=id;
      for(let j=0;j<list.length;j++)for(const n of neighbours(list[j]))if(mask[n]&&!labels[n]){labels[n]=id;list.push(n);}
      components.push(list);
    }
    if(!components.length){result[color]={color,segments:[],points:[],lengthMm:0};continue;}
    // Distance to white suppresses fill on thin pen strokes (rings/curves).
    const depth=new Int32Array(mask.length);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const i=y*w+x;if(mask[i])depth[i]=1+Math.min(x?depth[i-1]:0,y?depth[i-w]:0);
    }
    for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--) {
      const i=y*w+x;if(mask[i])depth[i]=Math.min(depth[i],1+Math.min(x+1<w?depth[i+1]:0,y+1<h?depth[i+w]:0));
    }
    const skeleton=thinMask(mask,w,h);
    // Keep centre lines only in thin ink. Wide-area medial axes would create
    // unnecessary diagonal webs across the intended serpentine fill.
    for(let i=0;i<skeleton.length;i++)if(depth[i]>Math.max(2,rowStep*0.3))skeleton[i]=0;
    const targets:Target[][]=components.map(()=>[]);
    const adjacency=new Map<number,number[]>();
    for(let i=0;i<skeleton.length;i++)if(skeleton[i]) {
      adjacency.set(i,neighbours(i).filter(n=>{
        if(!skeleton[n])return false;
        const dx=n%w-i%w,dy=Math.floor(n/w)-Math.floor(i/w);
        // Do not add triangular diagonal shortcuts around a right-angle turn.
        return !dx||!dy||(!skeleton[i+dx]&&!skeleton[i+dy*w]);
      }));
    }
    const used=new Set<string>();
    const edgeKey=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
    for(const [node,adj] of adjacency) {
      if(!adj.length){targets[labels[node]-1].push({pixels:[node],kind:"line"});continue;}
      for(const next of adj) {
        if(used.has(edgeKey(node,next)))continue;
        const trail=[node];let from=node,to=next;
        while(true) {
          used.add(edgeKey(from,to));trail.push(to);
          const options=(adjacency.get(to)??[]).filter(n=>!used.has(edgeKey(to,n)));
          if(!options.length)break;
          // Prefer a gentle continuation. Every skeleton edge is consumed once;
          // disconnected trails are joined inside this same coloured component.
          const a=pixel(from),b=pixel(to);
          options.sort((u,v)=>{
            const score=(n:number)=>{const c=pixel(n);return ((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y))/Math.hypot(c.x-b.x,c.y-b.y);};
            return score(v)-score(u);
          });
          from=to;to=options[0];
        }
        if(trail[0]===trail[trail.length-1]) {
          const area=trail.slice(1).reduce((sum,n,i)=>{const a=pixel(trail[i]),b=pixel(n);return sum+a.x*b.y-b.x*a.y;},0);
          if(area>0)trail.reverse();
        }
        targets[labels[node]-1].push({pixels:trail,kind:"line"});
      }
    }
    for(let y=Math.floor(rowStep/2);y<h;y+=rowStep) {
      let x=0;
      while(x<w) {
        while(x<w&&!mask[y*w+x])x++;
        const start=x;let maximum=0;
        while(x<w&&mask[y*w+x]){maximum=Math.max(maximum,depth[y*w+x]);x++;}
        if(x>start&&maximum>=Math.max(2,rowStep*0.3))targets[labels[y*w+start]-1].push({pixels:[y*w+start,y*w+x-1],kind:"fill"});
      }
    }
    const inside=(a:Pixel,b:Pixel)=>{
      // Test every crossed pixel interval, not a sampling step that could miss
      // a short white sliver. A diagonal may touch the shared corner of ink cells.
      const times=[0,1],dx=b.x-a.x,dy=b.y-a.y;
      if(dx)for(let x=Math.floor(Math.min(a.x,b.x))+1;x<Math.max(a.x,b.x);x++)times.push((x-a.x)/dx);
      if(dy)for(let y=Math.floor(Math.min(a.y,b.y))+1;y<Math.max(a.y,b.y);y++)times.push((y-a.y)/dy);
      times.sort((a,b)=>a-b);
      for(let j=1;j<times.length;j++) {
        if(times[j]-times[j-1]<1e-10)continue;
        const t=(times[j]+times[j-1])/2;
        const x=Math.floor(a.x+dx*t),y=Math.floor(a.y+dy*t);
        if(x<0||y<0||x>=w||y>=h||!mask[y*w+x])return false;
      }
      return true;
    };
    const parent=new Int32Array(mask.length),seen=new Int32Array(mask.length),queue=new Int32Array(mask.length);let stamp=0;
    const connect=(a:number,b:number):number[]=>{
      if(a===b)return [a];
      if(inside(pixel(a),pixel(b)))return [a,b];
      stamp++;queue[0]=a;seen[a]=stamp;parent[a]=a;let cursor=0,end=1;
      while(cursor<end&&seen[b]!==stamp) {
        const i=queue[cursor++];
        for(const n of neighbours(i))if(labels[n]===labels[a]&&seen[n]!==stamp){seen[n]=stamp;parent[n]=i;queue[end++]=n;}
      }
      if(seen[b]!==stamp)throw new Error("同一图案内的连接失败，已停止生成，避免错误跨越留白。");
      const route=[b];while(route[route.length-1]!==a)route.push(parent[route[route.length-1]]);
      return route.reverse();
    };
    // Preserve small circular eyes explicitly. Large white compartments are
    // represented by the thin ring/curve centre line and fill edges, not by a
    // second outline alongside that same pen stroke.
    const whiteSeen=new Uint8Array(mask.length),detailPixels:number[][]=[];
    for(let i=0;i<mask.length;i++)if(!mask[i]&&!whiteSeen[i]) {
      const list=[i];whiteSeen[i]=1;let border=false;
      for(let j=0;j<list.length;j++) {
        const n=list[j],x=n%w,y=Math.floor(n/w);
        if(!x||!y||x===w-1||y===h-1)border=true;
        for(const t of [x?n-1:-1,x+1<w?n+1:-1,y?n-w:-1,y+1<h?n+w:-1])if(t>=0&&!mask[t]&&!whiteSeen[t]){whiteSeen[t]=1;list.push(t);}
      }
      if(!border&&list.length<=mask.length*.05) {
        detailPixels.push(list);
      }
    }
    for(const component of components)if(component.length>4&&component.length<=mask.length*.05) {
      detailPixels.push(component);
    }
    for(const pixels of detailPixels) {
      const detail=new Uint8Array(mask.length);for(const n of pixels)detail[n]=1;
      for(const contour of traceMaskContours(detail,w,h)) {
      const route:number[]=[];
      for(const p of contour) {
        const candidates:number[]=[];
        for(const y of [p.y-1,p.y])for(const x of [p.x-1,p.x])if(x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x])candidates.push(y*w+x);
        if(!candidates.length)continue;
        const previous=route.at(-1);
        candidates.sort((a,b)=>previous===undefined?a-b:Math.hypot(pixel(a).x-pixel(previous).x,pixel(a).y-pixel(previous).y)-Math.hypot(pixel(b).x-pixel(previous).x,pixel(b).y-pixel(previous).y));
        const next=candidates[0];
        if(previous===undefined)route.push(next);
        else route.push(...connect(previous,next).slice(1));
      }
      if(route.length>2){route.push(...connect(route[route.length-1],route[0]).slice(1));targets[labels[route[0]]-1].push({pixels:route,kind:"line"});}
      }
    }
    for(let i=0;i<components.length;i++)if(!targets[i].length)targets[i].push({pixels:[components[i][Math.floor(components[i].length/2)]],kind:"line"});
    const segments:ColorPath['segments']=[],points:PointMm[]=[];
    const convert=(p:Pixel):PointMm=>({...imagePixelToFrameMm(p.x,p.y,w,h,size,frame,position,rotation),color});
    const append=(a:PointMm,b:PointMm)=>{
      if(segments.length>=2048)throw new Error("一笔走线超过板卡缓存，请选更少针或缩小图案。");
      segments.push({start:a,end:b});points.push(a,b);
    };
    const run=(a:Pixel,b:Pixel)=>{
      const start=convert(a),end=convert(b),distance=Math.hypot(end.x-start.x,end.y-start.y);
      if(distance<1e-9)return;
      const count=Math.ceil(distance/density.stitchSpacingMm);let from=start;
      for(let j=1;j<=count;j++) {
        const to=j===count?end:{x:start.x+(end.x-start.x)*j/count,y:start.y+(end.y-start.y)*j/count,color};
        append(from,to);from=to;
      }
    };
    // Simplify a whole polyline, preserving its shape and staying on ink.
    const emit=(route:number[])=>{
      if(route.length<2)return;
      const tolerance=0.3/Math.max(size.width/w,size.height/h);
      const pending:[number,number][]=[[0,route.length-1]],keep=new Set([0,route.length-1]);
      while(pending.length) {
        const [lo,hi]=pending.pop()!;if(hi-lo<2)continue;
        const a=pixel(route[lo]),b=pixel(route[hi]),dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy;
        let max=0,split=lo+1;
        for(let k=lo+1;k<hi;k++) {
          const p=pixel(route[k]),t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len)):0;
          const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
          if(d>max){max=d;split=k;}
        }
        if(max>tolerance||!inside(a,b)){keep.add(split);pending.push([lo,split],[split,hi]);}
      }
      const ordered=[...keep].sort((a,b)=>a-b);
      for(let j=1;j<ordered.length;j++)run(pixel(route[ordered[j-1]]),pixel(route[ordered[j]]));
    };
    const remaining=components.map((pixels,index)=>({index,pixels})).sort((a,b)=>b.pixels.length-a.pixels.length);
    let last:number|null=null;
    while(remaining.length) {
      let component=0;
      if(last!==null) {
        let best=Infinity;
        remaining.forEach((r,i)=>{for(const t of targets[r.index])for(const n of [t.pixels[0],t.pixels[t.pixels.length-1]]){const d=Math.hypot(pixel(n).x-pixel(last!).x,pixel(n).y-pixel(last!).y);if(d<best){best=d;component=i;}}});
      }
      const {index}=remaining.splice(component,1)[0],list=targets[index];
      let first=true;
      while(list.length) {
        let best=Infinity,chosen=0,reverse=false;
        const haveLines=list.some(t=>t.kind==="line");
        list.forEach((t,i)=>{
          if(haveLines&&t.kind!=="line")return;
          [t.pixels[0],t.pixels[t.pixels.length-1]].forEach((n,end)=>{
            const p=pixel(n),d=last===null?p.y*w+p.x:Math.hypot(p.x-pixel(last).x,p.y-pixel(last).y);
            if(d<best){best=d;chosen=i;reverse=end===1;}
          });
        });
        const target=list.splice(chosen,1)[0];if(reverse)target.pixels.reverse();
        if(first&&last!==null&&target.pixels.length>2&&target.pixels[0]===target.pixels[target.pixels.length-1]) {
          const cycle=target.pixels.slice(0,-1);let nearest=0;
          for(let i=1;i<cycle.length;i++)if(Math.hypot(pixel(cycle[i]).x-pixel(last).x,pixel(cycle[i]).y-pixel(last).y)<Math.hypot(pixel(cycle[nearest]).x-pixel(last).x,pixel(cycle[nearest]).y-pixel(last).y))nearest=i;
          target.pixels=[...cycle.slice(nearest),...cycle.slice(0,nearest),cycle[nearest]];
        }
        const start=target.pixels[0];
        if(first){const p=convert(pixel(start));append(p,p);first=false;}
        else emit(connect(last!,start));
        emit(target.pixels);last=target.pixels[target.pixels.length-1];
      }
      // Finish at the edge facing the next island, rather than leaving a long
      // floating thread from whichever fill row happened to finish last.
      if(remaining.length&&last!==null) {
        let exit:number=last,best=Infinity;
        for(const next of remaining) {
          const centre=next.pixels.reduce((p,n)=>({x:p.x+n%w/next.pixels.length,y:p.y+Math.floor(n/w)/next.pixels.length}),{x:0,y:0});
          let near=components[index][0];
          for(const n of components[index])if(Math.hypot(n%w-centre.x,Math.floor(n/w)-centre.y)<Math.hypot(near%w-centre.x,Math.floor(near/w)-centre.y))near=n;
          for(const n of next.pixels) {
            const d=Math.hypot(n%w-near%w,Math.floor(n/w)-Math.floor(near/w));
            if(d<best){best=d;exit=near;}
          }
        }
        emit(connect(last,exit));last=exit;
      }
    }
    result[color]={color,segments,points,lengthMm:segments.reduce((sum,s)=>sum+Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y),0)};
  }
  return result;
}
