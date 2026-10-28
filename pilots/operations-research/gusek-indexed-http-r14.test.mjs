import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {GET,POST} from '../../app/api/pilot/gusek/route.ts';
import {makeGusekTask,solveGusekTask} from './gusek-exam-r13.mjs';
import {EXAMPLE_INDEXED_MODEL,trustedIndexedData} from './mathprog-indexed-r7.mjs';
import {prepareVerifiedAttempt,appendOnceToChat} from './attempt-service-r9.mjs';

const root='http://localhost/api/pilot/gusek';
const model=()=>EXAMPLE_INDEXED_MODEL.replace('>= 0, <= cap[i,j]','>= 0, integer, <= cap[i,j]');
const full=seed=>{
 const task=makeGusekTask('transport',seed),opt=solveGusekTask(task);
 return {taskKind:'transport',mathprog:model(),
  values:Object.fromEntries(Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>[
   `x[${i+1},${j+1}]`,opt.values[`Raktar${i+1}_Bolt${j+1}`]
  ])).flat()),
  reportedObjective:opt.objective,hintsUsed:false};
};
const submit=async(seed,answer)=>POST(new Request(root,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'transport',seed:String(seed),answer})}));
describe('R14 indexed transport: real HTTP contract and authoritative Practice receipts',()=>{
 it('GET transport serves task-specific indexed starter and trusted data',async()=>{
  const r=GET(new Request(root+'?kind=transport&seed=42'));assert.equal(r.status,200);
  const j=await r.json();assert.match(j.indexed.starter,/var x\{/);
  assert.match(j.indexed.starter,/TODO/);
  assert.equal(j.indexed.dataTemplate,trustedIndexedData(42));
  assert.equal('exemplar' in j.task,false);
  assert.equal('solution' in j.indexed,false);
 });
 it('GET nontransport does not publish indexed fixture',async()=>{
  for(const kind of ['froccs','tablet']){
   const j=await GET(new Request(root+`?kind=${kind}&seed=42`)).json();
   assert.equal('indexed' in j,false);
  }
 });
 it('HTTP accepts verified indexed full-credit answer without special POST keys',async()=>{
  const r=await submit(42,full(42)),j=await r.json();
  assert.equal(r.status,200);assert.equal(j.points,1);
  assert.equal(j.status,'FULL_CREDIT');assert.equal(j.taskId,'gusek-transport-42');
 });
 it('HTTP accepts two other seeded task variants',async()=>{
  for(const seed of [0,99]){const j=await(await submit(seed,full(seed))).json();assert.equal(j.points,1,'seed='+seed);}
 });
 it('HTTP reports zero for missing integer domain',async()=>{
  const a=full(42);a.mathprog=a.mathprog.replace(', integer','');
  const j=await(await submit(42,a)).json();assert.equal(j.points,0);
  assert.equal(j.errors[0],'source_missing_integer_domain');
 });
 it('HTTP refuses unsupported indexed source as unassessable',async()=>{
  const a=full(42);a.mathprog+='\ninclude "foreign.mod";';
  const j=await(await submit(42,a)).json();assert.equal(j.points,null);
  assert.equal(j.status,'UNASSESSABLE');
 });
 it('Practice receipt stores correct indexed dialect, no student source',()=>{
  const a=full(42),chatId='chat_abc123_1234abcd';
  const {receipt,marker}=prepareVerifiedAttempt({chatId,attemptId:'123e4567-e89b-42d3-a456-426614174000',seed:'42',answer:a,at:'2026-10-28T00:00:00Z'});
  assert.equal(receipt.dialect,'gusek_indexed_r14');assert.equal(receipt.points,1);
  assert.equal('mathprog' in receipt,false);assert.doesNotMatch(marker.content,/param supply/);
  const c={id:chatId,kind:'practice',transportAttempts:[],messages:[]};
  const first=appendOnceToChat(c,receipt,marker);const replay=appendOnceToChat(first.record,receipt,marker);
  assert.equal(replay.replayed,true);assert.equal(replay.record.messages.length,1);
  assert.equal(replay.record.transportAttempts.length,1);
 });
 it('Practice indexed incorrect objective is persisted as 0 point, no partial',()=>{
  const a=full(42);a.reportedObjective+=1;
  const r=prepareVerifiedAttempt({chatId:'chat_abc123_1234abcd',attemptId:'123e4567-e89b-42d3-a456-426614174001',seed:'42',answer:a});
  assert.equal(r.receipt.points,0);
  assert.equal(r.receipt.dialect,'gusek_indexed_r14');
 });
});
