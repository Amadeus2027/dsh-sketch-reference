import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Excalidraw,CaptureUpdateAction} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI,AppState} from '@excalidraw/excalidraw/types';
import type {ExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import {loadSchema,drawingSchema,batchSchema,canonical,contentDigest,digest,type Owner,type Drawing,type Batch,type Route,type CommentStatus,type CommentUpdate} from '../core/contracts.ts';
import {withComments,anchorTarget,adviceIsStale} from '../core/comments.ts';
import {CommentList,CommentOverlay,type CommentActions} from './comments.tsx';
import {normalize} from './scene.ts';
import {useAgentComments} from './agent-comments.ts';
import {rpc} from './rpc.ts';
import {Autosave} from './autosave.ts';
import {SceneUpdates} from './scene-updates.ts';
import {useAppearance} from './appearance.ts';
import {RPC_LIMITS} from '../core/limits.ts';
import {writePending,clearPending,recoverPending} from './pending.ts';
import {pngExport,download,downloadScene,base64} from './export.ts';
import {createSceneExport} from './scene-export.ts';
import {startBridge,stageImage,insertAdvice,closeBoard} from './bridge.ts';
const labels={clean:'已保存',dirty:'未保存',saving:'正在保存',error:'保存失败',conflict:'版本冲突'};
export function SketchApp({sessionId}:{sessionId:string}) {
 const [loaded,setLoaded]=useState<ReturnType<typeof loadSchema.parse>|null>(null),[error,setError]=useState('');
 const [reload,setReload]=useState(0),requestedClose=useRef<(()=>void)|null>(null);
 const registerClose=useCallback((handler:(()=>void)|null)=>{requestedClose.current=handler;},[]);
 useEffect(()=>startBridge(()=>{if(requestedClose.current)requestedClose.current();else void closeBoard();}),[sessionId]);
 useEffect(()=>{
  const abort=new AbortController();setLoaded(null);setError('');
  void rpc('drawing/get',null,{sessionId},abort.signal).then(v=>{if(!abort.signal.aborted)setLoaded(loadSchema.parse(v));}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
  return()=>abort.abort();
 },[sessionId,reload]);
 if(!loaded)return <main className="loading"><h1>手绘参考板</h1><p role="status">{error||'正在载入会话草图…'}</p>{error&&<button onClick={()=>setReload(v=>v+1)}>重试</button>}<button onClick={()=>void closeBoard()}>返回聊天</button></main>;
 return <Board key={reload} owner={loaded.owner} initial={loaded.drawing} latestAdvice={loaded.latestAdvice} routes={loaded.routes} registerClose={registerClose} onReload={()=>setReload(v=>v+1)} />;
}
function Board({owner,initial,latestAdvice,routes,onReload,registerClose}:{owner:Owner;initial:Drawing|null;latestAdvice:Batch|null;routes:Route[];onReload:()=>void;registerClose:(handler:(()=>void)|null)=>void}) {
 const appearance=useAppearance();
 const [exportScene]=useState(()=>createSceneExport(pngExport));
 const [adviceOpen,setAdviceOpen]=useState(false),[moreOpen,setMoreOpen]=useState(false),[exporting,setExporting]=useState(false);
 const closeAction=useRef<()=>void>(()=>{});
 useEffect(()=>{registerClose(()=>closeAction.current());return()=>registerClose(null);},[registerClose]);
 const [recovery]=useState(()=>recoverPending(owner));
 const [pending,setPending]=useState(recovery.pending),[backupUnavailable,setBackupUnavailable]=useState(!recovery.available);
 const [,render]=useState(0),[goal,setGoal]=useState(initial?.goal??''),[message,setMessage]=useState(''),[batch,setBatch]=useState(latestAdvice),[stale,setStale]=useState(()=>adviceIsStale(latestAdvice,initial?.contentDigest,initial?.goal??'')),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false);
 const analysisComments=useMemo(()=>batch?withComments(batch):null,[batch]);
 const [source,setSource]=useState<'analysis'|'agent'>('analysis');
 const [editor,setEditor]=useState<ExcalidrawImperativeAPI|null>(null),[selected,setSelected]=useState<string|null>(null),[showComments,setShowComments]=useState(true),[showIgnored,setShowIgnored]=useState(false);
 const [commentSaving,setCommentSaving]=useState(false),[commentError,setCommentError]=useState<{message:string;conflict:boolean}|null>(null);
 const pendingComment=useRef<CommentUpdate|null>(null);
 const [missing,setMissing]=useState(()=>new Set(analysisComments?.comments.filter(c=>!anchorTarget(analysisComments.advice.suggestions[c.suggestionIndex]?.anchor,initial?.scene.elements??[])&&analysisComments.advice.suggestions[c.suggestionIndex]?.anchor).map(c=>c.id)));
 const reportMissing=useCallback((ids:Set<string>)=>setMissing(previous=>previous.size===ids.size&&[...ids].every(id=>previous.has(id))?previous:ids),[]);
 const [routeIndex,setRouteIndex]=useState(0),[copy,setCopy]=useState('');
 const api=useRef<ExcalidrawImperativeAPI|null>(null),mounted=useRef(true),active=useRef<AbortController|null>(null),goalRef=useRef(goal);
 const ready=useCallback((instance:ExcalidrawImperativeAPI)=>{api.current=instance;setEditor(instance);},[]);
 const canvas=useRef<HTMLDivElement>(null),layoutBox=useRef('');
 const refreshLayout=useCallback(()=>{if(!api.current||!canvas.current)return;const rect=canvas.current.getBoundingClientRect(),key=[rect.left,rect.top,rect.width,rect.height].join(':');if(key!==layoutBox.current){layoutBox.current=key;api.current.refresh();}},[]);
 useLayoutEffect(refreshLayout);
 useEffect(()=>{if(!canvas.current)return;const observer=new ResizeObserver(refreshLayout);observer.observe(canvas.current);return()=>observer.disconnect();},[refreshLayout,editor]);
 const digestGeneration=useRef(0);
 const lifecycle=useRef(new AbortController());goalRef.current=goal;
 const [queue]=useState(()=>new Autosave(owner,initial,async input=>drawingSchema.parse(await rpc('drawing/save',owner,input,lifecycle.current.signal,true)),()=>{
  if(mounted.current)render(v=>v+1);
 },(draft,revision)=>{try{writePending(owner,draft,revision);}catch{if(mounted.current)setBackupUnavailable(true);}}));
 const agent=useAgentComments(owner,()=>api.current?normalize(api.current.getSceneElements(),api.current.getAppState() as unknown as Record<string,unknown>):queue.current().scene,()=>goalRef.current);
 const comments=source==='agent'?agent.batch:analysisComments,displayBatch=source==='agent'?agent.batch:batch,displayStale=source==='agent'?agent.stale:stale;
 const savingComments=source==='agent'?agent.saving||!!agent.pending:commentSaving||!!pendingComment.current;
 useEffect(()=>{setSource(agent.batch?'agent':'analysis');setSelected(null);setCopy('');},[agent.batch?.id]);
 const applyScene=useRef<(elements:readonly {id:string}[],state:Record<string,unknown>)=>void>(()=>{}),sceneError=useRef<string|null>(null);
 const [updates]=useState(()=>new SceneUpdates((elements,state)=>applyScene.current(elements,state)));
 useEffect(()=>{
  mounted.current=true;
  let closing=false;
  const shutdown=()=>{
   if(closing)return;closing=true;mounted.current=false;updates.dispose();active.current?.abort();
   const deadline=setTimeout(()=>lifecycle.current.abort(),RPC_LIMITS.ordinaryTimeoutMs);
   void queue.shutdown().catch(()=>{}).finally(()=>{clearTimeout(deadline);lifecycle.current.abort();});
   document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',shutdown);
  };
  const hide=()=>{if(document.visibilityState==='hidden'){updates.flush();void queue.settle().catch(()=>{});}};
  document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',shutdown);
  return shutdown;
 },[queue,updates]);
 useEffect(()=>{
  const dirty=canonical(queue.current())!==canonical({scene:initial?.scene??{elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}},goal:initial?.goal??''});
  if(pending && !dirty && canonical({scene:pending.draft.scene,goal:pending.draft.goal})===canonical(queue.current()))setPending(null);
  if(queue.state==='clean' && (!pending || canonical({scene:pending.draft.scene,goal:pending.draft.goal})===canonical(queue.current()))){try{clearPending(owner);}catch{setBackupUnavailable(true);}}
 },[queue.state,owner,initial,pending]);
 const updateStale=(scene:Drawing['scene'],currentGoal:string)=>{
  if((!batch&&!agent.batch)||!mounted.current)return;
  setStale(!!batch);agent.setStale(!!agent.batch);const generation=++digestGeneration.current;
  void contentDigest(scene).then(value=>{if(mounted.current&&generation===digestGeneration.current&&currentGoal===goalRef.current){setStale(adviceIsStale(batch,value,currentGoal));agent.setStale(adviceIsStale(agent.batch,value,currentGoal));}});
 };
 applyScene.current=(elements,state)=>{
  try{const scene=normalize(elements,state);sceneError.current=null;if(queue.update({scene,goal:goalRef.current}))updateStale(scene,goalRef.current);}
  catch(error){sceneError.current=error instanceof Error?error.message:'草图超出限制';if(mounted.current)setMessage(sceneError.current);}
 };
 const updated=(elements:readonly ExcalidrawElement[],appState:AppState)=>{if(!pending)updates.accept(elements,appState as unknown as Record<string,unknown>);};
 const capture=()=>{
  if(!api.current)throw new Error('画板尚未就绪');updates.accept(api.current.getSceneElements(),api.current.getAppState() as unknown as Record<string,unknown>);updates.flush();
  if(sceneError.current)throw new Error(sceneError.current);return queue.current().scene;
 };
 const settle=async()=>{if(api.current)capture();return queue.settle();};
 const run=async(task:()=>Promise<void>)=>{setMessage('');try{await task();}catch(e){if(mounted.current)setMessage(e instanceof Error?e.message:'操作失败');}};
 const saveComment=async(input:CommentUpdate)=>{
  setCommentSaving(true);setCommentError(null);
  try{
   const result=batchSchema.parse(await rpc('advice/update',owner,input,lifecycle.current.signal));
   if(mounted.current){setBatch(result);pendingComment.current=null;if(input.status==='ignored'){setSelected(value=>value===input.commentId?null:value);setCopy('');}}
  }catch(e){if(mounted.current)setCommentError({message:e instanceof Error?e.message:'批注保存失败',conflict:['COMMENT_CONFLICT','BATCH_CHANGED'].includes((e as {code?:string}).code??'')});}
  finally{if(mounted.current)setCommentSaving(false);}
 };
 const changeComment=(commentId:string,status:CommentStatus)=>{
  if(source==='agent'){agent.change(commentId,status);return;}
  if(!comments||pendingComment.current)return;
  const input:CommentUpdate={batchId:comments.id,expectedRevision:comments.commentRevision,mutationId:crypto.randomUUID(),commentId,status};
  pendingComment.current=input;void saveComment(input);
 };
 const refreshAnalysis=()=>void run(async()=>{
  if(commentSaving)return;
  const result=await rpc('advice/get',owner,null,lifecycle.current.signal),next=result===null?null:batchSchema.parse(result);
  if(!mounted.current)return;
  pendingComment.current=null;setCommentError(null);setBatch(next);setSelected(null);
  const currentGoal=goalRef.current,generation=++digestGeneration.current;
  setStale(!!next);
  if(next){const value=await contentDigest(capture());if(mounted.current&&generation===digestGeneration.current&&goalRef.current===currentGoal)setStale(adviceIsStale(next,value,currentGoal));}
 });
 const refreshComments=()=>source==='agent'?void agent.refresh():refreshAnalysis();
 const selectComment=(id:string,locate:boolean)=>{
  setSelected(id||null);if(!id||!comments||!api.current)return;
  const comment=comments.comments.find(c=>c.id===id),target=anchorTarget(comment?comments.advice.suggestions[comment.suggestionIndex]?.anchor:undefined,api.current.getSceneElements());
  if(target){api.current.updateScene({appState:{selectedElementIds:{[target.id]:true}},captureUpdate:CaptureUpdateAction.NEVER});if(locate)api.current.scrollToContent(target,{animate:false});}
 };
 const actions:CommentActions={select:selectComment,change:changeComment,use:index=>void run(async()=>{if(!batch)return;await settle();setMessage(await insertAdvice(owner,batch.id,index));}),prompt:index=>{setCopy(batch?.advice.suggestions[index]?.actionPrompt??'');setAdviceOpen(true);}};
 const analyze=()=>void run(async()=>{
  if(busy)return;if(pendingComment.current)throw new Error('请先重试保存或刷新批注');const route=routes[routeIndex];if(!route)throw new Error('请先在 Harness 中登录 DS 或配置支持图片的官方 DS 路线');
  const abort=new AbortController();active.current=abort;setBusy(true);setPreparing(true);
  try {
   const scene=capture();if(!scene.elements.length)throw new Error('先画一点内容');
   queue.update({scene,goal:goalRef.current});await settle();
   if(!queue.revision)throw new Error('草图尚未保存');
   const revision=queue.revision,png=await exportScene(scene),pngBase64=await base64(png);
   abort.signal.throwIfAborted();setPreparing(false);
   const result=batchSchema.parse(await rpc('advice/generate',owner,{revision,pngBase64,route},abort.signal));
   if(mounted.current){const generation=++digestGeneration.current;setBatch(result);setSource('analysis');setSelected(withComments(result).comments[0]?.id??null);setShowComments(true);setCopy('');setStale(true);const currentGoal=goalRef.current,value=await contentDigest(capture());if(mounted.current&&generation===digestGeneration.current&&currentGoal===goalRef.current)setStale(adviceIsStale(result,value,currentGoal));}
  }catch(e){if(abort.signal.aborted)throw new Error('分析已取消，草图保留');throw e;
  }finally{if(mounted.current){setBusy(false);setPreparing(false);}active.current=null;}
 });
 const close=()=>void run(async()=>{if(pendingComment.current||agent.pending)throw new Error('批注状态尚未确认保存，请重试或刷新批注后关闭');try{await settle();}catch{throw new Error('请先重试保存或下载草稿备份，再关闭');}await closeBoard();});
 closeAction.current=close;
 const recover=()=>{if(!pending || !api.current)return;const {scene,goal:restored}=pending.draft;setGoal(restored);goalRef.current=restored;
  if(pending.draft.base!==queue.revision){setMessage('恢复副本与服务器版本不同。已载入本地供导出；为防止覆盖，请下载草稿后载入服务器版本。');queue.state='conflict';queue.error='恢复副本版本冲突';}
  api.current.updateScene({elements:scene.elements as unknown as ExcalidrawElement[]});queue.update({scene,goal:restored});setPending(null);
 };
 const initialData={elements:(initial?.scene.elements??[]) as unknown as ExcalidrawElement[],appState:{...(initial?.scene.appState??{}),viewBackgroundColor:'#ffffff',currentItemFontFamily:1} as Partial<AppState>};
 return <main className="board">
  <header><div><h1>手绘参考板</h1><span className={`save ${queue.state}`} role="status" title={labels[queue.state]}>{labels[queue.state]}</span>{exporting&&<span role="status">正在导出…</span>}</div><button onClick={close}>返回聊天 ×</button></header>
  <section className="intent"><label className="srOnly" htmlFor="goal">这张图准备用来做什么？</label><input id="goal" maxLength={2000} value={goal} disabled={preparing||!!pending} placeholder="用途：例如识别物品、解释几何图形或讨论流程" onChange={e=>{const value=e.target.value;void run(async()=>{const scene=api.current?capture():queue.current().scene;setGoal(value);goalRef.current=value;queue.update({scene,goal:value});updateStale(scene,value);});}} />
  </section>
  {(batch||agent.batch||busy)&&<section className="advice" aria-label="AI 建议与批注">
   <div className="adviceTitle"><button aria-expanded={adviceOpen} aria-label={adviceOpen?'收起建议与批注':'展开建议与批注'} onClick={()=>setAdviceOpen(v=>!v)}>建议与批注{displayBatch?` · ${displayBatch.advice.suggestions.length}`:''} {adviceOpen?'⌃':'⌄'}</button><span>{busy?'正在分析草图…':displayBatch?.advice.summary}</span>{displayStale&&!busy&&<small>较早版本</small>}{busy&&<button onClick={()=>{active.current?.abort();setMessage('分析已取消，草图保留');}}>取消</button>}</div>
   <div hidden={!adviceOpen}>
   {batch&&agent.batch&&<div className="commentTools" role="group" aria-label="批注来源"><button aria-pressed={source==='analysis'} onClick={()=>{setSource('analysis');setSelected(null);setCopy('');}}>AI 分析建议</button><button aria-pressed={source==='agent'} onClick={()=>{setSource('agent');setSelected(null);setCopy('');}}>Agent 批注</button></div>}
   {comments&&<><div className="commentTools"><span title={new Date(comments.createdAt).toLocaleString('zh-CN')}>{displayStale?'草图或用途已修改，批注基于较早版本':source==='agent'?'原生聊天 Agent 批注':'本次分析'}</span><button aria-pressed={showComments} onClick={()=>setShowComments(v=>!v)}>{showComments?'隐藏批注':'显示批注'}</button><button onClick={refreshComments} disabled={savingComments}>刷新批注</button>{comments.comments.some(c=>c.status==='ignored')&&<button aria-pressed={showIgnored} onClick={()=>setShowIgnored(v=>!v)}>{showIgnored?'隐藏已忽略':'显示已忽略'}</button>}</div>
    <CommentList batch={comments} selected={selected} stale={displayStale||!!pending} saving={savingComments||busy} showIgnored={showIgnored} actions={actions} missing={missing}/></>}
   {copy&&<div className="copy"><textarea readOnly aria-label="建议指令" value={copy}/><button onClick={()=>void run(async()=>{await navigator.clipboard.writeText(copy);setMessage('指令已复制');})}>复制</button><button onClick={()=>setCopy('')}>收起</button></div>}
   </div>
  </section>}
  {agent.error&&<div className="notice" role="alert">Agent 批注：{agent.error}{agent.pending&&<button disabled={agent.saving} onClick={agent.retry}>重试 Agent 批注保存</button>}<button disabled={agent.saving} onClick={()=>void agent.refresh()}>刷新 Agent 批注</button></div>}
  {agent.disconnected&&<div className="notice" role="status">批注实时同步已断开，绘图和保存仍可使用。<button onClick={()=>void agent.refresh()}>刷新 Agent 批注</button></div>}
  {backupUnavailable&&<div className="notice" role="status">浏览器恢复存储不可用或空间不足，无法保证本地恢复副本；自动保存仍会尝试写入服务器。请及时下载草稿备份。</div>}
  {pending&&<div className="notice">发现未保存的恢复副本。<button onClick={recover}>恢复本地草稿</button><button onClick={()=>{downloadScene(pending.draft.scene);}}>下载恢复副本</button><button onClick={()=>setPending(null)}>暂不恢复</button></div>}
  {commentError&&<div className="notice" role="alert">批注状态未确认保存：{commentError.message}{!commentError.conflict&&<button disabled={commentSaving} onClick={()=>{if(pendingComment.current)void saveComment(pendingComment.current);}}>重试批注保存</button>}<button disabled={commentSaving} onClick={refreshAnalysis}>刷新批注</button></div>}
  {(message||queue.error)&&<div className="notice" role="alert">{message||queue.error}{queue.state==='error'&&<button onClick={()=>void run(async()=>{await settle();})}>重试保存</button>}{queue.state==='conflict'&&<><button onClick={()=>void run(async()=>{downloadScene(capture());})}>下载我的草稿</button><button onClick={onReload}>载入服务器版本</button></>}</div>}
  <div ref={canvas} className="canvas" data-preparing={preparing||!!pending}>
   <Excalidraw theme={appearance.theme} langCode="zh-CN" initialData={initialData} excalidrawAPI={ready} onChange={updated} UIOptions={{canvasActions:{loadScene:false,saveToActiveFile:false,export:false,saveAsImage:false,toggleTheme:false},tools:{image:false}}} />
   {comments&&<CommentOverlay api={editor} batch={comments} selected={selected} stale={displayStale} saving={savingComments||busy} shown={showComments&&!pending&&!preparing} actions={actions} onMissing={reportMissing}/>}
   {(preparing||!!pending)&&<div className="freeze">{pending?'请先选择是否恢复本地草稿':'正在保存并生成参考图…'}</div>}
  </div>
  <footer><div className="actions">
   <button disabled={!editor||!!pending||busy||preparing||queue.state==='conflict'||commentSaving} onClick={analyze}>{batch?'重新分析草图':'AI 分析草图'}</button>
   <button className="primary" disabled={!editor||!!pending||preparing} title="加入原生输入框，由你确认发送" onClick={()=>void run(async()=>{setPreparing(true);try{const scene=capture();queue.update({scene,goal:goalRef.current});await settle();const png=await exportScene(scene);const result=await stageImage(owner,png,await digest(scene));setMessage(stale&&batch?'参考图已更新；输入框中若有旧建议，请重新获取后替换。'+result:result);}finally{if(mounted.current)setPreparing(false);}})}>作为参考发送</button>
   <div className="more"><button aria-expanded={moreOpen} aria-label="更多操作" onClick={()=>setMoreOpen(v=>!v)}>···</button>{moreOpen&&<div className="moreMenu" role="group" aria-label="导出与模型选项">
    <button disabled={!editor||!!pending||preparing||exporting} onClick={()=>{setMoreOpen(false);void run(async()=>{setExporting(true);try{download(await exportScene(capture()),'sketch-reference.png');}finally{if(mounted.current)setExporting(false);}});}}>导出 PNG</button>
    <button onClick={()=>{setMoreOpen(false);void run(async()=>{downloadScene(capture());});}}>草稿备份</button>
    <label className="route">建议模型 <select aria-label="建议模型" disabled={busy} value={routeIndex} onChange={e=>setRouteIndex(Number(e.target.value))}>{!routes.length&&<option>尚未配置官方 DS</option>}{routes.map((r,i)=><option key={r.provider} value={i}>{r.provider==='deepseek-account'?'DS 账户':'DS API'} · Flash</option>)}</select></label>
    <small>AI 分析可选，会产生模型用量。参考图先加入聊天输入框，由你发送；批注不进入导出图。</small>
   </div>}</div>
  </div></footer>
 </main>;
}
