import {memo, useEffect, useMemo, useState, type MutableRefObject} from 'react';
import {ReactFlow, Background, Controls, Handle, Position, MarkerType, useUpdateNodeInternals, type Node, type NodeProps, type NodeChange, type Connection, type Viewport, type ReactFlowInstance, type Edge} from '@xyflow/react';
import {getCommonBounds} from '@excalidraw/excalidraw';
import type {NonDeletedExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import type {Drawing} from '../core/contracts.ts';
import {anchorStatus, type GraphAnchor, type GraphContent, type GraphEdge, type GraphNode} from '../core/graph.ts';
import type {GraphThumbnails} from './graph-thumbnails.ts';
import '@xyflow/react/dist/style.css';

const controlLabels = {
 'controls.ariaLabel': '工作流视图',
 'controls.zoomIn.ariaLabel': '放大',
 'controls.zoomOut.ariaLabel': '缩小',
 'controls.fitView.ariaLabel': '查看全图',
};

export type SketchFlowNode=Node<{node:GraphNode;cache:GraphThumbnails;revision:string|null|undefined;edges:GraphEdge[];locate:GraphAnchor|null},'sketch'>;

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
const nodeTypes={sketch:memo(Thumbnail,(a,b)=>a.id===b.id&&a.data.node.name===b.data.node.name&&a.data.node.kind===b.data.node.kind&&a.data.cache===b.data.cache&&a.data.revision===b.data.revision&&a.data.edges===b.data.edges&&a.data.locate===b.data.locate)};
const emptyEdges:GraphEdge[]=[];

interface GraphCanvasProps {
 theme: 'light' | 'dark';
 content: GraphContent;
 contentRef: MutableRefObject<GraphContent>;
 thumbnails: GraphThumbnails;
 revisions: Map<string, string | null>;
 selected: string | null;
 selectedNode: string | null;
 locate: GraphEdge | null;
 layoutLocked: boolean;
 locked: boolean;
 onInit: (flow: ReactFlowInstance<SketchFlowNode>) => void;
 layout: (content: GraphContent) => void;
 checkpoint: () => void;
 selectNode: (id: string) => void;
 openNode: (id: string) => void;
 selectEdge: (id: string) => void;
 clearSelection: () => void;
 connect: (connection: Connection) => void;
 reconnect: (edge: Edge, connection: Connection) => void;
}

export function GraphCanvas({theme, content, contentRef, thumbnails, revisions, selected, selectedNode, locate,
 layoutLocked, locked, onInit, layout, checkpoint, selectNode, openNode, selectEdge, clearSelection, connect, reconnect}: GraphCanvasProps) {
 // Viewport changes do not change thumbnail data or connection handles.
 const outgoing=useMemo(()=>{const map=new Map<string,GraphEdge[]>();for(const edge of content.edges){const edges=map.get(edge.sourceNodeId)??[];edges.push(edge);map.set(edge.sourceNodeId,edges);}return map;},[content.edges]);
 const flowNodes=useMemo<SketchFlowNode[]>(()=>content.nodes.map(n=>({id:n.id,type:'sketch',width:300,height:253,position:n.position,data:{node:n,cache:thumbnails,revision:revisions.get(n.id),edges:outgoing.get(n.id)??emptyEdges,locate:locate?.sourceNodeId===n.id?locate.anchor:null},selected:selectedNode===n.id})),[content.nodes,outgoing,thumbnails,revisions,locate,selectedNode]);
 const flowEdges=useMemo<Edge[]>(()=>content.edges.map(e=>({id:e.id,zIndex:1001,source:e.sourceNodeId,target:e.targetNodeId,sourceHandle:e.anchor.kind==='node'?'node':e.id,label:e.label||(e.type==='detail'?'细节展开':'页面跳转'),selected:selected===e.id,markerEnd:{type:MarkerType.ArrowClosed,color:e.type==='detail'?'var(--sketch-detail)':'var(--sketch-blue)'},style:{stroke:e.type==='detail'?'var(--sketch-detail)':'var(--sketch-blue)',strokeWidth:2,...(e.type==='detail'?{strokeDasharray:'7 5'}:{})}})),[content.edges,selected]);
 const moveNodes=(changes:NodeChange<SketchFlowNode>[])=>{
  if(layoutLocked)return;
  const positions=new Map<string,{x:number;y:number}>();
  for(const change of changes){
   if(change.type==='position'&&change.position)positions.set(change.id,change.position);
  }
  if(!positions.size)return;
  const current=contentRef.current;
  let moved=false;
  const nodes=current.nodes.map(node=>{
   const position=positions.get(node.id);
   if(!position||(position.x===node.position.x&&position.y===node.position.y))return node;
   moved=true;
   return {...node,position};
  });
  if(moved)layout({...current,nodes});
 };
 return <>
   <ReactFlow ariaLabelConfig={controlLabels} onInit={onInit} colorMode={theme} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} defaultViewport={content.viewport} onlyRenderVisibleElements nodesDraggable={!layoutLocked} nodesConnectable={!locked} elementsSelectable={!locked} deleteKeyCode={null}
    onNodesChange={moveNodes}
    onNodeDragStop={checkpoint}
    onMove={(_event,viewport:Viewport)=>{const old=contentRef.current.viewport;if(!layoutLocked&&(viewport.x!==old.x||viewport.y!==old.y||viewport.zoom!==old.zoom))layout({...contentRef.current,viewport});}}
    onMoveEnd={checkpoint}
    onNodeClick={(_e,n)=>selectNode(n.id)} onNodeDoubleClick={(_e,n)=>openNode(n.id)} onEdgeClick={(_e,e)=>selectEdge(e.id)} onPaneClick={clearSelection} onConnect={connect} edgesReconnectable={!locked} onReconnect={reconnect}>
    <Background/><Controls showInteractive={false}/>
   </ReactFlow><div className="graphLegend"><span>页面跳转</span><span>细节展开</span></div>
 </>;
}
