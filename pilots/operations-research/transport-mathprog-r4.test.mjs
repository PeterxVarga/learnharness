import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {seededTransportToLinearProblem,seededTransportMathProg,seededTransportWitness} from './transport-mathprog-r4.mjs';
import {makeTransportTask} from './transport-exam-r3.mjs';
describe('R4 synthetic MathProg safely generated from trusted JSON',()=>{
 it('nine bounded variables and six balance equalities',()=>{const p=seededTransportToLinearProblem(42);assert.equal(p.variables.length,9);assert.equal(p.constraints.length,6);assert.ok(p.variables.every(v=>v.type==='continuous'&&v.lower===0));assert.ok(p.constraints.every(c=>c.op==='='));});
 it('costs and caps match the task exactly',()=>{const task=makeTransportTask(42),p=seededTransportToLinearProblem(42);for(let i=0;i<3;i++)for(let j=0;j<3;j++){const id=`x${i}${j}`;assert.equal(p.objective[id],task.costs[i][j]);assert.equal(p.variables.find(v=>v.id===id).upper,task.capacities[i][j]);}});
 it('row supply constraints have exactly three variables',()=>{const t=makeTransportTask(51),p=seededTransportToLinearProblem(51);for(let i=0;i<3;i++){const c=p.constraints[i];assert.equal(c.rhs,t.supply[i]);assert.deepEqual(Object.keys(c.coefficients),[`x${i}0`,`x${i}1`,`x${i}2`]);}});
 it('column demand constraints have exactly three variables',()=>{const t=makeTransportTask(51),p=seededTransportToLinearProblem(51);for(let j=0;j<3;j++){const c=p.constraints[j+3];assert.equal(c.rhs,t.demand[j]);assert.deepEqual(Object.keys(c.coefficients),[`x0${j}`,`x1${j}`,`x2${j}`]);}});
 it('renders actual valid-looking MathProg without model text injection',()=>{const text=seededTransportMathProg(42);assert.match(text,/minimize objective:/);assert.match(text,/s\.t\. c_s0:/);assert.match(text,/s\.t\. c_d2:/);assert.match(text,/solve;\nend;\n$/);assert.doesNotMatch(text,/(?:printf|table|shell|system\s*\()/);});
 it('invalid seeds fail before interpolation',()=>{for(const s of ['42',-1,2**32,NaN,0.5])assert.throws(()=>seededTransportMathProg(s));});
 it('witness satisfies every translated LP constraint and objective',()=>{for(let s=0;s<100;s++){const p=seededTransportToLinearProblem(s),w=seededTransportWitness(s);const x=Object.fromEntries(w.flow.flatMap((row,i)=>row.map((v,j)=>[`x${i}${j}`,v])));for(const v of p.variables){assert.ok(x[v.id]>=v.lower&&x[v.id]<=v.upper);}for(const c of p.constraints){assert.equal(Object.entries(c.coefficients).reduce((z,[id,a])=>z+a*x[id],0),c.rhs);}assert.equal(Object.entries(p.objective).reduce((z,[id,a])=>z+a*x[id],0),w.objective);}});
 it('generation is repeatable for 100 seeds',()=>{for(let s=0;s<100;s++)assert.equal(seededTransportMathProg(s),seededTransportMathProg(s));});
});
