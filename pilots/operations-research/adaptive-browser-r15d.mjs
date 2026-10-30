#!/usr/bin/env node
/**
 * R15D acceptance: explicit run activation, selection, loading, three real
 * submissions and no API requests caused by the recommendation UI itself.
 * Reuses existing local production server; never uses GLPK or model providers.
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {makeGusekTask,trustedGusekModel} from './gusek-exam-r13.mjs';
const url=process.env.LH_R15_BROWSER_URL;
const executablePath=process.env.LH_R14_CHROMIUM;
if(!/^http:\/\/127\.0\.0\.1:\d{4,5}\/pilot\/gusek$/.test(url??'')||
 !executablePath?.startsWith('/'))throw Error('explicit_loopback_and_chromium_required');
const counts={get:0,post:0},checks=[];
const check=async(name,fn)=>{await fn();checks.push(name);};
const browser=await puppeteer.launch({executablePath,headless:true,args:['--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:900});
 page.on('request',req=>{
  try{
   const u=new URL(req.url());
   if(u.origin!==new URL(url).origin||u.pathname!=='/api/pilot/gusek')return;
   if(req.method()==='GET')counts.get++;
   if(req.method()==='POST')counts.post++;
  }catch{/* Only count request metadata; never read or log learner text. */}
 });
 const doc=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(doc?.status(),200);
 await page.waitForFunction(
  ()=>document.querySelector('[data-testid="gusek-workbench-r14"]')?.getAttribute('data-hydrated')==='true',
  {timeout:15000});
 await check('R15D_NO_RUN_BEFORE_OPTIN',async()=>{
  assert.equal(await page.$('[data-testid="gusek-r15d-run"]'),null);
  assert.equal(await page.$('[data-testid="gusek-r15d-activate"]'),null);
 });
 const clickByText=async(value)=>page.evaluate(text=>{
  const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()===text);
  if(!b||b.disabled)throw Error('button_missing_or_disabled_'+text);
  b.click();
 },value);
 const text=async(selector,value)=>{
  await page.$eval(selector,(el,source)=>{
   const base=el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;
   const setter=Object.getOwnPropertyDescriptor(base.prototype,'value')?.set;
   if(!setter)throw Error('native_input_setter_required');
   setter.call(el,source);
   el.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
 };
 const awaitTask=async(kind,seed)=>page.waitForFunction(id=>
  document.querySelector('[aria-label="Vizsgafeladat"]')?.textContent?.includes(id),
  {timeout:20000},'gusek-'+kind+'-'+seed);
 const awaitGrade=async()=>page.waitForFunction(()=>{
  const p=document.querySelector('[data-testid="gusek-grade-r14z"]')?.getAttribute('data-grade-points');
  return p==='0'||p==='1'||p==='unassessable';
 },{timeout:20000});
 await clickByText('Új feladat');
 await awaitTask('transport',42);
 // A trusted example model with intentionally wrong reported objective; grading is
 // still only performed by the real HTTP endpoint after an explicit click.
 const model=trustedGusekModel(makeGusekTask('transport',42));
 await text('[data-testid="gusek-exam-source-r14"]',model);
 await page.waitForFunction(expected=>
  document.querySelector('[data-testid="gusek-exam-source-state-r14z"]')?.getAttribute('data-source-length')===String(expected),
  {timeout:15000},model.length);
 await text('#gusek-objective','0');
 await page.$eval('#gusek-objective',el=>el.blur());
 await clickByText('Teljes megoldás ellenőrzése');
 await awaitGrade();
 assert.equal(counts.post,1);
 const beforeOptIn={...counts};
 await page.click('[data-testid="gusek-r15d-activate"]');
 await check('R15D_ACTIVATION_NEVER_REQUESTS_TASK',async()=>{
  await page.waitForSelector('[data-testid="gusek-r15d-run"]',{timeout:10000});
  assert.deepEqual(counts,beforeOptIn);
  assert.equal(await page.$eval('[data-testid="gusek-r15d-run"]',el=>el.getAttribute('data-active')),'none');
 });
 await check('R15D_STEP_TWO_LOCKED_UNTIL_SUBMISSION',async()=>{
  assert.equal(await page.$$eval('[data-testid="gusek-r15d-stations"] > li',els=>els.length),3);
  assert.equal(await page.$eval('[data-testid="gusek-r15d-select-2"]',el=>el.disabled),true);
  assert.equal(await page.$eval('[data-testid="gusek-r15d-select-3"]',el=>el.disabled),true);
  assert.match(await page.$eval('[data-testid="gusek-r15d-progress"]',el=>el.textContent),/0\/3/);
 });
 const original={...counts};
 await page.click('[data-testid="gusek-r15d-select-1"]');
 await check('R15D_EXPLICIT_FIRST_SELECTION_NO_HTTP',async()=>{
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-r15d-run"]')?.getAttribute('data-active')==='1' &&
   document.querySelector('input[aria-label="Feladatvariáns"]')?.value==='43',{timeout:10000});
  assert.equal(await page.$('[aria-label="Vizsgafeladat"]'),null);
  assert.equal(await page.$eval('[data-testid="gusek-r15d-run"]',el=>el.getAttribute('data-ready')),'false');
  assert.deepEqual(counts,original);
 });
 await clickByText('Új feladat');
 await check('R15D_FIRST_LOAD_WITHOUT_AUTOGRADE',async()=>{
  await awaitTask('transport',43);
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-r15d-run"]')?.getAttribute('data-ready')==='true',
   {timeout:10000});
  assert.equal(counts.get,original.get+1);
  assert.equal(counts.post,original.post);
  assert.equal(await page.$eval('[data-testid="gusek-r15d-step-1"]',el=>el.getAttribute('data-status')),'loaded');
 });
 await text('#gusek-objective','0');
 await page.$eval('#gusek-objective',el=>el.blur());
 await clickByText('Teljes megoldás ellenőrzése');
 await check('R15D_ACTUAL_GRADE_COUNTS_FIRST_ATTEMPT',async()=>{
  await awaitGrade();
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-r15d-step-1"]')?.getAttribute('data-attempts')==='1',
   {timeout:10000});
  assert.equal(counts.post,original.post+1);
  const status=await page.$eval('[data-testid="gusek-r15d-step-1"]',el=>el.getAttribute('data-status'));
  assert.ok(['zero','unassessable','full'].includes(status));
  assert.match(await page.$eval('[data-testid="gusek-r15d-progress"]',el=>el.textContent),/1\/3/);
 });
 await check('R15D_SERVER_ATTEMPT_UNLOCKS_STEP_TWO',async()=>{
  assert.equal(await page.$eval('[data-testid="gusek-r15d-select-2"]',el=>el.disabled),false);
  assert.equal(await page.$eval('[data-testid="gusek-r15d-select-3"]',el=>el.disabled),true);
 });
 const beforeSecond={...counts};
 await page.click('[data-testid="gusek-r15d-select-2"]');
 await check('R15D_SECOND_SELECTION_NO_HTTP',async()=>{
  await page.waitForFunction(()=>
   document.querySelector('select[aria-label="Feladattípus"]')?.value==='froccs' &&
   document.querySelector('[data-testid="gusek-r15d-run"]')?.getAttribute('data-active')==='2',
   {timeout:10000});
  assert.equal(await page.$('[aria-label="Vizsgafeladat"]'),null);
  assert.deepEqual(counts,beforeSecond);
 });
 const secondSeed=await page.$eval('input[aria-label="Feladatvariáns"]',el=>el.value);
 await clickByText('Új feladat');
 await check('R15D_SECOND_LOAD_REQUIRES_CLICK',async()=>{
  await awaitTask('froccs',secondSeed);
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-r15d-run"]')?.getAttribute('data-ready')==='true',{timeout:10000});
  assert.equal(counts.get,beforeSecond.get+1);
  assert.equal(counts.post,beforeSecond.post);
 });
 await text('#gusek-objective','0');
 await page.$eval('#gusek-objective',el=>el.blur());
 await clickByText('Teljes megoldás ellenőrzése');
 await check('R15D_SECOND_REAL_GRADE_UNLOCKS_RETURN',async()=>{
  await awaitGrade();
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-r15d-step-2"]')?.getAttribute('data-attempts')==='1',{timeout:10000});
  assert.equal(counts.post,beforeSecond.post+1);
  assert.equal(await page.$eval('[data-testid="gusek-r15d-select-3"]',el=>el.disabled),false);
 });
 const beforeThird={...counts};
 await page.click('[data-testid="gusek-r15d-select-3"]');
 await check('R15D_RETURN_SELECTION_NO_HTTP',async()=>{
  await page.waitForFunction(()=>
   document.querySelector('select[aria-label="Feladattípus"]')?.value==='transport' &&
   document.querySelector('[data-testid="gusek-r15d-run"]')?.getAttribute('data-active')==='3',
   {timeout:10000});
  assert.deepEqual(counts,beforeThird);
 });
 const thirdSeed=await page.$eval('input[aria-label="Feladatvariáns"]',el=>el.value);
 await clickByText('Új feladat');
 await check('R15D_RETURN_TASK_LOAD_REQUIRES_CLICK',async()=>{
  await awaitTask('transport',thirdSeed);
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-r15d-run"]')?.getAttribute('data-ready')==='true',{timeout:10000});
  assert.equal(counts.get,beforeThird.get+1);
  assert.equal(counts.post,beforeThird.post);
 });
 await text('#gusek-objective','0');
 await page.$eval('#gusek-objective',el=>el.blur());
 await clickByText('Teljes megoldás ellenőrzése');
 await check('R15D_THREE_STATIONS_HAVE_REAL_ATTEMPTS',async()=>{
  await awaitGrade();
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-r15d-step-3"]')?.getAttribute('data-attempts')==='1',{timeout:10000});
  const statuses=await page.$$eval('[data-testid^="gusek-r15d-step-"]',els=>
   els.map(el=>el.getAttribute('data-attempts')));
  assert.deepEqual(statuses,['1','1','1']);
  assert.match(await page.$eval('[data-testid="gusek-r15d-progress"]',el=>el.textContent),/3\/3/);
  assert.equal(counts.post,beforeThird.post+1);
 });
 const beforeStop={...counts};
 await page.click('[data-testid="gusek-r15d-stop"]');
 await check('R15D_MANUAL_STOP_NO_HTTP',async()=>{
  assert.equal(await page.$('[data-testid="gusek-r15d-run"]'),null);
  assert.deepEqual(counts,beforeStop);
 });
 const expected=[
 'R15D_NO_RUN_BEFORE_OPTIN',
 'R15D_ACTIVATION_NEVER_REQUESTS_TASK',
 'R15D_STEP_TWO_LOCKED_UNTIL_SUBMISSION',
 'R15D_EXPLICIT_FIRST_SELECTION_NO_HTTP',
 'R15D_FIRST_LOAD_WITHOUT_AUTOGRADE',
 'R15D_ACTUAL_GRADE_COUNTS_FIRST_ATTEMPT',
 'R15D_SERVER_ATTEMPT_UNLOCKS_STEP_TWO',
 'R15D_SECOND_SELECTION_NO_HTTP',
 'R15D_SECOND_LOAD_REQUIRES_CLICK',
 'R15D_SECOND_REAL_GRADE_UNLOCKS_RETURN',
 'R15D_RETURN_SELECTION_NO_HTTP',
 'R15D_RETURN_TASK_LOAD_REQUIRES_CLICK',
 'R15D_THREE_STATIONS_HAVE_REAL_ATTEMPTS',
 'R15D_MANUAL_STOP_NO_HTTP'
 ];
 assert.deepEqual(checks,expected);
 process.stdout.write(JSON.stringify({
  schema:'learnharness.r15d.browser.v1',status:'PASS',checks,
  realServerGrades:4,manualSelectionOnly:true,noAutoStart:true,
  graderAuthorityUnchanged:true
 })+'\n');
}finally{await browser.close();}
