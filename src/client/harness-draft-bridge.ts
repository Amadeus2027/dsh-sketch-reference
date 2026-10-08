import type {Context} from '@deepseek-ai/cordis';
import type {ConversationController,InputActions,DraftAttachmentId} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {SessionId} from '@deepseek-ai/dsh-session/types';
/** Fixed-version adaptation: the outward IConversation omits browser-file registration. */
export function draftBridge(ctx:Context) {
 const service=ctx.get('conversation');
 if(!service || !('createDrafts' in service) || typeof service.createDrafts!=='function' || !('releaseDraftAttachment' in service) || typeof service.releaseDraftAttachment!=='function')return null;
 const controller=service as ConversationController;
 return {
  stage(sessionId:SessionId,bytes:ArrayBuffer,actions:InputActions,stillCurrent:()=>boolean):DraftAttachmentId {
   const attachments=controller.createDrafts(sessionId,[new File([bytes],'sketch-reference.png',{type:'image/png'})]);
   const ids=attachments.map(a=>a.id);
   try {
    if(!stillCurrent() || !actions.addAttachments(ids))throw new Error('会话或输入状态已变化，请重试');
    actions.persistDraft();return ids[0]!;
   }catch(error){for(const id of ids){actions.removeAttachment(id);controller.releaseDraftAttachment(id);}throw error;}
  }
 };
}
