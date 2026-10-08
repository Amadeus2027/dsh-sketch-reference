// Summary of measured samples only; never infer real-model or cold-start results.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {join} from 'node:path';
const directory=process.env.DSH_PERF_RESULTS??'test-results';
const baseline=process.env.DSH_PERF_BASELINE??'baseline',optimized=process.env.DSH_PERF_OPTIMIZED??'optimized';
const versions=(process.env.DSH_PERF_VERSIONS??'0.2.0,0.2.1').split(',');
const summary=process.env.DSH_PERF_SUMMARY??'summary.md';
assert([baseline,optimized].every(v=>/^[a-z0-9-]+$/.test(v))&&/^[a-z0-9-]+\.md$/.test(summary));
assert.equal(versions.length,2);assert(versions.every(v=>/^[0-9.]+$/.test(v)));
const samples={};
for(const variant of ['baseline','optimized']){
 samples[variant]=await Promise.all([1,2,3].map(async i=>JSON.parse(await readFile(join(directory,`performance-${variant==='baseline'?baseline:optimized}-${i}.json`),'utf8'))));
 for(const sample of samples[variant]){
  assert(sample.clientArtifactVerified&&sample.persistedFinalEditVerified,'Unverified or failed sample');
  assert.equal(sample.sceneElements,250);assert.equal(sample.framesPerGesture,50);assert.equal(sample.realModelCalls,0);assert.equal(sample.editorRequestsBeforeOpen,0);
  assert.deepEqual(sample.viewport,{width:1600,height:1000});assert.equal(sample.pngExportMs.length,3);assert.equal(sample.reopenMs.length,5);assert.equal(sample.measurements.length,2);
 }
}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
const time=values=>`${median(values).toFixed(1)} (${Math.min(...values).toFixed(1)}–${Math.max(...values).toFixed(1)}) ms`;
const gesture=(variant,name)=>samples[variant].flatMap(s=>s.measurements.filter(m=>m.gesture===name));
const rows=[
 ['首次打开 · 3 样本',s=>time(s.map(x=>x.firstOpenMs))],
 ['关闭重开 · 15 样本',s=>time(s.flatMap(x=>x.reopenMs))],
 ['首次 PNG 导出 · 3 样本',s=>time(s.map(x=>x.pngExportMs[0]))],
 ['相同场景再次导出 · 6 样本',s=>time(s.flatMap(x=>x.pngExportMs.slice(1)))],
 ['保存 HTTP 往返（不含 debounce）',s=>time(s.flatMap(x=>x.saveRequestMs))],
 ['连续三次 PNG 实际光栅化',s=>String(median(s.map(x=>x.pngRasterizations)))],
 ['编辑 50 帧的恢复写入',s=>String(median(s.flatMap(x=>x.measurements.filter(m=>m.gesture==='edit').map(m=>m.backups))))],
 ['编辑帧间隔 P95 · 三轮的中位数',s=>`${median(s.flatMap(x=>x.measurements.filter(m=>m.gesture==='edit').map(m=>m.frameGapP95Ms))).toFixed(1)} ms`],
 ['绘图区（无批次/提示）',s=>{const {width,height}=s[0].canvas;assert(s.every(x=>x.canvas.width===width&&x.canvas.height===height));return `${width}×${height} px`;}],
 ['插件客户端（未压缩）',s=>`${s[0].pluginClientBytes.toLocaleString('en-US')} B`],
 ['打开前编辑器请求',s=>String(s[0].editorRequestsBeforeOpen)],
 ['深色主题同步',s=>s.every(x=>x.darkThemePropagated)?'通过':'未支持'],
];
const table=[`| 指标（耗时为中位数及范围） | ${versions[0]} | ${versions[1]} |`,'| --- | --- | --- |',...rows.map(([label,fn])=>`| ${label} | ${fn(samples.baseline)} | ${fn(samples.optimized)} |`)].join('\n');
for(const variant of ['baseline','optimized']){assert(gesture(variant,'pan').every(x=>x.backups===0&&x.saveRPCs===0));assert(gesture(variant,'edit').every(x=>x.saveRPCs===1));}
await writeFile(join(directory,summary),table+'\n');console.log(table);
