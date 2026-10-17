import {memo,useCallback,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ReactFlow,Background,Controls,Handle,Position,MarkerType,useUpdateNodeInternals,type Node,type NodeProps,type Connection,type Viewport,type ReactFlowInstance,type Edge} from '@xyflow/react';
import {exportToBlob,getCommonBounds} from '@excalidraw/excalidraw';
import type {NonDeletedExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import {z} from 'zod';
import {canonical,loadSchema,drawingSchema,type Drawing} from '../core/contracts.ts';
import {graphSchema,graphContentSchema,graphDocumentRevisionsSchema,initialGraph,documentOwner,anchorStatus,type GraphContent,type GraphNode,type GraphEdge,type GraphAnchor,type SketchGraph} from '../core/graph.ts';
import {GraphRecovery,type GraphPending,type ImportJob} from './graph-recovery.ts';
import {GraphAutosave,type GraphSavePhase} from './graph-autosave.ts';
import {GraphThumbnails} from './graph-thumbnails.ts';
import type {GraphEditorProps} from './graph-tools.tsx';
import {rpc} from './rpc.ts';
import {closeBoard} from './bridge.ts';
import {download} from './export.ts';
import {useAppearance} from './appearance.ts';
import '@xyflow/react/dist/style.css';
import './graph.css';

type Loaded=z.infer<typeof loadSchema>;
const graphResponse=z.object({graph:graphSchema.nullable()}).strict();
const documentResponse=z.object({drawing:drawingSchema.nullable()}).strict();
const backupSchema=z.object({format:z.literal('dsh-sketch-graph'),version:z.literal(1),content:graphContentSchema,documents:z.array(z.object({nodeId:z.string(),drawing:drawingSchema.nullable()}).strict()).max(100)}).strict().superRefine((b,ctx)=>{
 if(b.documents.length!==b.content.nodes.length||new Set(b.documents.map(d=>d.nodeId)).size!==b.documents.length||b.documents.some(d=>!b.content.nodes.some(n=>n.id===d.nodeId)))ctx.addIssue({code:'custom',message:'备份文档必须与节点逐一对应'});
});
type SketchFlowNode=Node<{node:GraphNode;cache:GraphThumbnails;revision:string|null|undefined;edges:GraphEdge[];locate:GraphAnchor|null},'sketch'>;

function Thumbnail({data,id}:NodeProps<SketchFlowNode>){
 const [documentLoaded,setDocumentLoaded]=useState(false);
 const [drawing,setDrawing]=useState<Drawing|null>(null),[url,setUrl]=useState(''),[bounds,setBounds]=useState<number[]|null>(null),[error,setError]=useState('');
 const update=useUpdateNodeInternals();
 useEffect(()=>{let active=true;setDocumentLoaded(false);setDrawing(null);setBounds(null);setUrl('');setError('');
  void data.cache.get(id,data.revision).then(value=>{if(active){setDrawing(value.drawing);setDocumentLoaded(true);setBounds(value.bounds);setUrl(value.url);}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'预览失败');});
  return()=>{active=false;};
 },[data.cache,data.revision,id]);
 useEffect(()=>{update(id);},[bounds,data.edges,id,update]);
 const point=(anchor:GraphAnchor)=>{
  if(!bounds||anchor.kind==='node')return null;
  let x:number,y:number;
  if(anchor.kind==='region'){x=anchor.region.x+anchor.region.width;y=anchor.region.y+anchor.region.height/2;}
  else{const selected=drawing?.scene.elements.filter(e=>!e.isDeleted&&anchor.elementIds.includes(e.id));if(!selected?.length||anchorStatus(anchor,drawing)==='missing')return null;const b=getCommonBounds(selected as unknown as NonDeletedExcalidrawElement[]);x=b[2];y=(b[1]+b[3])/2;}
  const [left=0,top=0,right=1,bottom=1]=bounds,w=right-left+64,h=bottom-top+64,scale=Math.min(280/w,190/h);
  return {left:(280-w*scale)/2+(x-left+32)*scale,top:(190-h*scale)/2+(y-top+32)*scale};
 };
 const locatePoint=data.locate?point(data.locate):null;
 const anchoredEdges=data.edges.filter(edge=>edge.anchor.kind!=='node');
 return <div className="sketchGraphNode">
  <div className="sketchGraphNodeTitle"><strong>{data.node.name}</strong><span>{data.node.kind==='detail'?'细节':data.node.kind==='page'?'页面':'未分类'}</span></div>
  <div className="sketchGraphPreview">{url?<img src={url} alt={`${data.node.name}草图预览`}/>:<span>{error||(!documentLoaded?'正在生成预览…':!drawing?.scene.elements.some(e=>!e.isDeleted)?'空白草图':'正在生成预览…')}</span>}
   {anchoredEdges.map((edge,index)=>{const p=point(edge.anchor),missing=anchorStatus(edge.anchor,drawing)==='missing';return <Handle key={edge.id} id={edge.id} type="source" position={Position.Right} className={`${edge.type} ${missing?'missing':''}`} style={p?{left:p.left,top:p.top,right:'auto'}:{top:18+index*16}} title={missing?'待重新绑定':edge.type==='detail'?'细节展开':'页面跳转'}/>;})}
   {documentLoaded&&data.edges.some(e=>anchorStatus(e.anchor,drawing)==='missing')&&<span className="graphAnchorWarning">关联来源已删除 · 请重新绑定</span>}
   {locatePoint&&<span className="graphLocate" style={{left:locatePoint.left,top:locatePoint.top}}/>}
  </div>
  <Handle id="node" type="source" position={Position.Right} style={{top:18}}/><Handle type="target" position={Position.Left} style={{top:18}}/>
 </div>;
}
const nodeTypes={sketch:memo(Thumbnail,(a,b)=>a.id===b.id&&a.data.node===b.data.node&&a.data.cache===b.data.cache&&a.data.revision===b.data.revision&&a.data.edges===b.data.edges&&a.data.locate===b.data.locate)};
const emptyEdges:GraphEdge[]=[];

