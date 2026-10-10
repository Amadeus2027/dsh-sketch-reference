import {exportToSvg,getCommonBounds} from '@excalidraw/excalidraw';
import type {NonDeletedExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import type {Drawing} from '../core/contracts.ts';
import {createdElementId,type EditProposal} from '../core/edits.ts';

const ns='http://www.w3.org/2000/svg',padding=32;
/** Native SVG rendering and bounds; both views share one camera. No scene writes. */
export async function editComparison(proposal:EditProposal,after:Drawing['scene']){
 await document.fonts.ready;
 const scenes=[proposal.before,after],elements=scenes.map(s=>s.elements.filter(e=>!e.isDeleted) as unknown as NonDeletedExcalidrawElement[]);
 const maps=elements.map(items=>new Map(items.map(e=>[e.id,e])));
 const bounds=elements.map((items,i)=>items.length?getCommonBounds(items,maps[i]!):null);
 const valid=bounds.filter((b):b is NonNullable<typeof b>=>!!b);
 const left=Math.min(...valid.map(b=>b[0])),top=Math.min(...valid.map(b=>b[1])),right=Math.max(...valid.map(b=>b[2])),bottom=Math.max(...valid.map(b=>b[3]));
 const width=Math.max(1,right-left)+padding*2,height=Math.max(1,bottom-top)+padding*2;
 const images:Blob[]=[];
 for(let side=0;side<2;side++){
  const items=elements[side]!,map=maps[side]!,own=bounds[side],originX=own?.[0]??left,originY=own?.[1]??top;
  const svg=items.length?await exportToSvg({elements:items,appState:{...scenes[side]!.appState,viewBackgroundColor:'#ffffff',exportBackground:false,exportWithDarkMode:false},files:{},exportPadding:padding}):document.createElementNS(ns,'svg');
  const viewX=left-originX,viewY=top-originY;
  svg.setAttribute('viewBox',`${viewX} ${viewY} ${width} ${height}`);svg.setAttribute('width',String(width));svg.setAttribute('height',String(height));
  const background=document.createElementNS(ns,'rect');for(const [key,value] of Object.entries({x:viewX,y:viewY,width,height,fill:'#ffffff'}))background.setAttribute(key,String(value));svg.prepend(background);
  const marks=document.createElementNS(ns,'g');marks.setAttribute('transform',`translate(${padding-originX} ${padding-originY})`);svg.append(marks);
  proposal.operations.forEach((op,index)=>{
   const id=op.op==='create'?createdElementId(proposal.id,index):op.elementId,element=map.get(id);
   if(!element||op.op==='create'&&side===0||op.op==='delete'&&side===1)return;
   const [x,y,x2,y2]=getCommonBounds([element],map),color=op.op==='create'?'#15803d':op.op==='delete'?'#b91c1c':'#2563eb';
   const outline=document.createElementNS(ns,'rect');
   for(const [key,value] of Object.entries({x:x-5,y:y-5,width:Math.max(1,x2-x)+10,height:Math.max(1,y2-y)+10,rx:4,fill:'none',stroke:color,'stroke-width':2,'vector-effect':'non-scaling-stroke',...(side===0?{'stroke-dasharray':'5 3'}:{})}))outline.setAttribute(key,String(value));
   marks.append(outline);
   const label=document.createElementNS(ns,'text');for(const [key,value] of Object.entries({x:x-3,y:y-10,fill:color,'font-size':14,'font-family':'system-ui,sans-serif'}))label.setAttribute(key,String(value));label.textContent=`${index+1} ${op.op==='create'?'新增':op.op==='delete'?'删除':op.op==='move'?(side===0?'移动前':'移动后'):(side===0?'原尺寸':'新尺寸')}`;marks.append(label);
  });
  images.push(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
 }
 return {before:images[0]!,after:images[1]!};
}
