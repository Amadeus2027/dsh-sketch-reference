import {AGENT_EVENTS} from '../core/agent.ts';
import type {Owner} from '../core/contracts.ts';

/** Event-only transport. Retired connections cannot mutate a new board. */
export function subscribeAgentComments(owner:Owner,changed:()=>void,failed:()=>void){
 const stream=new EventSource(`${AGENT_EVENTS}?${new URLSearchParams(owner)}`);
 let active=true;
 const fail=()=>{if(!active)return;active=false;stream.close();failed();};
 stream.onmessage=event=>{if(active&&event.data==='changed')changed();};
 stream.addEventListener('disconnected',fail);
 stream.onerror=fail;
 return()=>{active=false;stream.close();};
}
