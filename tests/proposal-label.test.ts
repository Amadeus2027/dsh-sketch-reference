import {it,expect} from 'vitest';
import {proposalLabel,type EditProposal} from '../src/core/edits.ts';
it('separates preview, stale, dismissed and historical applied receipts after undo',()=>{
 const pending={status:'pending',baseRevision:'before'} as EditProposal;
 expect(proposalLabel(pending,'before',false,false)).toBe('待预览');
 expect(proposalLabel(pending,'before',false,true)).toBe('已预览 · 待确认');
 expect(proposalLabel(pending,'before',true,true)).toBe('需重新提议');
 expect(proposalLabel(pending,'other',false,true)).toBe('需重新提议');
 expect(proposalLabel({...pending,status:'dismissed'},'other',false,true)).toBe('已忽略');
 const applied={...pending,status:'applied' as const,resultRevision:'after'};
 expect(proposalLabel(applied,'after',false,true)).toBe('已应用（历史记录）');
 expect(proposalLabel(applied,'after',true,true)).toBe('曾应用 · 画板已变化');
 expect(proposalLabel(applied,'undo',false,true)).toBe('曾应用 · 画板已变化');
});
