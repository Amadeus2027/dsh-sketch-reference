import {expect,it,vi} from 'vitest';
import {RecordBytes} from '../src/host/record-bytes.ts';
import {Repository} from '../src/host/repository.ts';
import {ownerKey,type Drawing,type Save} from '../src/core/contracts.ts';
import type {KvTable} from '@deepseek-ai/dsh-storage-domain';
const owner={sessionId:'quota',createdAt:'1',cwd:'/test'};
const scene={elements:[],appState:{},files:{}};
function memory(){
 const rows=new Map<string,Drawing>();let fail=false;
 const table={get:(k:string)=>rows.get(k),entries:()=>rows.entries(),get size(){return rows.size;},put:async(k:string,v:Drawing)=>{if(fail)throw Error('disk full');rows.set(k,v);},update:async(k:string,fn:(v:Drawing)=>Drawing)=>{const value=fn(rows.get(k)!);if(fail)throw Error('disk full');rows.set(k,value);return value;}};
 return {rows,table:table as unknown as KvTable<string,Drawing>,setFailure:(v:boolean)=>{fail=v;}};
}
const input=(goal:string,expectedRevision:string|null=null):Save=>({scene,goal,expectedRevision,mutationId:crypto.randomUUID()});
it('counts UTF-8 bytes against current immutable records after replacements, deletes and restart',()=>{
 const a={text:'中文'},b={text:'b'},rows=new Map([['a',a],['b',b]]),table={entries:()=>rows.entries()},cache=new RecordBytes<{text:string}>();
 const size=(v:object)=>Buffer.byteLength(JSON.stringify(v));
 expect(cache.replacing(table,'a',a)).toBe(size(a)+size(b));
 const c={text:'replacement'};rows.set('b',c);expect(cache.replacing(table,'a',a)).toBe(size(a)+size(c));
 rows.delete('b');expect(cache.replacing(table,'new',b)).toBe(size(a)+size(b));
 expect(new RecordBytes().replacing(table,'a',a)).toBe(size(a));
});
it('serializes unchanged historical values once, without retaining deleted records in a total',()=>{
 const serialize=vi.fn(()=>({text:'large historical record'})),historical={toJSON:serialize},rows=new Map([['old',historical]]),cache=new RecordBytes<object>(),table={entries:()=>rows.entries()};
 cache.replacing(table,'new',{});cache.replacing(table,'new',{});expect(serialize).toHaveBeenCalledTimes(1);
 rows.delete('old');expect(cache.replacing(table,'new',{})).toBe(2);
});
it('keeps record caps, permits overwrites at the cap and recovers after a failed durable write',async()=>{
 const s=memory(),repo=new Repository(s.table),first=await repo.save(owner,input('first'),async()=>{});
 for(let i=1;i<500;i++)s.rows.set('history-'+i,{...first,owner:{...owner,sessionId:'history-'+i}});
 await expect(repo.save({...owner,sessionId:'new'},input('new'),async()=>{})).rejects.toMatchObject({code:'STORAGE_FULL'});
 s.setFailure(true);await expect(repo.save(owner,input('failed',first.revision),async()=>{})).rejects.toThrow('disk full');expect(repo.get(owner)).toBe(first);
 s.setFailure(false);const second=await repo.save(owner,input('ok',first.revision),async()=>{});expect(second.goal).toBe('ok');
 s.rows.delete('history-1');await expect(new Repository(s.table).save({...owner,sessionId:'new'},input('new'),async()=>{})).resolves.toMatchObject({goal:'new'});
});
it('enforces byte limits on overwrite and serializes concurrent capacity admission',async()=>{
 const s=memory(),repo=new Repository(s.table),first=await repo.save(owner,input('first'),async()=>{});
 // Synthetic historical payload at the real 128 MiB quota boundary.
 const large={...first,toJSON:()=>('x'.repeat(128*1024*1024))};s.rows.set('large',large);
 await expect(repo.save(owner,input('blocked',first.revision),async()=>{})).rejects.toMatchObject({code:'STORAGE_FULL'});expect(repo.get(owner)).toBe(first);s.rows.delete('large');
 for(let i=1;i<499;i++)s.rows.set('history-'+i,first);
 const outcomes=await Promise.allSettled(['a','b'].map(sessionId=>repo.save({...owner,sessionId},input(sessionId),async()=>{})));
 expect(outcomes.map(v=>v.status)).toEqual(['fulfilled','rejected']);expect(s.rows.size).toBe(500);expect(s.rows.get(ownerKey(owner))).toBe(first);
});
