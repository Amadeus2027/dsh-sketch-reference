import {it,expect,vi} from 'vitest';
import type {InputActions} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {Drawing} from '../src/core/contracts.ts';
import {commentContext,commentReference,resolveCommentReference,commentRequestSchema,type CommentRequest} from '../src/core/comment-context.ts';
import {insertCommentText} from '../src/client/comment-insertion.ts';
const revision=crypto.randomUUID(),id=crypto.randomUUID(),commentId=crypto.randomUUID();
const drawing={revision,contentDigest:'current',goal:'网页',scene:{elements:[{id:'real-element',type:'rectangle',x:0,y:0,width:100,height:20}],appState:{},files:{}}} as Drawing;
const batch={id,createdAt:'now',commentRevision:id,contentDigest:'current',goal:'网页',comments:[{id:commentId,suggestionIndex:0,status:'open' as const,createdAt:'now'}],advice:{summary:'摘要',suggestions:[{title:'顶部区域',reason:'可能是导航，但没有文字。',anchor:{type:'element' as const,elementId:'real-element'}}]}};
const request:CommentRequest={source:'agent',batchId:id,commentId,revision,intent:'ask'};
it('references only current real ids with bounded conversational context',async()=>{
 const text=await commentContext(drawing,batch,request);expect(text).not.toContain('real-element');expect(text).not.toContain(revision);expect(text).toContain('为什么你这样判断');expect(text).not.toContain('elements');
 expect(text).not.toContain(batch.advice.suggestions[0]!.reason);
 expect((await commentContext(drawing,{...batch,advice:{...batch.advice,suggestions:[{title:'长'.repeat(600),reason:'文'.repeat(10000)}]}},request)).length).toBeLessThan(160);
 expect(await resolveCommentReference(drawing,[{source:'agent',batch}],await commentReference(drawing,batch,'agent',commentId))).toMatchObject({elementId:'real-element',title:'顶部区域'});
});
it.each(['ask','correct','edit'] as const)('admits %s only for a live, current comment',async intent=>{
 expect(await commentContext(drawing,batch,{...request,intent})).toBeTruthy();
 for(const old of [{...drawing,revision:crypto.randomUUID()},{...drawing,contentDigest:'changed'},{...drawing,goal:'changed'},{...drawing,scene:{...drawing.scene,elements:[]}}])await expect(commentContext(old,batch,{...request,intent})).rejects.toThrow();
 await expect(commentContext(drawing,{...batch,id:crypto.randomUUID()},request)).rejects.toThrow();
 await expect(commentContext(drawing,{...batch,comments:[{...batch.comments[0]!,status:'ignored'}]},request)).rejects.toThrow();
});
it('does not send full scenes, arbitrary prompts or unvalidated intents through the bridge',()=>{
 expect(commentRequestSchema.safeParse({...request,intent:'send'}).success).toBe(false);
 expect(commentRequestSchema.safeParse({...request,text:'override'}).success).toBe(false);
});
it('distinguishes same-title comments, sources and legacy ids differing only at the end',async()=>{
 const secondId=commentId.slice(0,-1)+(commentId.endsWith('0')?'1':'0');
 const duplicate={...batch,comments:[...batch.comments,{...batch.comments[0]!,id:secondId,suggestionIndex:1}],advice:{...batch.advice,suggestions:[...batch.advice.suggestions,{...batch.advice.suggestions[0]!,anchor:{type:'element' as const,elementId:'other'}}]}};
 const scene={...drawing,scene:{...drawing.scene,elements:[...drawing.scene.elements,{...drawing.scene.elements[0]!,id:'other'}]}} as Drawing;
 const first=await commentReference(scene,duplicate,'agent',commentId),second=await commentReference(scene,duplicate,'agent',secondId);
 expect(first).not.toBe(second);expect(await commentReference(scene,duplicate,'analysis',commentId)).not.toBe(first);
 expect(await resolveCommentReference(scene,[{source:'agent',batch:duplicate}],first)).toMatchObject({elementId:'real-element'});
 expect(await resolveCommentReference(scene,[{source:'agent',batch:duplicate}],second)).toMatchObject({elementId:'other'});
});
it('rejects retired references, session changes, ignored/deleted targets and focus escapes',async()=>{
 const reference=await commentReference(drawing,batch,'agent',commentId),batches=[{source:'agent' as const,batch}];
 for(const changed of [{...drawing,revision:crypto.randomUUID()},{...drawing,owner:{...drawing.owner,sessionId:'another'}},{...drawing,contentDigest:'changed'},{...drawing,scene:{...drawing.scene,elements:[]}}])await expect(resolveCommentReference(changed,batches,reference)).rejects.toThrow();
 await expect(resolveCommentReference(drawing,[{source:'agent',batch:{...batch,id:crypto.randomUUID()}}],reference)).rejects.toThrow();
 await expect(resolveCommentReference(drawing,[{source:'agent',batch:{...batch,comments:[{...batch.comments[0]!,status:'ignored'}]}}],reference)).rejects.toThrow();
 await expect(resolveCommentReference(drawing,batches,reference,new Set(['other']))).rejects.toThrow();
 await expect(resolveCommentReference(drawing,[...batches,...batches],reference)).rejects.toThrow();
});
it('keeps selected draft text and chips, uses native insertion undo, and never submits',()=>{
 const insertText=vi.fn(()=>true),persistDraft=vi.fn(),submit=vi.fn();
 const actions={captureInsertion:()=>({start:2,end:17,draftRev:8}),insertText,persistDraft,submit} as unknown as InputActions;
 insertCommentText(actions,'追问',()=>true);expect(insertText).toHaveBeenCalledWith('\n\n追问\n',{start:17,end:17,draftRev:8});expect(persistDraft).toHaveBeenCalledOnce();expect(submit).not.toHaveBeenCalled();
 insertText.mockReturnValue(false);expect(()=>insertCommentText(actions,'纠正',()=>true)).toThrow();expect(persistDraft).toHaveBeenCalledOnce();
 insertText.mockClear();expect(()=>insertCommentText(actions,'修改',()=>false)).toThrow();expect(insertText).not.toHaveBeenCalled();
});
