import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {makeGusekTask,trustedGusekModel,solveGusekTask} from './gusek-exam-r13.mjs';
import {makeGusekScalarStarter} from './gusek-starters-r14z.mjs';
import {parseGusekModel} from './gusek-model-r13.mjs';
const tasks=['transport','froccs','tablet'];
describe('R14Z safe GNU MathProg scalar starter across all exam kinds',()=>{
 it('provides 9 transport decision variables without supplying objective',()=>{
  const source=makeGusekScalarStarter(makeGusekTask('transport',42));
  assert.equal((source.match(/^var /gm)||[]).length,9);
  assert.match(source,/Raktar1_Bolt1/);
  assert.match(source,/# TODO: minimize/);
  assert.doesNotMatch(source,/^minimize /m);
 });
 it('provides 10 integer wine-product variables with homework left to learner',()=>{
  const source=makeGusekScalarStarter(makeGusekTask('froccs',42));
  assert.equal((source.match(/^var /gm)||[]).length,10);
  assert.match(source,/var xKF >= 0, integer/);
  assert.doesNotMatch(source,/^maximize /m);
 });
 it('keeps tablet variables continuous without giving the optimal mixture',()=>{
  const source=makeGusekScalarStarter(makeGusekTask('tablet',42));
  assert.match(source,/var epres >= 0;/);
  assert.match(source,/var spenotos >= 0;/);
  assert.doesNotMatch(source,/^var .*integer/m);
  assert.doesNotMatch(source,/^minimize /m);
 });
 it('all starts contain real MathProg end markers but incomplete models',()=>{
  for(const kind of tasks){
   const src=makeGusekScalarStarter(makeGusekTask(kind,42));
   assert.match(src,/\nsolve;\nend;\n$/);
   assert.equal(parseGusekModel(src).ok,false);
  }
 });
 it('the trusted finished model differs from every learner starter',()=>{
  for(const kind of tasks){
   const task=makeGusekTask(kind,42),starter=makeGusekScalarStarter(task);
   assert.notEqual(starter,trustedGusekModel(task));
   assert.doesNotMatch(starter,/^s\.t\.\s+[A-Za-z]/m);
  }
 });
 it('different seeds never reveal hidden optimum or data coefficients',()=>{
  for(const kind of tasks){
   const a=makeGusekScalarStarter(makeGusekTask(kind,0));
   const b=makeGusekScalarStarter(makeGusekTask(kind,42));
   assert.equal(a,b);
   const sol=solveGusekTask(makeGusekTask(kind,42));
   assert.ok(sol.objective>=0);
   assert.equal(a.includes('objective: '+sol.objective),false);
  }
 });
 it('rejects malformed trusted task and arbitrary variable identifiers',()=>{
  for(const task of [null,{}, {kind:'froccs',variableNames:['name; include secret.mod']},
   {kind:'tablet',variableNames:['x','x']},{kind:'other',variableNames:['x']}])
   assert.throws(()=>makeGusekScalarStarter(task),/invalid_trusted_task_starter/);
 });
 it('produces bounded, reproducible source files for every supported task',()=>{
  for(const kind of tasks)for(const seed of [0,1,42,99]){
   const task=makeGusekTask(kind,seed),source=makeGusekScalarStarter(task);
   assert.equal(source,makeGusekScalarStarter(task));
   assert.ok(Buffer.byteLength(source)<8192);
  }
 });
});
