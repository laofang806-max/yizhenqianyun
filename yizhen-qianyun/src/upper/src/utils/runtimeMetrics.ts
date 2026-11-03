type Sample={time:string;elapsedMs:number;id:string;latencyMs:number|null};
let started=performance.now(),lastEncoder=0,pending:{id:string;sent:number}|null=null;
let enabled=false,connected=false,sent=0,received=0,timeouts=0,writeErrors=0,boardErrors=0,corrections=0,completed=0,uploads=0,disconnects=0,maxEncoderGapMs=0;
let uploadStart=0;const uploadAcks:number[]=[];const samples:Sample[]=[];
let watchedMs=0,watchStarted=0;
let nextId=Math.floor(Math.random()*65536);
function sample(id:string,latencyMs:number|null){samples.push({time:new Date().toISOString(),elapsedMs:performance.now()-started,id,latencyMs});if(samples.length>20000)samples.shift();}
export const runtimeMetrics={
 connected(value:boolean,unexpected=false){connected=value;if(value)lastEncoder=0;if(!value){if(unexpected)disconnects++;runtimeMetrics.monitoring(false);pending=null;}},
 monitoring(value:boolean){if(enabled && !value)watchedMs+=performance.now()-watchStarted;if(!enabled&&value)watchStarted=performance.now();enabled=value;pending=null;if(value&&sent===0)started=performance.now();},
 probe():string|null{if(!enabled||!connected)return null;const now=performance.now();if(pending){if(now-pending.sent>=2000){timeouts++;sample(pending.id,null);pending=null;}else return null;}const id=(nextId++%65536).toString(16).padStart(4,'0').toUpperCase();pending={id,sent:now};sent++;return `PING ${id}\n`;},
 line(line:string){
   const m=/^PONG ([0-9A-Fa-f]{4})$/.exec(line);if(m&&pending&&m[1].toUpperCase()===pending.id){const elapsed=performance.now()-pending.sent;if(elapsed<2000){received++;sample(pending.id,elapsed);}else{timeouts++;sample(pending.id,null);}pending=null;}
   if(line.startsWith('ENC ')){const now=performance.now();if(lastEncoder)maxEncoderGapMs=Math.max(maxEncoderGapMs,now-lastEncoder);lastEncoder=now;}
   if(line.startsWith('ERR'))boardErrors++;
   if(line==='CORRECT')corrections++;
   if(line.startsWith('DONE '))completed++;
   if(line.startsWith('OK ')&&uploadStart){uploads++;uploadAcks.push(performance.now()-uploadStart);uploadStart=0;}
 },
 upload(){uploadStart=performance.now();},
 writeError(){writeErrors++;},
 reset(){started=performance.now();watchedMs=0;watchStarted=performance.now();lastEncoder=0;pending=null;sent=received=timeouts=writeErrors=boardErrors=corrections=completed=uploads=disconnects=maxEncoderGapMs=0;uploadStart=0;uploadAcks.length=0;samples.length=0;},
 snapshot(){const latencies=samples.flatMap(s=>s.latencyMs===null?[]:[s.latencyMs]).sort((a,b)=>a-b);const max=latencies.length?latencies[latencies.length-1]:null;return {startedAt:new Date(Date.now()-(performance.now()-started)).toISOString(),elapsedMs:performance.now()-started,watchedMs:watchedMs+(enabled?performance.now()-watchStarted:0),enabled,connected,sent,received,timeouts,pending:!!pending,writeErrors,boardErrors,corrections,completed,uploads,disconnects,meanMs:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:null,p95Ms:latencies.length?latencies[Math.max(0,Math.ceil(latencies.length*.95)-1)]:null,maxMs:max,timeoutRate:received+timeouts?timeouts/(received+timeouts):null,maxEncoderGapMs:lastEncoder?maxEncoderGapMs:null,encoderAgeMs:lastEncoder?performance.now()-lastEncoder:null,uploadAcksMs:[...uploadAcks],samples:[...samples],sampleRetentionLimit:20000};}
};
