import {it,expect,vi} from 'vitest';
import {subscribeAgentComments} from '../src/editor/agent-stream.ts';
const owner={sessionId:'s',createdAt:'1',cwd:'/test'};
it('delivers explicit disconnect once, ignores retired events and allocates no polling timers',()=>{
 const instances:FakeSource[]=[];
 class FakeSource {onmessage:((v:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;listeners=new Map<string,()=>void>();close=vi.fn();constructor(){instances.push(this);}addEventListener(name:string,fn:()=>void){this.listeners.set(name,fn);}}
 vi.stubGlobal('EventSource',FakeSource);vi.useFakeTimers();
 try{
  const changed=vi.fn(),failed=vi.fn(),dispose=subscribeAgentComments(owner,changed,failed),first=instances[0]!;
  first.onmessage?.({data:'changed'});expect(changed).toHaveBeenCalledTimes(1);first.listeners.get('disconnected')?.();first.onerror?.();expect(failed).toHaveBeenCalledTimes(1);expect(first.close).toHaveBeenCalledTimes(1);
  const next=subscribeAgentComments(owner,changed,failed);dispose();first.onmessage?.({data:'changed'});first.onerror?.();expect(changed).toHaveBeenCalledTimes(1);expect(failed).toHaveBeenCalledTimes(1);
  instances[1]!.onmessage?.({data:'changed'});expect(changed).toHaveBeenCalledTimes(2);next();instances[1]!.onerror?.();expect(failed).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
 }finally{vi.unstubAllGlobals();vi.useRealTimers();}
});
