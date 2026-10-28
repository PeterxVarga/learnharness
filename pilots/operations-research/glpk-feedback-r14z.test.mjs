import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {classifyGlpkFeedback} from './glpk-feedback-r14z.mjs';
const optimum={status:'GLPK_COMPLETED',graded:false,points:null,mode:'solve',solverStatus:'OPTIMAL',
 columnStatus:'OPTIMAL_COLUMNS',columns:[{name:'x',value:4}],objective:4};
const verdict=(patch={})=>classifyGlpkFeedback({...optimum,...patch});
describe('R14Z GLPK learner-facing feedback: never grading authority',()=>{
 it('explains missing result with no exam score',()=>{
  const f=classifyGlpkFeedback(null);
  assert.equal(f.code,'NOT_RUN');assert.equal(f.scoreAuthority,false);
 });
 it('rejects forged scored GLPK results',()=>{
  assert.equal(verdict({points:1}).code,'INVALID_RESULT');
  assert.equal(verdict({graded:true}).code,'INVALID_RESULT');
 });
 it('explains a confirmed optimum without awarding credit',()=>{
  const f=verdict();assert.equal(f.code,'OPTIMAL');
  assert.equal(f.level,'success');assert.equal(f.scoreAuthority,false);
  assert.match(f.detail,/nem igazolja/);
 });
 it('no machine columns means no transferable optimum',()=>{
  assert.equal(verdict({columnStatus:'INVALID_MACHINE_OUTPUT'}).code,'OPTIMAL_WITHOUT_COLUMNS');
  assert.equal(verdict({columns:[]}).code,'OPTIMAL_WITHOUT_COLUMNS');
 });
 it('infeasible solution is not an optimum',()=>{
  assert.equal(verdict({solverStatus:'INFEASIBLE'}).code,'INFEASIBLE');
 });
 it('unbounded solution is reported as distinct problem',()=>{
  assert.equal(verdict({solverStatus:'UNBOUNDED'}).code,'UNBOUNDED');
 });
 it('feasible but nonoptimal remains not transferable',()=>{
  assert.equal(verdict({solverStatus:'FEASIBLE_NOT_PROVEN_OPTIMAL'}).code,'NONOPTIMAL');
 });
 it('unknown/undefined solution state stays separate',()=>{
  for(const s of ['UNKNOWN','UNDEFINED'])assert.equal(verdict({solverStatus:s}).code,'UNKNOWN_SOLUTION');
 });
 it('check-only model translation does not claim optimality',()=>{
  const f=verdict({mode:'check',solverStatus:'UNKNOWN',columns:[]});
  assert.equal(f.code,'TRANSLATED');assert.equal(f.scoreAuthority,false);
 });
 it('syntax errors are recognized only as compile failures',()=>{
  const f=verdict({status:'GLPK_ERROR',diagnostic:'/input/model.mod:7: syntax error in model section'});
  assert.equal(f.code,'SOURCE_ERROR');assert.match(f.nextAction,/sorszámot/);
 });
 it('arbitrary stdout containing ERROR does not become syntax error',()=>{
  assert.equal(verdict({status:'GLPK_ERROR',diagnostic:'bad external runtime'}).code,'SOLVER_ERROR');
 });
 it('cancellation and timeout are distinguished',()=>{
  assert.equal(verdict({status:'CANCELLED'}).code,'CANCELLED');
  assert.equal(verdict({status:'TIME_LIMIT'}).code,'TIME_LIMIT');
 });
 it('blocked native execution remains a harmless unavailable result',()=>{
  assert.equal(verdict({status:'BLOCKED'}).code,'BLOCKED');
 });
 it('unknown HTTP response or solver kind does not certify a solution',()=>{
  assert.equal(verdict({status:'BROKEN'}).code,'UNKNOWN_STATUS');
  assert.equal(verdict({mode:'solve',solverStatus:'not-a-glpk-status'}).code,'MISSING_SOLUTION');
 });
 it('all outcomes return bounded, user-oriented strings and no score field',()=>{
  const outcomes=[classifyGlpkFeedback(null),verdict(),verdict({status:'CANCELLED'}),
   verdict({status:'GLPK_ERROR',diagnostic:'syntax error'}),verdict({solverStatus:'INFEASIBLE'}),
   verdict({solverStatus:'UNBOUNDED'}),verdict({solverStatus:'FEASIBLE_NOT_PROVEN_OPTIMAL'})];
  for(const f of outcomes){
   assert.equal(f.scoreAuthority,false);
   assert.equal('points' in f,false);
   for(const key of ['title','detail','nextAction']){
    assert.equal(typeof f[key],'string');assert.ok(f[key].length>8&&f[key].length<500);
   }
  }
 });
});
