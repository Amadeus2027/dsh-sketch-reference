import {useState,type PointerEvent} from 'react';
import {viewportCoordsToSceneCoords} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import type {GraphAnchor,GraphContent,GraphEdge} from '../core/graph.ts';
import {detailPath} from '../core/graph.ts';

export interface GraphEditorProps {
 content:GraphContent;nodeId:string;rebind:GraphEdge|null;
 onBack:()=>Promise<void>;
 onLink:(anchor:GraphAnchor,type:GraphEdge['type'],target:string,name:string)=>Promise<void>;
 onLocate:(nodeId:string)=>Promise<void>;
}
export function GraphEditorTools({graph,api,disabled,beforeAction}:{graph:GraphEditorProps;api:ExcalidrawImperativeAPI|null;disabled:boolean;beforeAction:()=>Promise<unknown>}){
 const [expanded,setExpanded]=useState(!!graph.rebind);
 const [type,setType]=useState<GraphEdge['type']>('navigation'),[target,setTarget]=useState('new'),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[region,setRegion]=useState(false),[start,setStart]=useState<{x:number;y:number}|null>(null),[end,setEnd]=useState<{x:number;y:number}|null>(null);
 const run=async(work:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await beforeAction();await work();}catch(e){setError(e instanceof Error?e.message:'操作失败');}finally{setBusy(false);}};
 const create=(anchor:GraphAnchor)=>run(()=>graph.onLink(anchor,type,target,name.trim()||'新草图'));
 const selection=()=>{if(!api)return;if(region){setRegion(false);setStart(null);setEnd(null);return;}const ids=Object.entries(api.getAppState().selectedElementIds).filter(([,yes])=>yes).map(([id])=>id);if(!ids.length){setRegion(true);setStart(null);setEnd(null);return;}void create({kind:'elements',elementIds:ids});};
 const down=(e:PointerEvent<HTMLDivElement>)=>{e.currentTarget.setPointerCapture(e.pointerId);setStart({x:e.clientX,y:e.clientY});setEnd({x:e.clientX,y:e.clientY});};
 const up=(e:PointerEvent<HTMLDivElement>)=>{
  if(!start||!api)return;const a=viewportCoordsToSceneCoords({clientX:start.x,clientY:start.y},api.getAppState()),b=viewportCoordsToSceneCoords({clientX:e.clientX,clientY:e.clientY},api.getAppState());setStart(null);setEnd(null);
  if(Math.abs(e.clientX-start.x)<8||Math.abs(e.clientY-start.y)<8){setError('请拖动框选一个区域');return;}
  setRegion(false);void create({kind:'region',region:{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(b.x-a.x),height:Math.abs(b.y-a.y)}});
 };
 const state=api?.getAppState();
 return <section className="graphEditorTools" aria-label="草图关联工具">
  <div className="graphBreadcrumb"><button disabled={disabled||busy} onClick={()=>void run(graph.onBack)}>工作流总览</button><span className="graphCurrentMode">草图编辑</span>{detailPath(graph.content,graph.nodeId).map(n=><span key={n.id}> / {n.id===graph.nodeId?n.name:<button className="graphCrumb" disabled={disabled||busy} onClick={()=>void run(()=>graph.onLocate(n.id))}>{n.name}</button>}</span>)}<button className="graphCreateToggle" disabled={!api||disabled||busy} aria-label="关联工具" aria-expanded={expanded} onClick={()=>{setExpanded(v=>!v);setRegion(false);}}>关联</button></div>
  <div className="graphToolRow" hidden={!expanded}>
   {graph.rebind?<strong>重新绑定：{graph.rebind.label||'关联'} · 选择新的元素或区域</strong>:<>
    <label>关联类型 <select aria-label="关联类型" value={type} onChange={e=>{const next=e.target.value as GraphEdge['type'];setType(next);if(next==='detail'&&target==='root')setTarget('new');}}><option value="navigation">页面跳转</option><option value="detail">细节展开</option></select></label>
    <label>目标 <select aria-label="目标" value={target} onChange={e=>setTarget(e.target.value)}><option value="new">新建草图</option>{graph.content.nodes.filter(n=>n.id!==graph.nodeId&&(type!=='detail'||n.id!=='root')).map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>
    {target==='new'&&<input aria-label="新关联草图名称" placeholder="新草图名称" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/>}
   </>}
   <button disabled={!api||disabled||busy} onClick={selection} title="绑定所选元素；未选中元素时拖动框选区域">{region?'取消框选':graph.rebind?'重新绑定':'创建关联'}</button>
   <span className="graphSelectionHint">选中元素可直接关联；未选择时框选区域</span>
  </div>
  {error&&<p role="alert">{error}</p>}
  {region&&state&&<div className="graphRegionPicker" style={{left:state.offsetLeft,top:state.offsetTop,width:state.width,height:state.height}} onPointerDown={down} onPointerMove={e=>{if(start)setEnd({x:e.clientX,y:e.clientY});}} onPointerUp={up} onPointerCancel={()=>{setStart(null);setEnd(null);}} role="region" aria-label="拖动框选关联区域">
   <span>拖动框选区域 · 再次点击按钮取消</span>
   {start&&end&&<div className="graphRegionRect" style={{left:Math.min(start.x,end.x)-state.offsetLeft,top:Math.min(start.y,end.y)-state.offsetTop,width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y)}}/>}
  </div>}
 </section>;
}
