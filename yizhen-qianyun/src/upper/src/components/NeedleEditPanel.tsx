import { COLOR_META,COLOR_ORDER,type EmbroideryColor,type PathSet } from "../types/embroidery";
import type { NeedleEditMode,NeedleSelection } from "../utils/needleEditing";
type Props={paths:PathSet|null;mode:NeedleEditMode;onModeChange:(m:NeedleEditMode)=>void;color:EmbroideryColor;onColorChange:(c:EmbroideryColor)=>void;selection:NeedleSelection|null;removed:number;canUndo:boolean;canRedo:boolean;hasEdits:boolean;onUndo:()=>void;onRedo:()=>void;onReset:()=>void;onDelete:()=>void};
export function NeedleEditPanel(p:Props) {
 const selected=p.selection&&p.paths?.[p.selection.color].segments[p.selection.index]?.end;
 return <section className="needle-edit-panel" aria-label="落针点编辑">
  <div className="needle-edit-heading"><strong>落针点编辑</strong><span>框外点自动忽略{p.removed>0?` · 已忽略 ${p.removed} 点`:""}</span></div>
  <div className="needle-edit-actions">
   {([['off','图案定位'],['move','选点 / 拖动'],['add','补点'],['delete','删点']] as const).map(([m,label])=><button type="button" key={m} disabled={!p.paths} aria-pressed={p.mode===m} className={p.mode===m?'selected':''} onClick={()=>p.onModeChange(m)}>{label}</button>)}
   <select aria-label="补点颜色" value={p.color} onChange={e=>p.onColorChange(e.target.value as EmbroideryColor)}>{COLOR_ORDER.map(c=><option key={c} value={c}>{COLOR_META[c].label}</option>)}</select>
   <button type="button" onClick={p.onUndo} disabled={!p.canUndo}>撤销</button>
   <button type="button" onClick={p.onRedo} disabled={!p.canRedo}>重做</button>
   <button type="button" onClick={p.onDelete} disabled={!selected}>删除选中点</button>
   <button type="button" onClick={p.onReset} disabled={!p.hasEdits}>恢复自动路径</button>
  </div>
  <p>{selected&&p.selection?`已选 ${COLOR_META[p.selection.color].label}第 ${p.selection.index+1} 针：${selected.x.toFixed(2)}, ${selected.y.toFixed(2)} mm。 `:''}{p.mode==='add'?'选点后点击画布，在其后补一针；未选点时插入最近的同色线段。':p.mode==='delete'?'点击小点删除；重叠点每次删除一针。':p.mode==='move'?'拖动小点调整位置，拖出画框会移除；原图视图可叠加针点对照编辑。':'先生成路径，再选择拖动、补点或删点。'}</p>
  <small>修改会同步到预览、导出和待上传数据；需重新上传才替换板卡缓存。重新生成或变换图案会恢复自动路径。</small>
 </section>;
}
