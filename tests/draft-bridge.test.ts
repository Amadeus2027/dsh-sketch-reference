import {describe,it,expect} from 'vitest';
import type {Context} from '@deepseek-ai/cordis';
import type {InputActions} from '@deepseek-ai/dsh-client-ui-conversation/client';
import {SessionId} from '@deepseek-ai/dsh-session';
import {draftBridge} from '../src/client/harness-draft-bridge.ts';
function setup(fail=false){const ids=['existing'];const released:string[]=[];const ctx={get:()=>({createDrafts:(_id:unknown,files:File[])=>{expect(files[0]!.type).toBe('image/png');return [{id:'sketch'}];},releaseDraftAttachment:(id:string)=>released.push(id)})};const actions={addAttachments:(next:string[])=>{ids.push(...next);return true;},removeAttachment:(id:string)=>{const i=ids.indexOf(id);if(i>=0)ids.splice(i,1);return true;},persistDraft:()=>{if(fail)throw new Error('storage failed');}};return {ctx:ctx as unknown as Context,actions:actions as unknown as InputActions,ids,released};}
describe('native attachment bridge',()=>{
 it('adds only the new attachment without replacing the existing draft',()=>{const c=setup();expect(draftBridge(c.ctx)!.stage(SessionId('s'),new ArrayBuffer(1),c.actions,()=>true)).toBe('sketch');expect(c.ids).toEqual(['existing','sketch']);expect(c.released).toEqual([]);});
 it('rolls back and releases its temporary attachment on persistence failure',()=>{const c=setup(true);expect(()=>draftBridge(c.ctx)!.stage(SessionId('s'),new ArrayBuffer(1),c.actions,()=>true)).toThrow('storage failed');expect(c.ids).toEqual(['existing']);expect(c.released).toEqual(['sketch']);});
 it('refuses to attach after a session switch',()=>{const c=setup();expect(()=>draftBridge(c.ctx)!.stage(SessionId('s'),new ArrayBuffer(1),c.actions,()=>false)).toThrow('会话或输入状态');expect(c.ids).toEqual(['existing']);expect(c.released).toEqual(['sketch']);});
});
