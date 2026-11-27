// Adapted phase logic from the pinned official ConversationMainPanel (MIT).
interface SessionLayout {
 blank:boolean;awaitingFirstTurn:boolean;running:boolean;promptAttempted:boolean;openState:string;
 subagent?:{address:{mode:string};parentAvailable?:boolean|undefined}|null;
}

/** Keep the shell's version-dependent lifecycle separate from panel rendering.
 * Current DSH no longer publishes the legacy parentAvailable handshake. */
export function conversationLayout(session:SessionLayout|undefined,conversation:{activeTargets:ReadonlySet<string>}|undefined,sessionId:string|undefined,summaryBlank:boolean|undefined,modernNavigation:boolean) {
 const active=!!session&&!!conversation&&(conversation.activeTargets.size>0||(!session.blank&&!session.awaitingFirstTurn)||session.running);
 const blank=!active&&!session?.promptAttempted;
 const pending=!modernNavigation&&session?.subagent?.address.mode==='continuable'&&session.subagent.parentAvailable===undefined;
 const settling=sessionId!==undefined&&((blank&&session?.openState==='loading'&&summaryBlank!==true)||pending);
 const hero=sessionId===undefined||(blank&&(session?.openState==='open'||summaryBlank===true));
 return {phase:settling?'settling' as const:hero?'hero' as const:'active' as const,hero};
}
