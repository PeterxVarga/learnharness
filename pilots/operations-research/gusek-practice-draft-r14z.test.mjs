import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {practiceDraftKey,makePracticeDraft,readPracticeDraft} from '../../src/features/gusek/practice-draft-r14z.mjs';
const sample={taskId:'gusek-transport-42',kind:'transport',seed:'42',
 dialect:'indexed',model:'var x{i in I, j in J} >= 0;',
 values:'{"x[1,1]":1}',objective:'23',hintsUsed:false};
describe('R14Z local, per-task GUSEK Practice drafts',()=>{
 it('round-trips exactly without secrets, score or solver logs',()=>{
  const d=makePracticeDraft(sample,17);
  assert.deepEqual(readPracticeDraft(d,{kind:'transport',seed:'42',dialect:'indexed'}),d);
  assert.deepEqual(Object.keys(d).sort(),['dialect','hintsUsed','kind','model','modifiedAt','objective','schema','seed','taskId','values'].sort());
 });
 it('separates chat IDs, tasks and GMPL dialects',()=>{
  const a=practiceDraftKey(null,'transport','42','indexed');
  const b=practiceDraftKey('chat_abc123_1234abcd','transport','42','indexed');
  const c=practiceDraftKey(null,'transport','43','indexed');
  const d=practiceDraftKey(null,'transport','42','scalar');
  assert.equal(new Set([a,b,c,d]).size,4);
 });
 it('never cross-restores another variant or dialect',()=>{
  const d=makePracticeDraft(sample);
  assert.equal(readPracticeDraft(d,{kind:'transport',seed:'43',dialect:'indexed'}),null);
  assert.equal(readPracticeDraft(d,{kind:'transport',seed:'42',dialect:'scalar'}),null);
 });
 it('refuses mismatched task identifiers',()=>{
  assert.throws(()=>makePracticeDraft({...sample,taskId:'gusek-transport-41'}),/invalid_practice_draft/);
 });
 it('refuses unknown chat, kinds and dialiects',()=>{
  assert.equal(practiceDraftKey('bad','transport','42','indexed'),null);
  assert.equal(practiceDraftKey(null,'tablet','42','indexed'),null);
  assert.equal(practiceDraftKey(null,'transport','42','unknown'),null);
 });
 it('protects uint32 task seed and canonical task identifier',()=>{
  for(const seed of ['-1','01','4294967296','2e2'])
   assert.equal(practiceDraftKey(null,'transport',seed,'indexed'),null);
 });
 it('enforces source and submitted JSON size, type, NUL and timestamp',()=>{
  assert.throws(()=>makePracticeDraft({...sample,model:'é'.repeat(32769)}));
  assert.throws(()=>makePracticeDraft({...sample,values:'x'.repeat(8193)}));
  assert.throws(()=>makePracticeDraft({...sample,objective:'0'.repeat(129)}));
  assert.throws(()=>makePracticeDraft({...sample,model:'a\0b'}));
  assert.throws(()=>makePracticeDraft(sample,-1));
 });
 it('rejects malformed cached objects rather than recovering a different task',()=>{
  for(const draft of [null,{},'x',{...sample,schema:'bad'},
   {...sample,schema:'learnharness.gusek-practice-draft.r14z',modifiedAt:'broken'}])
   assert.equal(readPracticeDraft(draft,{kind:'transport',seed:'42',dialect:'indexed'}),null);
 });
});
