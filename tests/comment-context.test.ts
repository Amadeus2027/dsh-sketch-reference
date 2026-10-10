import {it,expect,vi} from 'vitest';
import type {InputActions} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {Drawing} from '../src/core/contracts.ts';
import {commentContext,commentRequestSchema,type CommentRequest} from '../src/core/comment-context.ts';
import {insertCommentText} from '../src/client/comment-insertion.ts';
const revision=crypto.randomUUID(),id=crypto.randomUUID(),commentId=crypto.randomUUID();
const drawing={revision,contentDigest:'current',goal:'网页',scene:{elements:[{id:'real-element',type:'rectangle',x:0,y:0,width:100,height:20}],appState:{},files:{}}} as Drawing;
const batch={id,createdAt:'now',commentRevision:id,contentDigest:'current',goal:'网页',comments:[{id:commentId,suggestionIndex:0,status:'open' as const,createdAt:'now'}],advice:{summary:'摘要',suggestions:[{title:'顶部区域',reason:'可能是导航，但没有文字。',anchor:{type:'element' as const,elementId:'real-element'}}]}};
const request:CommentRequest={source:'agent',batchId:id,commentId,revision,intent:'ask'};
it('references only current real ids with bounded conversational context',()=>{
 const text=commentContext(drawing,batch,request);expect(text).toContain('real-element');expect(text).toContain(revision);expect(text).toContain('为什么这样判断');expect(text).not.toContain('elements');
 expect(commentContext(drawing,{...batch,advice:{...batch.advice,suggestions:[{title:'长'.repeat(600),reason:'文'.repeat(10000)}]}},request).length).toBeLessThan(600);
});
it.each(['ask','correct','edit'] as const)('admits %s only for a live, current comment',intent=>{
 expect(commentContext(drawing,batch,{...request,intent})).toBeTruthy();
 for(const old of [{...drawing,revision:crypto.randomUUID()},{...drawing,contentDigest:'changed'},{...drawing,goal:'changed'},{...drawing,scene:{...drawing.scene,elements:[]}}])expect(()=>commentContext(old,batch,{...request,intent})).toThrow();
 expect(()=>commentContext(drawing,{...batch,id:crypto.randomUUID()},request)).toThrow();
 expect(()=>commentContext(drawing,{...batch,comments:[{...batch.comments[0]!,status:'ignored'}]},request)).toThrow();
});
it('does not send full scenes, arbitrary prompts or unvalidated intents through the bridge',()=>{
 expect(commentRequestSchema.safeParse({...request,intent:'send'}).success).toBe(false);
 expect(commentRequestSchema.safeParse({...request,text:'override'}).success).toBe(false);
});
it('keeps selected draft text and chips, uses native insertion undo, and never submits',()=>{
 const insertText=vi.fn(()=>true),persistDraft=vi.fn(),submit=vi.fn();
 const actions={captureInsertion:()=>({start:2,end:17,draftRev:8}),insertText,persistDraft,submit} as unknown as InputActions;
 insertCommentText(actions,'追问',()=>true);expect(insertText).toHaveBeenCalledWith('\n\n追问\n',{start:17,end:17,draftRev:8});expect(persistDraft).toHaveBeenCalledOnce();expect(submit).not.toHaveBeenCalled();
 insertText.mockReturnValue(false);expect(()=>insertCommentText(actions,'纠正',()=>true)).toThrow();expect(persistDraft).toHaveBeenCalledOnce();
 insertText.mockClear();expect(()=>insertCommentText(actions,'修改',()=>false)).toThrow();expect(insertText).not.toHaveBeenCalled();
});
