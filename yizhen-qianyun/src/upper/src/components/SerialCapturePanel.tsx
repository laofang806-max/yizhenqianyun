import { useEffect, useState } from "react";
import { Activity, X } from "lucide-react";
import { captureSnapshot, clearCapture, exportCapture, type CaptureEntry } from "../utils/serialCapture";
import "./SerialCapturePanel.css";

export function SerialCapturePanel({ embedded = false }: { embedded?: boolean }) {
  const [open, setOpen] = useState(new URLSearchParams(location.search).get("capture") === "1");
  const [snapshot, setSnapshot] = useState(captureSnapshot);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [hex, setHex] = useState(false);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<CaptureEntry | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if ((!open && !embedded) || paused) return;
    setSnapshot(captureSnapshot());
    const timer = window.setInterval(() => setSnapshot(captureSnapshot()), 500);
    return () => window.clearInterval(timer);
  }, [open, paused, embedded]);
  const perform = async (operation: () => Promise<void>) => {
    setWorking(true); setError("");
    try { await operation(); setSnapshot(captureSnapshot()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setWorking(false); }
  };
  const rows = snapshot.recent.filter(entry => (filter === "ALL" || entry.direction === filter)
    && (!search || `${entry.label}\n${entry.text}\n${entry.hex}`.toLowerCase().includes(search.toLowerCase()))).slice(-200).reverse();
  return <>
    {!embedded && <section className="panel serial-capture-launch">
      <div className="panel-title"><Activity size={14} />通信抓包</div>
      <p>自动记录本页串口收发，关闭窗口也继续记录。</p>
      <button type="button" onClick={() => setOpen(true)}>打开通信抓包窗口</button>
    </section>}
    {(open || embedded) && <div className={embedded ? "capture-embedded" : "capture-overlay"} role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-label="串口通信抓包">
      <div className="capture-window">
        <header><div><h2>{embedded ? "串口传输" : "串口通信抓包"}</h2><p>TX 上位机→FPGA · RX FPGA→上位机 · 115200 8N1</p></div>{!embedded && <button aria-label="关闭抓包窗口" onClick={() => setOpen(false)}><X size={20}/></button>}</header>
        <p className="capture-note">使用“FPGA设备控制”的同一串口连接，无需另开COM口。自动保存本页连接的原始收发字节；不包含其他程序、历史已发生通信或摄像头USB视频。RX按浏览器读取块记录，一条回复可能跨多块。</p>
        <div className="capture-toolbar">
          <select aria-label="收发方向" value={filter} onChange={event => setFilter(event.target.value)}><option value="ALL">全部方向</option><option>TX</option><option>RX</option><option value="EVENT">连接/写入事件</option></select>
          <input aria-label="搜索抓包" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索 STATUS / ENC / ERR / 十六进制"/>
          <label><input type="checkbox" checked={hex} onChange={event => setHex(event.target.checked)}/>HEX</label>
          <button onClick={() => setPaused(!paused)}>{paused ? "恢复刷新" : "暂停刷新"}</button>
          <button disabled={working} onClick={() => void perform(() => exportCapture("txt"))}>导出TXT</button>
          <button disabled={working} onClick={() => void perform(() => exportCapture("jsonl"))}>导出JSONL</button>
          <button disabled={working} onClick={() => { if (window.confirm("清空此浏览器保存的所有抓包记录？")) void perform(async () => { await clearCapture(); setSelected(null); }); }}>清空记录</button>
        </div>
        <div className="capture-stats">本页累计 {snapshot.records} 条 · TX {snapshot.txBytes} B · RX {snapshot.rxBytes} B · 当前显示最新200条匹配记录（搜索范围：内存最近2000条；导出包含磁盘全部历史）{paused && " · 仅暂停显示，仍在抓包"}</div>
        {(error || snapshot.storageError) && <div className="capture-error">{error || snapshot.storageError}<button onClick={() => void perform(() => exportCapture("jsonl", true))}>导出内存最近2000条</button></div>}
        <div className="capture-table"><table><thead><tr><th>时间</th><th>方向</th><th>字节</th><th>内容（点击查看完整记录）</th></tr></thead><tbody>
          {rows.map(entry => <tr key={entry.id} onClick={() => setSelected(entry)}><td>{new Date(entry.time).toLocaleTimeString("zh-CN", { hour12: false })}.{entry.time.slice(20, 23)}</td><td className={`capture-${entry.direction}`}>{entry.direction}</td><td>{entry.bytes}</td><td><small>{entry.label}</small><pre>{(hex ? entry.hex : JSON.stringify(entry.text)).slice(0, 300)}{(hex ? entry.hex : JSON.stringify(entry.text)).length > 300 ? " …" : ""}</pre></td></tr>)}
          {!rows.length && <tr><td colSpan={4}>暂无匹配数据。连接板卡后，状态查询、路径发送和板卡回复会自动出现在这里；抓包本身不发送任何运动指令。</td></tr>}
        </tbody></table></div>
        {selected && <div className="capture-detail"><button onClick={() => setSelected(null)}>收起详情</button><strong>{selected.time} · {selected.direction} · {selected.bytes} B</strong><p>{selected.label}</p><pre>{hex ? selected.hex : JSON.stringify(selected.text)}</pre></div>}
        <footer>日志保存在本浏览器本机IndexedDB，刷新后可导出历史；清理浏览器站点数据会删除记录。WRITE_OK仅表示浏览器写入完成，不代表FPGA已确认；请核对随后RX中的OK/ERR。</footer>
      </div>
    </div>}
  </>;
}
