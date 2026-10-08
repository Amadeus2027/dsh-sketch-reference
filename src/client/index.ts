import {createElement} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import {SketchButton,SketchShell} from './SketchShell.tsx';
import {HEADER,mirrorHeader} from './header-adapter.tsx';
import {createPanelStore} from './panel-store.ts';
import {createHostAppearance} from './appearance.ts';
import {mountStyles as mountShellStyles} from './SketchShell.module.css';
import {mountStyles as mountChatStyles} from './ConversationRoot.module.css';
export const inject=['slots','uiConversation','conversation','modelDirectories'];
export function apply(ctx:Context) {
 const panel=createPanelStore(),appearance=createHostAppearance(ctx);
 const panelFace=()=>({hooks:{sketchPanel:panel},setPanel:panel.set,requestPanelClose:panel.requestClose,subscribePanelClose:panel.onClose,prunePanels:panel.prune});
 try {
 ctx.slots.inject('conversation.input.right',()=>ctx.slots.register({name:'conversation.input.right',id:'sketch-reference',order:30,inject:panelFace},SketchButton));
 ctx.slots.inject('main.conversation',()=>ctx.slots.register({name:'main.conversation',priority:-100,children:{[HEADER]:{kind:'single',scope:'session-maybe'}},inject:()=>({...panelFace(),hooks:{sketchPanel:panel,hostAppearance:appearance}})},props=> createElement(SketchShell,{ctx,props})));
 mirrorHeader(ctx);
 ctx.effect(()=>()=>panel.clear());
 ctx.effect(()=>{const cleanups=[mountShellStyles(),mountChatStyles()];return()=>{for(const cleanup of cleanups)cleanup();};});
 } catch(error) {console.error("sketch-reference registration",error);throw error;}
}
