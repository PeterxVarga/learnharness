import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { overallStatus, parseArgs, validateOfflineReceipt, R8_PIN, REQUIRED_STEPS } from './qualify-r8.mjs';
const digest = 'a'.repeat(64);
const fixture = () => ({status:'PASS',totalTests:147,suites:Array.from({length:14}, (_, i) => ({name:`suite${i}`,passed: i === 0 ? 134 : 1})),sourceSha256:Object.fromEntries(Array.from({length:23}, (_, i) => [`source${i}`, digest]))});
const passes = () => Object.fromEntries(REQUIRED_STEPS.map(key => [key,{status:'PASS'}]));
describe('R8 qualification is fail-closed and cannot turn partial evidence into PASS',()=>{
  it('accepts only full fourteen-suite, 147-count offline receipts',()=>assert.equal(validateOfflineReceipt(fixture()),true));
  it('rejects false PASS with only 102 tests',()=>{const f=fixture();f.totalTests=102;assert.equal(validateOfflineReceipt(f),false);});
  it('rejects self-reported counts inconsistent with suite evidence',()=>{const f=fixture();f.suites[0].passed=89;assert.equal(validateOfflineReceipt(f),false);});
  it('rejects duplicate suite names',()=>{const f=fixture();f.suites[1].name=f.suites[0].name;assert.equal(validateOfflineReceipt(f),false);});
  it('rejects absent or invalid source hashes',()=>{const f=fixture();f.sourceSha256.source0='bogus';assert.equal(validateOfflineReceipt(f),false);delete f.sourceSha256;assert.equal(validateOfflineReceipt(f),false);});
  it('rejects missing evidence and skipped steps',()=>{assert.equal(overallStatus({}), 'BLOCKED');const f=passes();delete f.native_glpsol;assert.equal(overallStatus(f),'BLOCKED');f.native_glpsol={status:'BLOCKED'};assert.equal(overallStatus(f),'BLOCKED');});
  it('a failing build cannot become overall PASS from six successes',()=>{const f=passes();f.next_build.status='FAIL';assert.equal(overallStatus(f),'FAIL');});
  it('only seven PASS steps make a PASS',()=>assert.equal(overallStatus(passes()),'PASS'));
  it('validates arguments exactly without ambiguous options',()=>{assert.deepEqual(parseArgs(['--repo','/tmp/repo','--native','--full-build']),{repo:'/tmp/repo',native:true,fullBuild:true,output:null});for(const args of [[],['--repo'],['--repo','/tmp','--repo','/var'],['--repo','/tmp','--native','--native'],['--repo','/tmp','--input','evil.mod'],['--repo','/tmp','--output']])assert.throws(()=>parseArgs(args));});
  it('hardpins the exact R7 SHA rather than a branch name',()=>assert.equal(R8_PIN,'24dcfccf412544ecd3b65d4cba0fb8116a699186'));
});
