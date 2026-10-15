import {expect,it} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import {GraphRepository} from '../src/host/graph-repository.ts';
import {Repository} from '../src/host/repository.ts';
import {SketchService} from '../src/host/service.ts';
import {ownerKey,sessionOwner,type Owner,type Drawing,SketchError} from '../src/core/contracts.ts';
import {graphContentSchema,initialGraph,documentOwner,anchorStatus,detailPath,type SketchGraph,type GraphContent} from '../src/core/graph.ts';
import {agentReadSchema} from '../src/core/agent.ts';
import {visualReadSchema} from '../src/core/visual.ts';
import type {SessionHeader} from '@deepseek-ai/dsh-session';
import {SketchAgent} from '../src/host/agent.ts';
import {CommentRepository} from '../src/host/comment-repository.ts';
import type {AgentBatch} from '../src/core/agent.ts';
import type {VisualRepository} from '../src/host/visual-repository.ts';

const owner:Owner={sessionId:'graph-session',createdAt:'123',cwd:'C:/project'};
function table<T>(){const rows=new Map<string,T>();let fail=false;return {rows,setFail:(value:boolean)=>{fail=value;},get:(key:string)=>rows.get(key),get size(){return rows.size;},entries:()=>rows.entries(),keys:()=>rows.keys(),put:async(key:string,value:T)=>{if(fail)throw Error('offline');rows.set(key,structuredClone(value));},delete:async(key:string)=>rows.delete(key),update:async(key:string,fn:(v:T)=>T)=>{if(fail)throw Error('offline');const v=fn(rows.get(key)!);rows.set(key,structuredClone(v));return v;}} satisfies KvTable<string,T>&{rows:Map<string,T>;setFail:(value:boolean)=>void};}
const check=async()=>{};
function content(){const c=initialGraph();for(let i=1;i<5;i++)c.nodes.push({id:randomUUID(),name:`草图 ${i}`,kind:i===4?'detail':'page',position:{x:i*350,y:i*100}});return c;}
function edge(c:GraphContent,source:number,target:number,type:'detail'|'navigation'='detail'){return {id:randomUUID(),sourceNodeId:c.nodes[source]!.id,targetNodeId:c.nodes[target]!.id,type,anchor:{kind:'node' as const},label:''};}
const input=(c:GraphContent,revision:string|null=null)=>({expectedRevision:revision,mutationId:randomUUID(),content:c});
const scene:Drawing['scene']={elements:[{id:'button',type:'rectangle',x:10,y:20,width:120,height:40}],appState:{viewBackgroundColor:'#fff'},files:{}};

