import {useState,useSyncExternalStore} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {ConversationSlotProps} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {PropsRenderSlots,PropsRuntime} from '@deepseek-ai/dsh-client-ui-slots';
import {HEADER} from './header-adapter.tsx';
import {panelStore} from './panel-store.ts';
import {SketchFrame} from './SketchFrame.tsx';
import {ConversationWidthControls} from './ConversationWidthControls.tsx';
import original from './ConversationRoot.module.css';
import css from './SketchShell.module.css';
export function SketchButton(props:PropsRuntime<'conversation.input.right'>) {
 const open=useSyncExternalStore(panelStore.subscribe,()=>panelStore.isOpen(props.sessionId));
 return <button type="button" className={css.button} aria-label="打开手绘参考板" aria-pressed={open} onClick={()=>panelStore.set(props.sessionId,!open)}>✎ 参考板</button>;
}
export function SketchShell({ctx,props}:{ctx:Context;props:Omit<ConversationSlotProps,'renderSlot'|'__renders'>&PropsRenderSlots<'sketch-reference.header'>}) {
 const open=useSyncExternalStore(panelStore.subscribe,()=>!!props.sessionId && panelStore.isOpen(props.sessionId));
 const [ratio,setRatio]=useState(45);
 const session=props.useSession(s=>s),conversation=props.useConversation(s=>s);
 const summaryBlank=props.useSessions(s=>props.sessionId===undefined?undefined:s.byId[props.sessionId]?.blank);
 // Adapted phase logic from the pinned official ConversationMainPanel (MIT).
 const active=!!session && !!conversation && (conversation.activeTargets.size>0 || (!session.blank&&!session.awaitingFirstTurn) || session.running);
 const blank=!active && !session?.promptAttempted;
 const pending=session?.subagent?.address.mode==='continuable' && session.subagent.parentAvailable===undefined;
 const settling=props.sessionId!==undefined && ((blank && session?.openState==='loading' && summaryBlank!==true) || pending);
 const hero=props.sessionId===undefined || (blank && (session?.openState==='open' || summaryBlank===true));
 const phase=settling?'settling':hero?'hero':'active';
 return <div className={css.shell} data-sketch-open={open}>
  <div className={`${original.root} ${css.chat}`} data-phase={phase} style={open?{flexBasis:`${ratio}%`}:undefined}>
   {props.renderSlot(HEADER,{})}
   {props.renderFactorySlot('conversation.content',{variant:'main',phase,hero},{slots:{widthControls:ConversationWidthControls}})}
  </div>
  {open && <><div className={css.divider} role="separator" aria-label="调整聊天和画板宽度" aria-orientation="vertical" tabIndex={0}
   onKeyDown={e=>{if(e.key==='ArrowLeft')setRatio(v=>Math.max(30,v-2));if(e.key==='ArrowRight')setRatio(v=>Math.min(60,v+2));}}
   onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMove={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){const r=e.currentTarget.parentElement!.getBoundingClientRect();setRatio(Math.max(30,Math.min(60,(e.clientX-r.left)/r.width*100)));}}}
   onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} />
   <aside className={css.panel}><SketchFrame key={props.sessionId} ctx={ctx} props={props} onClose={()=>{if(props.sessionId)panelStore.set(props.sessionId,false);}} /></aside></>}
 </div>;
}
