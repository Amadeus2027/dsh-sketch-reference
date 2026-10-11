// Deterministic local microbenchmark; no model, filesystem writes or host changes.
import {performance} from 'node:perf_hooks';
import {RecordBytes} from '../src/host/record-bytes.ts';
const samples=40, rows=new Map();
for(let i=0;i<100;i++)rows.set(String(i),{id:i,scene:{text:'中文'.repeat(150_000)}});
const table={entries:()=>rows.entries()},next={id:'next',scene:{text:'small'}},cache=new RecordBytes();
const old=()=>Array.from(rows).reduce((sum,[k,v])=>sum+(k==='0'?0:Buffer.byteLength(JSON.stringify(v))),0)+Buffer.byteLength(JSON.stringify(next));
const cached=()=>cache.replacing(table,'0',next);
const measure=fn=>{const times=[];let bytes;for(let i=0;i<samples;i++){const start=performance.now();bytes=fn();times.push(performance.now()-start);}times.sort((a,b)=>a-b);return {samples,bytes,p50Ms:times[Math.floor(samples*.5)],p95Ms:times[Math.floor(samples*.95)]};};
const coldStart=performance.now(),coldBytes=cached(),coldMs=performance.now()-coldStart;
console.log(JSON.stringify({node:process.version,records:rows.size,baseline:measure(old),cached:measure(cached),cold:{bytes:coldBytes,ms:coldMs},scope:'quota calculation only; excludes digest, disk serialization and save transport'},null,2));
