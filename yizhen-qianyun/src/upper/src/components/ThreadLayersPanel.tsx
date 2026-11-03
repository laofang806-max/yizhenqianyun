import type { ThreadLayer } from '../utils/adaptiveColors';
export function ThreadLayersPanel({enabled,onEnabled,layers,index,onIndex,tolerance,onTolerance,maxColors,onMaxColors,locked,completed}: {
  enabled:boolean;onEnabled:(value:boolean)=>void;layers:ThreadLayer[];index:number;onIndex:(index:number)=>void;tolerance:number;onTolerance:(n:number)=>void;maxColors:number;onMaxColors:(n:number)=>void;locked:boolean;completed:string[];
}){
 return <section className="panel thread-layers-panel"><div className="panel-title">彩色色层 · 近似色合并</div>
 <label className="thread-mode"><input type="checkbox" checked={enabled} disabled={locked} onChange={e=>onEnabled(e.target.checked)}/>彩色模式</label>
 {enabled&&<><label className="thread-merge">相近色合并范围 <b>{tolerance}</b><input type="range" min="6" max="50" step="2" value={tolerance} disabled={locked} onChange={e=>onTolerance(+e.target.value)}/></label><small>越大越容易把深浅接近的颜色合成一种线色。白色和近白色作为底布忽略，不生成色层。</small>
 <label className="thread-limit">最多线色 <select value={maxColors} disabled={locked} onChange={e=>onMaxColors(+e.target.value)}>{[8,12,16,24,32].map(n=><option key={n}>{n}</option>)}</select></label>
 <div className="thread-swatches">{layers.map((layer,i)=><button key={layer.id} type="button" className={i===index?'selected':''} disabled={locked} onClick={()=>onIndex(i)} aria-pressed={i===index}><i style={{backgroundColor:layer.hex}}/><span>{layer.label}<small>{layer.hex}</small></span><b>{completed.includes(layer.id)?'已完成':'待绣'}</b></button>)}</div>
 <p>{layers.length?`共 ${layers.length} 个色层。选择一种线色，检查路径后单独发送；完成后再换线发送下一层。`:'载入彩色图片后自动提取线色。'}</p>{locked&&<p>当前色层已上传或正在执行，完成或任务复位后再切换。</p>}</>}
 </section>;
}
