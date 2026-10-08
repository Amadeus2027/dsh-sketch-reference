import {useEffect,useRef,useState} from 'react';
import {Excalidraw} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI,AppState} from '@excalidraw/excalidraw/types';
import type {ExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import {loadSchema,drawingSchema,batchSchema,canonical,contentDigest,digest,type Owner,type Drawing,type Batch,type Route} from '../core/contracts.ts';
import {normalize} from './scene.ts';
import {rpc} from './rpc.ts';
import {Autosave} from './autosave.ts';
import {writePending,clearPending,recoverPending} from './pending.ts';
import {pngExport,download,downloadScene,base64} from './export.ts';
import {startBridge,stageImage,insertAdvice,closeBoard} from './bridge.ts';
const labels={clean:'已保存',dirty:'未保存',saving:'正在保存',error:'保存失败',conflict:'版本冲突'};
export function SketchApp({sessionId}:{sessionId:string}) {
 const [loaded,setLoaded]=useState<ReturnType<typeof loadSchema.parse>|null>(null),[error,setError]=useState('');
 const [reload,setReload]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();setLoaded(null);setError('');
  void rpc('drawing/get',null,{sessionId},abort.signal).then(v=>{if(!abort.signal.aborted)setLoaded(loadSchema.parse(v));}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
  return()=>abort.abort();
 },[sessionId,reload]);
 if(!loaded)return <main className="loading"><h1>手绘参考板</h1><p role="status">{error||'正在载入会话草图…'}</p>{error&&<button onClick={()=>setReload(v=>v+1)}>重试</button>}<button onClick={()=>void closeBoard()}>返回聊天</button></main>;
 return <Board key={reload} owner={loaded.owner} initial={loaded.drawing} latestAdvice={loaded.latestAdvice} routes={loaded.routes} onReload={()=>setReload(v=>v+1)} />;
}
function Board({owner,initial,latestAdvice,routes,onReload}:{owner:Owner;initial:Drawing|null;latestAdvice:Batch|null;routes:Route[];onReload:()=>void}) {
 const [recovery]=useState(()=>recoverPending(owner));
 const [pending,setPending]=useState(recovery.pending),[backupUnavailable,setBackupUnavailable]=useState(!recovery.available);
 const [,render]=useState(0),[goal,setGoal]=useState(initial?.goal??''),[message,setMessage]=useState(''),[batch,setBatch]=useState(latestAdvice),[stale,setStale]=useState(false),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false);
 const [routeIndex,setRouteIndex]=useState(0),[copy,setCopy]=useState('');
 const api=useRef<ExcalidrawImperativeAPI|null>(null),mounted=useRef(true),active=useRef<AbortController|null>(null),goalRef=useRef(goal);
 const digestGeneration=useRef(0);
 const lifecycle=useRef(new AbortController());goalRef.current=goal;
 const [queue]=useState(()=>new Autosave(owner,initial,async input=>drawingSchema.parse(await rpc('drawing/save',owner,input,lifecycle.current.signal)),()=>{
  if(mounted.current)render(v=>v+1);
 },(draft,revision)=>{try{writePending(owner,draft,revision);}catch{if(mounted.current)setBackupUnavailable(true);}}));
 useEffect(()=>{
  mounted.current=true;const cleanup=startBridge();
  const hide=()=>{if(document.visibilityState==='hidden')void queue.settle().catch(()=>{});};
  document.addEventListener('visibilitychange',hide);
  return()=>{mounted.current=false;cleanup();active.current?.abort();lifecycle.current.abort();queue.dispose();document.removeEventListener('visibilitychange',hide);};
 },[queue]);
 useEffect(()=>{
  const dirty=canonical(queue.current())!==canonical({scene:initial?.scene??{elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}},goal:initial?.goal??''});
  if(pending && !dirty && canonical({scene:pending.draft.scene,goal:pending.draft.goal})===canonical(queue.current()))setPending(null);
  if(queue.state==='clean' && (!pending || canonical({scene:pending.draft.scene,goal:pending.draft.goal})===canonical(queue.current()))){try{clearPending(owner);}catch{setBackupUnavailable(true);}}
 },[queue.state,owner,initial,pending]);
 const updated=(elements:readonly ExcalidrawElement[],appState:AppState)=>{
  if(pending)return;
  try {const scene=normalize(elements,appState as unknown as Record<string,unknown>);queue.update({scene,goal:goalRef.current});
   if(batch){setStale(true);const currentGoal=goalRef.current,generation=++digestGeneration.current;void contentDigest(scene).then(value=>{if(mounted.current && generation===digestGeneration.current && currentGoal===goalRef.current)setStale(batch.contentDigest!==value||batch.goal!==currentGoal);});}
  }catch(e){setMessage(e instanceof Error?e.message:'草图超出限制');}
 };
 const capture=()=>{if(!api.current)throw new Error('画板尚未就绪');return normalize(api.current.getSceneElements(),api.current.getAppState() as unknown as Record<string,unknown>);};
 const run=async(task:()=>Promise<void>)=>{setMessage('');try{await task();}catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'操作失败');}};
 const analyze=()=>void run(async()=>{
  if(busy)return;const route=routes[routeIndex];if(!route)throw new Error('请先在 Harness 中登录 DS 或配置支持图片的官方 DS 路线');
  const abort=new AbortController();active.current=abort;setBusy(true);setPreparing(true);
  try {
   const scene=structuredClone(capture());if(!scene.elements.length)throw new Error('先画一点内容');
   queue.update({scene,goal:goalRef.current});await queue.settle();
   if(!queue.revision)throw new Error('草图尚未保存');
   const revision=queue.revision,png=await pngExport(scene),pngBase64=await base64(png);
   abort.signal.throwIfAborted();setPreparing(false);
   const result=batchSchema.parse(await rpc('advice/generate',owner,{revision,pngBase64,route},abort.signal));
   if(mounted.current){setBatch(result);setStale(result.contentDigest!==await contentDigest(capture()) || result.goal!==goalRef.current);}
  }finally{if(mounted.current){setBusy(false);setPreparing(false);}active.current=null;}
 });
 const close=()=>void run(async()=>{try{await queue.settle();}catch{throw new Error('请先重试保存或下载草稿备份，再关闭');}await closeBoard();});
 const recover=()=>{if(!pending || !api.current)return;const {scene,goal:restored}=pending.draft;setGoal(restored);goalRef.current=restored;
  if(pending.draft.base!==queue.revision){setMessage('恢复副本与服务器版本不同。已载入本地供导出；为防止覆盖，请下载草稿后载入服务器版本。');queue.state='conflict';queue.error='恢复副本版本冲突';}
  api.current.updateScene({elements:scene.elements as unknown as ExcalidrawElement[]});queue.update({scene,goal:restored});setPending(null);
 };
 const initialData={elements:(initial?.scene.elements??[]) as unknown as ExcalidrawElement[],appState:{...(initial?.scene.appState??{}),viewBackgroundColor:'#ffffff',currentItemFontFamily:1} as Partial<AppState>};
 return <main className="board">
  <header><div><h1>手绘参考板</h1><span className={`save ${queue.state}`} role="status">{labels[queue.state]}</span></div><button onClick={close}>返回聊天 ×</button></header>
  <section className="intent"><label htmlFor="goal">这张图准备用来做什么？</label><input id="goal" maxLength={2000} value={goal} disabled={preparing||!!pending} placeholder="例如：按这张布局制作网页首页" onChange={e=>{setGoal(e.target.value);goalRef.current=e.target.value;queue.update({...queue.current(),goal:e.target.value});if(batch)setStale(true);}} />
   <label className="route">建议模型 <select aria-label="建议模型" disabled={busy} value={routeIndex} onChange={e=>setRouteIndex(Number(e.target.value))}>{!routes.length&&<option>尚未配置官方 DS</option>}{routes.map((r,i)=><option key={r.provider} value={i}>{r.provider==='deepseek-account'?'DS 账户':'DS API'} · Flash</option>)}</select></label>
  </section>
  <section className="advice" aria-label="DS 建议">
   <div className="adviceTitle"><strong>DS 建议</strong><span>{busy?'正在分析参考图…':stale?'草图或用途已修改，建议基于较早版本':batch?batch.advice.summary:'画好后获取建议，或直接加入聊天参考'}</span>{busy&&<button onClick={()=>{active.current?.abort();setMessage('分析已取消，草图保留');}}>取消</button>}</div>
   {batch&&<div className="cards">{batch.advice.suggestions.map((s,i)=><article key={s.title+i}><h2>{s.title}</h2><p>{s.reason}</p><button disabled={stale||busy} onClick={()=>void run(async()=>{await queue.settle();setMessage(await insertAdvice(owner,batch.id,i));})}>使用建议</button><button onClick={()=>{setCopy(s.actionPrompt);}}>查看指令</button></article>)}</div>}
   {copy&&<div className="copy"><textarea readOnly aria-label="建议指令" value={copy}/><button onClick={()=>void run(async()=>{await navigator.clipboard.writeText(copy);setMessage('指令已复制');})}>复制</button><button onClick={()=>setCopy('')}>收起</button></div>}
  </section>
  {backupUnavailable&&<div className="notice" role="status">浏览器恢复存储不可用或空间不足，无法保证本地恢复副本；自动保存仍会尝试写入服务器。请及时下载草稿备份。</div>}
  {pending&&<div className="notice">发现未保存的恢复副本。<button onClick={recover}>恢复本地草稿</button><button onClick={()=>{downloadScene(pending.draft.scene);}}>下载恢复副本</button><button onClick={()=>setPending(null)}>暂不恢复</button></div>}
  {(message||queue.error)&&<div className="notice" role="alert">{message||queue.error}{queue.state==='error'&&<button onClick={()=>void run(async()=>{await queue.settle();})}>重试保存</button>}{queue.state==='conflict'&&<><button onClick={()=>downloadScene(capture())}>下载我的草稿</button><button onClick={onReload}>载入服务器版本</button></>}</div>}
  <div className="canvas" data-preparing={preparing||!!pending}>
   <Excalidraw langCode="zh-CN" initialData={initialData} excalidrawAPI={instance=>{api.current=instance;}} onChange={updated} UIOptions={{canvasActions:{loadScene:false,saveToActiveFile:false,export:false,saveAsImage:false,toggleTheme:false},tools:{image:false}}} />
   {(preparing||!!pending)&&<div className="freeze">{pending?'请先选择是否恢复本地草稿':'正在保存并生成参考图…'}</div>}
  </div>
  <footer><div className="actions"><button className="primary" disabled={!!pending||busy||preparing||queue.state==='conflict'} onClick={analyze}>完成并获取建议</button><button disabled={!!pending||preparing} onClick={()=>void run(async()=>{setPreparing(true);try{const scene=structuredClone(capture());queue.update({scene,goal:goalRef.current});await queue.settle();const png=await pngExport(scene);const result=await stageImage(owner,png,await digest(scene));setMessage(stale&&batch?'参考图已更新；输入框中若有旧建议，请重新获取后替换。'+result:result);}finally{if(mounted.current)setPreparing(false);}})}>作为参考发送</button><button disabled={!!pending||preparing} onClick={()=>void run(async()=>download(await pngExport(capture()),'sketch-reference.png'))}>导出 PNG</button><button onClick={()=>downloadScene(capture())}>草稿备份</button></div><small>参考图加入左侧输入框后发送；分析会使用所选 DS 路线并产生模型用量。</small></footer>
 </main>;
}
