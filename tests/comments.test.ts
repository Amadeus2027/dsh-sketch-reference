import {describe,it,expect} from 'vitest';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
import {batchSchema,contentDigest,ownerKey,type Batch,type Owner,type CommentUpdate} from '../src/core/contracts.ts';
import {anchorTarget,adviceIsStale,describeScene,withComments} from '../src/core/comments.ts';
import {ANALYSIS_LIMITS} from '../src/core/limits.ts';
import {CommentRepository} from '../src/host/comment-repository.ts';
import {parseAdvice} from '../src/host/advice.ts';

const owner:Owner={sessionId:'session',createdAt:'123',cwd:'/workspace'};
const scene={elements:[{id:'navigation',type:'rectangle' as const,x:20,y:40,width:300,height:30}],appState:{viewBackgroundColor:'#ffffff'},files:{}};
const advice={summary:'首页布局',suggestions:[{kind:'improve' as const,title:'增加留白',reason:'导航偏窄',actionPrompt:'按所附手绘参考图增加导航留白。',anchor:{type:'element' as const,elementId:'navigation'}}]};
const batch=():Batch=>({id:crypto.randomUUID(),owner,contentDigest:'digest',goal:'首页',route:{provider:'deepseek-account',model:'deepseek-flash'},advice,createdAt:new Date().toISOString()});
function store(){
 const rows=new Map<string,Batch>();let writes=0;
 const table={get:(k:string)=>rows.get(k),put:async(k:string,v:Batch)=>{writes++;rows.set(k,v);},update:async(k:string,f:(v:Batch)=>Batch)=>{const next=f(rows.get(k)!);writes++;rows.set(k,next);return next;},get size(){return rows.size;}};
 return {repo:new CommentRepository(table as unknown as KvTable<string,Batch>),rows,writes:()=>writes};
}
function change(value:Batch,status:CommentUpdate['status']='resolved'):CommentUpdate{const current=withComments(value);return {batchId:current.id,commentId:current.comments[0]!.id,expectedRevision:current.commentRevision,mutationId:crypto.randomUUID(),status};}

describe('model anchors and bounded scene input',()=>{
 it('retains an ID supplied for this analysis',()=>{expect(parseAdvice(JSON.stringify(advice),describeScene(scene).elements)).toEqual(advice);});
 it.each([{type:'element',elementId:'invented'},{type:'element',elementId:'deleted'},{type:'region',x:1e12,y:0},null,{type:'element',elementId:'navigation',execute:'code'}])('downgrades an invalid anchor to a global suggestion: %j',anchor=>{
  const parsed=parseAdvice(JSON.stringify({...advice,suggestions:[{...advice.suggestions[0],anchor}]}),describeScene({...scene,elements:[...scene.elements,{...scene.elements[0]!,id:'deleted',isDeleted:true}]}).elements);
  expect(parsed.suggestions[0]?.anchor).toBeUndefined();expect(parsed.suggestions[0]?.actionPrompt).toBe(advice.suggestions[0]?.actionPrompt);
 });
 it('accepts legacy global advice and rejects malformed JSON or executable extra fields',()=>{
  const {anchor:_,...global}=advice.suggestions[0]!;
  expect(parseAdvice(JSON.stringify({...advice,suggestions:[global]})).suggestions[0]?.anchor).toBeUndefined();
  expect(()=>parseAdvice('{broken')).toThrow('格式不完整');
  expect(()=>parseAdvice(JSON.stringify({...advice,suggestions:[{...global,tool:'execute'}]}))).toThrow('格式或长度');
 });
 it('limits structure size and element count and excludes unrelated state',()=>{
  const input={...scene,elements:Array.from({length:2000},(_,i)=>({...scene.elements[0]!,id:String(i).padEnd(256,'x'),customData:{secret:'UNRELATED'}}))};
  const result=describeScene(input);
  expect(result.elements.length).toBeLessThanOrEqual(ANALYSIS_LIMITS.maxElements);expect(result.truncated).toBe(true);expect(result.totalElements).toBe(2000);
  expect(new TextEncoder().encode(JSON.stringify(result.elements)).length).toBeLessThanOrEqual(ANALYSIS_LIMITS.maxStructureBytes);
  expect(JSON.stringify(result)).not.toContain('UNRELATED');expect(result).not.toHaveProperty('appState');
 });
 it('truncates element text by codepoints and omits deleted primitives',()=>{
  const result=describeScene({...scene,elements:[{...scene.elements[0]!,id:'deleted',isDeleted:true},{...scene.elements[0]!,type:'text',text:'😀'.repeat(1000)}]});
  expect(result.totalElements).toBe(1);expect(Array.from(result.elements[0]!.text!).length).toBe(160);
 });
 it('never rebinds a removed target by position or array index',()=>{
  expect(anchorTarget(advice.suggestions[0]!.anchor,scene.elements)?.id).toBe('navigation');
  expect(anchorTarget(advice.suggestions[0]!.anchor,[{...scene.elements[0]!,id:'different'}])).toBeNull();
  expect(anchorTarget(advice.suggestions[0]!.anchor,[{...scene.elements[0]!,isDeleted:true}])).toBeNull();
 });
});