it('keeps the legacy session key unchanged and isolates every node and session',()=>{
 expect(ownerKey(owner)).toBe(JSON.stringify([owner.sessionId,owner.createdAt,owner.cwd]));
 const a=documentOwner(owner,randomUUID()),b=documentOwner(owner,randomUUID());
 expect(ownerKey(a)).not.toBe(ownerKey(b));expect(sessionOwner(a)).toEqual(owner);expect(documentOwner(a,'root')).toEqual(owner);
 expect(ownerKey({...a,createdAt:'new'})).not.toBe(ownerKey(a));
});
it('restores five nodes and both link types through a new repository instance',async()=>{
 const t=table<SketchGraph>(),repo=new GraphRepository(t),c=content();c.edges=[edge(c,0,1,'navigation'),edge(c,1,0,'navigation'),edge(c,0,4)];
 const saved=await repo.save(owner,input(c),check);expect(new GraphRepository(t).get(owner)).toEqual(saved);expect(t.size).toBe(1);
 expect(repo.get({...owner,createdAt:'other'})).toBeNull();
});
it('rejects detail cycles, multiple parents, missing endpoints and duplicate IDs',()=>{
 for(const edges of [(c:GraphContent)=>[edge(c,1,2),edge(c,2,1)],(c:GraphContent)=>[edge(c,0,2),edge(c,1,2)],(c:GraphContent)=>[edge(c,1,0)],(c:GraphContent)=>[{...edge(c,0,1),targetNodeId:randomUUID()}]]){const c=content();c.edges=edges(c);expect(graphContentSchema.safeParse(c).success).toBe(false);}
 const c=content();c.nodes.push(c.nodes[0]!);expect(graphContentSchema.safeParse(c).success).toBe(false);
});
it('allows navigation cycles and resolves only the detail breadcrumb path',()=>{
 const c=content();c.edges=[edge(c,0,1),edge(c,1,4),edge(c,4,0,'navigation')];expect(graphContentSchema.safeParse(c).success).toBe(true);expect(detailPath(c,c.nodes[4]!.id).map(n=>n.id)).toEqual([c.nodes[0]!.id,c.nodes[1]!.id,c.nodes[4]!.id]);
});
it('retries an acknowledged graph mutation without duplicating nodes, and rejects reused content',async()=>{
 const t=table<SketchGraph>(),repo=new GraphRepository(t),args=input(content()),saved=await repo.save(owner,args,check);
 expect(await repo.save(owner,args,check)).toEqual(saved);expect(t.size).toBe(1);
 await expect(repo.save(owner,{...args,content:initialGraph()},check)).rejects.toMatchObject({code:'MUTATION_REUSED'});
});
it('serializes competing creates and refuses stale graph revisions',async()=>{
 const repo=new GraphRepository(table<SketchGraph>()),results=await Promise.allSettled([repo.save(owner,input(content()),check),repo.save(owner,input(content()),check)]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 await expect(repo.save(owner,input(initialGraph()),check)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
});
it('preserves graph state after offline writes and retries the same mutation',async()=>{
 const t=table<SketchGraph>(),repo=new GraphRepository(t),args=input(content());t.setFail(true);
 await expect(repo.save(owner,args,check)).rejects.toThrow('offline');expect(repo.get(owner)).toBeNull();t.setFail(false);await expect(repo.save(owner,args,check)).resolves.toMatchObject({mutationId:args.mutationId});
});
it('keeps drawing revisions independent of node movement and other documents',async()=>{
 const graphs=new GraphRepository(table<SketchGraph>()),docs=new Repository(table<Drawing>()),c=content(),g=await graphs.save(owner,input(c),check),a=documentOwner(owner,c.nodes[1]!.id),b=documentOwner(owner,c.nodes[2]!.id);
 const d=await docs.save(a,{expectedRevision:null,mutationId:randomUUID(),scene,goal:'登录页'},check);await docs.save(b,{expectedRevision:null,mutationId:randomUUID(),scene,goal:'商品页'},check);
 c.nodes[1]!.position.x+=200;await graphs.save(owner,input(c,g.revision),check);expect(docs.get(a)).toEqual(d);expect(docs.get(b)?.goal).toBe('商品页');
 await expect(docs.save(a,{expectedRevision:null,mutationId:randomUUID(),scene,goal:'覆盖'},check)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
});
it('reports deletion without rebinding to an element with similar geometry, and recovers on undo',async()=>{
 const repo=new Repository(table<Drawing>()),d=await repo.save(owner,{expectedRevision:null,mutationId:randomUUID(),scene,goal:''},check),anchor={kind:'elements' as const,elementIds:['button']};
 expect(anchorStatus(anchor,d)).toBe('valid');expect(anchorStatus(anchor,{...d,scene:{...scene,elements:[{id:'copy',type:'rectangle',x:10,y:20,width:120,height:40}]}})).toBe('missing');expect(anchorStatus(anchor,d)).toBe('valid');
 expect(anchorStatus({kind:'region',region:{x:0,y:0,width:100,height:100}},null)).toBe('valid');
});
it('cleans deleted document records while retaining live nodes and other sessions',async()=>{
 const t=table<Drawing>(),docs=new Repository(t),id=randomUUID(),a=documentOwner(owner,id),b=documentOwner({...owner,sessionId:'other'},id);
 for(const o of [owner,a,b])await docs.save(o,{expectedRevision:null,mutationId:randomUUID(),scene,goal:''},check);
 await docs.prune(o=>!!o.nodeId&&o.sessionId===owner.sessionId);expect(docs.get(a)).toBeNull();expect(docs.get(owner)).not.toBeNull();expect(docs.get(b)).not.toBeNull();
});
it('advertises node reads without admitting session identity or multi-node writes',()=>{
 const id=randomUUID();expect(agentReadSchema.parse({nodeId:id}).nodeId).toBe(id);expect(visualReadSchema.parse({nodeId:id,revision:randomUUID()}).nodeId).toBe(id);
 expect(agentReadSchema.safeParse({nodeId:id,sessionId:'other'}).success).toBe(false);
});
it('checks session and graph membership before reading or saving node content',async()=>{
 const c=content(),graphs=new GraphRepository(table<SketchGraph>());await graphs.save(owner,input(c),check);
 const repo=new Repository(table<Drawing>()),documents=new Repository(table<Drawing>()),carrier=Object.assign(Object.create(SketchService.prototype),{graphs,repository:repo,documents,resolve:async()=>owner});
 const methods=carrier as {operation:(method:string,body:unknown,signal:AbortSignal)=>Promise<unknown>};
 const call=(target:Owner,method='document/get',payload:unknown=null)=>methods.operation(method,{owner:target,payload,requestId:randomUUID(),protocolVersion:1},new AbortController().signal);
 await expect(call(documentOwner(owner,c.nodes[1]!.id))).resolves.toEqual({drawing:null});
 await expect(call(documentOwner(owner,randomUUID()))).rejects.toMatchObject({code:'NODE_NOT_FOUND'});
 await expect(call({...owner,createdAt:'replaced'})).rejects.toMatchObject({code:'SESSION_CHANGED'});
 const a=documentOwner(owner,c.nodes[1]!.id);await call(a,'drawing/save',{expectedRevision:null,mutationId:randomUUID(),scene,goal:'子草图'});expect(repo.get(owner)).toBeNull();expect(documents.get(a)?.goal).toBe('子草图');
});
it('retains the previous graph when access is revoked during a save',async()=>{
 const repo=new GraphRepository(table<SketchGraph>());let calls=0;
 await expect(repo.save(owner,input(content()),async()=>{if(++calls===2)throw new SketchError('SESSION_CHANGED','changed');})).rejects.toMatchObject({code:'SESSION_CHANGED'});expect(repo.get(owner)).toBeNull();
});
it('pages graph summaries with bounded output and identifies stale anchors by source revision',async()=>{
 const graphs=new GraphRepository(table<SketchGraph>()),c=content(),docs=new Repository(table<Drawing>()),root=new Repository(table<Drawing>());
 const d=await root.save(owner,{expectedRevision:null,mutationId:randomUUID(),scene,goal:''},check);
 for(let i=0;i<20;i++)c.edges.push({...edge(c,0,1,'navigation'),anchor:{kind:'elements',elementIds:Array.from({length:50},(_,j)=>'x'.repeat(240)+j)},label:'细节'.repeat(100)});
 const g=await graphs.save(owner,input(c),check),host=Object.assign(Object.create(SketchService.prototype),{graphs,repository:root,documents:docs,resolve:async()=>owner});
 const session={id:owner.sessionId,createdAt:owner.createdAt,cwd:owner.cwd} as unknown as SessionHeader,signal=new AbortController().signal;
 let offset=0,count=0,edgeCount=0;
 do{const page=await host.readGraph(session,{offset,revision:g.revision},signal);expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(16*1024);count+=page.nodes.length;edgeCount+=page.edges.length;
  for(const e of page.edges){expect(e).toMatchObject({sourceRevision:d.revision,anchorStatus:'missing',anchor:{elementIdsTruncated:true,elementCount:50}});}
  if(!page.truncated)break;expect(page.nextOffset).toBeGreaterThan(offset);offset=page.nextOffset;
 }while(offset<400);
 expect(count).toBe(5);expect(edgeCount).toBe(20);
 await expect(host.readGraph(session,{revision:randomUUID()},signal)).rejects.toMatchObject({code:'REVISION_CONFLICT'});
});
it('blocks graph traversal and node reads under a root focus, including stale focus',async()=>{
 const graphs=new GraphRepository(table<SketchGraph>()),c=content();await graphs.save(owner,input(c),check);
 const host=Object.assign(Object.create(SketchService.prototype),{graphs,repository:new Repository(table<Drawing>()),documents:new Repository(table<Drawing>()),resolve:async()=>owner,agent:{getFocus:()=>({revision:randomUUID(),elementIds:['button']})}});
 const session={id:owner.sessionId,createdAt:owner.createdAt,cwd:owner.cwd} as unknown as SessionHeader,signal=new AbortController().signal;
 await expect(host.readGraph(session,{},signal)).rejects.toMatchObject({code:'FOCUS_SCOPE'});await expect(host.agentSnapshot(session,signal,c.nodes[1]!.id)).rejects.toMatchObject({code:'FOCUS_SCOPE'});
 host.agent.getFocus=()=>null;await expect(host.agentSnapshot(session,signal,c.nodes[1]!.id)).resolves.toMatchObject({owner:{nodeId:c.nodes[1]!.id},drawing:null});
});
it('returns copyable node image arguments and refuses to interpret another node revision as root',async()=>{
 const nodeId=randomUUID(),docs=new Repository(table<Drawing>()),target=documentOwner(owner,nodeId),d=await docs.save(target,{expectedRevision:null,mutationId:randomUUID(),scene,goal:'Banner 细节'},check),root=await docs.save(owner,{expectedRevision:null,mutationId:randomUUID(),scene,goal:'首页'},check);
 let readOwner:Owner|null=null;const visual={status:()=>({available:true,all:{stale:false,width:500,height:200},focus:null}),read:async(o:Owner)=>{readOwner=o;return {revision:d.revision};}} as unknown as VisualRepository;
 const agent=new SketchAgent({snapshot:async(_s,_signal,id)=>({owner:id===nodeId?target:owner,drawing:id===nodeId?d:root}),check:async()=>{},changed:()=>{}},new CommentRepository(table<AgentBatch>()),undefined,visual),signal=new AbortController().signal,session={id:owner.sessionId,createdAt:owner.createdAt,cwd:owner.cwd} as unknown as SessionHeader;
 const summary=await agent.read(session,{nodeId},signal);expect(summary).toMatchObject({nodeId,readOnly:true,imageReadArguments:{nodeId,revision:d.revision,scope:'all'}});
 await expect(agent.readImage(session,{revision:d.revision},signal)).rejects.toMatchObject({code:'REVISION_CONFLICT',message:expect.stringContaining('nodeId')});expect(readOwner).toBeNull();
 await expect(agent.readImage(session,'imageReadArguments' in summary?summary.imageReadArguments:{},signal)).resolves.toMatchObject({revision:d.revision});expect(readOwner).toEqual(target);
});