export function GraphWorkspace({loaded,renderBoard,registerClose}:{loaded:Loaded;renderBoard:(loaded:Loaded,graph:GraphEditorProps,onReload:()=>void)=>ReactNode;registerClose:(handler:(()=>void)|null)=>void}){
 const appearance=useAppearance(),owner=loaded.owner;
 const [graph,setGraph]=useState<SketchGraph|null>(null),[content,setContent]=useState<GraphContent>(initialGraph),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[overview,setOverview]=useState(false),[current,setCurrent]=useState<Loaded>(loaded),[editorEpoch,setEditorEpoch]=useState(0),[selected,setSelected]=useState<string|null>(null),[selectedNode,setSelectedNode]=useState<string|null>(null),[rebind,setRebind]=useState<GraphEdge|null>(null),[locate,setLocate]=useState<GraphEdge|null>(null);
 const [pending,setPending]=useState<GraphPending|null>(null),[job,setJob]=useState<ImportJob|null>(null),[phase,setPhase]=useState<GraphSavePhase>('clean');
 const menu=useRef<HTMLDetailsElement>(null);
 const flow=useRef<ReactFlowInstance<SketchFlowNode>|null>(null);
 const graphRef=useRef(graph),contentRef=useRef(content);graphRef.current=graph;contentRef.current=content;
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
 const queue=useMemo(()=>new GraphAutosave({write:record=>recovery.writePending(record),clear:id=>recovery.clearPending(id),save:async request=>graphSchema.parse(await rpc('graph/save',owner,request)),saved:value=>{graphRef.current=value;setGraph(value);},changed:(state,record,failure)=>{setPhase(state);setPending(state==='error'?record:null);if(state==='error')setError(failure instanceof Error?failure.message:'工作流保存失败');else if(state==='clean')setError('');}}),[owner,recovery]);
 useEffect(()=>{const checkpoint=()=>{try{queue.checkpointLayout();}catch{/* Queue reports the recovery failure. */}};window.addEventListener('pagehide',checkpoint);const hidden=()=>{if(document.visibilityState==='hidden')checkpoint();};document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('pagehide',checkpoint);document.removeEventListener('visibilitychange',hidden);queue.dispose();};},[queue]);
 const accept=(value:SketchGraph|null)=>{graphRef.current=value;setGraph(value);const c=value?.content??initialGraph();contentRef.current=c;setContent(c);void flow.current?.setViewport(c.viewport);};
 const loadGraph=useCallback(async()=>{
  const next=graphResponse.parse(await rpc('graph/get',owner,null)).graph;accept(next);setError('');
  try{let backup=recovery.readPending();
   if(backup&&!backup.next&&canonical(backup.request.content)===canonical(next?.content??initialGraph())){recovery.clearPending(backup.request.mutationId);backup=null;}
   queue.reset(next,backup);if(backup){contentRef.current=backup.next??backup.request.content;setContent(contentRef.current);setOverview(true);}
   const task=await recovery.readImport();setJob(task);if(task)setOverview(true);
  }catch{setError('本地工作流恢复存储不可用或损坏，请及时下载备份');}
  await refreshPreviews();setReady(true);
 },[owner,recovery,queue,refreshPreviews]);
 useEffect(()=>{void loadGraph().catch(e=>setError(e.message));},[loadGraph]);
 const save=async(next:GraphContent)=>{
  menu.current?.removeAttribute('open');
  setError('');queue.update(next);contentRef.current=next;setContent(next);thumbnails.retain(new Map(next.nodes.map(n=>[n.id,revisions.get(n.id)])));return queue.flush();
 };
 const layout=(next:GraphContent)=>{try{queue.stageLayout(next);contentRef.current=next;setContent(next);}catch(e){setContent({...contentRef.current,nodes:[...contentRef.current.nodes]});void flow.current?.setViewport(contentRef.current.viewport);setError(e instanceof Error?e.message:'工作流保存失败');}};
 const run=(work:()=>Promise<unknown>)=>{void work().catch(e=>setError(e instanceof Error?e.message:'操作失败'));};
 const open=async(id:string)=>{if(busy||pending||job)throw new Error('请先处理工作流保存或恢复');await queue.flush();const data=loadSchema.parse(await rpc('drawing/get',documentOwner(owner,id),{sessionId:owner.sessionId}));setRebind(null);setCurrent(data);setOverview(false);setEditorEpoch(v=>v+1);};
 const back=async()=>{await queue.flush();await loadGraph();setRebind(null);setOverview(true);};
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
 // Viewport changes do not change thumbnail data or connection handles.
 const outgoing=useMemo(()=>{const map=new Map<string,GraphEdge[]>();for(const edge of content.edges){const edges=map.get(edge.sourceNodeId)??[];edges.push(edge);map.set(edge.sourceNodeId,edges);}return map;},[content.edges]);
 const flowNodes=useMemo<SketchFlowNode[]>(()=>content.nodes.map(n=>({id:n.id,type:'sketch',width:300,height:253,position:n.position,data:{node:n,cache:thumbnails,revision:revisions.get(n.id),edges:outgoing.get(n.id)??emptyEdges,locate:locate?.sourceNodeId===n.id?locate.anchor:null},selected:selectedNode===n.id})),[content.nodes,outgoing,thumbnails,revisions,locate,selectedNode]);
 const flowEdges=useMemo<Edge[]>(()=>content.edges.map(e=>({id:e.id,zIndex:1001,source:e.sourceNodeId,target:e.targetNodeId,sourceHandle:e.anchor.kind==='node'?'node':e.id,label:e.label||(e.type==='detail'?'细节展开':'页面跳转'),selected:selected===e.id,markerEnd:{type:MarkerType.ArrowClosed,color:e.type==='detail'?'var(--sketch-detail)':'var(--sketch-blue)'},style:{stroke:e.type==='detail'?'var(--sketch-detail)':'var(--sketch-blue)',strokeWidth:2,...(e.type==='detail'?{strokeDasharray:'7 5'}:{})}})),[content.edges,selected]);
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
  <div className="graphToolbar"><button disabled={locked} onClick={()=>run(async()=>{const id=crypto.randomUUID();await save({...contentRef.current,nodes:[...contentRef.current.nodes,{id,name:'新草图',kind:'unclassified',position:{x:(contentRef.current.nodes.length%3)*360,y:Math.floor(contentRef.current.nodes.length/3)*300}}]});setSelectedNode(id);})}>＋ 新建草图</button><details ref={menu} className="graphMore"><summary aria-label="更多工作流操作">更多</summary><div><button disabled={busy} onClick={()=>{menu.current?.removeAttribute('open');run(backup);}}>备份工作流</button><label className="graphImport">恢复备份<input type="file" accept="application/json,.json" disabled={locked} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)run(()=>importFile(f));}}/></label></div></details><span role="status">{busy||phase==='saving'?'正在保存…':pending?'保存待确认':phase==='dirty'?'待保存…':'已保存'} · {content.nodes.length} 张草图</span></div>
  {error&&<div className="notice" role="alert">{error}</div>}
  {pending&&<div className="notice">有未确认保存的工作流副本。<button disabled={phase==='saving'} onClick={()=>run(()=>queue.retry())}>重试保存</button><button disabled={busy} onClick={()=>{download(new Blob([JSON.stringify(pending)],{type:'application/json'}),'sketch-graph-pending.json');}}>下载本地副本</button><button disabled={busy} onClick={()=>{if(window.confirm('放弃未确认的图布局与关联，重新载入服务器版本？'))run(async()=>{recovery.clearPending(pending.request.mutationId);await loadGraph();});}}>载入服务器版本</button></div>}
  {job&&<div className="notice">备份恢复尚未完成，已保留恢复任务。<button disabled={busy} onClick={()=>run(()=>continueImport(job))}>继续恢复</button><button disabled={busy} onClick={()=>{download(new Blob([JSON.stringify(job)],{type:'application/json'}),'sketch-graph-restore-task.json');}}>下载恢复任务</button><button disabled={busy} onClick={()=>{if(window.confirm('结束恢复任务？已恢复的节点保留，未完成节点可手动删除。'))run(async()=>{await recovery.clearImport(job.graph.mutationId);queue.reset(graphRef.current);setJob(null);});}}>结束恢复</button></div>}
  <div className="graphBody"><div className="graphCanvas">
   <ReactFlow onInit={instance=>{flow.current=instance;}} colorMode={appearance.theme} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} defaultViewport={content.viewport} onlyRenderVisibleElements nodesDraggable={!layoutLocked} nodesConnectable={!locked} elementsSelectable={!locked} deleteKeyCode={null}
    onNodesChange={changes=>{if(layoutLocked)return;const positions=new Map<string,{x:number;y:number}>();for(const change of changes)if(change.type==='position'&&change.position)positions.set(change.id,change.position);if(!positions.size)return;let moved=false;const nodes=contentRef.current.nodes.map(n=>{const position=positions.get(n.id);if(!position||(position.x===n.position.x&&position.y===n.position.y))return n;moved=true;return {...n,position};});if(moved)layout({...contentRef.current,nodes});}}
    onNodeDragStop={()=>{try{queue.checkpointLayout();}catch(e){setError(e instanceof Error?e.message:'工作流保存失败');}}}
    onMove={(_event,viewport:Viewport)=>{const old=contentRef.current.viewport;if(!layoutLocked&&(viewport.x!==old.x||viewport.y!==old.y||viewport.zoom!==old.zoom))layout({...contentRef.current,viewport});}}
    onMoveEnd={()=>{try{queue.checkpointLayout();}catch(e){setError(e instanceof Error?e.message:'工作流保存失败');}}}
    onNodeClick={(_e,n)=>{setSelectedNode(n.id);setSelected(null);}} onNodeDoubleClick={(_e,n)=>run(()=>open(n.id))} onEdgeClick={(_e,e)=>{setSelected(e.id);setSelectedNode(null);}} onPaneClick={()=>{setSelected(null);setSelectedNode(null);setLocate(null);}} onConnect={connect} edgesReconnectable={!locked} onReconnect={(old,c)=>run(async()=>{if(!c.source||!c.target)return;const anchor=c.source===old.source?(contentRef.current.edges.find(e=>e.id===old.id)?.anchor??{kind:'node' as const}):(contentRef.current.edges.find(e=>e.id===c.sourceHandle)?.anchor??{kind:'node' as const});await save({...contentRef.current,edges:contentRef.current.edges.map(e=>e.id===old.id?{...e,sourceNodeId:c.source!,targetNodeId:c.target!,anchor}:e)});})}>
    <Background/><Controls showInteractive={false}/>
   </ReactFlow><div className="graphLegend">蓝色实线：页面跳转　橙色虚线：细节展开</div>
  </div>
  {(edge||node)&&<aside className="graphSidebar">
   {node&&<><h2>草图设置</h2><label>名称<input key={node.id+node.name} aria-label="草图名称" defaultValue={node.name} maxLength={120} disabled={locked} onBlur={e=>{if(e.target.value.trim()&&e.target.value.trim()!==node.name)changeNode({name:e.target.value.trim()});}}/></label><label>用途<select value={node.kind} disabled={locked} onChange={e=>changeNode({kind:e.target.value as GraphNode['kind']})}><option value="page">页面</option><option value="detail">细节</option><option value="unclassified">未分类</option></select></label><button disabled={locked} onClick={()=>run(()=>open(node.id))}>编辑草图</button>{node.id!=='root'&&<button disabled={locked} onClick={()=>{const count=content.edges.filter(e=>e.sourceNodeId===node.id||e.targetNodeId===node.id).length;if(window.confirm(`删除“${node.name}”及其 ${count} 条关联？请先备份需要的内容。`))run(()=>save({...contentRef.current,nodes:contentRef.current.nodes.filter(n=>n.id!==node.id),edges:contentRef.current.edges.filter(e=>e.sourceNodeId!==node.id&&e.targetNodeId!==node.id)}));}}>删除草图</button>}</>}
   {edge&&<><h2>关联设置</h2><label>类型<select value={edge.type} disabled={locked} onChange={e=>run(()=>save({...contentRef.current,edges:contentRef.current.edges.map(v=>v.id===edge.id?{...v,type:e.target.value as GraphEdge['type']}:v)}))}><option value="navigation">页面跳转</option><option value="detail">细节展开</option></select></label><p>来源：{content.nodes.find(n=>n.id===edge.sourceNodeId)?.name}</p><p>目标：{content.nodes.find(n=>n.id===edge.targetNodeId)?.name}</p><label>关联说明<input key={edge.id+edge.label} defaultValue={edge.label} maxLength={200} disabled={locked} onBlur={e=>{if(e.target.value!==edge.label)run(()=>save({...contentRef.current,edges:contentRef.current.edges.map(v=>v.id===edge.id?{...v,label:e.target.value}:v)}));}}/></label><button disabled={locked} onClick={()=>{setLocate(edge);void flow.current?.fitView({nodes:[{id:edge.sourceNodeId}],maxZoom:1,duration:200});}}>定位来源</button><button disabled={locked} onClick={()=>run(async()=>{await open(edge.sourceNodeId);setRebind(edge);})}>重新绑定</button><button disabled={locked} onClick={()=>run(()=>save({...contentRef.current,edges:contentRef.current.edges.filter(e=>e.id!==edge.id)}))}>删除关联</button></>}
  </aside>}
  </div>
 </main>;
}
