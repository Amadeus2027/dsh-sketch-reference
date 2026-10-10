import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {getCommonBounds,sceneCoordsToViewportCoords} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {anchorTarget,type CommentView} from '../core/comments.ts';
import type {CommentStatus} from '../core/contracts.ts';
import type {CommentRequest} from '../core/comment-context.ts';

export const commentNumbers=['①','②','③'];
export interface CommentActions {
 select:(id:string,locate:boolean)=>void;
 hover:(id:string|null)=>void;
 discuss:(id:string,intent:CommentRequest['intent'])=>void;
 change:(id:string,status:CommentStatus)=>void;
 use:(index:number)=>void;
 prompt:(index:number)=>void;
}
interface Props {batch:CommentView;selected:string|null;stale:boolean;saving:boolean;showIgnored:boolean;actions:CommentActions;missing:Set<string>}
function Detail({batch,id,stale,saving,actions}:{batch:CommentView;id:string;stale:boolean;saving:boolean;actions:CommentActions}) {
 const comment=batch.comments.find(c=>c.id===id)!;
 const suggestion=batch.advice.suggestions[comment.suggestionIndex]!;
 return <div className="commentDetail"><p>{suggestion.reason}</p><div className="commentActions" role="group" aria-label="在原生聊天中讨论批注">
  <button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.discuss(id,'ask')}>追问</button>
  <button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.discuss(id,'correct')}>纠正</button>
  <button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.discuss(id,'edit')}>修改这里</button>
  {suggestion.actionPrompt&&<><button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.use(comment.suggestionIndex)}>使用建议</button>
  <button onClick={()=>actions.prompt(comment.suggestionIndex)}>查看指令</button></>}
  <button disabled={saving} onClick={()=>actions.change(id,comment.status==='open'?'resolved':'open')}>{comment.status==='open'?'标记已解决':'重新打开'}</button>
  {comment.status!=='ignored'&&<button disabled={saving} onClick={()=>actions.change(id,'ignored')}>忽略批注</button>}
 </div></div>;
}
export function CommentList({batch,selected,stale,saving,showIgnored,actions,missing}:Props){return <div className="cards" data-stale={stale}>
 {batch.comments.filter(c=>showIgnored||c.status!=='ignored').map(c=>{
  const suggestion=batch.advice.suggestions[c.suggestionIndex]!,expanded=selected===c.id;
  return <article key={c.id} className={`commentCard ${c.status} ${expanded?'active':''}`} data-comment-id={c.id}
   onMouseEnter={()=>actions.hover(c.id)} onMouseLeave={()=>actions.hover(null)}
   onFocus={()=>actions.hover(c.id)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))actions.hover(null);}}
   onClick={e=>{if(!(e.target as Element).closest('button,a,input,textarea,select'))actions.select(expanded?'':c.id,true);}}>
   <h2><button className="commentHeading" aria-expanded={expanded} onClick={()=>actions.select(expanded?'':c.id,true)}>{commentNumbers[c.suggestionIndex]} {suggestion.title}</button></h2>
   <small>{c.status==='resolved'?'已解决 · ':c.status==='ignored'?'已忽略 · ':''}{suggestion.anchor?(missing.has(c.id)?'失去锚点':stale?'较早版本的元素批注':'元素批注'):'全局建议'}</small>
   {expanded&&<Detail batch={batch} id={c.id} stale={stale||missing.has(c.id)} saving={saving} actions={actions}/>}
  </article>;
 })}
 </div>;}

