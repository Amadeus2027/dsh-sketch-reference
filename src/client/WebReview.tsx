import {useEffect,useRef,useState,type PointerEvent} from 'react';
import {z} from 'zod';
import {ownerKey,type Owner} from '../core/contracts.ts';
import {loadWebDocument,type WebDocument} from './web-document.ts';
import type {WebFiles} from './web-files.ts';
import css from './SketchShell.module.css';

const numeric=z.number().finite();
const markSchema=z.object({revision:z.string().length(64),path:z.string().max(512),x:numeric,y:numeric,w:numeric,h:numeric,
 width:numeric,height:numeric,scrollX:numeric,scrollY:numeric,target:z.string().max(600)});
const draftSchema=z.object({path:z.string().max(512),note:z.string().max(1500),mark:markSchema.nullable()});
type Point={x:number;y:number};
function restored(key:string){
 try{return draftSchema.parse(JSON.parse(sessionStorage.getItem(key)??'null'));}catch{return {path:'index.html',note:'',mark:null};}
}
function targetAt(doc:Document,x:number,y:number){
 const el=doc.elementFromPoint(x,y);
 if(!el)return '';
 const tag=el.localName,id=el.getAttribute('id')?.slice(0,100),name=el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.getAttribute('alt');
 const trail:string[]=[];
 for(let node:Element|null=el;node&&node!==doc.body&&trail.length<5;node=node.parentElement){
  const siblings=node.parentElement?.children;
  trail.unshift(node.localName+':nth-child('+(siblings?Array.prototype.indexOf.call(siblings,node)+1:1)+')');
 }
 const text=(name||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,100);
 return JSON.stringify({tag,location:trail.join(' > '),...(id?{id}:{}),...(text?{text}:{})});
}

