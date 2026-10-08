import {expect,it,vi} from 'vitest';

it('uses event-driven handshakes, rejects pending work on reconnect and releases timers',async()=>{
 vi.useFakeTimers();const listeners=new Set<(event:unknown)=>void>(),parent={postMessage:vi.fn()},window={parent,addEventListener:(_type:string,fn:(event:unknown)=>void)=>listeners.add(fn),removeEventListener:(_type:string,fn:(event:unknown)=>void)=>listeners.delete(fn)};
 vi.stubGlobal('window',window);vi.stubGlobal('location',{search:'?nonce=n&sessionId=s',origin:'http://localhost'});
 const messagePort=()=>({close:vi.fn(),start:vi.fn(),postMessage:vi.fn(),onmessage:null as null|((event:{data:unknown})=>void)});
 const first=messagePort(),second=messagePort(),close=vi.fn();let dispose:(()=>void)|undefined;
 try{
  const bridge=await import('../src/editor/bridge.ts');dispose=bridge.startBridge(close);expect(parent.postMessage).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);
  const receive=(data:unknown,ports:unknown[]=[],source:unknown=parent)=>{for(const fn of listeners)fn({source,origin:'http://localhost',data,ports});};
  receive({type:'SKETCH_INIT',nonce:'wrong',sessionId:'s'},[first]);expect(first.start).not.toHaveBeenCalled();
  receive({type:'SKETCH_INIT',nonce:'n',sessionId:'s'},[first]);const pending=bridge.closeBoard(),rejected=expect(pending).rejects.toThrow('连接已重建');expect(vi.getTimerCount()).toBe(1);
  receive({type:'SKETCH_INIT',nonce:'n',sessionId:'s'},[second]);await rejected;expect(first.close).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  second.onmessage?.({data:{type:'REQUEST_CLOSE'}});expect(close).toHaveBeenCalledTimes(1);
  const finished=bridge.closeBoard(),id=second.postMessage.mock.calls.at(-1)?.[0].id;second.onmessage?.({data:{type:'RESULT',id,ok:true,message:'已关闭'}});expect(await finished).toBe('已关闭');
  dispose();dispose=undefined;expect(second.close).toHaveBeenCalled();expect(listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);
 }finally{dispose?.();vi.unstubAllGlobals();vi.useRealTimers();}
});
