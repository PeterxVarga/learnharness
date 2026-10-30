import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {r15SessionOutcome,r15HistoryOutcome,r15ObservedOutcomes} from './adaptive-practice-r15.mjs';
import {r15bDiagnosticBrief} from './adaptive-diagnostics-r15b.mjs';
const valid=(points,error='objective_mismatch',kind='transport',seed=42)=>({
 taskId:'gusek-'+kind+'-'+seed,points,maxPoints:1,
 correct:points===null?null:points===1,errors:points===1?[]:[error]
});
const item=(points,error,kind='transport',seed=42,time=1000,hints=false)=>
 r15SessionOutcome(valid(points,error,kind,seed),{kind,seed,at:time,hintsUsed:hints});
const brief=(session,history=[])=>r15bDiagnosticBrief({session,history});
const historic=(points,error='objective_mismatch',seed=42,id='123e4567-e89b-42d3-a456-426614174000')=>({
 ...valid(points,error,'transport',seed),id,seed,
 status:points===1?'FULL_CREDIT':points===0?'ZERO_CREDIT':'UNASSESSABLE',
 submittedAt:'2026-10-30T09:00:00.000Z'
});
describe('R15B deterministic repeated-error diagnosis, without score or mastery authority',()=>{
 it('empty history produces no plan',()=>assert.equal(brief([]),null));
 it('rejected junk is never a plan',()=>assert.equal(brief([{points:5,kind:'transport'}]),null));
 it('zero grade produces exactly three steps',()=>{const p=brief([item(0)]);assert.equal(p.state,'repair');assert.equal(p.steps.length,3);});
 it('objective mismatch prioritizes computation rather than exposing optimum',()=>{const p=brief([item(0)]);assert.equal(p.topic,'Célfüggvény számítása');assert.doesNotMatch(JSON.stringify(p),/1400|example\.mod|exemplar/);});
 it('transport missing supply is actionable',()=>assert.equal(brief([item(0,'source_missing_supply_balance')]).topic,'Kínálati mérleg'));
 it('transport missing demand is actionable',()=>assert.equal(brief([item(0,'source_missing_demand_balance')]).topic,'Keresleti mérleg'));
 it('transport route capacity is actionable',()=>assert.equal(brief([item(0,'source_missing_route_capacity')]).topic,'Útvonal-kapacitás'));
 it('transport wrong objective is actionable',()=>assert.equal(brief([item(0,'source_wrong_objective')]).topic,'Célfüggvény'));
 it('scalar wrong variables is actionable',()=>assert.equal(brief([item(0,'source_wrong_variables','froccs',42,1000)]).topic,'Döntési változók'));
 it('tablet constraints actionable without transport claims',()=>assert.equal(brief([item(0,'source_wrong_constraint','tablet',42,1000)]).topic,'Feltételek'));
 it('tablet transport-specific error does not invent a route',()=>assert.equal(brief([item(0,'source_missing_route_capacity','tablet',42,1000)]).topic,'Teljes modell újraellenőrzése'));
 it('froccs transport-specific balance error is generic',()=>assert.equal(brief([item(0,'source_missing_supply_balance','froccs',42,1000)]).topic,'Teljes modell újraellenőrzése'));
 it('prior repeated error outranks later one-off error within last grade',()=>{
  const s=[item(0,'source_missing_supply_balance','transport',39,1000),
   item(0,'source_missing_supply_balance','transport',40,2000),
   r15SessionOutcome({...valid(0,'objective_mismatch'),errors:['objective_mismatch','source_missing_supply_balance']},
    {kind:'transport',seed:41,at:3000,hintsUsed:false})];
  const p=brief(s);assert.equal(p.topic,'Kínálati mérleg');assert.equal(p.repeatCount,3);
 });
 it('repeated unrelated error not in latest grade cannot hijack focus',()=>{
  const p=brief([item(0,'source_missing_supply_balance','transport',39,1000),item(0,'objective_mismatch','transport',40,2000)]);
  assert.equal(p.topic,'Célfüggvény számítása');assert.equal(p.repeatCount,1);
 });
 it('repeat counts do not include unassessable results',()=>{
  const p=brief([item(null,'source_missing_supply_balance','transport',39,1000),item(0,'source_missing_supply_balance','transport',40,2000)]);
  assert.equal(p.repeatCount,1);assert.equal(p.unassessable,1);
 });
 it('repeat counts stay confined to the same task kind',()=>{
  const p=brief([item(0,'source_wrong_objective','froccs',40,1000),item(0,'source_wrong_objective','transport',41,2000)]);
  assert.equal(p.repeatCount,1);assert.equal(p.kindAttempts,1);
 });
 it('unassessable is not incorrect and suggests checker-aware explanation',()=>{
  const p=brief([item(null,'source_unsupported_expression')]);
  assert.equal(p.state,'unsupported');assert.equal(p.repeatCount,0);
  assert.match(p.steps.join(' '),/nem állítás|nem.*helyesség/i);
 });
 it('success does not claim competence',()=>{
  const p=brief([item(1)]);assert.equal(p.state,'complete');assert.equal(p.steps.length,3);
  assert.doesNotMatch(JSON.stringify(p),/mastery|kész vagy|garantált/i);
 });
 it('assistance is self-reported even after successful attempt',()=>{
  const p=brief([item(1,undefined,'transport',42,1000,false)]);
  assert.equal(p.helpProvenance,'self_reported');
 });
 it('historical successful grade preserves unknown help status',()=>{
  const p=brief([], [historic(1)]);assert.equal(p.helpProvenance,'unknown');assert.equal(p.selfReportedUnaidedFull,0);
 });
 it('older history does not override a newer session outcome',()=>{
  const p=brief([item(0,'objective_mismatch','tablet',43,Date.parse('2026-10-30T10:00:00Z'))],[historic(1)]);
  assert.equal(p.kind,'tablet');assert.equal(p.state,'repair');
 });
 it('duplicate history+session id is counted once',()=>{
  const h=historic(0);
  const s={...item(0,'objective_mismatch','transport',42,Date.parse(h.submittedAt)),id:h.id};
  assert.equal(brief([s],[h]).observed,1);
 });
 it('wrong history task ID never becomes evidence',()=>{
  const bad={...historic(0),taskId:'malicious-task-42'};
  assert.equal(brief([],[bad]),null);
 });
 it('strange markup in error code is rejected upstream',()=>{
  const bad=r15SessionOutcome(valid(0,'<svg onload=alert(1)>'),{kind:'transport',seed:42,at:1000,hintsUsed:false});
  assert.equal(bad,null);assert.equal(brief([bad]),null);
 });
 it('unknown safe error is not echoed into topic or steps',()=>{
  const p=brief([item(0,'my_very_secret_canary')]);
  assert.equal(p.topic,'Teljes modell újraellenőrzése');
  assert.doesNotMatch(JSON.stringify(p),/my_very_secret_canary/);
 });
 it('a single assessment is never partial credit',()=>{
  const p=brief([item(0)]);
  assert.equal(p.scoreAuthority,false);assert.equal(p.autoStart,false);
  assert.equal('points' in p,false);
 });
 it('output count is bounded to 48 valid outcomes',()=>{
  const many=Array.from({length:80},(_,i)=>item(0,'objective_mismatch','transport',i,i*1000));
  assert.equal(brief(many).observed,48);
 });
 it('an unassessable last attempt supersedes earlier wrong-model advice',()=>{
  const p=brief([item(0,'source_wrong_objective','transport',42,1000),item(null,'source_unsupported_expression','transport',43,2000)]);
  assert.equal(p.state,'unsupported');assert.equal(p.repeatCount,0);
 });
 it('last complete attempt does not continue assigning repair for earlier errors',()=>{
  const p=brief([item(0,'source_wrong_objective','transport',42,1000),item(1,undefined,'transport',43,2000)]);
  assert.equal(p.state,'complete');assert.equal(p.repeatCount,0);
 });
 it('no raw .mod strings or hidden optimum in output',()=>{
  const p=brief([item(0,'solution_constraint_violation')]);
  const json=JSON.stringify(p);
  for(const secret of ['var Raktar1_Bolt1','model.mod','solutionListing','answerSha256','secret_token'])
   assert.equal(json.includes(secret),false);
 });
 it('dedupe collector remains a single shared normalization contract',()=>{
  const h=historic(0);
  assert.equal(r15HistoryOutcome(h).assistance,'unknown');
  assert.equal(r15ObservedOutcomes({history:[h]}).length,1);
 });
});