describe('durable comments independent from drawing CAS',()=>{
 it('reads old batches as stable open comments without rewriting storage',()=>{
  const s=store(),old=batch();s.rows.set(ownerKey(owner),old);
  expect(batchSchema.parse(old)).toEqual(old);expect(s.repo.get(owner)).toEqual(s.repo.get(owner));
  expect(s.repo.get(owner)?.comments[0]?.status).toBe('open');expect(s.writes()).toBe(0);
 });
 it('persists resolve, reopen and ignore and restores them through a new repository',async()=>{
  const s=store(),initial=await s.repo.put(batch(),async()=>{});
  let current=await s.repo.update(owner,change(initial),async()=>{});expect(current.comments[0]?.status).toBe('resolved');
  current=await s.repo.update(owner,change(current,'open'),async()=>{});expect(current.comments[0]?.status).toBe('open');
  current=await s.repo.update(owner,change(current,'ignored'),async()=>{});
  expect(batchSchema.parse(current)).toEqual(current);expect(s.repo.get(owner)?.comments[0]?.status).toBe('ignored');
  const reopened=new CommentRepository({get:(k:string)=>s.rows.get(k)} as unknown as KvTable<string,Batch>);
  expect(reopened.get(owner)?.comments).toEqual(current.comments);
 });
 it('rejects racing status writes and deduplicates an ambiguous retry',async()=>{
  const s=store(),initial=await s.repo.put(batch(),async()=>{}),input=change(initial);
  const results=await Promise.allSettled([s.repo.update(owner,input,async()=>{}),s.repo.update(owner,change(initial,'ignored'),async()=>{})]);
  expect(results.map(r=>r.status)).toEqual(['fulfilled','rejected']);
  const saved=s.repo.get(owner)!;expect(await s.repo.update(owner,input,async()=>{})).toEqual(saved);
  await expect(s.repo.update(owner,{...input,status:'ignored'},async()=>{})).rejects.toMatchObject({code:'MUTATION_REUSED'});
 });
 it('does not attach old state changes to a new analysis or another session',async()=>{
  const s=store(),first=await s.repo.put(batch(),async()=>{}),input=change(first);
  await s.repo.put(batch(),async()=>{});
  await expect(s.repo.update(owner,input,async()=>{})).rejects.toMatchObject({code:'BATCH_CHANGED'});
  for(const identity of [{...owner,sessionId:'other'},{...owner,createdAt:'later'},{...owner,cwd:'/other'}]){
   expect(s.repo.get(identity)).toBeNull();await expect(s.repo.update(identity,input,async()=>{})).rejects.toMatchObject({code:'BATCH_CHANGED'});
  }
 });
 it('rechecks lifecycle immediately before a comment write',async()=>{
  const s=store(),first=await s.repo.put(batch(),async()=>{});let checks=0;
  await expect(s.repo.update(owner,change(first),async()=>{if(++checks===2)throw new Error('Session removed');})).rejects.toThrow('Session removed');
  expect(s.repo.get(owner)?.comments[0]?.status).toBe('open');
 });
 it('leaves drawing digest, analysis version and suggestion text unchanged',async()=>{
  const s=store(),first=await s.repo.put({...batch(),analysisRevision:crypto.randomUUID()},async()=>{}),digest=await contentDigest(scene);
  const resolved=await s.repo.update(owner,change(first),async()=>{});
  expect(resolved.contentDigest).toBe(first.contentDigest);expect(resolved.analysisRevision).toBe(first.analysisRevision);expect(resolved.advice).toEqual(first.advice);
  expect(await contentDigest(scene)).toBe(digest);expect(adviceIsStale(resolved,'digest','首页')).toBe(false);
  expect(adviceIsStale(resolved,'changed','首页')).toBe(true);expect(adviceIsStale(resolved,'digest','新用途')).toBe(true);
  expect(adviceIsStale(resolved,null,'首页')).toBe(true);
 });
 it('rejects inconsistent persisted comment indexes or duplicate IDs',()=>{
  const current=withComments(batch());expect(batchSchema.safeParse({...current,comments:[{...current.comments[0],suggestionIndex:2}]}).success).toBe(false);
  expect(batchSchema.safeParse({...current,commentRevision:undefined}).success).toBe(false);
 });
});
