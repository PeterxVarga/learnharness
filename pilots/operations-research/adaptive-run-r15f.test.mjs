import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {r15cPracticeItinerary} from './adaptive-sequence-r15c.mjs';
import {r15SessionOutcome} from './adaptive-practice-r15.mjs';
import {r15dCreateRun,r15dSelectRunStep,r15dLoadedRunStep,r15dRecordRunGrade,r15dPauseRun,r15dRunSummary} from './adaptive-run-r15d.mjs';
const fresh=()=>r15dCreateRun(r15cPracticeItinerary({currentSeed:42}));
const ready=()=>{const r=r15dSelectRunStep(fresh(),1);return r15dLoadedRunStep(r,r.steps[0].taskId);};
const grade=(r,points=0,at=1000,id=null)=>{
 const s=r.steps[0];
 return r15SessionOutcome({taskId:s.taskId,maxPoints:1,points,
  correct:points===null?null:points===1,
  errors:points===1?[]:['objective_mismatch'],...(id?{id}:{})},
  {kind:s.kind,seed:s.seed,hintsUsed:false,at});
};
const submit=(r,points=0,at=1000,id=null)=>r15dRecordRunGrade(r,grade(r,points,at,id));
describe('R15F bounded grade receipt replay hardening',()=>{
 it('new run has an empty receipt ledger',()=>assert.deepEqual(ready().steps[0].receiptKeys,[]));
 it('one server grade adds exactly one ledger key',()=>{const r=submit(ready());assert.equal(r.steps[0].receiptKeys.length,1);assert.equal(r.steps[0].attempts,1)});
 it('A B A replay is not counted twice',()=>{let r=ready(),a=grade(r,0,1000),b=grade(r,1,2000);
  r=r15dRecordRunGrade(r,a);r=r15dRecordRunGrade(r,b);const before=r;
  assert.equal(r15dRecordRunGrade(r,a),before);assert.equal(r.steps[0].attempts,2)});
 it('A B C A replay cannot add a fourth attempt',()=>{let r=ready(),a=grade(r,0,1000),b=grade(r,null,2000),c=grade(r,1,3000);
  r=r15dRecordRunGrade(r,a);r=r15dRecordRunGrade(r,b);r=r15dRecordRunGrade(r,c);
  assert.equal(r15dRecordRunGrade(r,a),r);assert.equal(r.steps[0].attempts,3)});
 it('old replay does not alter latest status',()=>{let r=ready(),a=grade(r,0,1000),b=grade(r,1,2000);
  r=r15dRecordRunGrade(r,a);r=r15dRecordRunGrade(r,b);assert.equal(r15dRecordRunGrade(r,a).steps[0].status,'full')});
 it('old replay does not alter full/zero totals',()=>{let r=ready(),a=grade(r,0,1000),b=grade(r,1,2000);
  r=r15dRecordRunGrade(r,a);r=r15dRecordRunGrade(r,b);r=r15dRecordRunGrade(r,a);
  assert.deepEqual([r.steps[0].fullCount,r.steps[0].zeroCount],[1,1])});
 it('server id has priority when present',()=>{const id='123e4567-e89b-42d3-a456-426614174000';
  const r=submit(ready(),0,1000,id);assert.equal(r.steps[0].lastReceiptKey,id)});
 it('same receipt id replay cannot bypass duplicate guard with later timestamp',()=>{
  const id='123e4567-e89b-42d3-a456-426614174000',r=submit(ready(),0,1000,id);
  assert.equal(submit(r,0,2000,id),r)});
 it('different valid receipt ids count as distinct server attempts',()=>{
  let r=ready();r=submit(r,0,1000,'123e4567-e89b-42d3-a456-426614174000');
  r=submit(r,0,2000,'123e4567-e89b-42d3-a456-426614174001');assert.equal(r.steps[0].attempts,2)});
 it('receipt ledger survives pause and manual step restart',()=>{
  let r=ready(),a=grade(r,0,1000);r=r15dRecordRunGrade(r,a);r=r15dPauseRun(r);
  r=r15dSelectRunStep(r,1);r=r15dLoadedRunStep(r,r.steps[0].taskId);
  assert.equal(r15dRecordRunGrade(r,a),r)});
 it('receipt ledger remains private to the active station',()=>{
  const r=submit(ready());assert.deepEqual(r.steps.slice(1).map(s=>s.receiptKeys.length),[0,0])});
 it('ledger keys are unique and their count equals attempt count',()=>{
  let r=ready();for(let i=0;i<12;i++)r=submit(r,0,1000+i);
  assert.equal(new Set(r.steps[0].receiptKeys).size,12);
  assert.equal(r.steps[0].receiptKeys.length,r.steps[0].attempts)});
 it('128 genuine attempts are bounded',()=>{
  let r=ready();for(let i=0;i<128;i++)r=submit(r,0,1000+i);
  assert.equal(r.steps[0].attempts,128);assert.equal(r.steps[0].receiptKeys.length,128)});
 it('attempt 129 fails closed instead of dropping old evidence',()=>{
  let r=ready();for(let i=0;i<128;i++)r=submit(r,0,1000+i);
  assert.equal(submit(r,0,4000),r);assert.equal(r.steps[0].attempts,128)});
 it('ledger refuses old replay even when already at capacity',()=>{
  let r=ready(),a=grade(r,0,1000);for(let i=0;i<128;i++)r=submit(r,0,1000+i);
  assert.equal(r15dRecordRunGrade(r,a),r)});
 it('invalid forged ledger cardinality fails closed',()=>{
  const r=submit(ready());const fake={...r,steps:[{...r.steps[0],receiptKeys:[]},...r.steps.slice(1)]};
  assert.equal(r15dRunSummary(fake),null)});
 it('duplicate fabricated ledger keys fail closed',()=>{
  let r=ready();r=submit(r,0,1000);r=submit(r,0,2000);
  const fake={...r,steps:[{...r.steps[0],receiptKeys:[r.steps[0].receiptKeys[0],r.steps[0].receiptKeys[0]]},...r.steps.slice(1)]};
  assert.equal(r15dRunSummary(fake),null)});
 it('altered last receipt key is inconsistent and rejected',()=>{
  const r=submit(ready());const fake={...r,steps:[{...r.steps[0],lastReceiptKey:'fake'},...r.steps.slice(1)]};
  assert.equal(r15dRunSummary(fake),null)});
 it('negative attempt count fails closed',()=>{
  const r=ready();const fake={...r,steps:[{...r.steps[0],attempts:-1},...r.steps.slice(1)]};
  assert.equal(r15dRunSummary(fake),null)});
 it('normal progress summary stays evidence only',()=>{
  const r=submit(ready());const s=r15dRunSummary(r);assert.equal(s.attempts,1);
  assert.equal(s.scoreAuthority,false);assert.equal('mastery' in s,false)});
});
