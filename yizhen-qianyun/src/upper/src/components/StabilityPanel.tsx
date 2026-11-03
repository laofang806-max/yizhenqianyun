import {useEffect,useState} from 'react';
import {runtimeMetrics} from '../utils/runtimeMetrics';
import {downloadBlob} from '../utils/fileDownload';
export function StabilityPanel(){
 const [data,setData]=useState(runtimeMetrics.snapshot);
 useEffect(()=>{const timer=setInterval(()=>setData(runtimeMetrics.snapshot()),1000);return()=>clearInterval(timer);},[]);
 const fmt=(v:number|null)=>v===null?'—':v.toFixed(1);
 const exportData=(csv=false)=>{const snapshot=runtimeMetrics.snapshot();const body=csv?['时间,监测时间ms,序号,响应ms,结果',...snapshot.samples.map(s=>`${s.time},${s.elapsedMs.toFixed(1)},${s.id},${s.latencyMs?.toFixed(1)??''},${s.latencyMs===null?'超时':'应答'}`)].join('\n'):JSON.stringify(snapshot,null,2);downloadBlob(new Blob(['\ufeff'+body],{type:'text/plain;charset=utf-8'}),`湘绣运行稳定性-${Date.now()}.${csv?'csv':'json'}`);};
 const recent=data.samples.slice(-120),values=recent.flatMap(s=>s.latencyMs===null?[]:[s.latencyMs]);const ceiling=Math.max(100,...values);
 return <section className="panel stability-panel"><div className="panel-title">运行稳定性与持续响应</div><p>{data.enabled?'实时监测中':data.sent?'监测已暂停':'暂无实测数据，请连接新版板卡并开启持续响应监测。'}</p>
 <div className="metric-grid">{[['监测时长',`${(data.watchedMs/60000).toFixed(1)} min`],['已应答 / 已探测',`${data.received} / ${data.sent}`],['平均响应',`${fmt(data.meanMs)} ms`],['P95响应',`${fmt(data.p95Ms)} ms`],['最大响应',`${fmt(data.maxMs)} ms`],['超时率',data.timeoutRate===null?'—':`${(data.timeoutRate*100).toFixed(2)}%`],['串口写入失败',data.writeErrors],['板卡ERR',data.boardErrors],['纠偏次数',data.corrections],['完成色层',data.completed],['意外断开',data.disconnects],['编码器最大间隔',`${fmt(data.maxEncoderGapMs)} ms`]].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>
 {recent.length>0&&<svg className="response-chart" viewBox="0 0 600 120" role="img" aria-label="最近120次真实响应时间"><path d="M0 110H600" stroke="#ccd9c2" fill="none"/>{recent.map((s,i)=>s.latencyMs===null?<path key={i} d={`M${i*600/Math.max(1,recent.length-1)-3} 10l6 6m-6 0l6 -6`} stroke="#b35d51"/>:<circle key={i} cx={i*600/Math.max(1,recent.length-1)} cy={110-s.latencyMs/ceiling*95} r="2" fill="#537b58"/>)}</svg>}
 <p>带序号PING/PONG测量上位机至板卡的往返时间，包含串口排队和网页调度；超时阈值2秒。编码器间隔仅反映遥测连续性，不等于实际定位误差。图表显示最近120次，导出保留最近20000次。</p>
 <div className="metrics-actions"><button onClick={()=>exportData()}>导出报告 JSON</button><button onClick={()=>exportData(true)}>导出响应 CSV</button><button onClick={()=>{if(confirm('清零本页统计？原始通信日志不会清除。')){runtimeMetrics.reset();setData(runtimeMetrics.snapshot());}}}>统计清零</button></div>
 <small>建议记录30分钟以上、至少1000次应答和多色层执行，比较空闲与运行时的P95、超时率、错误和纠偏次数。统计本身不代表已通过长时间实板验证。</small></section>;
}
