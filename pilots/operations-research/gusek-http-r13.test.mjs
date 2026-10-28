import assert from 'node:assert/strict';
import {it,describe} from 'node:test';
import {GET,POST} from '../../app/api/pilot/gusek/route.ts';
import {makeGusekTask,trustedGusekModel,solveGusekTask} from './gusek-exam-r13.mjs';
const base='http://localhost/api/pilot/gusek';
const taskGet=async(kind,seed)=>GET(new Request(`${base}?kind=${kind}&seed=${seed}`));
const submit=async(kind,seed,answer)=>POST(new Request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,seed:String(seed),answer})}));
const full=(kind,seed)=>{const t=makeGusekTask(kind,seed),sol=solveGusekTask(t);return {taskKind:kind,mathprog:trustedGusekModel(t),values:sol.values,reportedObjective:sol.objective,hintsUsed:false};};
describe('R13 GUSEK actual Next HTTP route',()=>{
 it('public task does not leak optimum or source key',async()=>{const r=await taskGet('froccs',42);assert.equal(r.status,200);const j=await r.json();assert.equal(j.task.id,'gusek-froccs-42');assert.equal('exemplar'in j.task,false);assert.equal('optimal'in j.task,false);});
 it('rejects wrong kind, seed and query keys',async()=>{for(const [k,s]of[['bad',42],['tablet',4294967296]]){assert.equal((await taskGet(k,s)).status,400);}assert.equal(GET(new Request(base+'?kind=tablet&seed=42&evil=1')).status,400);});
 it('grades exact bounded transport and beverage optima in HTTP',async()=>{for(const kind of ['transport','froccs']){const r=await submit(kind,42,full(kind,42));assert.equal(r.status,200);const g=await r.json();assert.equal(g.status,'FULL_CREDIT',kind);assert.equal(g.points,1,kind);assert.equal(g.taskId,`gusek-${kind}-42`);}});
 it('grades fractional continuous optimum in HTTP',async()=>{const r=await submit('tablet',42,full('tablet',42));assert.equal((await r.json()).points,1);});
 it('returns null instead of 0 for unsupported executable statements',async()=>{const a=full('tablet',42);a.mathprog+='\ninclude "unsafe.mod";';const r=await submit('tablet',42,a);const j=await r.json();assert.equal(j.points,null);assert.equal(j.status,'UNASSESSABLE');});
 it('rejects malformed content types and foreign fields',async()=>{const r=await POST(new Request(base,{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'}));assert.equal(r.status,415);const s=await submit('tablet',42,{...full('tablet',42),extra:1});assert.equal(s.status,400);});
});
