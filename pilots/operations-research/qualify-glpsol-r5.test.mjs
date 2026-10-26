import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qualificationPlan, trustedBinaryMetadata, qualifyGeneratedGlpsol } from './qualify-glpsol-r5.mjs';
const script=fileURLToPath(new URL('./qualify-glpsol-r5.mjs',import.meta.url));
const cli=(...a)=>spawnSync(process.execPath,[script,...a],{encoding:'utf8',timeout:5000});
describe('R5 fail-closed native glpsol qualification',()=>{
 it('only generated model and fixed solver command-line options',()=>{const p=qualificationPlan(42);assert.match(p.model,/^# Generated ONLY/);assert.deepEqual(p.arguments,['--math','generated.mod','--wglp','generated.glp','--write','generated.sol','--tmlim','5','--memlim','64']);});
 it('model source SHA256 deterministic and seed-specific',()=>{const a=qualificationPlan(42),b=qualificationPlan(42),c=qualificationPlan(43);assert.equal(a.modelSha256,b.modelSha256);assert.notEqual(a.modelSha256,c.modelSha256);});
 it('direct arbitrary binary path not allowed',()=>{assert.throws(()=>trustedBinaryMetadata('/tmp/fake-glpsol'),/UNAPPROVED_BINARY_PATH/);});
 it('native qualification reports only actual PASS or explicit blocked status',()=>{const p=cli('--seed','42');if(p.status===0){const j=JSON.parse(p.stdout);assert.equal(j.status,'PASS_ACTUAL_NATIVE_GLPSOL');assert.equal(j.objective,j.oracleObjective);}else{assert.doesNotMatch(p.stdout,/PASS_ACTUAL_NATIVE_GLPSOL/);assert.match(p.stderr,/GLPSOL_NOT_QUALIFIED:/);}});
 it('invalid CLI seeds fail before touching a binary',()=>{for(const v of [[],['--seed'],['--seed','-1'],['--seed','4294967296'],['--model','/tmp/student.mod'],['--seed','42','--binary','/tmp/glpsol']]){const p=cli(...v);assert.equal(p.status,2);assert.match(p.stderr,/GLPSOL_NOT_QUALIFIED:/);}});
 it('never accepts user-provided .mod content, only uint32 seeds',()=>{for(const v of [-1,4294967296,1.5,'42'])assert.throws(()=>qualificationPlan(v));assert.throws(()=>qualifyGeneratedGlpsol('source code;'));});
 it('witness always matches nine variables and six constraints',()=>{for(let s=0;s<40;s++){const p=qualificationPlan(s);assert.equal(p.problem.variables.length,9);assert.equal(p.problem.constraints.length,6);assert.ok(p.witness.objective>0);}});
});
