#!/usr/bin/env node
/** Final R14Z browser test: synthetic native solver response, real Practice API.
 * ONLY the local-only GLPK endpoint is intercepted. The authoritative
 * server-side score is never mocked, and no real Podman is called here.
 * Run as part of the ONE final Fedora qualification, not per-commit.
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {makeGusekTask,solveGusekTask} from './gusek-exam-r13.mjs';
import {EXAMPLE_INDEXED_MODEL} from './mathprog-indexed-r7.mjs';
import {trustedIndexedData} from './mathprog-indexed-r7.mjs';

const url=process.env.LH_R14_BROWSER_URL??'http://127.0.0.1:3000/pilot/gusek';
const executablePath=process.env.LH_R14_CHROMIUM;
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}\/pilot\/gusek$/.test(url))
 throw Error('local_browser_url_required');
if(!executablePath||!executablePath.startsWith('/'))
 throw Error('absolute_chromium_path_required');
const task=makeGusekTask('transport',42),oracle=solveGusekTask(task);
const model=EXAMPLE_INDEXED_MODEL.replace('>= 0, <= cap[i,j]','>= 0, integer, <= cap[i,j]');
const expected=Object.fromEntries(Array.from({length:3},(_,i)=>
 Array.from({length:3},(_,j)=>[
  'x['+(i+1)+','+(j+1)+']',oracle.values['Raktar'+(i+1)+'_Bolt'+(j+1)]
 ])).flat());
const checks=[];
const check=async(name,fn)=>{await fn();checks.push(name);process.stdout.write('PASS '+name+'\n');};
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:900});
 await page.setRequestInterception(true);
 let nativeRequests=0;
 page.on('request',request=>{
  const isNative=request.url().endsWith('/api/pilot/gusek/native');
  if(!isNative){void request.continue();return;}
  if(request.method()==='GET'){
   void request.respond({status:200,contentType:'application/json',
    body:JSON.stringify({schema:'learnharness.glpk-native-status.r14',available:true,scoreAuthority:false})});return;
  }
  if(request.method()==='POST'){
   nativeRequests++;
   let payload;try{payload=JSON.parse(request.postData()??'');}catch{payload=null;}
   const valid=payload?.model===model&&payload?.data===trustedIndexedData(42)&&payload?.mode==='solve';
   const result=valid?{
    schema:'learnharness.glpk-native-diagnostic.r14',
    status:'GLPK_COMPLETED',code:'completed',graded:false,points:null,
    mode:'solve',solverStatus:'OPTIMAL',columnStatus:'OPTIMAL_COLUMNS',
    objective:oracle.objective,solutionListing:'SYNTHETIC_TEST_ONLY',
    columns:Object.entries(expected).map(([name,value])=>({name,value})),
    diagnostic:'SIMULATED_OPTIMAL_NOT_REAL_GLPK',solverOutputTrusted:false
   }:{error:'synthetic_native_fixture_mismatch'};
   void request.respond({status:valid?200:422,contentType:'application/json',body:JSON.stringify(result)});
   return;
  }
  void request.abort('blockedbyclient');
 });
 await page.goto(url,{waitUntil:'networkidle2',timeout:30000});
 await check('NATIVE_ONLY_MOCK_ON',async()=>{
  assert.ok(await page.$('[data-testid="gusek-workbench-r14"]'));
 });
 await page.select('[data-testid="gusek-transport-dialect-r14"]','indexed');
 await page.evaluate(()=>{
  const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Új feladat');
  if(!button)throw Error('task_button_missing');button.click();
 });
 await check('INDEXED_TASK_AND_TRUSTED_DATA',async()=>{
  await page.waitForSelector('[data-testid="gusek-exam-source-r14"]',{timeout:15000});
  const data=await page.$eval('[data-testid="gusek-exam-data-r14"]',el=>el.value);
  assert.equal(data,trustedIndexedData(42));
  assert.ok(await page.$('[data-testid="gusek-indexed-guidance-r14"]'));
 });
 const modelInput='[data-testid="gusek-exam-source-r14"]';
 await page.click(modelInput);
 await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');
 await page.keyboard.type(model,{delay:0});
 await check('ACTUAL_GMPL_EDITOR_INPUT',async()=>{
  const value=await page.$eval(modelInput,el=>el.value);
  assert.equal(value,model);
 });
 await page.type('input[type="password"]','a'.repeat(64),{delay:0});
 await page.click('[data-testid="gusek-native-solve-r14"]');
 await check('MOCK_GLPK_STRUCTURED_RESULT',async()=>{
  await page.waitForFunction(()=>{
   const button=document.querySelector('[data-testid="gusek-transfer-solution-r14"]');
   return !!button&&!button.disabled;
  },{timeout:15000});
  assert.equal(nativeRequests,1);
  assert.ok(await page.$('[data-testid="gusek-native-status-r14"]'));
  const text=await page.$eval('[data-testid="gusek-native-result-r14"]',el=>el.textContent);
  assert.match(text,/OPTIMAL/);
 });
 await check('NO_AUTOMATIC_SCORE_FROM_GLPK',async()=>{
  const text=await page.$eval('[data-testid="gusek-exam-r13"]',el=>el.textContent);
  assert.equal(text.includes('TELJESEN HELYES'),false);
 });
 await page.click('[data-testid="gusek-transfer-solution-r14"]');
 await check('EXPLICIT_FORM_TRANSFER',async()=>{
  const form=JSON.parse(await page.$eval('#gusek-values',el=>el.value));
  assert.deepEqual(form,expected);
  assert.equal(Number(await page.$eval('#gusek-objective',el=>el.value)),oracle.objective);
 });
 await page.evaluate(()=>{
  const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Teljes megoldás ellenőrzése');
  if(!button)throw Error('grade_button_missing');button.click();
 });
 await check('REAL_SERVER_GRADE_NOT_MOCKED',async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-exam-r13"]')?.textContent?.includes('TELJESEN HELYES'),{timeout:15000});
  const result=await page.$eval('[data-testid="gusek-exam-r13"]',el=>el.textContent);
  assert.match(result,/1\/1/);
 });
 await check('SOURCE_EDIT_INVALIDATES_PREVIOUS_SOLUTION',async()=>{
  await page.click(modelInput);
  await page.keyboard.press('End');
  await page.keyboard.type('\n# changed');
  await page.waitForFunction(()=>!document.querySelector('[data-testid="gusek-native-result-r14"]'));
  assert.equal(await page.$('[data-testid="gusek-transfer-solution-r14"]'),null);
 });
 process.stdout.write(JSON.stringify({schema:'learnharness.r14z.practice-browser.v1',status:'PASS',checks,mockedNativeOnly:true,realPracticeGrade:true})+'\n');
}finally{await browser.close();}
