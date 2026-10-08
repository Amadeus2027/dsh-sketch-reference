import {afterEach,expect,it,vi} from 'vitest';
import {clearPending,recoverPending,writePending} from '../src/editor/pending.ts';
import {ownerKey,type Owner} from '../src/core/contracts.ts';

const owner:Owner={sessionId:'test',createdAt:'2026-10-08',cwd:'/workspace'};
const scene={elements:[],appState:{viewBackgroundColor:'#ffffff'},files:{}};
const backup=(goal='草稿',updated=1)=>({scene,goal,base:null,updated});
const key=(identity=owner,tab='tab')=>'dsh-sketch:v1:'+encodeURIComponent(ownerKey(identity))+':'+tab;
function memoryStorage(){
 const data=new Map<string,string>();
 return {data,get length(){return data.size;},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};
}

afterEach(()=>vi.unstubAllGlobals());

it('keeps recovery readable when the browser denies local storage',()=>{
 vi.stubGlobal('localStorage',{get length(){throw new DOMException('Denied','SecurityError');}});
 expect(()=>recoverPending(owner)).not.toThrow();
 expect(recoverPending(owner)).toEqual({available:false,pending:null});
});

it('distinguishes an empty store from denied access',()=>{
 vi.stubGlobal('localStorage',memoryStorage());
 expect(recoverPending(owner)).toEqual({available:true,pending:null});
});

it('selects the newest backup only within the full session identity',()=>{
 const storage=memoryStorage();vi.stubGlobal('localStorage',storage);
 storage.setItem(key(owner,'older'),JSON.stringify(backup('旧',1)));
 storage.setItem(key(owner,'newer'),JSON.stringify(backup('新',2)));
 for(const identity of [{...owner,sessionId:'other'},{...owner,createdAt:'later'},{...owner,cwd:'/elsewhere'}])storage.setItem(key(identity),JSON.stringify(backup('其他会话',100)));
 expect(recoverPending(owner)).toEqual({available:true,pending:{key:key(owner,'newer'),draft:backup('新',2)}});
});

it('leaves malformed and unsaveable backups untouched while recovering valid Unicode text',()=>{
 const storage=memoryStorage();vi.stubGlobal('localStorage',storage);
 const valid=backup('😀'.repeat(2000));storage.setItem(key(owner,'valid'),JSON.stringify(valid));
 storage.setItem(key(owner,'json'),'{broken');
 const invalid=[{goal:'x'.repeat(2001)},{goal:'bad\0text'},{base:'not-a-revision'},{updated:-1},{scene:{...scene,elements:[{type:'image'}]}}];
 invalid.forEach((change,i)=>storage.setItem(key(owner,String(i)),JSON.stringify({...backup('invalid',100),...change})));
 const before=[...storage.data.entries()];
 expect(recoverPending(owner).pending?.draft).toEqual(valid);
 expect([...storage.data.entries()]).toEqual(before);
});

it.each(['key','getItem'] as const)('reports an incomplete scan when %s fails without changing backups',method=>{
 const storage=memoryStorage();vi.stubGlobal('localStorage',storage);
 storage.setItem(key(),JSON.stringify(backup()));
 storage.setItem(key(owner,'later'),JSON.stringify(backup('newest',2)));
 const denied=()=>new DOMException('Denied','SecurityError');
 if(method==='key'){
  const original=storage.key;vi.spyOn(storage,'key').mockImplementation(i=>{if(i===1)throw denied();return original(i);});
 }else{
  const original=storage.getItem;let reads=0;vi.spyOn(storage,'getItem').mockImplementation(k=>{if(++reads===2)throw denied();return original(k);});
 }
 expect(recoverPending(owner)).toEqual({available:false,pending:null});
 expect(storage.data.size).toBe(2);
});

it('writes and clears only this tab while retaining other tabs and sessions',()=>{
 const storage=memoryStorage(),session=memoryStorage();vi.stubGlobal('localStorage',storage);vi.stubGlobal('sessionStorage',session);
 session.setItem('dsh-sketch:tab','current');
 storage.setItem(key(owner,'other'),JSON.stringify(backup()));
 storage.setItem(key({...owner,createdAt:'later'}),JSON.stringify(backup()));
 writePending(owner,{scene,goal:'本窗口'},null);
 expect(JSON.parse(storage.getItem(key(owner,'current'))!).goal).toBe('本窗口');
 clearPending(owner);
 expect(storage.data.size).toBe(2);expect(storage.getItem(key(owner,'other'))).not.toBeNull();
});

it('propagates failed writes so the UI cannot claim a backup exists',()=>{
 const storage=memoryStorage();vi.stubGlobal('localStorage',storage);
 vi.spyOn(storage,'setItem').mockImplementation(()=>{throw new DOMException('Full','QuotaExceededError');});
 expect(()=>writePending(owner,{scene,goal:'unsaved'},null)).toThrow('Full');
 expect(storage.data.size).toBe(0);
});
