import {createElement} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import {SketchButton,SketchShell} from './SketchShell.tsx';
import {HEADER,mirrorHeader} from './header-adapter.tsx';
import {panelStore} from './panel-store.ts';
export const inject=['slots','uiConversation','conversation','modelDirectories'];
export function apply(ctx:Context) {
 try {
 ctx.slots.inject('conversation.input.right',()=>ctx.slots.register({name:'conversation.input.right',id:'sketch-reference',order:30},SketchButton));
 ctx.slots.inject('main.conversation',()=>ctx.slots.register({name:'main.conversation',priority:-100,children:{[HEADER]:{kind:'single',scope:'session-maybe'}}},props=> createElement(SketchShell,{ctx,props})));
 mirrorHeader(ctx);
 ctx.effect(()=>()=>panelStore.clear());
 } catch(error) {console.error("sketch-reference registration",error);throw error;}
}
