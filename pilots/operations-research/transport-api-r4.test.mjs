import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {GET,POST} from '../../app/api/pilot/transport/route.ts';
import {makeTransportTask,solveTransportTask} from './transport-exam-r3.mjs';
const URL='http://localhost/api/pilot/transport';
const get=(query='seed=42')=>GET(new Request(`${URL}?${query}`));
const post=(body,headers={})=>POST(new Request(URL,{method:'POST',headers:{'content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}));
const correct=(seed=42)=>{const t=makeTransportTask(seed),o=solveTransportTask(t);return{seed:String(seed),answer:{model:{sense:t.sense,nonnegative:true,supply:t.supply,demand:t.demand,costs:t.costs,capacities:t.capacities},allocation:o.exemplar,reportedObjective:o.objective,hintsUsed:false}}};
describe('R4 Next.js HTTP route actual fetch-like end-to-end',()=>{
 it('GET emits task but never optimum or exemplar',async()=>{const r=get();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store, private');const j=await r.json();assert.equal(j.task.id,'synthetic-transport-r3-42');assert.equal(j.task.supply.length,3);assert.equal('exemplar' in j.task,false);assert.equal('objective' in j.task,false);});
 it('GET rejects invalid, duplicated and extra seed input',()=>{for(const q of ['seed=','seed=-1','seed=4294967296','seed=NaN','seed=42&seed=43','seed=42&debug=true'])assert.equal(get(q).status,400,q);});
 it('POST full correct independent synthetic solution receives exactly 1/1',async()=>{const r=await post(correct());assert.equal(r.status,200);const j=await r.json();assert.equal(j.points,1);assert.equal(j.maxPoints,1);assert.equal(j.correct,true);assert.equal(j.assessmentScope,'self_reported_practice_not_proctored');assert.equal('partialCredit' in j,false);});
 it('POST feasible wrong optimum or altered model receives zero',async()=>{const p=correct();p.answer.reportedObjective+=1;const j=await(await post(p)).json();assert.equal(j.points,0);assert.ok(j.errors.includes('objective_mismatch'));p.answer.reportedObjective-=1;p.answer.model.costs[0][0]+=1;assert.equal((await(await post(p)).json()).points,0);});
 it('POST never awards independent credit on hints-used or missing metadata',async()=>{const p=correct();p.answer.hintsUsed=true;assert.equal((await(await post(p)).json()).points,0);delete p.answer.hintsUsed;assert.equal((await(await post(p)).json()).points,0);});
 it('POST refuses untrusted user-specified outcome and scorer flags',async()=>{const p={...correct(),points:1};assert.equal((await post(p)).status,400);p.seed='42';delete p.points;p.answer.status='optimal';p.answer.claimedPoints=999;assert.equal((await(await post(p)).json()).points,1);});
 it('POST limits request size even without content-length header',async()=>{const body=JSON.stringify({seed:'42',answer:{padding:'x'.repeat(70_000)}});const r=await post(body);assert.equal(r.status,413);assert.equal((await r.json()).error,'body_too_large');});
 it('POST rejects non-JSON, malformed JSON, bad payload and seed',async()=>{assert.equal((await post('{bad')).status,400);assert.equal((await post([])).status,400);assert.equal((await post({seed:42,answer:{}})).status,400);assert.equal((await post(correct(),{'content-type':'text/plain'})).status,415);});
 it('all server replies are explicitly no-store',async()=>{for(const r of [get(),get('seed=-1'),await post(correct()),await post('{bad')])assert.equal(r.headers.get('cache-control'),'no-store, private');});
});
