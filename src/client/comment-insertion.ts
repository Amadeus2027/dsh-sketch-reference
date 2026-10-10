import type {InputActions} from '@deepseek-ai/dsh-client-ui-conversation/client';

/** Collapse the native revision-guarded span; never replace a selected draft or chip. */
export function insertCommentText(actions:InputActions,text:string,valid:()=>boolean){
 const span=actions.captureInsertion();
 if(!valid()||!actions.insertText(`\n\n${text}\n`,{...span,start:span.end}))throw new Error('会话或输入框已变化，请再次点击');
 actions.persistDraft();
}
