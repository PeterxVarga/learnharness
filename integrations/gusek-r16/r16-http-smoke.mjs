/** Owner-initiated real local Next HTTP smoke, requires a completed production build.
 * No external model calls, GLPK, account mutation or deployment. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.argv[2] ? resolve(process.argv[2]) : null;
if (!root) { console.error('Usage: node r16-http-smoke.mjs /absolute/path/to/assembled'); process.exit(2); }
const receipt=JSON.parse(readFileSync(resolve(root,'../evidence/assembly.json'),'utf8'));
const addonPrefix = receipt.addon_namespace || '';
const { trustedGusekModel, solveGusekTask } = await import(pathToFileURL(resolve(root,addonPrefix,'pilots/operations-research/gusek-exam-r13.mjs')));
const getFreePort = () => new Promise((resolvePort,reject) => {
  const server=createServer();
  server.on('error',reject);
  server.listen(0,'127.0.0.1',()=>{
    const port=server.address()?.port;
    server.close(e=>e?reject(e):resolvePort(port));
  });
});
const port=await getFreePort();
const url=`http://127.0.0.1:${port}`;
const environment={...process.env,LH_GLPK_ENABLE_LOCAL:'0',NEXT_TELEMETRY_DISABLED:'1'};
const child=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{
  cwd:root,env:environment,stdio:['ignore','pipe','pipe'],detached:false,
});
let output='';
child.stdout.on('data',x=>output+=(x.toString().slice(0,5000)));
child.stderr.on('data',x=>output+=(x.toString().slice(0,5000)));
const cleanup=()=>{
  if(child.exitCode===null){child.kill('SIGTERM');}
};
for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>{cleanup();process.exit(128);});
async function ready(){
  for(let i=0;i<120;i++){
    if(child.exitCode!==null)throw Error('Next exited early: '+output.slice(-3000));
    try {const res=await fetch(`${url}/api/pilot/gusek?kind=tablet&seed=42`,{signal:AbortSignal.timeout(1000)});
      if(res.ok)return;
    } catch {};
    await sleep(250);
  }
  throw Error('Next did not become ready: '+output.slice(-3000));
}
try {
  await ready();
  const response=await fetch(`${url}/api/pilot/gusek?kind=tablet&seed=42`);
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.equal(payload.schema,'learnharness.gusek-task.r13');
  assert.equal(payload.task.id,'gusek-tablet-42');
  assert.ok(!('solution' in payload) && !('oracle' in payload),'GET must not leak reference solution');
  const optimal=solveGusekTask(payload.task);
  assert.equal(optimal.status,'optimal');
  const input={ kind:'tablet', seed:'42', answer:{
    taskKind:'tablet',mathprog:trustedGusekModel(payload.task),
    values:optimal.values,reportedObjective:optimal.objective,hintsUsed:false,
  }};
  async function grade(value){
    const result=await fetch(`${url}/api/pilot/gusek`,{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
    assert.equal(result.status,200);
    return result.json();
  }
  const full=await grade(input);
  assert.equal(full.points,1,'server oracle should award exactly one point');
  assert.equal(full.correct,true);
  const assisted=await grade({...input,answer:{...input.answer,hintsUsed:true}});
  assert.equal(assisted.points,0,'assisted work cannot earn independent full credit');
  const wrong=await grade({...input,answer:{...input.answer,mathprog:'invalid syntax;'}});
  assert.notEqual(wrong.points,1,'malformed model must never earn full credit');
  const invalidSeed=await fetch(`${url}/api/pilot/gusek?kind=tablet&seed=-1`);
  assert.equal(invalidSeed.status,400,'invalid seed must be rejected');
  const native=await fetch(`${url}/api/pilot/gusek/native`);
  if(receipt.native_route_installed===true){
    assert.equal(native.status,200,'Local-only native route should report disabled capability');
    const info=await native.json();
    assert.equal(info.available,false,'Qualification must not enable the native runner');
    assert.equal(info.scoreAuthority,false,'Native solver must never award points');
  } else {
    assert.equal(native.status,404,'Native route must be absent without opt-in');
  }
  const page=await fetch(`${url}/pilot/gusek`);
  assert.equal(page.status,200,'standalone page must render');
  const html=await page.text();
  assert.match(html,/GUSEK|MathProg/);
  // R16.10 real source/parser/Next integration, not synthetic-only.
  if (receipt.profile==='workbench') {
    const {orReference} = await import(pathToFileURL(resolve(root,addonPrefix,'domain/or-domain-r1610.mjs')));
    const orPost=async body=>{
      const res=await fetch(`${url}/api/pilot/gusek/szakmai`,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      assert.equal(res.status,200);return res.json();
    };
    for(const kind of ['assignment','production']){
      const get=await fetch(`${url}/api/pilot/gusek/szakmai?kind=${kind}&seed=42`);
      assert.equal(get.status,200,`R16.10 ${kind} GET`);
      const item=await get.json();
      assert.equal(item.task.id,`or-${kind}-42`);
      assert.ok(!('solution' in item)&&!('oracle' in item)&&!('exemplar' in item));
      assert.ok(item.starter.includes('TODO'));
      const t=item.task;
      // Independent golden scalar source, not a client-exposed answer key.
      const src=kind==='assignment'?[...t.variableNames.map(n=>`var ${n} binary;`),
        ...[0,1,2].map(i=>`s.t. worker_${i}: ${[0,1,2].map(j=>`a${i+1}${j+1}`).join(' + ')} = 1;`),
        ...[0,1,2].map(j=>`s.t. job_${j}: ${[0,1,2].map(i=>`a${i+1}${j+1}`).join(' + ')} = 1;`),
        `minimize total: ${t.variableNames.map((n,i)=>`${t.costs[Math.floor(i/3)][i%3]}*${n}`).join(' + ')};`,
        'solve;','end;'].join('\n'):
        [`var alap >= 0, integer;`,`var premium >= 0, integer;`,
         `s.t. material: ${t.material[0]}*alap + ${t.material[1]}*premium <= ${t.materialLimit};`,
         `s.t. labor: ${t.hours[0]}*alap + ${t.hours[1]}*premium <= ${t.hoursLimit};`,
         `maximize gain: ${t.profit[0]}*alap + ${t.profit[1]}*premium;`,
         'solve;','end;'].join('\n');
      const sol=orReference(t);
      const values=kind==='assignment'?Object.fromEntries(t.variableNames.map((n,i)=>[n,Number(sol.exemplar[Math.floor(i/3)]===i%3)])):
        Object.fromEntries(t.variableNames.map((n,i)=>[n,sol.exemplar[i]]));
      const base={kind,seed:'42',answer:{mathprog:src,values,reportedObjective:sol.objective,hintsUsed:false}};
      assert.equal((await orPost(base)).points,1,`${kind} full credit`);
      if(kind==='assignment'){
        // Exactly redundant final column equality: mathematical correctness
        // must survive a missing textual row. R15 strict count would reject.
        const redundant=src.replace(/^s\.t\. job_2:.*\n/m,'');
        assert.notEqual(redundant,src,'redundant fixture must change the source');
        assert.equal((await orPost({...base,answer:{...base.answer,mathprog:redundant}})).points,1,
          'R16.11 exact 512-state equivalence must accept redundant row omission');
        // Two omitted worker equalities enlarge the feasible binary set.
        const incomplete=src.replace(/^s\.t\. worker_[12]:.*\n/gm,'');
        assert.equal((await orPost({...base,answer:{...base.answer,mathprog:incomplete}})).points,0,
          'R16.11 must reject a genuine feasible-region change');
      }
      assert.equal((await orPost({...base,answer:{...base.answer,hintsUsed:true}})).points,0);
      assert.equal((await orPost({...base,answer:{...base.answer,mathprog:'unsupported string;'}})).points,null);
    }
    // R16.12: seed 0 production has a mathematically redundant labor row.
    // The material constraint already enforces all integer labor budgets.
    const p0res=await fetch(`${url}/api/pilot/gusek/szakmai?kind=production&seed=0`);
    assert.equal(p0res.status,200);
    const p0=(await p0res.json()).task;
    const p0src=[`var alap >= 0, integer;`,`var premium >= 0, integer;`,
      `s.t. material: ${p0.material[0]}*alap + ${p0.material[1]}*premium <= ${p0.materialLimit};`,
      `s.t. labor: ${p0.hours[0]}*alap + ${p0.hours[1]}*premium <= ${p0.hoursLimit};`,
      `maximize profit: ${p0.profit[0]}*alap + ${p0.profit[1]}*premium;`,
      'solve;','end;'].join('\n');
    const p0sol=orReference(p0);
    const p0body={kind:'production',seed:'0',answer:{mathprog:p0src,
      values:Object.fromEntries(p0.variableNames.map((name,i)=>[name,p0sol.exemplar[i]])),
      reportedObjective:p0sol.objective,hintsUsed:false}};
    assert.equal((await orPost(p0body)).points,1,'production original complete model');
    const p0Redundant=p0src.replace(/^s\.t\. labor:.*\n/m,'');
    assert.notEqual(p0Redundant,p0src,'production redundant labor fixture exists');
    assert.equal((await orPost({...p0body,answer:{...p0body.answer,mathprog:p0Redundant}})).points,1,
      'R16.12 production redundant labor must retain 1/1');
    const p0Incomplete=p0src.replace(/^s\.t\. material:.*\n/m,'');
    assert.notEqual(p0Incomplete,p0src,'production missing material fixture exists');
    const p0Wrong=await orPost({...p0body,answer:{...p0body.answer,mathprog:p0Incomplete}});
    assert.equal(p0Wrong.points,0,'production genuinely missing material must be rejected');
    assert.ok(p0Wrong.errors.includes('production_model_material'));
    // No certified finite region: valid syntax but no basis for a 0/1 verdict.
    const p0Unbounded=p0src.replace(/^s\.t\. (?:material|labor):.*\n/gm,'');
    assert.equal((await orPost({...p0body,answer:{...p0body.answer,mathprog:p0Unbounded}})).points,null,
      'unsupported unbounded model must not be misgraded as 0');
    assert.equal((await fetch(`${url}/api/pilot/gusek/szakmai?kind=assignment&seed=-1`)).status,400);
    assert.equal((await fetch(`${url}/pilot/gusek/szakmai`)).status,200);
  }else{
    assert.equal((await fetch(`${url}/api/pilot/gusek/szakmai?kind=assignment&seed=42`)).status,404,
      'No subject route in core profile');
  }
  console.log(`R16_HTTP=PASS_TASK_GRADE_ASSISTED_REJECTED_BAD_MODEL_BAD_SEED_NATIVE_${receipt.native_route_installed?'DISABLED':'ABSENT'}_UI`);
} catch(error) {
  console.error('R16_HTTP=FAIL',error?.stack||String(error));
  console.error('Next log (last 3000 chars):',output.slice(-3000));
  process.exitCode=1;
} finally {
  cleanup();
}
