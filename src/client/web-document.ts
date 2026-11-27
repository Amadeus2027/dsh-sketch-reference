import {digest,type Owner} from '../core/contracts.ts';
import {relativeWebPath,type WebFiles} from './web-files.ts';

const safeTags=new Set('address article aside blockquote br button caption code col colgroup dd details div dl dt em fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr i img input label legend li main nav ol option p pre section select small span strong summary table tbody td textarea th thead tr ul a b time picture hgroup'.split(' '));
const safeAttributes=new Set('id class style title hidden alt type value placeholder checked selected disabled open for name role colspan rowspan width height lang dir'.split(' '));
const policy="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; frame-src 'none'";
const decoder=new TextDecoder('utf-8',{fatal:true});

export async function loadWebDocument(owner:Owner,input:string,read:WebFiles,signal:AbortSignal){
 const path=relativeWebPath(input);
 if(!/\.html?$/i.test(path))throw Error('请选择 HTML 文件');
 const stamps=new Map<string,string>();
 const versions=new Map<string,string>();
 const files=new Map<string,Uint8Array>();
 let total=0;
 const get=async(file:string)=>{
  const cached=files.get(file);
  if(cached)return cached;
  if(files.size>=17)throw Error('预览最多包含 16 个本地资源');
  const {data:bytes,version}=await read.read(owner,file,signal);
  stamps.set(file,version);
  total+=bytes.length;
  if(total>2*1024*1024)throw Error('网页预览超过 2 MiB');
  const hash=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  versions.set(file,Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join(''));
  files.set(file,bytes);return bytes;
 };
 const source=decoder.decode(await get(path));
 // Parse outside a browsing context. Only whitelisted nodes enter the preview.
 const inert=document.implementation.createHTMLDocument('');
 inert.documentElement.innerHTML=source;
 const doc=document.implementation.createHTMLDocument('');
 const csp=doc.createElement('meta');
 csp.httpEquiv='Content-Security-Policy';csp.content=policy;doc.head.prepend(csp);
 let hasScript=false;
 let nodes=0,embeddedBytes=0;
 const copyAttributes=(node:Element,el:Element)=>{
  for(const attr of node.attributes){
   if(!safeAttributes.has(attr.name)&&!attr.name.startsWith('aria-')&&!attr.name.startsWith('data-'))continue;
   if(attr.name==='type'&&el.localName==='input'&&['file','image'].includes(attr.value.toLowerCase()))continue;
   el.setAttribute(attr.name,attr.value);
  }
 };
 const copy=async(parent:Element,children:NodeListOf<ChildNode>,depth:number)=>{
  if(depth>80)throw Error('网页层级过深');
  for(const node of children){
   if(++nodes>15000)throw Error('网页节点过多');
   if(node.nodeType===Node.TEXT_NODE){parent.append(doc.createTextNode(node.textContent??''));continue;}
   if(!(node instanceof Element))continue;
   const tag=node.localName;
   if(tag==='script'){hasScript=true;continue;}
   if(node.namespaceURI!=='http://www.w3.org/1999/xhtml')continue;
   if(tag==='style'||(tag==='link'&&node.getAttribute('rel')?.toLowerCase().split(/\s+/).includes('stylesheet'))){
    const href=node.getAttribute('href')??'';
    if(tag==='link'&&(!/\.css$/i.test(href)||/^(?:[a-z]+:|\/)/i.test(href)))continue;
    const css=tag==='style'?node.textContent??'':decoder.decode(await get(relativeWebPath(href,path)));
    embeddedBytes+=css.length;
    if(embeddedBytes>2*1024*1024)throw Error('预览内嵌资源超过 2 MiB');
    const style=doc.createElement('style');
    // A style raw-text end tag must never become markup when serialized.
    style.textContent=css.replace(/<\/style/gi,'<\\/style');
    style.media=node.getAttribute('media')??'';doc.head.append(style);continue;
   }
   if(!safeTags.has(tag))continue;
   const el=doc.createElement(tag);
   copyAttributes(node,el);
   if(tag==='img'){
    const src=node.getAttribute('src')??'';
    if(/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src))el.setAttribute('src',src);
    else if(/\.(?:png|jpe?g|webp|gif)$/i.test(src)&&!/^(?:[a-z]+:|\/)/i.test(src)){
     const asset=relativeWebPath(src,path),bytes=await get(asset);
     embeddedBytes+=bytes.length;
     if(embeddedBytes>2*1024*1024)throw Error('预览内嵌图片超过 2 MiB');
     const mime=asset.split('.').pop()!.toLowerCase().replace(/^jpg$/,'jpeg');
     let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
     el.setAttribute('src','data:image/'+mime+';base64,'+btoa(binary));
    }
   }
   parent.append(el);await copy(el,node.childNodes,depth+1);
  }
 };
 copyAttributes(inert.documentElement,doc.documentElement);
 copyAttributes(inert.body,doc.body);
 await copy(doc.head,inert.head.childNodes,0);
 await copy(doc.body,inert.body.childNodes,0);
 signal.throwIfAborted();
 return {path,stamps,html:'<!doctype html>'+doc.documentElement.outerHTML,revision:await digest([...versions]),hasScript};
}
export type WebDocument=Awaited<ReturnType<typeof loadWebDocument>>;
