import {expect,it} from 'vitest';
import {conversationLayout} from '../src/client/conversation-layout.ts';
const session={blank:true,awaitingFirstTurn:true,running:false,promptAttempted:false,openState:'loading'},conversation={activeTargets:new Set<string>()};
it('keeps loading, known blank, active and engaging native composer states',()=>{
 expect(conversationLayout(session,conversation,'s',false,true)).toEqual({phase:'settling',hero:false});
 expect(conversationLayout(session,conversation,'s',true,true)).toEqual({phase:'hero',hero:true});
 expect(conversationLayout({...session,openState:'open',running:true},conversation,'s',false,true).phase).toBe('active');
 expect(conversationLayout({...session,promptAttempted:true},conversation,'s',false,true).phase).toBe('active');
 expect(conversationLayout(undefined,undefined,undefined,undefined,true).hero).toBe(true);
});
it('retains the legacy parent handshake without leaving current subagent composers permanently settling',()=>{
 const pending={...session,openState:'open',subagent:{address:{mode:'continuable'}}};
 expect(conversationLayout(pending,conversation,'s',false,false).phase).toBe('settling');
 expect(conversationLayout(pending,conversation,'s',false,true).phase).toBe('hero');
 expect(conversationLayout({...pending,subagent:{...pending.subagent,parentAvailable:true}},conversation,'s',false,false).phase).toBe('hero');
});
