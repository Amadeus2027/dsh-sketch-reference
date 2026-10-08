import {describe,it,expect} from 'vitest';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import {Repository} from '../src/host/repository.ts';
import {Autosave} from '../src/editor/autosave.ts';
import {adviceSchema,contentDigest,type Drawing,type Save,type Owner} from '../src/core/contracts.ts';
import {sceneSchema} from '../src/core/contracts.ts';
const owner:Owner={sessionId:'session-1',createdAt:'123',cwd:'/workspace'};
const scene={elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}};
function repository(){const rows=new Map<string,Drawing>();const table={get:(k:string)=>rows.get(k),put:async(k:string,v:Drawing)=>{rows.set(k,v);},update:async(k:string,f:(v:Drawing)=>Drawing)=>{const v=f(rows.get(k)!);rows.set(k,v);return v;},entries:()=>rows.entries(),get size(){return rows.size;}};return new Repository(table as unknown as KvTable<string,Drawing>);}
const input=(goal='a'):Save=>({expectedRevision:null,mutationId:crypto.randomUUID(),scene,goal});
describe('persisted ownership and revision',()=>{
 it('serializes racing first writes, preserves winner, and deduplicates a lost response',async()=>{const repo=repository(),first=input(),second=input('b');const results=await Promise.allSettled([repo.save(owner,first,async()=>{}),repo.save(owner,second,async()=>{})]);expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);const record=repo.get(owner)!;expect(record.goal).toBe('a');expect(await repo.save(owner,first,async()=>{})).toEqual(record);expect(repo.get({...owner,createdAt:'124'})).toBeNull();await expect(repo.save(owner,{...first,goal:'forged'},async()=>{})).rejects.toMatchObject({code:'MUTATION_REUSED'});});
 it('checks the session again before committing',async()=>{const repo=repository();let checks=0;await expect(repo.save(owner,input(),async()=>{if(++checks===2)throw new Error('deleted');})).rejects.toThrow('deleted');expect(repo.get(owner)).toBeNull();});
});
describe('autosave recovery',()=>{
 it('retries the same mutation after an ambiguous failure and then saves newer edits',async()=>{const repo=repository();const requests:Save[]=[];let ambiguous=true;const queue=new Autosave(owner,null,async v=>{requests.push(v);const record=await repo.save(owner,v,async()=>{});if(ambiguous){ambiguous=false;throw new Error('lost response');}return record;},()=>{},()=>{});queue.update({scene,goal:'first'});await expect(queue.flush()).rejects.toThrow('lost response');queue.update({scene,goal:'newer'});await queue.settle();expect(requests[0]!.mutationId).toBe(requests[1]!.mutationId);expect(repo.get(owner)!.goal).toBe('newer');expect(queue.state).toBe('clean');queue.dispose();});
 it('stops on conflict without retrying or replacing local edits',async()=>{let calls=0;const queue=new Autosave(owner,null,async()=>{calls++;throw Object.assign(new Error('conflict'),{code:'REVISION_CONFLICT'});},()=>{},()=>{});queue.update({scene,goal:'keep me'});await expect(queue.flush()).rejects.toThrow('conflict');await expect(queue.settle()).rejects.toThrow('conflict');expect(calls).toBe(1);expect(queue.current().goal).toBe('keep me');queue.dispose();});
});
describe('untrusted data',()=>{
 it('rejects model prose, extra fields and oversized advice',()=>{expect(adviceSchema.safeParse({summary:'x',suggestions:[]}).success).toBe(false);expect(adviceSchema.safeParse({summary:'x',suggestions:[{kind:'create',title:'x',reason:'x',actionPrompt:'x',execute:true}]}).success).toBe(false);expect(adviceSchema.safeParse({summary:'x'.repeat(121),suggestions:[{kind:'create',title:'x',reason:'x',actionPrompt:'x'}]}).success).toBe(false);});
 it('rejects embedded remote images and hostile cyclic input',()=>{expect(sceneSchema.safeParse({...scene,elements:[{type:'image'}]}).success).toBe(false);const cyclic:Record<string,unknown>={};cyclic['loop']=cyclic;expect(sceneSchema.safeParse({...scene,appState:cyclic}).success).toBe(false);});
 it('hashes visible content independently of edit metadata',async()=>{const e={id:'a',type:'rectangle',x:0,y:0,width:10,height:10,version:1,versionNonce:1,seed:1};const a={...scene,elements:[e]} as Drawing['scene'];expect(await contentDigest(a)).toBe(await contentDigest({...a,elements:[{...e,version:2,seed:3}]} as Drawing['scene']));expect(await contentDigest(a)).not.toBe(await contentDigest({...a,elements:[{...e,x:2}]} as Drawing['scene']));});
});
