import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Excalidraw,CaptureUpdateAction} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI,AppState} from '@excalidraw/excalidraw/types';
import type {ExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import {loadSchema,drawingSchema,batchSchema,canonical,contentDigest,digest,type Owner,type Drawing,type Batch,type Route,type CommentStatus,type CommentUpdate} from '../core/contracts.ts';
import {withComments,anchorTarget,adviceIsStale} from '../core/comments.ts';
import {CommentList,CommentOverlay,type CommentActions} from './comments.tsx';
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
 const [,render]=useState(0),[goal,setGoal]=useState(initial?.goal??''),[message,setMessage]=useState(''),[batch,setBatch]=useState(latestAdvice),[stale,setStale]=useState(()=>adviceIsStale(latestAdvice,initial?.contentDigest,initial?.goal??'')),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false);
 const comments=useMemo(()=>batch?withComments(batch):null,[batch]);
 const [editor,setEditor]=useState<ExcalidrawImperativeAPI|null>(null),[selected,setSelected]=useState<string|null>(null),[showComments,setShowComments]=useState(true),[showIgnored,setShowIgnored]=useState(false);
 const [commentSaving,setCommentSaving]=useState(false),[commentError,setCommentError]=useState<{message:string;conflict:boolean}|null>(null);
 const pendingComment=useRef<CommentUpdate|null>(null);
 const [missing,setMissing]=useState(()=>new Set(comments?.comments.filter(c=>!anchorTarget(comments.advice.suggestions[c.suggestionIndex]?.anchor,initial?.scene.elements??[])&&comments.advice.suggestions[c.suggestionIndex]?.anchor).map(c=>c.id)));
 const reportMissing=useCallback((ids:Set<string>)=>setMissing(previous=>previous.size===ids.size&&[...ids].every(id=>previous.has(id))?previous:ids),[]);
 const [routeIndex,setRouteIndex]=useState(0),[copy,setCopy]=useState('');
 const api=useRef<ExcalidrawImperativeAPI|null>(null),mounted=useRef(true),active=useRef<AbortController|null>(null),goalRef=useRef(goal);
 const ready=useCallback((instance:ExcalidrawImperativeAPI)=>{api.current=instance;setEditor(instance);},[]);
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
 const updateStale=(scene:Drawing['scene'],currentGoal:string)=>{
  if(!batch)return;
  setStale(true);const generation=++digestGeneration.current;
  void contentDigest(scene).then(value=>{if(mounted.current&&generation===digestGeneration.current&&currentGoal===goalRef.current)setStale(adviceIsStale(batch,value,currentGoal));});
 };
 const updated=(elements:readonly ExcalidrawElement[],appState:AppState)=>{
  if(pending)return;
  try {const scene=normalize(elements,appState as unknown as Record<string,unknown>),draft={scene,goal:goalRef.current};
   const changed=canonical(queue.current())!==canonical(draft);queue.update(draft);
   if(changed)updateStale(scene,goalRef.current);
  }catch(e){setMessage(e instanceof Error?e.message:'草图超出限制');}
 };
 const capture=()=>{if(!api.current)throw new Error('画板尚未就绪');return normalize(api.current.getSceneElements(),api.current.getAppState() as unknown as Record<string,unknown>);};
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
  if(!comments||pendingComment.current)return;
  const input:CommentUpdate={batchId:comments.id,expectedRevision:comments.commentRevision,mutationId:crypto.randomUUID(),commentId,status};
  pendingComment.current=input;void saveComment(input);
 };
 const refreshComments=()=>void run(async()=>{
  if(commentSaving)return;
  const result=await rpc('advice/get',owner,null,lifecycle.current.signal),next=result===null?null:batchSchema.parse(result);
  if(!mounted.current)return;
  pendingComment.current=null;setCommentError(null);setBatch(next);setSelected(null);
  const currentGoal=goalRef.current,generation=++digestGeneration.current;
  setStale(!!next);
  if(next){const value=await contentDigest(capture());if(mounted.current&&generation===digestGeneration.current&&goalRef.current===currentGoal)setStale(adviceIsStale(next,value,currentGoal));}
 });
 const selectComment=(id:string,locate:boolean)=>{
  setSelected(id||null);if(!id||!comments||!api.current)return;
  const comment=comments.comments.find(c=>c.id===id),target=anchorTarget(comment?comments.advice.suggestions[comment.suggestionIndex]?.anchor:undefined,api.current.getSceneElements());
  if(target){api.current.updateScene({appState:{selectedElementIds:{[target.id]:true}},captureUpdate:CaptureUpdateAction.NEVER});if(locate)api.current.scrollToContent(target,{animate:false});}
 };
 const actions:CommentActions={select:selectComment,change:changeComment,use:index=>void run(async()=>{if(!batch)return;await queue.settle();setMessage(await insertAdvice(owner,batch.id,index));}),prompt:index=>setCopy(batch?.advice.suggestions[index]?.actionPrompt??'')};
 const analyze=()=>void run(async()=>{
  if(busy)return;if(pendingComment.current)throw new Error('请先重试保存或刷新批注');const route=routes[routeIndex];if(!route)throw new Error('请先在 Harness 中登录 DS 或配置支持图片的官方 DS 路线');
  const abort=new AbortController();active.current=abort;setBusy(true);setPreparing(true);
  try {
   const scene=structuredClone(capture());if(!scene.elements.length)throw new Error('先画一点内容');
   queue.update({scene,goal:goalRef.current});await queue.settle();
   if(!queue.revision)throw new Error('草图尚未保存');
   const revision=queue.revision,png=await pngExport(scene),pngBase64=await base64(png);
   abort.signal.throwIfAborted();setPreparing(false);
   const result=batchSchema.parse(await rpc('advice/generate',owner,{revision,pngBase64,route},abort.signal));
   if(mounted.current){const generation=++digestGeneration.current;setBatch(result);setSelected(withComments(result).comments[0]?.id??null);setShowComments(true);setCopy('');setStale(true);const currentGoal=goalRef.current,value=await contentDigest(capture());if(mounted.current&&generation===digestGeneration.current&&currentGoal===goalRef.current)setStale(adviceIsStale(result,value,currentGoal));}
  }catch(e){if(abort.signal.aborted)throw new Error('分析已取消，草图保留');throw e;
  }finally{if(mounted.current){setBusy(false);setPreparing(false);}active.current=null;}
 });
 const close=()=>void run(async()=>{if(pendingComment.current)throw new Error('批注状态尚未确认保存，请重试或刷新批注后关闭');try{await queue.settle();}catch{throw new Error('请先重试保存或下载草稿备份，再关闭');}await closeBoard();});
 const recover=()=>{if(!pending || !api.current)return;const {scene,goal:restored}=pending.draft;setGoal(restored);goalRef.current=restored;
  if(pending.draft.base!==queue.revision){setMessage('恢复副本与服务器版本不同。已载入本地供导出；为防止覆盖，请下载草稿后载入服务器版本。');queue.state='conflict';queue.error='恢复副本版本冲突';}
  api.current.updateScene({elements:scene.elements as unknown as ExcalidrawElement[]});queue.update({scene,goal:restored});setPending(null);
 };
 const initialData={elements:(initial?.scene.elements??[]) as unknown as ExcalidrawElement[],appState:{...(initial?.scene.appState??{}),viewBackgroundColor:'#ffffff',currentItemFontFamily:1} as Partial<AppState>};
 return <main className="board">
  <header><div><h1>手绘参考板</h1><span className={`save ${queue.state}`} role="status">{labels[queue.state]}</span></div><button onClick={close}>返回聊天 ×</button></header>
  <section className="intent"><label htmlFor="goal">这张图准备用来做什么？</label><input id="goal" maxLength={2000} value={goal} disabled={preparing||!!pending} placeholder="例如：按这张布局制作网页首页" onChange={e=>{setGoal(e.target.value);goalRef.current=e.target.value;queue.update({...queue.current(),goal:e.target.value});updateStale(queue.current().scene,e.target.value);}} />
   <label className="route">建议模型 <select aria-label="建议模型" disabled={busy} value={routeIndex} onChange={e=>setRouteIndex(Number(e.target.value))}>{!routes.length&&<option>尚未配置官方 DS</option>}{routes.map((r,i)=><option key={r.provider} value={i}>{r.provider==='deepseek-account'?'DS 账户':'DS API'} · Flash</option>)}</select></label>
  </section>
  <section className="advice" aria-label="AI 建议与批注">
   <div className="adviceTitle"><strong>AI 建议与批注</strong><span>{busy?'正在分析参考图…':batch?batch.advice.summary:'画好后分析草图，或直接加入聊天参考'}</span>{busy&&<button onClick={()=>{active.current?.abort();setMessage('分析已取消，草图保留');}}>取消</button>}</div>
   {comments&&<><div className="commentTools"><span>{stale?'草图或用途已修改，批注基于较早版本':'本次分析'} · {new Date(comments.createdAt).toLocaleString('zh-CN')}</span><button aria-pressed={showComments} onClick={()=>setShowComments(v=>!v)}>{showComments?'隐藏批注':'显示批注'}</button><button onClick={refreshComments} disabled={commentSaving}>刷新批注</button>{comments.comments.some(c=>c.status==='ignored')&&<button aria-pressed={showIgnored} onClick={()=>setShowIgnored(v=>!v)}>{showIgnored?'隐藏已忽略':'显示已忽略'}</button>}</div>
    <CommentList batch={comments} selected={selected} stale={stale||!!pending} saving={commentSaving||!!pendingComment.current||busy} showIgnored={showIgnored} actions={actions} missing={missing}/></>}
   {copy&&<div className="copy"><textarea readOnly aria-label="建议指令" value={copy}/><button onClick={()=>void run(async()=>{await navigator.clipboard.writeText(copy);setMessage('指令已复制');})}>复制</button><button onClick={()=>setCopy('')}>收起</button></div>}
  </section>
  {backupUnavailable&&<div className="notice" role="status">浏览器恢复存储不可用或空间不足，无法保证本地恢复副本；自动保存仍会尝试写入服务器。请及时下载草稿备份。</div>}
  {pending&&<div className="notice">发现未保存的恢复副本。<button onClick={recover}>恢复本地草稿</button><button onClick={()=>{downloadScene(pending.draft.scene);}}>下载恢复副本</button><button onClick={()=>setPending(null)}>暂不恢复</button></div>}
  {commentError&&<div className="notice" role="alert">批注状态未确认保存：{commentError.message}{!commentError.conflict&&<button disabled={commentSaving} onClick={()=>{if(pendingComment.current)void saveComment(pendingComment.current);}}>重试批注保存</button>}<button disabled={commentSaving} onClick={refreshComments}>刷新批注</button></div>}
  {(message||queue.error)&&<div className="notice" role="alert">{message||queue.error}{queue.state==='error'&&<button onClick={()=>void run(async()=>{await queue.settle();})}>重试保存</button>}{queue.state==='conflict'&&<><button onClick={()=>downloadScene(capture())}>下载我的草稿</button><button onClick={onReload}>载入服务器版本</button></>}</div>}
  <div className="canvas" data-preparing={preparing||!!pending}>
   <Excalidraw langCode="zh-CN" initialData={initialData} excalidrawAPI={ready} onChange={updated} UIOptions={{canvasActions:{loadScene:false,saveToActiveFile:false,export:false,saveAsImage:false,toggleTheme:false},tools:{image:false}}} />
   {comments&&<CommentOverlay api={editor} batch={comments} selected={selected} stale={stale} saving={commentSaving||!!pendingComment.current||busy} shown={showComments&&!pending&&!preparing} actions={actions} onMissing={reportMissing}/>}
   {(preparing||!!pending)&&<div className="freeze">{pending?'请先选择是否恢复本地草稿':'正在保存并生成参考图…'}</div>}
  </div>
  <footer><div className="actions"><button className="primary" disabled={!!pending||busy||preparing||queue.state==='conflict'||commentSaving} onClick={analyze}>{batch?'重新分析草图':'AI 分析草图'}</button><button disabled={!!pending||preparing} onClick={()=>void run(async()=>{setPreparing(true);try{const scene=structuredClone(capture());queue.update({scene,goal:goalRef.current});await queue.settle();const png=await pngExport(scene);const result=await stageImage(owner,png,await digest(scene));setMessage(stale&&batch?'参考图已更新；输入框中若有旧建议，请重新获取后替换。'+result:result);}finally{if(mounted.current)setPreparing(false);}})}>作为参考发送</button><button disabled={!!pending||preparing} onClick={()=>void run(async()=>download(await pngExport(capture()),'sketch-reference.png'))}>导出 PNG</button><button onClick={()=>downloadScene(capture())}>草稿备份</button></div><small>参考图加入左侧输入框后发送；分析会使用所选 DS 路线并产生模型用量。重新分析将替换当前批注；画板标记不进入导出图。</small></footer>
 </main>;
}
