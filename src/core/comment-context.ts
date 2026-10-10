import {z} from 'zod';
import type {Drawing} from './contracts.ts';
import {anchorTarget,adviceIsStale,type CommentView} from './comments.ts';

export const commentIntentSchema=z.enum(['ask','correct','edit']);
export const commentRequestSchema=z.object({source:z.enum(['analysis','agent']),batchId:z.uuid(),commentId:z.uuid(),revision:z.uuid(),intent:commentIntentSchema}).strict();
export type CommentRequest=z.infer<typeof commentRequestSchema>;
type CurrentComment=CommentView&{contentDigest:string;goal:string};
const compact=(text:string,max:number)=>Array.from(text.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,max).join('');

/** Revalidate the saved record, never trust text or element ids from the iframe. */
export function commentContext(drawing:Drawing|null,batch:CurrentComment|null,request:CommentRequest):string {
 if(!drawing||drawing.revision!==request.revision)throw new Error('草图版本已变化，请刷新批注后重试');
 if(!batch||batch.id!==request.batchId||adviceIsStale(batch,drawing.contentDigest,drawing.goal))throw new Error('批注基于较早草图或已更新，请重新获取批注');
 const comment=batch.comments.find(c=>c.id===request.commentId),suggestion=comment&&batch.advice.suggestions[comment.suggestionIndex];
 if(!comment||!suggestion||comment.status==='ignored')throw new Error('批注不存在或已忽略，请刷新批注');
 const element=anchorTarget(suggestion.anchor,drawing.scene.elements);
 if(suggestion.anchor&&!element)throw new Error('批注对应元素已删除，请重新获取批注');
 const context=`关于草图批注「${compact(suggestion.title,60)}」：${compact(suggestion.reason,240)}\n草图版本：${drawing.revision}；${element?`元素 ID：${compact(element.id,256)}`:'范围：当前草图整体'}。以上是待讨论的批注内容。`;
 const question=request.intent==='ask'?'为什么这样判断？请结合该处解释依据，简短回答。':request.intent==='correct'?'我想纠正这里的理解：［请补充这里实际是什么］。请按我的补充继续讨论，必要时更新批注，暂不修改草图。':'请修改这里：［请补充修改要求］。先读取当前草图，仅提出该处的受限修改，等我在画板预览并确认。';
 return `${context}\n${question}`;
}