interface Marker {id:string;index:number;x:number;y:number;left:number;top:number;width:number;height:number;status:CommentStatus}
/** Official element bounds + viewport conversion. The layer never adds scene elements. */
export function CommentOverlay({api,batch,selected,hovered,stale,saving,shown,disabled,actions,onMissing}:{api:ExcalidrawImperativeAPI|null;batch:CommentView;selected:string|null;hovered:string|null;stale:boolean;saving:boolean;shown:boolean;disabled:boolean;actions:CommentActions;onMissing:(ids:Set<string>)=>void}) {
 const root=useRef<HTMLDivElement>(null);
 const box=useRef(''),invalidate=useRef<(()=>void)|null>(null);
 const refreshOffsets=()=>{
  if(!api||!root.current)return false;
  const rect=root.current.getBoundingClientRect(),key=[rect.left,rect.top,rect.width,rect.height].join(':');
  if(key===box.current)return false;
  box.current=key;api.refresh();return true;
 };
 // Parent notices/cards can move the editor without a window resize.
 useLayoutEffect(()=>{if(refreshOffsets())invalidate.current?.();});
 const [layout,setLayout]=useState<{markers:Marker[];width:number;height:number}>({markers:[],width:0,height:0});
 useEffect(()=>{
  if(!api||!root.current)return;
  let frame=0;let closed=false;
  const measure=()=>{
   frame=0;if(closed||!root.current)return;
   if(refreshOffsets()){schedule();return;}
   const rect=root.current.getBoundingClientRect(),elements=api.getSceneElements(),map=new Map(elements.map(e=>[e.id,e])),state=api.getAppState();
   const markers:Marker[]=[],missing=new Set<string>(),stacked=new Map<string,number>();
   for(const comment of batch.comments){
    const anchor=batch.advice.suggestions[comment.suggestionIndex]?.anchor;
    if(!anchor)continue;
    const element=anchorTarget(anchor,elements);
    if(!element){missing.add(comment.id);continue;}
    if(comment.status==='ignored')continue;
    const [left,top,right,bottom]=getCommonBounds([element],map);
    const start=sceneCoordsToViewportCoords({sceneX:left,sceneY:top},state),end=sceneCoordsToViewportCoords({sceneX:right,sceneY:bottom},state);
    const position=sceneCoordsToViewportCoords({sceneX:right,sceneY:top},state);
    const ordinal=stacked.get(element.id)??0;stacked.set(element.id,ordinal+1);
    markers.push({id:comment.id,index:comment.suggestionIndex,x:position.x-rect.left-ordinal*30,y:position.y-rect.top,left:start.x-rect.left,top:start.y-rect.top,width:end.x-start.x,height:end.y-start.y,status:comment.status});
   }
   setLayout(previous=>previous.width===rect.width&&previous.height===rect.height&&previous.markers.length===markers.length&&markers.every((m,i)=>{const old=previous.markers[i];return old&&Object.keys(m).every(key=>m[key as keyof Marker]===old[key as keyof Marker]);})?previous:{markers,width:rect.width,height:rect.height});onMissing(missing);
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  invalidate.current=schedule;
  const offChange=api.onChange(schedule),offScroll=api.onScrollChange(schedule);
  const observer=new ResizeObserver(schedule);observer.observe(root.current);
  // Changes to the advice area also move the canvas without resizing the window.
  window.addEventListener('resize',schedule);schedule();
  return()=>{closed=true;invalidate.current=null;cancelAnimationFrame(frame);offChange();offScroll();observer.disconnect();window.removeEventListener('resize',schedule);};
 },[api,batch,onMissing]);
 const current=layout.markers.find(m=>m.id===selected),selectedComment=batch.comments.find(c=>c.id===selected);
 const emphasis=layout.markers.find(m=>m.id===(hovered??selected));
 const visible=(m:Marker)=>m.x>=0&&m.y>=0&&m.x<=layout.width&&m.y<=layout.height;
 return <div className="commentOverlay" ref={root} data-stale={stale} style={{visibility:disabled?'hidden':'visible'}} onKeyDown={e=>e.stopPropagation()}>
  {emphasis&&<div className="commentHighlight" aria-hidden="true" data-comment-id={emphasis.id} style={{left:emphasis.left-5,top:emphasis.top-5,width:Math.max(1,emphasis.width)+10,height:Math.max(1,emphasis.height)+10}}/>}
  {shown&&layout.markers.filter(visible).map(m=><button key={m.id} className={`commentMarker ${m.status} ${selected===m.id?'active':''}`} style={{left:m.x,top:m.y}} data-comment-id={m.id} aria-label={`批注${commentNumbers[m.index]}`} aria-expanded={selected===m.id} title={stale?'基于较早草图':batch.advice.suggestions[m.index]?.title} onPointerDown={e=>e.stopPropagation()} onClick={()=>actions.select(selected===m.id?'':m.id,false)}>{commentNumbers[m.index]}</button>)}
  {shown&&selectedComment&&selectedComment.status!=='ignored'&&current&&visible(current)&&<aside className="commentPopover" role="dialog" aria-label={`批注详情${commentNumbers[current.index]}`} style={{left:Math.max(8,Math.min(current.x+16,layout.width-292)),top:Math.max(8,Math.min(current.y+16,layout.height-210))}} onPointerDown={e=>e.stopPropagation()}>
   <div><strong>{commentNumbers[current.index]} {batch.advice.suggestions[current.index]!.title}</strong><button aria-label="收起批注" onClick={()=>actions.select('',false)}>×</button></div>
   {stale&&<small>批注基于较早草图，定位仅供参考。</small>}
   <Detail batch={batch} id={selectedComment.id} stale={stale} saving={saving} actions={actions}/>
  </aside>}
 </div>;
}
