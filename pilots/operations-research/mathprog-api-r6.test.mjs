import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {GET,POST} from '../../app/api/pilot/transport/route.ts';
import {makeTransportTask,solveTransportTask} from './transport-exam-r3.mjs';
import {trustedExpandedExample} from './mathprog-expanded-r6.mjs';
const URL='http://localhost/api/pilot/transport';
const post=async(data)=>POST(new Request(URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)}));
function correct(seed=42){const task=makeTransportTask(seed), optimum=solveTransportTask(task);return{seed:String(seed),answer:{mathprog:trustedExpandedExample(task),allocation:optimum.exemplar,reportedObjective:optimum.objective,hintsUsed:false}};}
describe('R6 Next.js API source-level grading without MathProg execution',()=>{
 it('exposes only task not reference source, point total or answer',async()=>{const j=await GET(new Request(URL+'?seed=42')).json();assert.ok(j.task.costs);assert.ok(!Object.hasOwn(j.task,'modelSource'));assert.ok(!Object.hasOwn(j.task,'objective'));assert.ok(!Object.hasOwn(j.task,'exemplar'));});
 it('passes a complete independently verified MathProg source+solution',async()=>{const r=await post(correct());assert.equal(r.status,200);const g=await r.json();assert.equal(g.points,1);assert.equal(g.maxPoints,1);assert.equal(g.dialect,'explicit_3x3_only');assert.equal(g.errors.length,0);});
 it('rejects incorrect MathProg source even with correct optimum',async()=>{const p=correct();p.answer.mathprog=p.answer.mathprog.replace('11 * x00','12 * x00');const g=await (await post(p)).json();assert.equal(g.points,0);assert.equal(g.maxPoints,1);assert.ok(g.errors.some(x=>x.startsWith('source_')));});
 it('rejects unsafe and unsupported file operations or arbitrary MathProg statements',async()=>{const p=correct();p.answer.mathprog=p.answer.mathprog.replace('solve;', 'table t OUT "/tmp/data";\nsolve;');const g=await (await post(p)).json();assert.equal(g.points,null);assert.equal(g.status,'UNASSESSABLE');});
 it('nonstring mathprog cannot be bypassed using a correct JSON model',async()=>{const p=correct();const task=makeTransportTask(42);p.answer.mathprog={evil:true};p.answer.model={...task,nonnegative:true};const g=await(await post(p)).json();assert.equal(g.points,0);});
 it('cannot override scoring with submitted status/points fields',async()=>{const p=correct();p.answer.mathprog='invalid';p.answer.claimedPoints=1;p.answer.status='optimal';const g=await(await post(p)).json();assert.equal(g.points,0);});
 it('valid full MathProg outside the dialect is not falsely scored wrong',async()=>{const p=correct();p.answer.mathprog=p.answer.mathprog.replace('solve;','set I;\nsolve;');const g=await(await post(p)).json();assert.equal(g.points,null);assert.equal(g.status,'UNASSESSABLE');});
 it('old JSON response contract remains valid',async()=>{const p=correct(), task=makeTransportTask(42);delete p.answer.mathprog;p.answer.model={...task,nonnegative:true};const g=await(await post(p)).json();assert.equal(g.points,1);assert.equal(g.maxPoints,1);});
 it('all score responses declare non-proctored status',async()=>{const g=await(await post(correct())).json();assert.equal(g.assessmentScope,'self_reported_practice_not_proctored');});
});
