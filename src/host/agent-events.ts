import type {ServerResponse} from 'node:http';
import {AGENT_LIMITS} from '../core/agent.ts';
import {ownerKey,type Owner,SketchError} from '../core/contracts.ts';

/** Authenticated HTTP SSE invalidations only. No drawings, text, timers or polling. */
export class AgentEvents {
 private clients=new Map<ServerResponse,string>();
 connect(owner:Owner,response:ServerResponse){
  if(this.clients.size>=AGENT_LIMITS.maxEventClients)throw new SketchError('EVENT_CAPACITY','批注连接较多，请手动刷新',429);
  response.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache, no-store','x-content-type-options':'nosniff','x-accel-buffering':'no'});
  response.flushHeaders?.();
  this.clients.set(response,ownerKey(owner));
  response.on('close',()=>this.clients.delete(response));
  response.write('data: changed\n\n');
 }
 changed(owner:Owner){for(const [response,key] of this.clients)if(key===ownerKey(owner)){
  // Slow clients must reconnect/read the latest snapshot rather than buffer events.
  if(!response.write('data: changed\n\n')){this.clients.delete(response);response.end();}
 }}
 close(){for(const response of this.clients.keys()){response.write('event: disconnected\ndata: unavailable\n\n');response.end();}this.clients.clear();}
 get size(){return this.clients.size;}
}
