import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {makeTransportTask,solveTransportTask} from './transport-exam-r3.mjs';
import {assessExpandedMathProg,gradeExpandedMathProg,trustedExpandedExample} from './mathprog-expanded-r6.mjs';
function check(seed=42){const task=makeTransportTask(seed), oracle=solveTransportTask(task);return{task, source:trustedExpandedExample(task), answer:{mathprog:trustedExpandedExample(task),allocation:oracle.exemplar,reportedObjective:oracle.objective,hintsUsed:false}};}
function zero(change){const x=check();change(x.answer);const g=gradeExpandedMathProg(42,x.answer);assert.equal(g.points,0);assert.equal(g.maxPoints,1);return g;}
function failSource(newText){const {task}=check();const r=assessExpandedMathProg(task,newText);assert.equal(r.ok,false,`Unexpectedly accepted: ${newText.slice(0,400)}`);return r.code;}
describe('R6 restricted expanded MathProg source grading, zero partial credit',()=>{
 it('passes complete mathematically correct source and optimum',()=>{const {answer}=check();const g=gradeExpandedMathProg(42,answer);assert.equal(g.points,1);assert.equal(g.maxPoints,1);assert.equal(g.errors.length,0);});
 it('passes correct 3x3 tasks for 120 seeded variants',()=>{for(let s=0;s<120;s++)assert.equal(gradeExpandedMathProg(s,check(s).answer).points,1,`seed ${s}`);});
 it('accepts source with different objective term order',()=>{const {task,source}=check();const full=task.costs.flatMap((row,i)=>row.map((v,j)=>`${v} * x${i}${j}`)).reverse().join(' + ');assert.equal(assessExpandedMathProg(task,source.replace(/minimize total_cost:[^;]+;/,`minimize z: ${full};`)).ok,true);});
 it('accepts equality scaling and reversed sign, independently of constraint names',()=>{const {task,source}=check();const mod=source.replace(`s.t. supply_0: x00 + x01 + x02 = ${task.supply[0]};`,`s.t. renamed_one: -2*x02 - 2*x00 - 2*x01 = ${-2*task.supply[0]};`);assert.equal(assessExpandedMathProg(task,mod).ok,true);});
 it('accepts inline hash comments and whitespace changes',()=>{const {task,source}=check();assert.equal(assessExpandedMathProg(task,`# safe comment\n${source.replace('minimize total_cost:', 'minimize z:\n ')}`).ok,true);});
 it('rejects an omitted balance equality despite correct optimum',()=>{const {answer}=check();answer.mathprog=answer.mathprog.replace(/^s\.t\. demand_2:[^\n]*\n/m,'');assert.ok(zero(x=>x.mathprog=answer.mathprog).errors.some(s=>s.startsWith('source_')));});
 it('rejects a duplicate balance equation substituted for another',()=>{const {source,task}=check();failSource(source.replace(`s.t. demand_2: x02 + x12 + x22 = ${task.demand[2]};`,`s.t. forged: x00 + x01 + x02 = ${task.supply[0]};`));});
 it('rejects a duplicate constraint label which GLPK would reject',()=>{const {source}=check();assert.equal(failSource(source.replace('s.t. demand_2:', 's.t. supply_1:')),'duplicate_constraint_name');});
 it('rejects objective coefficient changed even if allocation happens to match',()=>{const {answer}=check();zero(x=>x.mathprog=x.mathprog.replace('11 * x00','12 * x00'));});
 it('rejects a sign error in the objective',()=>{const {source}=check();failSource(source.replace('11 * x00','-11 * x00'));});
 it('rejects duplicate or missing variable declaration',()=>{const {source}=check();failSource(source.replace('var x22','var x21'));failSource(source.replace(/^var x22[^\n]*\n/m,''));});
 it('rejects missing nonnegativity and missing/corrupted route capacity',()=>{const {source}=check();failSource(source.replace('var x02 >= 0, <= 2;','var x02 >= -1, <= 2;'));failSource(source.replace('var x02 >= 0, <= 2;','var x02 >= 0, <= 3;'));failSource(source.replace('var x02 >= 0, <= 2;','var x02 >= 0;'));});
 it('rejects added unexpected statements instead of silently ignoring them',()=>{const {source}=check();for(const payload of ['printf "oops";','table t OUT "/tmp/a";','include "x.mod";','data;','display x00;'])failSource(source.replace('solve;',payload+'\nsolve;'));});
 it('rejects set param sum and indexed arbitrary MathProg (not yet supported)',()=>{const {source}=check();for(const payload of ['set I;','param cost{I};','var x{1..3,1..3};','sum{i in 1..3} x[i,1];'])failSource(source.replace('solve;',payload+'\nsolve;'));});
 it('rejects extra junk, unrecognized operator and shell injection',()=>{const {source}=check();for(const payload of [' + system(1)',' + x00/x01',' + x00 ^ 2',' + x99'])failSource(source.replace(/minimize total_cost:([^;]+);/,(_,expr)=>`minimize total_cost:${expr}${payload};`));});
 it('rejects malformed parentheses, multiline misplaced solve, no end',()=>{const {source}=check();failSource(source.replace('11 * x00','(11) * x00'));failSource(source.replace('solve;\nend;','end;\nsolve;'));failSource(source.replace('end;',''));});
 it('rejects objective mismatch despite correct source and feasible plan',()=>{const g=zero(x=>x.reportedObjective+=1);assert.ok(g.errors.includes('objective_mismatch'));});
 it('rejects a feasible but suboptimal transport plan',()=>{const {task,answer}=check();const optimal=answer.reportedObjective;let found=false;for(let i=0;i<3&&!found;i++)for(let j=0;j<3&&!found;j++)for(let k=0;k<3&&!found;k++)for(let l=0;l<3&&!found;l++){
  if(i===k||j===l)continue;const x=structuredClone(answer.allocation);if(x[i][j]<1||x[k][l]<1)continue;
  x[i][j]--;x[k][l]--;x[i][l]++;x[k][j]++;
  if(x.some((r,ii)=>r.some((v,jj)=>v>task.capacities[ii][jj])))continue;
  const cost=x.reduce((acc,r,ii)=>acc+r.reduce((sum,v,jj)=>sum+v*task.costs[ii][jj],0),0);if(cost<=optimal)continue;
  found=true;const g=zero(a=>{a.allocation=x;a.reportedObjective=cost});assert.ok(g.errors.includes('not_optimal'));
 }assert.ok(found);});
 it('rejects hints-used or missing metadata, even with a perfect model',()=>{zero(x=>x.hintsUsed=true);zero(x=>delete x.hintsUsed);});
 it('rejects unsafe-length text and non-text input',()=>{const {task}=check();assert.equal(assessExpandedMathProg(task,'x'.repeat(17_000)).ok,false);assert.equal(assessExpandedMathProg(task,{}).ok,false);});
 it('ignores alleged score/status fields in learner answer',()=>{const {answer}=check();answer.status='optimal';answer.claimedPoints=999;assert.equal(gradeExpandedMathProg(42,answer).points,1);answer.mathprog='';assert.equal(gradeExpandedMathProg(42,answer).points,0);});
 it('unsupported valid MathProg set/param is UNASSESSABLE rather than a false zero',()=>{const {answer}=check();answer.mathprog=answer.mathprog.replace('solve;','set I;\nsolve;');const g=gradeExpandedMathProg(42,answer);assert.equal(g.status,'UNASSESSABLE');assert.equal(g.points,null);assert.equal(g.correct,null);});
 it('omitting a balance equation is still definitively zero, not unassessable',()=>{const {answer}=check();answer.mathprog=answer.mathprog.replace(/^s\.t\. demand_2:[^\n]*\n/m,'');const g=gradeExpandedMathProg(42,answer);assert.equal(g.status,'ZERO_CREDIT');assert.equal(g.points,0);});

});
