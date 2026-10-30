import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {makeGusekTask,gradeGusekExam,solveGusekTask} from './gusek-exam-r13.mjs';
import {indexedTransportData,indexedTransportStarter,gradeIndexedGusekTransport,looksIndexedTransport} from './gusek-indexed-r14.mjs';
import {EXAMPLE_INDEXED_MODEL,trustedIndexedData} from './mathprog-indexed-r7.mjs';

const model=()=>EXAMPLE_INDEXED_MODEL.replace('>= 0, <= cap[i,j]','>= 0, integer, <= cap[i,j]');
const answer=(seed=42)=>{
 const task=makeGusekTask('transport',seed),oracle=solveGusekTask(task);
 const values=Object.fromEntries(Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>[
  `x[${i+1},${j+1}]`,oracle.values[`Raktar${i+1}_Bolt${j+1}`]
 ])).flat());
 return {task,answer:{taskKind:'transport',mathprog:model(),values,reportedObjective:oracle.objective,hintsUsed:false}};
};
const grade=(mutate=()=>{},seed=42)=>{
 const x=answer(seed);mutate(x.answer,x.task);
 return gradeGusekExam('transport',seed,x.answer);
};
describe('R14 indexed GNU MathProg transport exam scoring, full-credit only',()=>{
 it('recognizes indexed transport, not scalar or comments',()=>{
  assert.equal(looksIndexedTransport(model()),true);
  assert.equal(looksIndexedTransport('# set I;\nvar example;'),false);
  assert.equal(looksIndexedTransport('var y >= 0;'),false);
 });
 it('grades correct indexed 3x3 .mod with indexed solution JSON',()=>assert.equal(grade().points,1));
 it('integrated R13 grading routes indexed source without new API fields',()=>{
  assert.equal(grade().status,'FULL_CREDIT');
 });
 it('accepts the existing scalar solution key names with indexed model',()=>{
  assert.equal(grade(a=>{
   const map={};
   for(let i=1;i<=3;i++)for(let j=1;j<=3;j++)map[`Raktar${i}_Bolt${j}`]=a.values[`x[${i},${j}]`];
   a.values=map;
  }).points,1);
 });
 it('accepts solve/end omission in otherwise bounded model',()=>{
  assert.equal(grade(a=>a.mathprog=a.mathprog.replace(/solve;\s*end;\s*$/,'')).points,1);
 });
 it('accepts different attribute ordering and spacing',()=>{
  assert.equal(grade(a=>a.mathprog=a.mathprog.replace('>= 0, integer, <= cap[i,j]','>=0, <=cap[i,j], integer')).points,1);
 });
 it('missing integer type gets exactly zero',()=>{
  const g=grade(a=>a.mathprog=a.mathprog.replace(', integer',''));assert.equal(g.points,0);assert.equal(g.errors[0],'source_missing_integer_domain');
 });
 it('missing route cap gets zero, never a guessed full credit',()=>{
  assert.equal(grade(a=>a.mathprog=a.mathprog.replace(', <= cap[i,j]','')).points,0);
 });
 it('missing supply balance receives zero',()=>{
  assert.equal(grade(a=>a.mathprog=a.mathprog.replace(/s\.t\. supply_balance[^;]*;/,'')).points,0);
 });
 it('incorrect objective direction is never full credit',()=>{
  assert.notEqual(grade(a=>a.mathprog=a.mathprog.replace('minimize total:','maximize total:')).points,1);
 });
 it('unsupported include/source IO is unassessable, never zero',()=>{
  const g=grade(a=>a.mathprog='include "unsafe.mod";\n'+a.mathprog);
  assert.equal(g.points,null);assert.equal(g.status,'UNASSESSABLE');
 });
 it('student-controlled in-band data cannot override the task',()=>{
  const g=grade(a=>a.mathprog+='\ndata; param cost := 0; end;');
  assert.equal(g.points,null);
 });
 it('wrong objective value receives zero',()=>{
  assert.equal(grade(a=>a.reportedObjective+=1).points,0);
 });
 it('fractional integer decision is zero',()=>{
  assert.equal(grade(a=>a.values['x[1,1]']+=0.5).points,0);
 });
 it('infeasible zero allocation is zero',()=>{
  assert.equal(grade(a=>{for(const k in a.values)a.values[k]=0;a.reportedObjective=0;}).points,0);
 });
 it('unapproved hint use earns zero',()=>{
  const g=grade(a=>a.hintsUsed=true);assert.equal(g.points,0);assert.equal('partialCredit' in g,false);
 });
 it('wrong/mixed/missing keys are never full credit',()=>{
  for(const change of [
   a=>delete a.values['x[1,2]'],
   a=>{a.values['Raktar1_Bolt1']=a.values['x[1,1]'];delete a.values['x[1,1]'];},
   a=>{a.values.__proto__=null;a.values.extra=0;}
  ])assert.equal(grade(change).points,0);
 });
 it('six deterministic task variants remain oracle-verified',()=>{
  for(const seed of [0,1,2,13,42,99]){
   const result=grade(()=>{},seed);
   assert.equal(result.points,1,'seed='+seed);
  }
 });
 it('trusted .dat matches reference data generator exactly',()=>{
  for(const seed of [0,13,42]){
   assert.equal(indexedTransportData(makeGusekTask('transport',seed)),trustedIndexedData(seed));
  }
 });
 it('starter has declarations but no answer or solution',()=>{
  const s=indexedTransportStarter();
  assert.match(s,/var x\{/);assert.doesNotMatch(s,/minimize total:/);
  assert.match(s,/TODO/);
 });
});
