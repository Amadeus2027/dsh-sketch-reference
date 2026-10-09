import {describe,it,expect} from 'vitest';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import {Repository} from '../src/host/repository.ts';
import {Autosave} from '../src/editor/autosave.ts';
import {adviceSchema,contentDigest,type Drawing,type Save,type Owner} from '../src/core/contracts.ts';
import {sceneSchema} from '../src/core/contracts.ts';
import {normalize} from '../src/editor/scene.ts';
const owner:Owner={sessionId:'session-1',createdAt:'123',cwd:'/workspace'};
const scene={elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}};
function repository(){const rows=new Map<string,Drawing>();const table={get:(k:string)=>rows.get(k),put:async(k:string,v:Drawing)=>{rows.set(k,v);},update:async(k:string,f:(v:Drawing)=>Drawing)=>{const v=f(rows.get(k)!);rows.set(k,v);return v;},entries:()=>rows.entries(),get size(){return rows.size;}};return new Repository(table as unknown as KvTable<string,Drawing>);}
const input=(goal='a'):Save=>({expectedRevision:null,mutationId:crypto.randomUUID(),scene,goal});
describe('persisted ownership and revision',()=>{
 it('serializes racing first writes, preserves winner, and deduplicates a lost response',async()=>{const repo=repository(),first=input(),second=input('b');const results=await Promise.allSettled([repo.save(owner,first,async()=>{}),repo.save(owner,second,async()=>{})]);expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);const record=repo.get(owner)!;expect(record.goal).toBe('a');expect(await repo.save(owner,first,async()=>{})).toEqual(record);expect(repo.get({...owner,createdAt:'124'})).toBeNull();await expect(repo.save(owner,{...first,goal:'forged'},async()=>{})).rejects.toMatchObject({code:'MUTATION_REUSED'});});
 it('checks the session again before committing',async()=>{const repo=repository();let checks=0;await expect(repo.save(owner,input(),async()=>{if(++checks===2)throw new Error('deleted');})).rejects.toThrow('deleted');expect(repo.get(owner)).toBeNull();});
});
describe('autosave recovery',()=>{
 it('persists new freehand strokes without their transient committed point',()=>{
  const stroke={id:'stroke',type:'freedraw',x:0,y:0,width:180,height:120,points:[[0,0],[180,120]],lastCommittedPoint:[180,120]};
  const saved=normalize([stroke],scene.appState);
  expect(saved.elements[0]?.lastCommittedPoint).toBeNull();
  expect(normalize([{...stroke,lastCommittedPoint:null}],scene.appState)).toEqual(saved);
 });
 it.each([{checkpoint:null},{checkpoint:[180,120]},{checkpoint:undefined}])('preserves a legacy freehand checkpoint ($checkpoint) without resaving hydration',async({checkpoint})=>{
  const repo=repository(),stroke={id:'stroke',type:'freedraw',x:0,y:0,width:180,height:120,points:[[0,0],[180,120]],...(checkpoint===undefined?{}:{lastCommittedPoint:checkpoint})};
  const saved=await repo.save(owner,{...input(),scene:sceneSchema.parse({...scene,elements:[stroke]})},async()=>{});let requests=0;
  const queue=new Autosave(owner,saved,async value=>{requests++;return repo.save(owner,value,async()=>{});},()=>{},()=>{});
  const restored={...stroke,lastCommittedPoint:null};
  queue.update({scene:normalize([restored],saved.scene.appState,queue.current().scene),goal:saved.goal});await queue.settle();
  expect(requests).toBe(0);expect(repo.get(owner)).toEqual(saved);
  queue.update({scene:normalize([{...restored,x:20}],saved.scene.appState,queue.current().scene),goal:saved.goal});await queue.settle();
  expect(requests).toBe(1);expect(repo.get(owner)?.revision).not.toBe(saved.revision);expect(repo.get(owner)?.contentDigest).not.toBe(saved.contentDigest);
  queue.dispose();
 });
 it('does not resave a scene solely because Excalidraw restored empty bindings',async()=>{
  const repo=repository(),saved=await repo.save(owner,{...input(),scene:{...scene,elements:[{id:'rect',type:'rectangle',x:0,y:0,width:10,height:10,boundElements:null}]}},async()=>{});let requests=0;
  const queue=new Autosave(owner,saved,async value=>{requests++;return repo.save(owner,value,async()=>{});},()=>{},()=>{});
  queue.update({scene:normalize(saved.scene.elements.map(e=>({...e,boundElements:[]})),saved.scene.appState),goal:saved.goal});await queue.settle();
  expect(requests).toBe(0);expect(repo.get(owner)?.revision).toBe(saved.revision);queue.dispose();
 });
 it('retries the same mutation after an ambiguous failure and then saves newer edits',async()=>{const repo=repository();const requests:Save[]=[];let ambiguous=true;const queue=new Autosave(owner,null,async v=>{requests.push(v);const record=await repo.save(owner,v,async()=>{});if(ambiguous){ambiguous=false;throw new Error('lost response');}return record;},()=>{},()=>{});queue.update({scene,goal:'first'});await expect(queue.flush()).rejects.toThrow('lost response');queue.update({scene,goal:'newer'});await queue.settle();expect(requests[0]!.mutationId).toBe(requests[1]!.mutationId);expect(repo.get(owner)!.goal).toBe('newer');expect(queue.state).toBe('clean');queue.dispose();});
 it('stops on conflict without retrying or replacing local edits',async()=>{let calls=0;const queue=new Autosave(owner,null,async()=>{calls++;throw Object.assign(new Error('conflict'),{code:'REVISION_CONFLICT'});},()=>{},()=>{});queue.update({scene,goal:'keep me'});await expect(queue.flush()).rejects.toThrow('conflict');await expect(queue.settle()).rejects.toThrow('conflict');expect(calls).toBe(1);expect(queue.current().goal).toBe('keep me');queue.dispose();});
});
describe('untrusted data',()=>{
 it('treats empty restored bindings as the same visible scene while retaining real bindings',async()=>{
  const element={id:'rect',type:'rectangle' as const,x:0,y:0,width:10,height:10,boundElements:null};
  const saved={...scene,elements:[element]};
  expect(await contentDigest(saved)).toBe(await contentDigest({...saved,elements:[{...element,boundElements:[]}]}));
  expect(await contentDigest(saved)).not.toBe(await contentDigest({...saved,elements:[{...element,boundElements:[{id:'label',type:'text' as const}]}]}));
 });
 it('rejects model prose, extra fields and oversized advice',()=>{expect(adviceSchema.safeParse({summary:'x',suggestions:[]}).success).toBe(false);expect(adviceSchema.safeParse({summary:'x',suggestions:[{kind:'create',title:'x',reason:'x',actionPrompt:'x',execute:true}]}).success).toBe(false);expect(adviceSchema.safeParse({summary:'x'.repeat(121),suggestions:[{kind:'create',title:'x',reason:'x',actionPrompt:'x'}]}).success).toBe(false);});
 it('rejects embedded remote images and hostile cyclic input',()=>{expect(sceneSchema.safeParse({...scene,elements:[{type:'image'}]}).success).toBe(false);const cyclic:Record<string,unknown>={};cyclic['loop']=cyclic;expect(sceneSchema.safeParse({...scene,appState:cyclic}).success).toBe(false);});
 it('hashes visible content independently of edit metadata',async()=>{const e={id:'a',type:'rectangle',x:0,y:0,width:10,height:10,version:1,versionNonce:1,seed:1};const a={...scene,elements:[e]} as Drawing['scene'];expect(await contentDigest(a)).toBe(await contentDigest({...a,elements:[{...e,version:2,seed:3}]} as Drawing['scene']));expect(await contentDigest(a)).not.toBe(await contentDigest({...a,elements:[{...e,x:2}]} as Drawing['scene']));});
});
