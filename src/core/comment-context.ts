import {z} from 'zod';
import {digest,type Drawing} from './contracts.ts';
import {anchorTarget,adviceIsStale,type CommentView} from './comments.ts';

export const commentIntentSchema=z.enum(['ask','correct','edit']);
export const commentRequestSchema=z.object({source:z.enum(['analysis','agent']),batchId:z.uuid(),commentId:z.uuid(),revision:z.uuid(),intent:commentIntentSchema}).strict();
export type CommentRequest=z.infer<typeof commentRequestSchema>;
export type CurrentComment=CommentView&{contentDigest:string;goal:string};
const compact=(text:string,max:number)=>Array.from(text.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()).slice(0,max).join('');

/** Revalidate the saved record, never trust text or element ids from the iframe. */
function currentComment(drawing:Drawing|null,batch:CurrentComment|null,request:CommentRequest) {
 if(!drawing||drawing.revision!==request.revision)throw new Error('草图版本已变化，请刷新批注后重试');
 if(!batch||batch.id!==request.batchId||adviceIsStale(batch,drawing.contentDigest,drawing.goal))throw new Error('批注基于较早草图或已更新，请重新获取批注');
 const comment=batch.comments.find(c=>c.id===request.commentId),suggestion=comment&&batch.advice.suggestions[comment.suggestionIndex];
 if(!comment||!suggestion||comment.status==='ignored')throw new Error('批注不存在或已忽略，请刷新批注');
 const element=anchorTarget(suggestion.anchor,drawing.scene.elements);
 if(suggestion.anchor&&!element)throw new Error('批注对应元素已删除，请重新获取批注');
 return {drawing,batch,comment,suggestion,element};
}

/** Short user-facing reference bound to the full saved identity, never the title. */
export async function commentReference(drawing:Drawing,batch:CurrentComment,source:CommentRequest['source'],commentId:string){
 const code=(await digest([drawing.owner,drawing.revision,source,batch.id,commentId])).slice(0,12);
 return `${source==='agent'?'聊天':'分析'}批注·${code}`;
}
export async function commentContext(drawing:Drawing|null,batch:CurrentComment|null,request:CommentRequest):Promise<string> {
 const current=currentComment(drawing,batch,request);
 const target=`画板上的「${compact(current.suggestion.title,60)}」（${await commentReference(current.drawing,current.batch,request.source,request.commentId)}）`;
 return request.intent==='ask'?`关于${target}，为什么你这样判断？`:request.intent==='correct'?`关于${target}，我想纠正你的理解：［在这里补充］。暂不修改草图。`:`请针对${target}对应的图形进行修改：［在这里补充要求］。先提出修改方案，等待我确认。`;
}

/** Resolve only a current, unambiguous saved reference; never guess by title or ordinal. */
export async function resolveCommentReference(drawing:Drawing,batches:{source:CommentRequest['source'];batch:CurrentComment|null}[],reference:string,allowedIds?:ReadonlySet<string>){
 const matches=[];
 for(const {source,batch} of batches){
  if(!batch)continue;
  for(const comment of batch.comments){
   if(await commentReference(drawing,batch,source,comment.id)!==reference)continue;
   const current=currentComment(drawing,batch,{source,batchId:batch.id,commentId:comment.id,revision:drawing.revision,intent:'ask'});
   if(allowedIds&&(!current.element||!allowedIds.has(current.element.id)))throw new Error('该批注不在当前重点内，请在画板重新选择');
   matches.push({reference,title:current.suggestion.title,reason:compact(current.suggestion.reason,240),elementId:current.element?.id??null});
  }
 }
 if(matches.length!==1)throw new Error('批注引用已失效或无法唯一定位，请在画板重新选择；不要按标题猜测');
 return matches[0]!;
}
