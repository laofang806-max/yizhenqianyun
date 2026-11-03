import { useMemo, useState, useEffect } from 'react';
import { Database, Download, FileCode2 } from 'lucide-react';
import type { StandardizedEmbroidery } from '../types/exportData';
import type { EmbroideryColor } from '../types/embroidery';
import { COLOR_META } from '../types/embroidery';
import { buildColorText } from '../utils/deviceProtocol';
import { encodeEmbroideryBin } from '../utils/binProtocol';
import { downloadBlob } from '../utils/fileDownload';

export function DataTransferPage({ data, stepsPerMm, disabledReason }: { data: StandardizedEmbroidery | null; stepsPerMm: number; disabledReason: string }) {
  const [color, setColor] = useState<EmbroideryColor>('black');
  const [format, setFormat] = useState<'points' | 'uart' | 'json' | 'bin'>('points');
  const [page, setPage] = useState(0);
  const [needleOnly, setNeedleOnly] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setPage(0); setError(''); }, [data, color, needleOnly, format, stepsPerMm]);
  const result = useMemo(() => {
    if (!data) return { points: [], uart: '', json: '', bin: new Uint8Array(), error: '' };
    try {
      return { points: data.paths[color].segments.flatMap(s => s.points).map((point, index) => ({ ...point, index: index + 1 })),
        uart: data.executionOrder.includes(color) ? buildColorText(data, color, stepsPerMm) : '', json: JSON.stringify(data, null, 2), bin: encodeEmbroideryBin(data), error: '' };
    } catch (cause) { return { points: [], uart: '', json: '', bin: new Uint8Array(), error: cause instanceof Error ? cause.message : '数据解析失败。' }; }
  }, [data, color, stepsPerMm]);
  const filtered = result.points.filter(p => !needleOnly || p.action === 'stitch');
  const pageSize = 100;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const hex = Array.from(result.bin.slice(0, 4096), (b, i) => `${i % 16 === 0 ? `${i === 0 ? '' : '\n'}${i.toString(16).padStart(6, '0')}  ` : ''}${b.toString(16).padStart(2, '0')} `).join('');
  const exportData = () => {
    try {
      if (!data || result.error) return;
      const content = format === 'bin' ? new Blob([result.bin], { type: 'application/octet-stream' }) : new Blob([format === 'uart' ? result.uart : result.json], { type: 'text/plain;charset=utf-8' });
      downloadBlob(content, `xiangxiu-${format === 'uart' ? `${color}-uart.txt` : format === 'bin' ? 'path.bin' : 'path.json'}`);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导出失败。'); }
  };
  return <section className="data-page">
    <div className="page-heading"><div><span className="page-eyebrow">DATA TRANSFER</span><h1><Database size={24}/>数据传输</h1><p>查看当前图案的坐标、针序与待发送数据。</p></div><button className="heritage-button" disabled={!data || !!result.error} onClick={exportData}><Download size={15}/>导出当前数据</button></div>
    <div className="data-summary"><article><small>当前图稿</small><strong>{data?.metadata.image.name || '尚未载入图案'}</strong></article><article><small>落针点</small><strong>{data?.statistics.totalStitchPointCount ?? '—'}</strong></article><article><small>画框尺寸</small><strong>{data ? `${data.frame.width} × ${data.frame.height} mm` : '—'}</strong></article><article><small>串口坐标换算</small><strong>{stepsPerMm} step/mm</strong></article></div>
    <section className="data-card"><div className="data-toolbar"><div className="page-tabs" role="tablist" aria-label="数据格式">{([['points','针点坐标'],['uart','UART动作流'],['json','JSON'],['bin','BIN / HEX']] as const).map(([id, label]) => <button role="tab" aria-selected={format === id} key={id} onClick={() => setFormat(id)}>{label}</button>)}</div><label hidden={!!data?.metadata.thread}>线色 <select aria-label="数据线色" value={color} onChange={e => setColor(e.target.value as EmbroideryColor)}>{Object.entries(COLOR_META).map(([id, meta]) => <option key={id} value={id}>{meta.label}</option>)}</select></label></div>
    {(error || result.error) && <p className="login-error" role="alert">{error || result.error}</p>}
    {!data ? <div className="page-empty"><FileCode2 size={40}/><h2>还没有待传输的数据</h2><p>{disabledReason || '在刺绣工作台载入图案并生成路径后，这里会显示对应数据。'}</p></div> : <>
      <p className="data-note">{format === 'uart' ? '此处为所选颜色按当前标定生成的待发送文本；实际发送与板卡应答请查看“串口传输”。' : format === 'bin' ? `BIN文件共${result.bin.length}字节；预览前4096字节。BIN用于文件导出，板卡当前串口上传使用UART文本。` : '坐标单位为mm，原点位于画框左上角。显示数据与当前编辑、裁切后的路径一致。'}</p>
      {format === 'points' ? <><div className="point-filter"><label><input type="checkbox" checked={needleOnly} onChange={e => setNeedleOnly(e.target.checked)}/>仅看落针点</label><span>{data?.metadata.thread?.label??COLOR_META[color].label} · {filtered.length} 个点</span></div><div className="data-table-scroll"><table className="data-table"><thead><tr><th>针序 / 点序</th><th>线色</th><th>X / mm</th><th>Y / mm</th><th>动作</th></tr></thead><tbody>{filtered.slice(page * pageSize, (page + 1) * pageSize).map(point => <tr key={point.index}><td>{point.index}</td><td>{data.metadata.thread ? `${data.metadata.thread.label} ${data.metadata.thread.hex}` : COLOR_META[color].label}</td><td>{point.x.toFixed(2)}</td><td>{point.y.toFixed(2)}</td><td><span className={`action-badge ${point.action}`}>{point.action === 'stitch' ? 'S · 落针' : 'J · 抬针移动'}</span></td></tr>)}{!filtered.length && <tr><td colSpan={5}>当前线色没有匹配的针点。</td></tr>}</tbody></table></div><div className="data-pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} / {pages}</span><button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>下一页</button></div></> : <pre className="data-code">{format === 'uart' ? result.uart || '当前颜色没有待发送动作。' : format === 'json' ? result.json : hex}</pre>}
    </>}
    </section>
  </section>;
}
