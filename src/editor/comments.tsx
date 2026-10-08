import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {getCommonBounds,sceneCoordsToViewportCoords} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/types';
import {anchorTarget,type CommentBatch} from '../core/comments.ts';
import type {CommentStatus} from '../core/contracts.ts';

export const commentNumbers=['①','②','③'];
export interface CommentActions {
 select:(id:string,locate:boolean)=>void;
 change:(id:string,status:CommentStatus)=>void;
 use:(index:number)=>void;
 prompt:(index:number)=>void;
}
interface Props {batch:CommentBatch;selected:string|null;stale:boolean;saving:boolean;showIgnored:boolean;actions:CommentActions;missing:Set<string>}
function Detail({batch,id,stale,saving,actions}:{batch:CommentBatch;id:string;stale:boolean;saving:boolean;actions:CommentActions}) {
 const comment=batch.comments.find(c=>c.id===id)!;
 const suggestion=batch.advice.suggestions[comment.suggestionIndex]!;
 return <div className="commentDetail"><p>{suggestion.reason}</p><div className="commentActions">
  <button disabled={stale||saving||comment.status==='ignored'} onClick={()=>actions.use(comment.suggestionIndex)}>使用建议</button>
  <button onClick={()=>actions.prompt(comment.suggestionIndex)}>查看指令</button>
  <button disabled={saving} onClick={()=>actions.change(id,comment.status==='open'?'resolved':'open')}>{comment.status==='open'?'标记已解决':'重新打开'}</button>
  {comment.status!=='ignored'&&<button disabled={saving} onClick={()=>actions.change(id,'ignored')}>忽略批注</button>}
 </div></div>;
}
export function CommentList({batch,selected,stale,saving,showIgnored,actions,missing}:Props){return <div className="cards" data-stale={stale}>
 {batch.comments.filter(c=>showIgnored||c.status!=='ignored').map(c=>{
  const suggestion=batch.advice.suggestions[c.suggestionIndex]!,expanded=selected===c.id;
  return <article key={c.id} className={`commentCard ${c.status} ${expanded?'active':''}`} data-comment-id={c.id}>
   <h2><button className="commentHeading" aria-expanded={expanded} onClick={()=>actions.select(expanded?'':c.id,true)}>{commentNumbers[c.suggestionIndex]} {suggestion.title}</button></h2>
   <small>{c.status==='resolved'?'已解决 · ':c.status==='ignored'?'已忽略 · ':''}{suggestion.anchor?(missing.has(c.id)?'失去锚点':stale?'较早版本的元素批注':'元素批注'):'全局建议'}</small>
   {expanded&&<Detail batch={batch} id={c.id} stale={stale} saving={saving} actions={actions}/>}
  </article>;
 })}
 </div>;}

interface Marker {id:string;index:number;x:number;y:number;status:CommentStatus}
/** Official element bounds + viewport conversion. The layer never adds scene elements. */
export function CommentOverlay({api,batch,selected,stale,saving,shown,actions,onMissing}:{api:ExcalidrawImperativeAPI|null;batch:CommentBatch;selected:string|null;stale:boolean;saving:boolean;shown:boolean;actions:CommentActions;onMissing:(ids:Set<string>)=>void}) {
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
   const markers:Marker[]=[],missing=new Set<string>();
   for(const comment of batch.comments){
    const anchor=batch.advice.suggestions[comment.suggestionIndex]?.anchor;
    if(!anchor)continue;
    const element=anchorTarget(anchor,elements);
    if(!element){missing.add(comment.id);continue;}
    if(comment.status==='ignored')continue;
    const [,top,right]=getCommonBounds([element],map);
    const position=sceneCoordsToViewportCoords({sceneX:right,sceneY:top},state);
    markers.push({id:comment.id,index:comment.suggestionIndex,x:position.x-rect.left,y:position.y-rect.top,status:comment.status});
   }
   setLayout(previous=>previous.width===rect.width&&previous.height===rect.height&&previous.markers.length===markers.length&&markers.every((m,i)=>{const old=previous.markers[i];return old?.id===m.id&&old.x===m.x&&old.y===m.y&&old.status===m.status&&old.index===m.index;})?previous:{markers,width:rect.width,height:rect.height});onMissing(missing);
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
 const visible=(m:Marker)=>m.x>=0&&m.y>=0&&m.x<=layout.width&&m.y<=layout.height;
 return <div className="commentOverlay" ref={root} data-stale={stale} style={{visibility:shown?'visible':'hidden'}} onKeyDown={e=>e.stopPropagation()}>
  {layout.markers.filter(visible).map(m=><button key={m.id} className={`commentMarker ${m.status} ${selected===m.id?'active':''}`} style={{left:m.x,top:m.y}} data-comment-id={m.id} aria-label={`批注${commentNumbers[m.index]}`} aria-expanded={selected===m.id} title={stale?'基于较早草图':batch.advice.suggestions[m.index]?.title} onPointerDown={e=>e.stopPropagation()} onClick={()=>actions.select(selected===m.id?'':m.id,false)}>{commentNumbers[m.index]}</button>)}
  {selectedComment&&selectedComment.status!=='ignored'&&current&&visible(current)&&<aside className="commentPopover" role="dialog" aria-label={`批注详情${commentNumbers[current.index]}`} style={{left:Math.max(8,Math.min(current.x+16,layout.width-292)),top:Math.max(8,Math.min(current.y+16,layout.height-210))}} onPointerDown={e=>e.stopPropagation()}>
   <div><strong>{commentNumbers[current.index]} {batch.advice.suggestions[current.index]!.title}</strong><button aria-label="收起批注" onClick={()=>actions.select('',false)}>×</button></div>
   {stale&&<small>基于较早草图，请重新分析后使用指令。</small>}
   <Detail batch={batch} id={selectedComment.id} stale={stale} saving={saving} actions={actions}/>
  </aside>}
 </div>;
}
