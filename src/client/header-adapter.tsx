import {createElement,type ComponentType} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {StoredEntry} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
export const HEADER='sketch-reference.header';
const alias=(key:string)=>'sketch-reference.'+key;
interface Registry {entries(key:string):readonly StoredEntry[];register(options:object,component:unknown):()=>void}
type Runtime=Record<string,unknown>&{renderSlot:(key:string,owner:object,options?:unknown)=>unknown;renderSlotChain:(key:string,owner:object,options?:unknown)=>unknown};
/** Fixed-version adapter: mirror the official header beneath private slot names.
 * The official declarations remain live; this adapter never mutates the host tree.
 * All hooks, business faces and store seats retain their official registrations.
 */
export function mirrorHeader(ctx:Context) {
 const registry=ctx.slots as unknown as Registry;
 const mirror=(source:string,target:string)=>{
  for(const entry of registry.entries(source)) {
   const children=entry.children?Object.fromEntries(Object.entries(entry.children).map(([key,spec])=>[alias(key),spec])):undefined;
   const options={name:target,...entry.options,...(children?{children}:{}),...(entry.inject?{inject:entry.inject}:{}),...(entry.store?{store:entry.store}:{}),...(entry.locale?{locale:entry.locale}:{}),...(entry.select?{select:entry.select}:{})};
   registry.register(options,(props:Runtime)=>createElement(entry.component as ComponentType<Runtime>,{...props,
    renderSlot:(key,owner,opts)=>props.renderSlot(alias(key),owner,opts),renderSlotChain:(key,owner,opts)=>props.renderSlotChain(alias(key),owner,opts),
   }));
   for(const key of Object.keys(entry.children??{}))mirror(key,alias(key));
  }
 };
 mirror('conversation.header',HEADER);
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
 interface SlotMap {'sketch-reference.header':{kind:'single';scope:'session-maybe';owner:Record<never,never>}}
}