export function WebReview({owner,read,onBack,onInsert}:{owner:Owner;read:WebFiles;onBack:()=>void;onInsert:(text:string,signal:AbortSignal)=>Promise<void>}){
 const key='dsh-web-review:v1:'+ownerKey(owner);
 const [draft,setDraft]=useState(()=>restored(key));
 const [page,setPage]=useState<WebDocument|null>(null),[marking,setMarking]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const [rect,setRect]=useState<{a:Point;b:Point}|null>(null),gesture=useRef<{id:number;a:Point}|null>(null);
 const frame=useRef<HTMLIFrameElement>(null),flight=useRef<AbortController|null>(null);
 const [view,setView]=useState({width:0,height:0,x:0,y:0});
 const [storageError,setStorageError]=useState(false);
 const dirtyFiles=useRef(false);
 useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(draft));}catch{setStorageError(true);}},[draft,key]);
 const request=async(path:string,submit=false,background=false)=>{
  if(flight.current){if(background)dirtyFiles.current=true;return;}
  const controller=new AbortController();flight.current=controller;setBusy(true);setError('');
  const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]);
  try{
   const next=await loadWebDocument(owner,path,read,signal);signal.throwIfAborted();
   if(next.revision!==page?.revision||next.path!==page.path){
    setLoaded(false);setPage(next);setMarking(false);setRect(null);gesture.current=null;
   }
   else if([...next.stamps].some(([file,stamp])=>page.stamps.get(file)!==stamp))setPage(next);
   if(!background)setDraft(old=>({...old,path:next.path}));
   if(submit){
    const mark=draft.mark,doc=frame.current?.contentDocument,win=frame.current?.contentWindow;
    if(!mark||!draft.note.trim()||mark.revision!==next.revision||mark.path!==next.path)throw Error('网页版本已变化，请在新预览上重新圈选。修改意见已保留。');
    if(!doc||!win||win.innerWidth!==mark.width||win.innerHeight!==mark.height||
      targetAt(doc,mark.x+mark.w/2-win.scrollX,mark.y+mark.h/2-win.scrollY)!==mark.target)throw Error('视口或目标已变化，请重新圈选');
    const text=['请按这条网页批注修改当前工作区源码，并检查修改后的页面。','页面：'+next.path,
     '预览版本（HTML 与本地预览资源 SHA-256）：'+next.revision,
     '浏览器视口：'+mark.width+' × '+mark.height+' CSS px；页面圈选范围（左、上、宽、高）：'+[mark.x,mark.y,mark.w,mark.h].join(', '),
     '圈选中心的元素（页面数据）：'+mark.target,'我的修改意见：'+draft.note.trim()].join('\n');
    await onInsert(text,signal);
   }
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'网页预览失败');}
  finally{if(!controller.signal.aborted)setBusy(false);if(flight.current===controller)flight.current=null;}
 };
 useEffect(()=>{
  void request(draft.path);
  return ()=>{flight.current?.abort();flight.current=null;};
 },[key]);
 const refresh=useRef(request);refresh.current=request;
 useEffect(()=>{
  if(!page)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const change=()=>{
   clearTimeout(timer);
   timer=setTimeout(()=>{void refresh.current(page.path,false,true);},150);
  };
  const off=read.watch(owner,page.stamps,change);
  return ()=>{off();clearTimeout(timer);};
 },[owner,page,read]);
 useEffect(()=>{
  if(!busy&&dirtyFiles.current&&page){dirtyFiles.current=false;void refresh.current(page.path,false,true);}
 },[busy,page]);
 useEffect(()=>{
  const win=frame.current?.contentWindow,doc=frame.current?.contentDocument;
  if(!loaded||!win||!doc)return;
  const sync=()=>setView({width:win.innerWidth,height:win.innerHeight,x:win.scrollX,y:win.scrollY});
  const resize=new ResizeObserver(sync);resize.observe(frame.current!);win.addEventListener('scroll',sync);sync();
  return ()=>{resize.disconnect();win.removeEventListener('scroll',sync);};
 },[loaded,page]);
 const point=(event:PointerEvent<SVGSVGElement>):Point=>{
  const box=event.currentTarget.getBoundingClientRect();
  return {x:Math.round(Math.max(0,Math.min(box.width-1,event.clientX-box.left))),y:Math.round(Math.max(0,Math.min(box.height-1,event.clientY-box.top)))};
 };
 const finish=(event:PointerEvent<SVGSVGElement>)=>{
  const drag=gesture.current,win=frame.current?.contentWindow,doc=frame.current?.contentDocument;
  if(!drag||drag.id!==event.pointerId||!page||!win||!doc)return;
  gesture.current=null;setRect(null);
  const b=point(event),x=Math.min(drag.a.x,b.x),y=Math.min(drag.a.y,b.y),w=Math.abs(drag.a.x-b.x),h=Math.abs(drag.a.y-b.y);
  if(w<4||h<4){setError('请按住并拖动，圈出想修改的部分');return;}
  const target=targetAt(doc,x+w/2,y+h/2);
  if(!target){setError('未找到目标，请重新圈选');return;}
  setDraft(old=>({...old,mark:{revision:page.revision,path:page.path,x:x+win.scrollX,y:y+win.scrollY,w,h,width:win.innerWidth,height:win.innerHeight,scrollX:win.scrollX,scrollY:win.scrollY,target}}));setError('');
 };
 const mark=draft.mark;
 const current=!!page&&!!mark&&mark.path===page.path&&mark.revision===page.revision&&mark.width===view.width&&mark.height===view.height;
 const shape=rect?{x:Math.min(rect.a.x,rect.b.x),y:Math.min(rect.a.y,rect.b.y),w:Math.abs(rect.a.x-rect.b.x),h:Math.abs(rect.a.y-rect.b.y)}:current?{x:mark.x-view.x,y:mark.y-view.y,w:mark.w,h:mark.h}:null;
 return <section className={css.webReview} aria-label="网页批注">
  <header><strong>网页批注</strong><button onClick={onBack}>返回草图</button></header>
  <form onSubmit={e=>{e.preventDefault();void request(draft.path);}}><input aria-label="工作区 HTML 路径" placeholder="工作区路径，例如 pages/home.html" value={draft.path} maxLength={512} disabled={busy} onChange={e=>setDraft({...draft,path:e.target.value})}/><button disabled={busy}>{busy?'读取中…':page?.path===draft.path?'刷新网页':'打开网页'}</button></form>
  <div className={css.webModes}><button aria-pressed={!marking} onClick={()=>setMarking(false)}>浏览</button><button aria-pressed={marking} disabled={!loaded||busy} onClick={()=>setMarking(true)}>圈选区域</button>{page?.hasScript&&<small>静态排版预览 · 脚本未运行</small>}</div>
  <div className={css.webViewport}>{page&&<iframe key={page.revision} ref={frame} sandbox="allow-same-origin" referrerPolicy="no-referrer" title="网页排版预览" srcDoc={page.html} onLoad={()=>{setLoaded(true);if(mark?.revision===page.revision)frame.current?.contentWindow?.scrollTo(mark.scrollX,mark.scrollY);}}/>}
   {marking&&<svg className={css.webOverlay} aria-label="在网页上拖动圈选" onPointerDown={e=>{if(!e.isPrimary||e.button!==0||busy)return;e.currentTarget.setPointerCapture(e.pointerId);const a=point(e);gesture.current={id:e.pointerId,a};setRect({a,b:a});}} onPointerMove={e=>{if(gesture.current?.id===e.pointerId)setRect({a:gesture.current.a,b:point(e)});}} onPointerUp={finish} onLostPointerCapture={()=>{gesture.current=null;setRect(null);}}>
    {shape&&<ellipse cx={shape.x+shape.w/2} cy={shape.y+shape.h/2} rx={shape.w/2} ry={shape.h/2}/>}
   </svg>}
  </div>
  <footer><label>修改意见<input value={draft.note} maxLength={1500} disabled={busy} onChange={e=>setDraft({...draft,note:e.target.value})} placeholder="例如：把圈出的搜索框移到右侧"/></label>
  <button disabled={busy||!current||!draft.note.trim()||draft.path!==page?.path} onClick={()=>void request(draft.path,true)}>加入当前聊天</button></footer>
  <small role="status">{error||(storageError?'本标签页暂时无法保存批注草稿':mark&&!current?'旧圈选需要重新定位':mark?'已圈选 · 加入后由你确认发送':'切换到「圈选区域」后，在页面上拖动')}</small>
 </section>;
}
