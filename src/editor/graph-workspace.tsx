import {useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import type {Connection, ReactFlowInstance} from '@xyflow/react';
import type {GraphCanvas, SketchFlowNode} from './graph-canvas.tsx';
import {exportToBlob,getCommonBounds} from '@excalidraw/excalidraw';
import type {NonDeletedExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import {z} from 'zod';
import {canonical,loadSchema,drawingSchema} from '../core/contracts.ts';
import {graphSchema,graphContentSchema,graphDocumentRevisionsSchema,initialGraph,documentOwner,type GraphContent,type GraphNode,type GraphEdge,type GraphAnchor,type SketchGraph} from '../core/graph.ts';
import {GraphRecovery,type GraphPending,type ImportJob} from './graph-recovery.ts';
import {GraphAutosave,type GraphSavePhase} from './graph-autosave.ts';
import {GraphThumbnails} from './graph-thumbnails.ts';
import type {GraphEditorProps} from './graph-tools.tsx';
import {rpc} from './rpc.ts';
import {closeBoard} from './bridge.ts';
import {download} from './export.ts';
import {useAppearance} from './appearance.ts';
import './graph.css';

type Loaded=z.infer<typeof loadSchema>;
const graphResponse=z.object({graph:graphSchema.nullable()}).strict();
const documentResponse=z.object({drawing:drawingSchema.nullable()}).strict();
const backupSchema=z.object({format:z.literal('dsh-sketch-graph'),version:z.literal(1),content:graphContentSchema,documents:z.array(z.object({nodeId:z.string(),drawing:drawingSchema.nullable()}).strict()).max(100)}).strict().superRefine((b,ctx)=>{
 if(b.documents.length!==b.content.nodes.length||new Set(b.documents.map(d=>d.nodeId)).size!==b.documents.length||b.documents.some(d=>!b.content.nodes.some(n=>n.id===d.nodeId)))ctx.addIssue({code:'custom',message:'备份文档必须与节点逐一对应'});
});
export function GraphWorkspace({loaded,renderBoard,registerClose}:{loaded:Loaded;renderBoard:(loaded:Loaded,graph:GraphEditorProps,onReload:()=>void)=>ReactNode;registerClose:(handler:(()=>void)|null)=>void}){
 const appearance=useAppearance(),owner=loaded.owner;
 const [content,setContent]=useState<GraphContent>(initialGraph),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[overview,setOverview]=useState(false),[current,setCurrent]=useState<Loaded>(loaded),[editorEpoch,setEditorEpoch]=useState(0),[selected,setSelected]=useState<string|null>(null),[selectedNode,setSelectedNode]=useState<string|null>(null),[rebind,setRebind]=useState<GraphEdge|null>(null),[locate,setLocate]=useState<GraphEdge|null>(null);
 const [pending,setPending]=useState<GraphPending|null>(null),[job,setJob]=useState<ImportJob|null>(null),[phase,setPhase]=useState<GraphSavePhase>('clean');
 const [Canvas,setCanvas]=useState<typeof GraphCanvas|null>(null);
 const [canvasError,setCanvasError]=useState(false);
 const [canvasAttempt,retryCanvas]=useState(0);
 useEffect(()=>{
  if(!overview||Canvas)return;
  let active=true;
  setCanvasError(false);
  void import('./graph-canvas.tsx').then(module=>{
   if(active)setCanvas(()=>module.GraphCanvas);
  }).catch(()=>{if(active)setCanvasError(true);});
  return ()=>{active=false;};
 },[overview,Canvas,canvasAttempt]);
 const menu=useRef<HTMLDetailsElement>(null);
 const flow=useRef<ReactFlowInstance<SketchFlowNode>|null>(null);
 const graphRef=useRef<SketchGraph|null>(null),contentRef=useRef(content);
 const recovery=useMemo(()=>new GraphRecovery(owner),[owner]);
 const [revisions,setRevisions]=useState(new Map<string,string|null>());
 const thumbnails=useMemo(()=>new GraphThumbnails(async(id,signal)=>documentResponse.parse(await rpc('document/get',documentOwner(owner,id),null,signal)).drawing,async drawing=>{
  const elements=drawing.scene.elements.filter(e=>!e.isDeleted) as unknown as NonDeletedExcalidrawElement[],bounds=[...getCommonBounds(elements)];
  const blob=await exportToBlob({elements,appState:{...drawing.scene.appState,exportBackground:true,viewBackgroundColor:'#ffffff'},files:{},mimeType:'image/png',exportPadding:32,maxWidthOrHeight:480});
  return {url:URL.createObjectURL(blob),bounds};
 }),[owner]);
 useEffect(()=>()=>thumbnails.dispose(),[thumbnails]);
 const refreshPreviews=useCallback(async()=>{
  try{const rows=graphDocumentRevisionsSchema.parse(await rpc('graph/document-revisions',owner,null)),next=new Map(rows.map(r=>[r.nodeId,r.revision]));thumbnails.retain(next);setRevisions(next);}
  catch{thumbnails.dispose();setRevisions(new Map());setError('预览版本暂不可用，将按需重新读取草图');}
 },[owner,thumbnails]);
 const queue=useMemo(()=>new GraphAutosave({write:record=>recovery.writePending(record),clear:id=>recovery.clearPending(id),save:async request=>graphSchema.parse(await rpc('graph/save',owner,request)),saved:value=>{graphRef.current=value;},changed:(state,record,failure)=>{setPhase(state);setPending(state==='error'?record:null);if(state==='error')setError(failure instanceof Error?failure.message:'工作流保存失败');else if(state==='clean')setError('');}}),[owner,recovery]);
 useEffect(()=>{const checkpoint=()=>{try{queue.checkpointLayout();}catch{/* Queue reports the recovery failure. */}};window.addEventListener('pagehide',checkpoint);const hidden=()=>{if(document.visibilityState==='hidden')checkpoint();};document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('pagehide',checkpoint);document.removeEventListener('visibilitychange',hidden);queue.dispose();};},[queue]);
 const accept=(value:SketchGraph|null)=>{graphRef.current=value;const c=value?.content??initialGraph();contentRef.current=c;setContent(c);void flow.current?.setViewport(c.viewport);};
 const loadGraph=useCallback(async(showOverview=false)=>{
  let needsOverview=showOverview;
  const next=graphResponse.parse(await rpc('graph/get',owner,null)).graph;accept(next);setError('');
  try{let backup=recovery.readPending();
   if(backup&&!backup.next&&canonical(backup.request.content)===canonical(next?.content??initialGraph())){recovery.clearPending(backup.request.mutationId);backup=null;}
   queue.reset(next,backup);if(backup){contentRef.current=backup.next??backup.request.content;setContent(contentRef.current);needsOverview=true;}
   const task=await recovery.readImport();setJob(task);if(task)needsOverview=true;
  }catch{setError('本地工作流恢复存储不可用或损坏，请及时下载备份');}
  if(needsOverview){await refreshPreviews();setOverview(true);}
  setReady(true);
 },[owner,recovery,queue,refreshPreviews]);
 useEffect(()=>{void loadGraph().catch(e=>setError(e.message));},[loadGraph]);
 const save=async(next:GraphContent)=>{
  menu.current?.removeAttribute('open');
  setError('');queue.update(next);contentRef.current=next;setContent(next);thumbnails.retain(new Map(next.nodes.map(n=>[n.id,revisions.get(n.id)])));return queue.flush();
 };
 const layout=(next:GraphContent)=>{try{
  queue.stageLayout(next);
  // React Flow already owns the live viewport. Only publish changes to controlled nodes.
  const nodesChanged=next.nodes!==contentRef.current.nodes;
  contentRef.current=next;
  if(nodesChanged)setContent(next);
 }catch(e){setContent({...contentRef.current,nodes:[...contentRef.current.nodes]});void flow.current?.setViewport(contentRef.current.viewport);setError(e instanceof Error?e.message:'工作流保存失败');}};
 const run=(work:()=>Promise<unknown>)=>{void work().catch(e=>setError(e instanceof Error?e.message:'操作失败'));};
 const opening=useRef(false);
 const open=async(id:string)=>{
  if(opening.current||busy||pending||job)throw new Error('请先结束当前工作流操作');
  opening.current=true;setBusy(true);
  try{
   await queue.flush();
   const data=loadSchema.parse(await rpc('drawing/get',documentOwner(owner,id),{sessionId:owner.sessionId}));
   flow.current=null;setRebind(null);setCurrent(data);setOverview(false);setEditorEpoch(v=>v+1);
  }finally{opening.current=false;setBusy(false);}
 };
 const back=async()=>{await queue.flush();await loadGraph(true);setRebind(null);};
 const close=async()=>{if(busy||pending||job)throw new Error('请先处理工作流保存或恢复');await queue.flush();await closeBoard();};
 useEffect(()=>{if(overview){registerClose(()=>{void close().catch(e=>setError(e.message));});return()=>registerClose(null);}},[overview,registerClose,pending,job,busy,queue]);
 const nodeId=current.owner.nodeId??'root';
 const link=async(anchor:GraphAnchor,type:GraphEdge['type'],target:string,name:string)=>{
  const next=structuredClone(contentRef.current);
  if(rebind){const edge=next.edges.find(e=>e.id===rebind.id);if(!edge)throw new Error('关联已删除');edge.anchor=anchor;}
  else{if(target==='new'){target=crypto.randomUUID();const source=next.nodes.find(n=>n.id===nodeId)!;next.nodes.push({id:target,name,kind:type==='detail'?'detail':'page',position:{x:source.position.x+420,y:source.position.y+next.edges.filter(e=>e.sourceNodeId===nodeId).length*280}});}
   next.edges.push({id:crypto.randomUUID(),sourceNodeId:nodeId,targetNodeId:target,type,anchor,label:''});}
  await save(next);await refreshPreviews();setRebind(null);setOverview(true);
 };
 const graphProps:GraphEditorProps={content,nodeId,rebind,onBack:back,onLink:link,onLocate:id=>open(id)};
 const checkpoint=()=>{try{queue.checkpointLayout();}catch(e){setError(e instanceof Error?e.message:'工作流保存失败');}};
 const changeNode=(change:Partial<GraphNode>)=>{if(!selectedNode)return;run(()=>save({...contentRef.current,nodes:contentRef.current.nodes.map(n=>n.id===selectedNode?{...n,...change}:n)}));};
 const connect=(c:Connection)=>run(async()=>{if(!c.source||!c.target)return;const previous=contentRef.current.edges.find(e=>e.id===c.sourceHandle);await save({...contentRef.current,edges:[...contentRef.current.edges,{id:crypto.randomUUID(),sourceNodeId:c.source,targetNodeId:c.target,type:previous?.type??'navigation',anchor:previous?.anchor??{kind:'node'},label:''}]});});
 const backup=async()=>{const docs=z.array(z.object({nodeId:z.string(),drawing:drawingSchema.nullable()})).parse(await rpc('graph/documents',owner,null));download(new Blob([JSON.stringify(backupSchema.parse({format:'dsh-sketch-graph',version:1,content:contentRef.current,documents:contentRef.current.nodes.map(n=>({nodeId:n.id,drawing:docs.find(d=>d.nodeId===n.id)?.drawing??null}))}),null,2)],{type:'application/json'}),'sketch-graph.json');};
 const continueImport=async(task:ImportJob)=>{
  setBusy(true);try{const saved=graphSchema.parse(await rpc('graph/save',owner,task.graph));accept(saved);
   for(const doc of task.documents)await rpc('drawing/save',documentOwner(owner,doc.nodeId),doc.input);
   await recovery.clearImport(task.graph.mutationId);setJob(null);queue.reset(saved);await refreshPreviews();setError('备份已恢复为新节点，原草图保留');
  }finally{setBusy(false);}
 };
 const importFile=async(file:File)=>{
  menu.current?.removeAttribute('open');
  setBusy(true);try{await queue.flush();
  if(file.size>128*1024*1024)throw new Error('备份超过 128 MiB');const b=backupSchema.parse(JSON.parse(await file.text()));
  const remaining=100-contentRef.current.nodes.length,remainingEdges=300-contentRef.current.edges.length;
  if(b.content.nodes.length>remaining||b.content.edges.length>remainingEdges)throw new Error(`无法追加恢复：当前 ${contentRef.current.nodes.length} 个节点，剩余 ${remaining} 个节点／${remainingEdges} 条连线容量；备份包含 ${b.content.nodes.length} 个节点／${b.content.edges.length} 条连线。尚未恢复任何内容；请先减少备份节点或连线；当前仅支持追加恢复，不会覆盖已有根草图。`);
  const ids=new Map(b.content.nodes.map(n=>[n.id,crypto.randomUUID()]));
  const next=graphContentSchema.parse({...contentRef.current,nodes:[...contentRef.current.nodes,...b.content.nodes.map(n=>({...n,id:ids.get(n.id)!,name:`${n.name}（恢复）`,position:{x:n.position.x+480,y:n.position.y+160}}))],edges:[...contentRef.current.edges,...b.content.edges.map(e=>({...e,id:crypto.randomUUID(),sourceNodeId:ids.get(e.sourceNodeId)!,targetNodeId:ids.get(e.targetNodeId)!}))]});
  const task:ImportJob={graph:{expectedRevision:graphRef.current?.revision??null,mutationId:crypto.randomUUID(),content:next},documents:b.documents.filter(d=>d.drawing).map(d=>({nodeId:ids.get(d.nodeId)!,input:{expectedRevision:null,mutationId:crypto.randomUUID(),scene:d.drawing!.scene,goal:d.drawing!.goal}}))};
  await recovery.writeImport(task);setJob(task);await continueImport(task);
  }finally{setBusy(false);}
 };
 const edge=content.edges.find(e=>e.id===selected),node=content.nodes.find(n=>n.id===selectedNode),layoutLocked=busy||!!pending||!!job,locked=layoutLocked||phase==='saving';
 if(!ready)return <main className="loading"><p role="status">{error||'正在载入工作流…'}</p><button onClick={()=>run(loadGraph)}>重试</button></main>;
 if(!overview)return <div key={editorEpoch} style={{height:'100%'}}>{renderBoard(current,graphProps,()=>run(()=>open(nodeId)))}</div>;
 return <main className="board graphWorkspace">
  <header><h1>手绘参考板</h1><div className="graphModes"><button aria-pressed>工作流总览</button><button disabled={locked} onClick={()=>run(()=>open(nodeId))}>草图编辑</button></div><button disabled={locked} onClick={()=>run(close)}>返回聊天 ×</button></header>
  <div className="graphToolbar"><button disabled={locked} onClick={()=>run(async()=>{const id=crypto.randomUUID();await save({...contentRef.current,nodes:[...contentRef.current.nodes,{id,name:'新草图',kind:'unclassified',position:{x:(contentRef.current.nodes.length%3)*360,y:Math.floor(contentRef.current.nodes.length/3)*300}}]});setSelectedNode(id);})}>＋ 新建草图</button><details ref={menu} className="graphMore"><summary aria-label="更多工作流操作">更多</summary><div><button disabled={busy} onClick={()=>{menu.current?.removeAttribute('open');run(backup);}}>备份工作流</button><label className="graphImport">恢复备份<input type="file" accept="application/json,.json" disabled={locked} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)run(()=>importFile(f));}}/></label></div></details><span role="status">{opening.current?'正在打开草图…':busy||phase==='saving'?'正在保存…':pending?'保存待确认':phase==='dirty'?'待保存…':'已保存'} · {content.nodes.length} 张草图</span></div>
  {error&&<div className="notice" role="alert">{error}</div>}
  {pending&&<div className="notice">有未确认保存的工作流副本。<button disabled={phase==='saving'} onClick={()=>run(()=>queue.retry())}>重试保存</button><button disabled={busy} onClick={()=>{download(new Blob([JSON.stringify(pending)],{type:'application/json'}),'sketch-graph-pending.json');}}>下载本地副本</button><button disabled={busy} onClick={()=>{if(window.confirm('放弃未确认的图布局与关联，重新载入服务器版本？'))run(async()=>{recovery.clearPending(pending.request.mutationId);await loadGraph(true);});}}>载入服务器版本</button></div>}
  {job&&<div className="notice">备份恢复尚未完成，已保留恢复任务。<button disabled={busy} onClick={()=>run(()=>continueImport(job))}>继续恢复</button><button disabled={busy} onClick={()=>{download(new Blob([JSON.stringify(job)],{type:'application/json'}),'sketch-graph-restore-task.json');}}>下载恢复任务</button><button disabled={busy} onClick={()=>{if(window.confirm('结束恢复任务？已恢复的节点保留，未完成节点可手动删除。'))run(async()=>{await recovery.clearImport(job.graph.mutationId);queue.reset(graphRef.current);setJob(null);});}}>结束恢复</button></div>}
  <div className="graphBody"><div className="graphCanvas">
   {Canvas?<Canvas theme={appearance.theme} content={content} contentRef={contentRef} thumbnails={thumbnails} revisions={revisions}
    selected={selected} selectedNode={selectedNode} locate={locate} layoutLocked={layoutLocked} locked={locked}
    onInit={instance=>{flow.current=instance;}} layout={layout} checkpoint={checkpoint}
    selectNode={id=>{setSelectedNode(id);setSelected(null);}} openNode={id=>run(()=>open(id))}
    selectEdge={id=>{setSelected(id);setSelectedNode(null);}} clearSelection={()=>{setSelected(null);setSelectedNode(null);setLocate(null);}}
    connect={connect} reconnect={(old,c)=>run(async()=>{if(!c.source||!c.target)return;const anchor=c.source===old.source?(contentRef.current.edges.find(e=>e.id===old.id)?.anchor??{kind:'node' as const}):(contentRef.current.edges.find(e=>e.id===c.sourceHandle)?.anchor??{kind:'node' as const});await save({...contentRef.current,edges:contentRef.current.edges.map(e=>e.id===old.id?{...e,sourceNodeId:c.source!,targetNodeId:c.target!,anchor}:e)});})}/>:
    <div className="graphCanvasLoading" role="status">{canvasError?<><span>工作流视图加载失败</span><button onClick={()=>retryCanvas(value=>value+1)}>重试</button></>:'正在打开工作流…'}</div>}
  </div>
  {(edge||node)&&<aside className="graphSidebar">
   {node&&<><h2>草图设置</h2><label>名称<input key={node.id+node.name} aria-label="草图名称" defaultValue={node.name} maxLength={120} disabled={locked} onBlur={e=>{if(e.target.value.trim()&&e.target.value.trim()!==node.name)changeNode({name:e.target.value.trim()});}}/></label><label>用途<select value={node.kind} disabled={locked} onChange={e=>changeNode({kind:e.target.value as GraphNode['kind']})}><option value="page">页面</option><option value="detail">细节</option><option value="unclassified">未分类</option></select></label><button disabled={locked} onClick={()=>run(()=>open(node.id))}>编辑草图</button>{node.id!=='root'&&<button disabled={locked} onClick={()=>{const count=content.edges.filter(e=>e.sourceNodeId===node.id||e.targetNodeId===node.id).length;if(window.confirm(`删除“${node.name}”及其 ${count} 条关联？请先备份需要的内容。`))run(()=>save({...contentRef.current,nodes:contentRef.current.nodes.filter(n=>n.id!==node.id),edges:contentRef.current.edges.filter(e=>e.sourceNodeId!==node.id&&e.targetNodeId!==node.id)}));}}>删除草图</button>}</>}
   {edge&&<><h2>关联设置</h2><label>类型<select value={edge.type} disabled={locked} onChange={e=>run(()=>save({...contentRef.current,edges:contentRef.current.edges.map(v=>v.id===edge.id?{...v,type:e.target.value as GraphEdge['type']}:v)}))}><option value="navigation">页面跳转</option><option value="detail">细节展开</option></select></label><p>来源：{content.nodes.find(n=>n.id===edge.sourceNodeId)?.name}</p><p>目标：{content.nodes.find(n=>n.id===edge.targetNodeId)?.name}</p><label>关联说明<input key={edge.id+edge.label} defaultValue={edge.label} maxLength={200} disabled={locked} onBlur={e=>{if(e.target.value!==edge.label)run(()=>save({...contentRef.current,edges:contentRef.current.edges.map(v=>v.id===edge.id?{...v,label:e.target.value}:v)}));}}/></label><button disabled={locked} onClick={()=>{setLocate(edge);void flow.current?.fitView({nodes:[{id:edge.sourceNodeId}],maxZoom:1,duration:200});}}>定位来源</button><button disabled={locked} onClick={()=>run(async()=>{await open(edge.sourceNodeId);setRebind(edge);})}>重新绑定</button><button disabled={locked} onClick={()=>run(()=>save({...contentRef.current,edges:contentRef.current.edges.filter(e=>e.id!==edge.id)}))}>删除关联</button></>}
  </aside>}
  </div>
 </main>;
}
