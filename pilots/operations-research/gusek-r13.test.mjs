import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {parseGusekModel,verifyGusekModel} from './gusek-model-r13.mjs';
import {makeGusekTask,gradeGusekExam,solveGusekTask,trustedGusekModel} from './gusek-exam-r13.mjs';

const answer=(kind,seed=42)=>{const task=makeGusekTask(kind,seed),sol=solveGusekTask(task);return {task,answer:{taskKind:kind,mathprog:trustedGusekModel(task),values:sol.values,reportedObjective:sol.objective,hintsUsed:false}}};
const grade=(kind,mutate=()=>{},seed=42)=>{const {answer:a}=answer(kind,seed);mutate(a);return gradeGusekExam(kind,seed,a);};
const source=(kind)=>answer(kind).answer.mathprog;

describe('R13 GUSEK scalar GNU MathProg syntax and mathematical grade',()=>{
 it('accepts a named 9-variable integer transport model without solve/end',()=>{const r=parseGusekModel(source('transport'));assert.equal(r.ok,true);assert.equal(r.vars.size,9);assert.equal(r.constraints.length,7);assert.equal(r.objective.sense,'min');});
 it('accepts a 10-variable integer maximize model without solve/end',()=>{const r=parseGusekModel(source('froccs'));assert.equal(r.ok,true);assert.equal(r.vars.size,10);assert.equal(r.objective.sense,'max');});
 it('accepts a 2-variable continuous minimize with inequality directions',()=>{const r=parseGusekModel(source('tablet'));assert.equal(r.ok,true);assert.equal(r.vars.get('epres').integer,false);assert.equal(r.constraints.length,3);});
 it('allows optional solve and end statements',()=>{for(const kind of ['transport','froccs','tablet'])assert.equal(parseGusekModel(source(kind)+'\nsolve;\nend;').ok,true);});
 it('allows CRLF and arbitrary comment accents and spaces',()=>{const s='# Egy gyakorlat: fröccs és tabletta\n'+source('tablet').replaceAll('\n','\r\n');assert.equal(parseGusekModel(s).ok,true);});
 it('allows arbitrary constraint and objective names, reordering and commutativity',()=>{const a=answer('tablet');a.answer.mathprog=a.answer.mathprog.replace('s.t. siker:', 's.t. ellenorzes:').replace('minimize koltseg: 1400*epres + 2100*spenotos','minimize nyereseg: 2100*spenotos + 1400*epres');assert.equal(gradeGusekExam('tablet',42,a.answer).points,1);});
 it('supports equivalent scaled equality in transport',()=>{const a=answer('transport');a.answer.mathprog=a.answer.mathprog.replace(/s\.t\. supply_1: ([^;]+) = (\d+);/,(_whole,expr,num)=>`s.t. renamed: 2*(${expr}) = ${Number(num)*2};`);assert.equal(parseGusekModel(a.answer.mathprog).ok,true);});
 it('scores full credit across all 3 task archetypes (bounded oracles)',()=>{for(const kind of ['froccs','tablet'])assert.equal(grade(kind).points,1,kind);});
 it('source mistakes within grammar yield ZERO not partial credit',()=>{for(const kind of ['froccs','tablet']){const x=grade(kind,a=>a.mathprog=a.mathprog.replace(kind==='froccs'?'maximize':'minimize',kind==='froccs'?'minimize':'maximize'));assert.equal(x.points,0);}});
 it('rejects missing constraint with zero credit',()=>assert.equal(grade('tablet',a=>a.mathprog=a.mathprog.replace(/s\.t\. adag:[^;]*;/,'' )).points,0));
 it('rejects integer domain omitted on drink variables',()=>assert.equal(grade('froccs',a=>a.mathprog=a.mathprog.replace('xKF >=0, integer','xKF >=0')).points,0));
 it('rejects wrong inequality direction',()=>assert.equal(grade('tablet',a=>a.mathprog=a.mathprog.replace('spenotos <= epres','spenotos >= epres')).points,0));
 it('rejects nonoptimal feasible beverage plan',()=>assert.equal(grade('froccs',a=>{for(const n in a.values)a.values[n]=0;a.reportedObjective=0;}).points,0));
 it('rejects objective mismatch in optimal solution',()=>assert.equal(grade('froccs',a=>a.reportedObjective+=1).points,0));
 it('rejects fractional drink quantity',()=>assert.equal(grade('froccs',a=>a.values.xKF=.5).points,0));
 it('rejects infeasible tablet candidate',()=>assert.equal(grade('tablet',a=>{a.values.epres=0;a.values.spenotos=0;a.reportedObjective=0;}).points,0));
 it('untrusted nonlinear multiplication must never be evaluated or certified',()=>assert.equal(grade('tablet',a=>a.mathprog=a.mathprog.replace('1400*epres','1400*epres*spenotos')).points,null));
 it('untrusted file IO and glpsol commands are UNASSESSABLE',()=>{for(const text of ['display epres;', 'printf "x";', 'include "x.mod";', 'table z OUT "x";']){const r=grade('tablet',a=>a.mathprog+=`\n${text}`);assert.equal(r.points,null,text);}});
 it('rejects unsupported indexed set/param syntax without calling glpsol',()=>assert.equal(grade('tablet',a=>a.mathprog='set I;\nparam cost{i in I};').points,null));
 it('binary exam scoring never awards partial marks',()=>{for(const kind of ['froccs','tablet']){const g=grade(kind,a=>a.hintsUsed=true);assert.equal(g.points,0);assert.equal('partialCredit' in g,false);}});
 it('bounded synthetic seeds have deterministic oracles',()=>{for(const kind of ['froccs','tablet'])for(const seed of [0,1,2,13,42,99]){const a=answer(kind,seed),b=answer(kind,seed);assert.deepEqual(a,b);assert.equal(gradeGusekExam(kind,seed,a.answer).points,1);}});
 it('all answers preserve 0/1/null domain',()=>{for(const kind of ['froccs','tablet'])for(const mutate of [()=>{},a=>a.reportedObjective=0,a=>a.mathprog='illegal'])assert.ok([0,1,null].includes(grade(kind,mutate).points));});
});
