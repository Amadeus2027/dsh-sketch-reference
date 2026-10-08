import {EventEmitter} from 'node:events';
import type {ServerResponse} from 'node:http';
import {it,expect} from 'vitest';
import {AgentEvents} from '../src/host/agent-events.ts';
import {AGENT_LIMITS} from '../src/core/agent.ts';
const owner={sessionId:'s',createdAt:'1',cwd:'/workspace'};
function response(){const e=new EventEmitter();const writes:string[]=[];let ended=false,accept=true;return {writes,setAccept:(v:boolean)=>{accept=v;},ended:()=>ended,handle:Object.assign(e,{writeHead:()=>{},write:(s:string)=>{writes.push(s);return accept;},end:()=>{ended=true;e.emit('close');}}) as unknown as ServerResponse};}
it('pushes invalidations only to matching lifecycle, and releases disconnected/unloaded clients',()=>{
 const events=new AgentEvents(),a=response(),b=response();events.connect(owner,a.handle);events.connect({...owner,createdAt:'2'},b.handle);events.changed(owner);expect(a.writes).toHaveLength(2);expect(b.writes).toHaveLength(1);expect(a.writes.join('')).toBe('data: changed\n\ndata: changed\n\n');
 a.handle.emit('close');expect(events.size).toBe(1);events.close();expect(events.size).toBe(0);expect(b.ended()).toBe(true);
});
it('bounds event clients and closes a slow client instead of buffering',()=>{
 const events=new AgentEvents();for(let i=0;i<AGENT_LIMITS.maxEventClients;i++)events.connect(owner,response().handle);expect(()=>events.connect(owner,response().handle)).toThrow('连接较多');events.close();const slow=response();events.connect(owner,slow.handle);slow.setAccept(false);events.changed(owner);expect(slow.ended()).toBe(true);expect(events.size).toBe(0);
});
