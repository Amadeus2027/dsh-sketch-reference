import {createElement,type ComponentType} from 'react';
import type {Context} from '@deepseek-ai/cordis';
import type {StoredEntry} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
export const HEADER='sketch-reference.header';
const alias=(key:string)=>'sketch-reference.'+key;
interface Registry {entries(key:string):readonly StoredEntry[];register(options:object,component:unknown):()=>void;subscribe(key:string,listener:()=>void):()=>void}
type Runtime=Record<string,unknown>&{renderSlot:(key:string,owner:object,options?:unknown)=>unknown;renderSlotChain:(key:string,owner:object,options?:unknown)=>unknown};
/** Fixed-version adapter: mirror the official header beneath private slot names.
 * The official declarations remain live; this adapter never mutates the host tree.
 * All hooks, business faces and store seats retain their official registrations.
 */
export function mirrorHeader(ctx:Context) {
 const registry=ctx.slots as unknown as Registry;
 const mirror=(source:string,target:string):(()=>void)=>{
  const mounted=new Map<StoredEntry,()=>void>();
  const reconcile=()=>{
   const entries=registry.entries(source);
   for(const [entry,dispose] of mounted)if(!entries.includes(entry)){dispose();mounted.delete(entry);}
   for(const entry of entries) {
   if(mounted.has(entry))continue;
   const children=entry.children?Object.fromEntries(Object.entries(entry.children).map(([key,spec])=>[alias(key),spec])):undefined;
   const options={name:target,...entry.options,...(children?{children}:{}),...(entry.inject?{inject:entry.inject}:{}),...(entry.store?{store:entry.store}:{}),...(entry.locale?{locale:entry.locale}:{}),...(entry.select?{select:entry.select}:{})};
   const dispose=registry.register(options,(props:Runtime)=>createElement(entry.component as ComponentType<Runtime>,{...props,
    renderSlot:(key,owner,opts)=>props.renderSlot(alias(key),owner,opts),renderSlotChain:(key,owner,opts)=>props.renderSlotChain(alias(key),owner,opts),
   }));
   const childCleanups=Object.keys(entry.children??{}).map(key=>mirror(key,alias(key)));
   mounted.set(entry,()=>{for(const cleanup of childCleanups)cleanup();dispose();});
   }
  }
  const unsubscribe=registry.subscribe(source,reconcile);reconcile();
  return()=>{unsubscribe();for(const dispose of mounted.values())dispose();mounted.clear();};
 };
 ctx.effect(()=>mirror('conversation.header',HEADER));
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
 interface SlotMap {'sketch-reference.header':{kind:'single';scope:'session-maybe';owner:Record<never,never>}}
}
