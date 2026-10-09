import {convertToExcalidrawElements,newElementWith,restoreElements} from '@excalidraw/excalidraw';
import type {ExcalidrawElement} from '@excalidraw/excalidraw/element/types';
import {createdElementId,validateOperations,type EditProposal} from '../core/edits.ts';

/** Native constructors and immutable updates; no renderer or geometry engine. */
export function buildEditElements(elements:readonly ExcalidrawElement[],proposal:EditProposal){
 validateOperations(proposal.before,proposal.operations);
 let result=[...elements];
 proposal.operations.forEach((op,index)=>{
  if(op.op==='create'){
   const base={id:createdElementId(proposal.id,index),type:op.type,x:op.x,y:op.y,width:op.width,height:op.height,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid' as const,strokeWidth:1,strokeStyle:'solid' as const,roughness:1,opacity:100,angle:0};
   const skeleton=op.type==='text'?{...base,type:'text' as const,text:op.text!,fontFamily:1 as const,fontSize:20}:op.type==='arrow'?{...base,type:'arrow' as const,points:[[0,0],[op.width,op.height]] as [number,number][],endArrowhead:'arrow' as const}: {...base,type:op.type};
   result.push(...convertToExcalidrawElements([skeleton],{regenerateIds:false}));return;
  }
  result=result.map(e=>e.id!==op.elementId?e:newElementWith(e,op.op==='move'?{x:op.x,y:op.y}:op.op==='resize'?{width:op.width,height:op.height}:{isDeleted:true}));
 });
 // Singleton constructors may share an index. Let the public restorer assign
 // valid scene ordering before persistence; retain original geometry/bindings.
 const indices=new Map(restoreElements(result,null,{repairBindings:false,refreshDimensions:false}).map(e=>[e.id,e.index]));
 return result.map(e=>indices.has(e.id)&&indices.get(e.id)!==e.index?newElementWith(e,{index:indices.get(e.id)!}):e);
}
