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
const browser=await puppeteer.launch({executablePath,headless:true,args:['--disable-dev-shm-usage']});
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
 await check('SEEDED_PRACTICE_DRAFT_SURVIVES_RELOAD',async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-practice-draft-status-r14z"]')?.textContent?.includes('helyben mentve'),{timeout:12000});
  await page.reload({waitUntil:'networkidle2',timeout:30000});
  await page.select('[data-testid="gusek-transport-dialect-r14"]','indexed');
  await page.evaluate(()=>{
   const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Új feladat');
   if(!button)throw Error('task_button_missing_after_reload');button.click();
  });
  await page.waitForFunction(expected=>{
   const editor=document.querySelector('[data-testid="gusek-exam-source-r14"]');
   return !!editor&&editor.value===expected;
  },{timeout:15000},model);
  assert.equal(await page.$eval(modelInput,el=>el.value),model);
  assert.equal(await page.$eval('[data-testid="gusek-exam-data-r14"]',el=>el.value),trustedIndexedData(42));
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
 await check('EDITABLE_3X3_GRID_AND_JSON_ROUNDTRIP',async()=>{
  const grid=await page.$('[data-testid="gusek-values-grid-r14z"]');
  assert.ok(grid);
  assert.equal((await page.$('[data-testid^="gusek-value-cell-"]')).length,9);
  const first='[data-testid="gusek-value-cell-0"]';
  await page.click(first,{clickCount:3});
  await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');
  const modified=expected['x[1,1]']===7?8:7;
  await page.keyboard.type(String(modified));
  await page.waitForFunction(changed=>{
   const answer=document.querySelector('#gusek-values');
   return !!answer&&JSON.parse(answer.value)['x[1,1]']===changed;
  },{timeout:10000},modified);
  const valueAfterGrid=JSON.parse(await page.$eval('#gusek-values',el=>el.value));
  assert.equal(valueAfterGrid['x[1,1]'],modified);
  assert.notEqual(valueAfterGrid['x[1,1]'],expected['x[1,1]']);
  // Restore the genuine OPTIMAL synthetic result using the existing explicit
  // transfer action, then the unmocked grade endpoint must award 1/1.
  await page.click('[data-testid="gusek-transfer-solution-r14"]');
  const restored=JSON.parse(await page.$eval('#gusek-values',el=>el.value));
  assert.deepEqual(restored,expected);
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
 await check('PRACTICE_FILE_TABS_AND_READONLY_FIXTURE',async()=>{
  await page.click('[data-testid="gusek-practice-tab-data-r14z"]');
  const readOnly=await page.$eval('[data-testid="gusek-exam-data-r14"]',el=>el.readOnly);
  assert.equal(readOnly,true);
  await page.click('[data-testid="gusek-practice-tab-model-r14z"]');
  assert.equal(await page.$eval(modelInput,el=>el.hidden),false);
 });
 await page.select('select[aria-label="Feladattípus"]','froccs');
 await page.evaluate(()=>{
  const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Új feladat');
  if(!button)throw Error('new_froccs_task_missing');button.click();
 });
 await check('FROCCS_HAS_REAL_ANSWER_FREE_STARTER',async()=>{
  await page.waitForFunction(()=>{
   const m=document.querySelector('[data-testid="gusek-exam-source-r14"]');
   return !!m&&m.value.includes('var xKF >= 0, integer;');
  },{timeout:15000});
  const starter=await page.$eval(modelInput,el=>el.value);
  assert.equal((starter.match(/^var /gm)||[]).length,10);
  assert.ok(starter.includes('solve;'));
  assert.ok(!/^maximize\s/m.test(starter));
 });
 await page.select('select[aria-label="Feladattípus"]','tablet');
 await page.evaluate(()=>{
  const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent?.trim()==='Új feladat');
  if(!button)throw Error('new_tablet_task_missing');button.click();
 });
 await check('TABLET_HAS_CONTINUOUS_ANSWER_FREE_STARTER',async()=>{
  await page.waitForFunction(()=>{
   const m=document.querySelector('[data-testid="gusek-exam-source-r14"]');
   return !!m&&m.value.includes('var spenotos >= 0;');
  },{timeout:15000});
  const starter=await page.$eval(modelInput,el=>el.value);
  assert.equal((starter.match(/^var /gm)||[]).length,2);
  assert.ok(!/^minimize\s/m.test(starter));
  assert.ok(!/var epres.*integer/.test(starter));
 });
 const originalTablet=await page.$eval(modelInput,el=>el.value);
 page.once('dialog',dialog=>{void dialog.accept();});
 await page.click('[data-testid="gusek-copy-free-r14z"]');
 await check('COPY_EXAM_MODEL_TO_UNGRADED_WORKSPACE',async()=>{
  await page.waitForFunction(expected=>{
   const editor=document.querySelector('[data-testid="gusek-free-model-r14"]');
   return !!editor&&editor.value===expected;
  },{timeout:15000},originalTablet);
  assert.equal(await page.$eval('[data-testid="gusek-free-model-r14"]',el=>el.value),originalTablet);
  assert.equal(await page.$('[data-testid="gusek-free-result-r14"]'),null);
  const mode=await page.$eval('[data-testid="gusek-mode-free-r14"]',el=>el.getAttribute('aria-pressed'));
  assert.equal(mode,'true');
 });
 await page.click('[data-testid="gusek-free-model-r14"]');
 await page.keyboard.press('End');
 await page.keyboard.type('\n# Free mode experiment');
 await page.click('[data-testid="gusek-mode-practice-r14"]');
 await check('FREE_COPY_NEVER_MUTATES_ORIGINAL_PRACTICE_MODEL',async()=>{
  const actual=await page.$eval(modelInput,el=>el.value);
  assert.equal(actual,originalTablet);
  assert.ok(!actual.includes('Free mode experiment'));
 });
 process.stdout.write(JSON.stringify({schema:'learnharness.r14z.practice-browser.v1',status:'PASS',checks,mockedNativeOnly:true,realPracticeGrade:true})+'\n');
}finally{await browser.close();}
