import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {makeTransportTask,solveTransportTask} from './transport-exam-r3.mjs';
import {parseArgs,runCli} from './transport-cli-r3.mjs';
const cli=fileURLToPath(new URL('./transport-cli-r3.mjs',import.meta.url));
function call(...args){return spawnSync(process.execPath,[cli,...args],{encoding:'utf8',timeout:5000});}
describe('R3 offline actual command-line learner flow',()=>{
 it('new shows the Hungarian task but no solution or score',()=>{
   const r=call('new','--seed','42');assert.equal(r.status,0);assert.match(r.stdout,/szállítási|Szállítási/);assert.match(r.stdout,/nincs részpont/);
   assert.doesNotMatch(r.stdout,/optimalAllocationCount|exemplar/);
 });
 it('JSON task is deterministic with SHA256 and independent of solution',()=>{
   const r=call('new','--seed','42','--json');assert.equal(r.status,0);const task=JSON.parse(r.stdout);assert.equal(task.supply.length,3);assert.match(task.digest,/^[0-9a-f]{64}$/);assert.equal(JSON.stringify(task),JSON.stringify(JSON.parse(call('new','--seed','42','--json').stdout)));
 });
 it('new -> user JSON answer -> grade complete point, then wrong answer gets zero',()=>{
   const root=mkdtempSync(join(tmpdir(),'learnharness-transport-r3-'));
   try{
     const task=makeTransportTask(42),sol=solveTransportTask(task);
     const answer={model:{...task,nonnegative:true},allocation:sol.exemplar,reportedObjective:sol.objective,hintsUsed:false};
     const path=join(root,'answer.json');writeFileSync(path,JSON.stringify(answer));
     const good=call('grade','--seed','42','--answer',path,'--json');assert.equal(good.status,0);assert.equal(JSON.parse(good.stdout).points,1);
     answer.reportedObjective+=1;writeFileSync(path,JSON.stringify(answer));
     const bad=call('grade','--seed','42','--answer',path,'--json');assert.equal(bad.status,0);assert.equal(JSON.parse(bad.stdout).points,0);
     assert.ok(JSON.parse(bad.stdout).errors.includes('objective_mismatch'));
   }finally{rmSync(root,{recursive:true,force:true});}
 });
 it('invalid arguments blocked before answer file IO',()=>{
   for(const args of [['new'],['grade','--seed','1'],['new','--seed','-1'],['new','--seed','4294967296'],['new','--seed','1','--answer','bad']])assert.throws(()=>parseArgs(args));
 });
 it('invalid JSON and missing files return explicit failure, never 1 point',()=>{
   const root=mkdtempSync(join(tmpdir(),'lh-invalid-'));
   try{
     const path=join(root,'bad.json');writeFileSync(path,'{not-json');
     assert.equal(call('grade','--seed','42','--answer',path).status,2);
     assert.equal(call('grade','--seed','42','--answer',join(root,'missing')).status,2);
   }finally{rmSync(root,{recursive:true,force:true});}
 });
});
