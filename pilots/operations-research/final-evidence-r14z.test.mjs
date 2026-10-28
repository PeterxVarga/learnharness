import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {validateFinalR14z} from './final-evidence-r14z.mjs';
const H='a'.repeat(40),S='b'.repeat(64);
const logs=Object.fromEntries([
 'npm-ci.log','offline.json','npm-test.log','typecheck.log','build.log',
 'native-glpk.json','next-server.log','browser-workbench.log','browser-practice.log'
].map(name=>[name,{bytes:9,sha256:S}]));
const offline={schema:'learnharness.operations-research.offline-verification.v1',
 status:'PASS',totalTests:454,suites:Array.from({length:36},()=>({name:'x',passed:1}))};
const native={schema:'learnharness.r14z.native-final.v1',status:'PASS',
 translationOnly:'GLPK_COMPLETED',syntaxError:'GLPK_ERROR',
 scalar:{status:'OPTIMAL'},indexed:{status:'OPTIMAL',variables:9},
 universityTasks:['transport','froccs','tablet'].map(kind=>({kind,status:'OPTIMAL',points:1}))};
const browsers=[{schema:'learnharness.r14.workbench-browser.v1',status:'PASS',checks:['OK']},
 {schema:'learnharness.r14z.practice-browser.v1',status:'PASS',checks:['OK'],
  mockedNativeOnly:true,realPracticeGrade:true}];
const fixture=()=>({head:H,status:'PASS',step:'final_receipt',logs,offline,native,browsers});
describe('R14Z final-qualification receipt contract (no real Fedora execution)',()=>{
 it('accepts complete source/native/browser evidence only',()=>{
  assert.equal(validateFinalR14z(fixture()).status,'PASS');
 });
 it('invalid exact Git pin never qualifies',()=>{
  assert.equal(validateFinalR14z({...fixture(),head:'main'}).status,'BLOCKED');
 });
 it('invalid state or unknown step never qualifies',()=>{
  assert.equal(validateFinalR14z({...fixture(),step:'deployment'}).status,'BLOCKED');
  assert.equal(validateFinalR14z({...fixture(),status:'UNKNOWN'}).status,'BLOCKED');
 });
 it('a failed run generates an explicitly failed receipt',()=>{
  const x=validateFinalR14z({...fixture(),status:'FAIL',step:'npm_test',logs:{}});
  assert.equal(x.status,'FAIL');assert.match(x.reason,/npm_test/);
 });
 it('rejects missing or forged SHA-256 log metadata',()=>{
  const a={...logs};delete a['browser-practice.log'];
  assert.equal(validateFinalR14z({...fixture(),logs:a}).status,'BLOCKED');
  assert.equal(validateFinalR14z({...fixture(),logs:{...logs,'npm-ci.log':{bytes:5,sha256:'bad'}}}).status,'BLOCKED');
 });
 it('requires receipt construction at the last qualified step',()=>{
  assert.equal(validateFinalR14z({...fixture(),step:'browser_practice'}).status,'BLOCKED');
 });
 it('rejects incorrect offline status, count and suite cardinality',()=>{
  for(const changed of [{status:'FAIL'},{totalTests:453},{suites:[]}])
   assert.equal(validateFinalR14z({...fixture(),offline:{...offline,...changed}}).status,'BLOCKED');
 });
 it('rejects missing verified scalar or indexed optimum',()=>{
  for(const changed of [{scalar:{status:'UNKNOWN'}},{indexed:{status:'OPTIMAL',variables:8}}])
   assert.equal(validateFinalR14z({...fixture(),native:{...native,...changed}}).status,'BLOCKED');
 });
 it('requires full credit for all three distinct university types',()=>{
  assert.equal(validateFinalR14z({...fixture(),native:{...native,
   universityTasks:native.universityTasks.slice(0,2)}}).status,'BLOCKED');
  assert.equal(validateFinalR14z({...fixture(),native:{...native,
   universityTasks:native.universityTasks.map(x=>({...x,points:x.kind==='tablet'?0:1}))}}).status,'BLOCKED');
 });
 it('rejects malformed-source execution that unexpectedly succeeded',()=>{
  assert.equal(validateFinalR14z({...fixture(),native:{...native,syntaxError:'GLPK_COMPLETED'}}).status,'BLOCKED');
 });
 it('rejects an unverified translation-only status',()=>{
  assert.equal(validateFinalR14z({...fixture(),native:{...native,translationOnly:'BLOCKED'}}).status,'BLOCKED');
 });
 it('requires two successful browser workflows, independent grader and explicit solver mock disclosure',()=>{
  assert.equal(validateFinalR14z({...fixture(),browsers:[browsers[0]]}).status,'BLOCKED');
  assert.equal(validateFinalR14z({...fixture(),browsers:[browsers[0],{...browsers[1],realPracticeGrade:false}]}).status,'BLOCKED');
  assert.equal(validateFinalR14z({...fixture(),browsers:[browsers[0],{...browsers[1],mockedNativeOnly:false}]}).status,'BLOCKED');
 });
});
