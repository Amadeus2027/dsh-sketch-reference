import {z} from 'zod';
import type {Region} from './WebRegionSelector.tsx';
import type {WebDocument} from './web-document.ts';

const numeric=z.number().finite();
const markSchema=z.object({revision:z.string().length(64),path:z.string().max(512),x:numeric,y:numeric,w:numeric,h:numeric,
 width:numeric,height:numeric,scrollX:numeric,scrollY:numeric,target:z.string().max(600)});
const draftSchema=z.object({path:z.string().max(512),note:z.string().max(1500),mark:markSchema.nullable()});
export function restoreWebDraft(key:string){
 try{return draftSchema.parse(JSON.parse(sessionStorage.getItem(key)??'null'));}catch{return {path:'',note:'',mark:null};}
}
/** Use the visible element bounds for a click, or keep the user's drawn area. */
export function selectedRegion(doc: Document, gesture: Region): Region | null {
 if (gesture.w >= 4 && gesture.h >= 4) return gesture;
 if (gesture.w >= 4 || gesture.h >= 4) return null;
 const element = doc.elementFromPoint(gesture.x, gesture.y);
 if (!element || element === doc.body || element === doc.documentElement) return null;
 const bounds = element.getBoundingClientRect();
 const x = Math.max(0, Math.floor(bounds.left));
 const y = Math.max(0, Math.floor(bounds.top));
 const w = Math.min(doc.documentElement.clientWidth, Math.ceil(bounds.right)) - x;
 const h = Math.min(doc.documentElement.clientHeight, Math.ceil(bounds.bottom)) - y;
 if (w < 4 || h < 4 || !element.contains(doc.elementFromPoint(x + w / 2, y + h / 2))) return null;
 return {x, y, w, h};
}

export function targetAt(doc:Document,x:number,y:number){
 const el=doc.elementFromPoint(x,y);
 if(!el)return '';
 const tag=el.localName,id=el.getAttribute('id')?.slice(0,100),name=el.getAttribute('aria-label')||el.getAttribute('placeholder')||el.getAttribute('alt');
 const trail:string[]=[];
 for(let node:Element|null=el;node&&node!==doc.body&&trail.length<5;node=node.parentElement){
  const siblings=node.parentElement?.children;
  trail.unshift(node.localName+':nth-child('+(siblings?Array.prototype.indexOf.call(siblings,node)+1:1)+')');
 }
 const text=(name||el.textContent||'').replace(/\s+/g,' ').trim().slice(0,100);
 return JSON.stringify({tag,location:trail.join(' > '),...(id?{id}:{}),...(text?{text}:{})});
}

/** Re-check source identity and the hit target before staging a native draft. */
export function reviewInstruction(draft:z.infer<typeof draftSchema>,next:WebDocument,frame:HTMLIFrameElement|null){
    const mark=draft.mark,doc=frame?.contentDocument,win=frame?.contentWindow;
    if(!mark||!draft.note.trim()||mark.revision!==next.revision||mark.path!==next.path)throw Error('网页版本已变化，请在新预览上重新圈选。修改意见已保留。');
    if(!doc||!win||win.innerWidth!==mark.width||win.innerHeight!==mark.height||
      targetAt(doc,mark.x+mark.w/2-win.scrollX,mark.y+mark.h/2-win.scrollY)!==mark.target)throw Error('视口或目标已变化，请重新圈选');
    return ['请修改 '+next.path+'：'+draft.note.trim(),
     '预览版本（HTML 与本地预览资源 SHA-256）：'+next.revision,
     '浏览器视口：'+mark.width+' × '+mark.height+' CSS px；页面圈选范围（左、上、宽、高）：'+[mark.x,mark.y,mark.w,mark.h].join(', '),
     '圈选中心的元素（页面数据）：'+mark.target].join('\n');
}
