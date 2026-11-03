import {COLOR_ORDER,type ColorAnalysis,type FrameSize,type PathSet,type PointMm,type PositionMm} from "../types/embroidery";
import {thinMask} from "./oneStrokePaths";
import {getImageSizeMm,imagePixelToFrameMm} from "./coordinateTransform";
type Edge={a:number;b:number;length:number;bridge:boolean};
type Search={distance:Float64Array;parent:Int32Array;edge:Int32Array};
class Heap {
 private items:{node:number;distance:number}[]=[];
 push(node:number,distance:number){let i=this.items.length;this.items.push({node,distance});while(i){const p=(i-1)>>1;if(this.items[p].distance<=distance)break;this.items[i]=this.items[p];i=p;}this.items[i]={node,distance};}
 pop(){if(!this.items.length)return undefined;const first=this.items[0],last=this.items.pop()!;if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.items[c+1].distance<this.items[c].distance)c++;if(this.items[c].distance>=last.distance)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return first;}
}

// A single Euler circuit through the centre-line graph. Odd vertices are joined
// via existing graph edges, so parity correction retraces ink instead of adding
// arbitrary chords. Central closed artwork is the hub for separate flower rays.
export function generateGraphStrokePaths(analysis:ColorAnalysis,frame:FrameSize,position:PositionMm,scale:number,rotation:number,spacingMm=3):PathSet {
 if(!Number.isFinite(spacingMm)||spacingMm<=0)throw new Error("针距必须大于0。");
 const w=analysis.width,h=analysis.height,size=getImageSizeMm(analysis.sourceWidth,analysis.sourceHeight,frame,scale),result={} as PathSet;
 for(const color of COLOR_ORDER){
  const mask=analysis.masks[color].data;
  if(!mask.some(v=>v)){result[color]={color,segments:[],points:[],lengthMm:0};continue;}
  const skeleton=thinMask(mask,w,h),pixels:number[]=[],ids=new Int32Array(mask.length).fill(-1);
  for(let i=0;i<skeleton.length;i++)if(skeleton[i]){ids[i]=pixels.length;pixels.push(i);}
  if(!pixels.length){const first=mask.findIndex(v=>v>0);ids[first]=0;pixels.push(first);}
  if(pixels.length>60000)throw new Error("线稿过于复杂，请缩小图片或清理杂点后生成。");
  const n=pixels.length,adj:number[][]=Array.from({length:n},()=>[]),edges:Edge[]=[];
  const x=(node:number)=>pixels[node]%w+.5,y=(node:number)=>Math.floor(pixels[node]/w)+.5;
  const add=(a:number,b:number,bridge=false)=>{const i=edges.length;edges.push({a,b,length:Math.hypot(x(a)-x(b),y(a)-y(b)),bridge});adj[a].push(i);adj[b].push(i);return i;};
  for(let a=0;a<n;a++){
   const index=pixels[a],px=index%w,py=Math.floor(index/w);
   for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){
    const xx=px+dx,yy=py+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;
    const b=ids[yy*w+xx];if(b<0)continue;
    if(dx&&dy&&(skeleton[index+dx]||skeleton[index+dy*w]))continue;
    add(a,b);
   }
  }
  const seen=new Uint8Array(n),components:number[][]=[];
  for(let a=0;a<n;a++)if(!seen[a]){
   const nodes=[a];seen[a]=1;
   for(let j=0;j<nodes.length;j++)for(const i of adj[nodes[j]]){const e=edges[i],b=e.a===nodes[j]?e.b:e.a;if(!seen[b]){seen[b]=1;nodes.push(b);}}
   components.push(nodes);
  }
  if(components.length>128)throw new Error("独立笔画超过128个，请清理背景杂点或改用其他走线方式。");
  const boxes=components.map(nodes=>nodes.reduce((b,a)=>({left:Math.min(b.left,x(a)),right:Math.max(b.right,x(a)),top:Math.min(b.top,y(a)),bottom:Math.max(b.bottom,y(a))}),{left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity}));
  const central=boxes.map((b,i)=>({b,i})).filter(({b,i})=>b.left<=w/2&&b.right>=w/2&&b.top<=h*.52&&b.bottom>=h*.52&&components[i].reduce((sum,a)=>sum+adj[a].length,0)/2>=components[i].length)
   .sort((a,b)=>(a.b.right-a.b.left)*(a.b.bottom-a.b.top)-(b.b.right-b.b.left)*(b.b.bottom-b.b.top));
  const nearest=(first:number[],second:number[])=>{
   let distance=Infinity,a=first[0],b=second[0];
   for(const u of first)for(const v of second){const d=(x(u)-x(v))**2+(y(u)-y(v))**2;if(d<distance){distance=d;a=u;b=v;}}
   return {distance,a,b};
  };
  if(central.length){
   const hub=central[0].i;
   for(let i=0;i<components.length;i++)if(i!==hub){const link=nearest(components[i],components[hub]);add(link.a,link.b,true);}
  }else{
   // No enclosing centre: connect components by a nearest-link spanning tree.
   const joined=new Set([0]);
   while(joined.size<components.length){
    let best:{distance:number;a:number;b:number;component:number}|null=null;
    for(const j of joined)for(let i=0;i<components.length;i++)if(!joined.has(i)){const link=nearest(components[i],components[j]);if(!best||link.distance<best.distance)best={...link,component:i};}
    if(!best)break;add(best.a,best.b,true);joined.add(best.component);
   }
  }
  const shortest=(source:number):Search=>{
   const distance=new Float64Array(n).fill(Infinity),parent=new Int32Array(n).fill(-1),edge=new Int32Array(n).fill(-1),heap=new Heap();distance[source]=0;heap.push(source,0);
   for(let entry=heap.pop();entry;entry=heap.pop()){
    const a=entry.node;if(entry.distance!==distance[a])continue;
    for(const i of adj[a]){const e=edges[i],b=e.a===a?e.b:e.a,d=entry.distance+e.length;if(d<distance[b]){distance[b]=d;parent[b]=a;edge[b]=i;heap.push(b,d);}}
   }
   return {distance,parent,edge};
  };
  const odd:number[]=[];for(let i=0;i<n;i++)if(adj[i].length%2)odd.push(i);
  if(odd.length>256||odd.length*n>8_000_000)throw new Error("线稿分叉过多，请清理杂点、减小图片后再生成一笔画。");
  const searches=new Map(odd.map(a=>[a,shortest(a)])),counts=edges.map(()=>1),unpaired=new Set(odd);
  while(unpaired.size){
   let distance=Infinity,a=-1,b=-1;
   for(const u of unpaired)for(const v of unpaired)if(u<v&&searches.get(u)!.distance[v]<distance){distance=searches.get(u)!.distance[v];a=u;b=v;}
   if(a<0)throw new Error("无法连接全部线稿，请检查图片。");
   unpaired.delete(a);unpaired.delete(b);const search=searches.get(a)!;
   while(b!==a){counts[search.edge[b]]++;b=search.parent[b];}
  }
  let start=0;for(let a=1;a<n;a++)if(y(a)<y(start)||(y(a)===y(start)&&x(a)<x(start)))start=a;
  const remaining=counts.slice(),stack:{node:number;edge:number}[]=[{node:start,edge:-1}],circuit:typeof stack=[];
  while(stack.length){
   const a=stack[stack.length-1].node;
   let chosen=-1,other=-1;
   for(const i of adj[a])if(remaining[i]){const e=edges[i],b=e.a===a?e.b:e.a;if(chosen<0||Number(e.bridge)<Number(edges[chosen].bridge)||(e.bridge===edges[chosen].bridge&&x(b)<x(other))){chosen=i;other=b;}}
   if(chosen<0)circuit.push(stack.pop()!);else{remaining[chosen]--;stack.push({node:other,edge:chosen});}
  }
  circuit.reverse();
  if(remaining.some(c=>c)||circuit.length!==counts.reduce((a,b)=>a+b,0)+1)throw new Error("一笔路径不完整，已停止生成。");
  const groups:{bridge:boolean;repeat:boolean;nodes:number[]}[]=[],visits=new Int32Array(edges.length);
  for(let j=1;j<circuit.length;j++){
   const i=circuit[j].edge,e=edges[i],repeat=visits[i]++>0,previous=groups[groups.length-1];
   if(previous&&previous.bridge===e.bridge&&previous.repeat===repeat)previous.nodes.push(circuit[j].node);
   else groups.push({bridge:e.bridge,repeat,nodes:[circuit[j-1].node,circuit[j].node]});
  }
  const segments:PathSet[typeof color]['segments']=[],points:PointMm[]=[];
  const convert=(a:number):PointMm=>({...imagePixelToFrameMm(x(a),y(a),w,h,size,frame,position,rotation),color});
  const append=(a:PointMm,b:PointMm)=>{if(segments.length>=2048)throw new Error("针迹超过板卡缓存，请增大针距或简化线稿。");segments.push({start:a,end:b});points.push(a,b);};
  let current=convert(start);append(current,current);
  for(const group of groups){
   const nodes=group.nodes,keep=new Set([0,nodes.length-1]),pending:[[number,number]]|[number,number][]=[[0,nodes.length-1]];
   while(pending.length){
    const [lo,hi]=pending.pop()!;if(hi-lo<2)continue;
    const a=nodes[lo],b=nodes[hi],dx=x(b)-x(a),dy=y(b)-y(a),len=dx*dx+dy*dy;let max=0,split=lo+1;
    for(let j=lo+1;j<hi;j++){const c=nodes[j],t=len?Math.max(0,Math.min(1,((x(c)-x(a))*dx+(y(c)-y(a))*dy)/len)):0,d=Math.hypot(x(c)-x(a)-t*dx,y(c)-y(a)-t*dy);if(d>max){max=d;split=j;}}
    if(max>1.2){keep.add(split);pending.push([lo,split],[split,hi]);}
   }
   const ordered=[...keep].sort((a,b)=>a-b);
   for(let j=1;j<ordered.length;j++){
    const from=current,end=convert(nodes[ordered[j]]),length=Math.hypot(end.x-from.x,end.y-from.y),pieces=Math.max(1,Math.ceil(length/spacingMm));
    for(let k=1;k<=pieces;k++){const to:PointMm=k===pieces?end:{x:from.x+(end.x-from.x)*k/pieces,y:from.y+(end.y-from.y)*k/pieces,color};append(current,to);current=to;}
   }
  }
  result[color]={color,segments,points,lengthMm:segments.reduce((sum,s)=>sum+Math.hypot(s.end.x-s.start.x,s.end.y-s.start.y),0)};
 }
 return result;
}
