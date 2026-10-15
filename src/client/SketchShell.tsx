import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Button} from '@deepseek-ai/dsh-client-ui-primitives';
import type {Context} from '@deepseek-ai/cordis';
import type {ConversationSlotProps} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {PropsRenderSlots,PropsRuntime,SnapshotSelectorHook} from '@deepseek-ai/dsh-client-ui-slots';
import type {Appearance} from '../core/appearance.ts';
import {HEADER} from './header-adapter.tsx';
import {SketchFrame} from './SketchFrame.tsx';
import {ConversationWidthControls} from './ConversationWidthControls.tsx';
import original from './ConversationRoot.module.css';
import css from './SketchShell.module.css';
import {clipHostViewport} from './host-viewport.ts';
interface PanelProps {
 useSketchPanel:SnapshotSelectorHook<Readonly<Record<string,boolean>>>;
 setPanel:(id:string,value:boolean)=>void;requestPanelClose:(id:string)=>void;
 subscribePanelClose:(listener:(id:string)=>void)=>()=>void;prunePanels:(ids:readonly string[])=>void;
}
export function SketchButton(props:PropsRuntime<'conversation.input.right'>&PanelProps) {
 const open=props.useSketchPanel(s=>!!s[props.sessionId]);
 return <Button type="button" size="sm" variant="toolbar" className={css.button} aria-label="打开手绘参考板" aria-pressed={open} title={open?'保存并返回聊天':'绘制参考草图'} onClick={()=>open?props.requestPanelClose(props.sessionId):props.setPanel(props.sessionId,true)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m14 4 6 6M4 20l4-1 13-13-3-3L5 16z"/></svg><span>参考板</span></Button>;
}
export function SketchShell({ctx,props}:{ctx:Context;props:Omit<ConversationSlotProps,'renderSlot'|'__renders'>&PropsRenderSlots<'sketch-reference.header'>&PanelProps&{useHostAppearance:SnapshotSelectorHook<Appearance>}}) {
 const open=props.useSketchPanel(s=>!!props.sessionId&&!!s[props.sessionId]);
 const shell=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{if(open&&shell.current)return clipHostViewport(shell.current);},[open]);
 const appearance=props.useHostAppearance(s=>s);
 const sessions=props.useSessions(s=>({ids:s.ids,phase:s.phase}),(a,b)=>a.ids===b.ids&&a.phase===b.phase);
 useEffect(()=>{if(sessions.phase==='ready')props.prunePanels(sessions.ids);},[sessions,props.prunePanels]);
 const [ratio,setRatio]=useState(40);
 const [fullscreen,setFullscreen]=useState(false),[collapsed,setCollapsed]=useState(false),[floating,setFloating]=useState({x:24,y:100});
 const chat=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
 useEffect(()=>{setFullscreen(false);setCollapsed(false);},[open,props.sessionId]);
 const clamp=(x:number,y:number)=>({x:Math.max(8,Math.min(x,window.innerWidth-(chat.current?.offsetWidth??420)-8)),y:Math.max(8,Math.min(y,window.innerHeight-(chat.current?.offsetHeight??500)-8))});
 useEffect(()=>{if(!fullscreen)return;const resize=()=>setFloating(p=>{const next=clamp(p.x,p.y);return next.x===p.x&&next.y===p.y?p:next;});const observer=new ResizeObserver(resize);if(chat.current)observer.observe(chat.current);window.addEventListener('resize',resize);return()=>{observer.disconnect();window.removeEventListener('resize',resize);};},[fullscreen]);
 const toggleFullscreen=()=>{if(!fullscreen)setFloating({x:24,y:Math.max(70,window.innerHeight-570)});setFullscreen(v=>!v);setCollapsed(false);};
 const session=props.useSession(s=>s),conversation=props.useConversation(s=>s);
 const workspace=props.useSessions(s=>props.sessionId===undefined?undefined:s.byId[props.sessionId]?.cwd);
 const summaryBlank=props.useSessions(s=>props.sessionId===undefined?undefined:s.byId[props.sessionId]?.blank);
 // Adapted phase logic from the pinned official ConversationMainPanel (MIT).
 const active=!!session && !!conversation && (conversation.activeTargets.size>0 || (!session.blank&&!session.awaitingFirstTurn) || session.running);
 const blank=!active && !session?.promptAttempted;
 const pending=session?.subagent?.address.mode==='continuable' && session.subagent.parentAvailable===undefined;
 const settling=props.sessionId!==undefined && ((blank && session?.openState==='loading' && summaryBlank!==true) || pending);
 const hero=props.sessionId===undefined || (blank && (session?.openState==='open' || summaryBlank===true));
 const phase=settling?'settling':hero?'hero':'active';
 return <div ref={shell} className={css.shell} data-sketch-open={open} data-sketch-fullscreen={open&&fullscreen}>
  <div ref={chat} className={`${original.root} ${css.chat}`} data-phase={phase} data-collapsed={collapsed} style={open&&fullscreen?{left:floating.x,top:floating.y}:open?{flexBasis:`${ratio}%`}:undefined}>
   <div className={css.floatingHeader} hidden={!open||!fullscreen}>
    <div className={css.floatingDrag} role="toolbar" aria-label="移动悬浮对话" tabIndex={0}
     onKeyDown={e=>{if(e.target!==e.currentTarget)return;const delta={ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,-16],ArrowDown:[0,16]}[e.key];if(delta){e.preventDefault();setFloating(p=>clamp(p.x+delta[0]!,p.y+delta[1]!));}}}
     onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY,left:floating.x,top:floating.y};e.currentTarget.setPointerCapture(e.pointerId);}}
     onPointerMove={e=>{const start=drag.current;if(start&&e.currentTarget.hasPointerCapture(e.pointerId))setFloating(clamp(start.left+e.clientX-start.x,start.top+e.clientY-start.y));}}
     onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
     onPointerCancel={()=>{drag.current=null;}}>原生对话</div>
    <Button size="sm" variant="toolbar" aria-label={collapsed?'展开悬浮对话':'收起悬浮对话'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?'展开':'收起'}</Button>
   </div>
   {props.renderSlot(HEADER,{})}
   {props.renderFactorySlot('conversation.content',{variant:'main',phase,hero},{slots:{widthControls:ConversationWidthControls}})}
  </div>
  {open&&!session?.removed && <><div className={css.divider} role="separator" aria-label="调整聊天和画板宽度" aria-orientation="vertical" aria-valuemin={30} aria-valuemax={60} aria-valuenow={ratio} tabIndex={0}
   onKeyDown={e=>{if(e.key==='ArrowLeft')setRatio(v=>Math.max(30,v-2));if(e.key==='ArrowRight')setRatio(v=>Math.min(60,v+2));}}
   onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const r=e.currentTarget.parentElement!.getBoundingClientRect();setRatio(Math.max(30,Math.min(60,(e.clientX-r.left)/r.width*100)));}}}
   onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} />
   <aside className={css.panel}><Button size="sm" variant="toolbar" className={css.fullscreenToggle} aria-label={fullscreen?'退出画板全屏':'画板全屏'} title={fullscreen?'恢复右侧画板':'全屏画板与悬浮对话'} onClick={toggleFullscreen}>{fullscreen?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 10h6V4m10 10h-6v6M10 10 3 3m11 11 7 7"/></svg>:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 3H3v6m12 12h6v-6M3 3l7 7m11 11-7-7"/></svg>}</Button><SketchFrame key={`${props.sessionId}:${workspace??''}`} ctx={ctx} props={props} appearance={appearance} subscribeClose={props.subscribePanelClose} onClose={()=>{if(props.sessionId)props.setPanel(props.sessionId,false);}} /></aside></>}
 </div>;
}
