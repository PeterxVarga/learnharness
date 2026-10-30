#!/usr/bin/env node
/**
 * R15E: explicit correction and tab-local plan bookmark (never grade provenance).
 * Uses an already-running Next.js production server, no GLPK or model provider.
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {makeGusekTask,trustedGusekModel} from './gusek-exam-r13.mjs';
const url=process.env.LH_R15_BROWSER_URL,path=process.env.LH_R14_CHROMIUM;
if(!/^http:\/\/127\.0\.0\.1:\d{4,5}\/pilot\/gusek$/.test(url??'')||!path?.startsWith('/'))throw Error('loopback_required');
const checks=[],counts={get:0,post:0};
const check=async(name,fn)=>{await fn();checks.push(name)};
const browser=await puppeteer.launch({executablePath:path,headless:true,args:['--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:900});
 page.on('request',r=>{try{const u=new URL(r.url());if(u.origin===new URL(url).origin&&u.pathname==='/api/pilot/gusek'){
  if(r.method()==='GET')counts.get++;if(r.method()==='POST')counts.post++;
 }}catch{/* metadata only */}});
 const set=async(selector,value)=>page.$eval(selector,(el,str)=>{
  const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el,str);
  el.dispatchEvent(new Event('input',{bubbles:true}));
 },value);
 const clickText=async(s)=>page.evaluate(t=>{const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()===t);
  if(!b||b.disabled)throw Error('button_unavailable:'+t);b.click();
 },s);
 const loaded=async(kind,seed)=>page.waitForFunction(x=>document.querySelector('[aria-label="Vizsgafeladat"]')?.textContent?.includes(x),
  {timeout:20000},'gusek-'+kind+'-'+seed);
 const graded=async()=>page.waitForFunction(()=>{
  const p=document.querySelector('[data-testid="gusek-grade-r14z"]')?.getAttribute('data-grade-points');
  return p==='0'||p==='1'||p==='unassessable';
 },{timeout:20000});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-workbench-r14"]')?.getAttribute('data-hydrated')==='true',{timeout:20000});
 await check('R15E_NO_AUTORESTORE_INITIAL',async()=>{
  assert.equal(await page.$('[data-testid="gusek-r15d-run"]'),null);
  assert.equal(counts.get,0);assert.equal(counts.post,0);
 });
 await clickText('Új feladat');
 await loaded('transport',42);
 const model=trustedGusekModel(makeGusekTask('transport',42));
 await set('[data-testid="gusek-exam-source-r14"]',model);
 await page.waitForFunction(n=>document.querySelector('[data-testid="gusek-exam-source-state-r14z"]')?.getAttribute('data-source-length')===String(n),{timeout:20000},model.length);
 await set('#gusek-objective','0');await page.$eval('#gusek-objective',el=>el.blur());
 await clickText('Teljes megoldás ellenőrzése');
 await graded();
 await page.click('[data-testid="gusek-r15d-activate"]');
 await check('R15E_OPTIN_CREATES_RUN_NO_FETCH',async()=>{
  await page.waitForSelector('[data-testid="gusek-r15d-run"]');
  assert.equal(counts.get,1);assert.equal(counts.post,1);
 });
 const beforeSelect={...counts};
 await page.click('[data-testid="gusek-r15d-select-1"]');
 await check('R15E_SELECTION_NO_HTTP',async()=>{
  await page.waitForFunction(()=>document.querySelector('input[aria-label="Feladatvariáns"]')?.value==='43',{timeout:10000});
  assert.deepEqual(counts,beforeSelect);
 });
 await clickText('Új feladat');
 await loaded('transport',43);
 await set('#gusek-objective','0');await page.$eval('#gusek-objective',el=>el.blur());
 await clickText('Teljes megoldás ellenőrzése');
 await check('R15E_FIRST_EXPLICIT_SERVER_GRADE',async()=>{
  await graded();
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-r15d-step-1"]')?.getAttribute('data-attempts')==='1',{timeout:10000});
  assert.equal(counts.post,2);
 });
 const beforeCorrect={...counts};
 await page.click('[data-testid="gusek-r15e-correct"]');
 await check('R15E_CORRECTION_NO_HTTP_OR_COUNT_CHANGE',async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-grade-r14z"]')===null,{timeout:10000});
  assert.equal(await page.$eval('[data-testid="gusek-r15d-step-1"]',el=>el.getAttribute('data-attempts')),'1');
  assert.deepEqual(counts,beforeCorrect);
 });
 await clickText('Teljes megoldás ellenőrzése');
 await check('R15E_SECOND_EXPLICIT_SERVER_GRADE_COUNTS_RETRY',async()=>{
  await graded();await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-r15d-step-1"]')?.getAttribute('data-attempts')==='2',{timeout:10000});
  assert.equal(counts.post,3);
 });
 const beforePause={...counts};
 await page.click('[data-testid="gusek-r15e-pause"]');
 await check('R15E_PAUSE_RETURNS_TO_MANUAL_SELECTION',async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-r15d-run"]')?.getAttribute('data-active')==='none',{timeout:10000});
  assert.equal(await page.$eval('[data-testid="gusek-r15d-step-1"]',el=>el.getAttribute('data-attempts')),'2');
  assert.deepEqual(counts,beforePause);
 });
 await page.click('[data-testid="gusek-r15e-save"]');
 await check('R15E_BOOKMARK_ONLY_KIND_AND_SEED',async()=>{
  const raw=await page.evaluate(()=>sessionStorage.getItem('learnharness:r15e:practice-plan:v1'));
  const data=JSON.parse(raw);
  assert.deepEqual(Object.keys(data),['schema','steps']);
  assert.equal(data.steps.length,3);
  assert.deepEqual(Object.keys(data.steps[0]),['kind','seed']);
  assert.doesNotMatch(raw,/model|receipt|points|attempts|chatId|source|answerSha256/);
  assert.deepEqual(counts,beforePause);
 });
 const beforeReload={...counts};
 await page.reload({waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-workbench-r14"]')?.getAttribute('data-hydrated')==='true',{timeout:20000});
 await check('R15E_RELOAD_NEVER_RESTORES_GRADES',async()=>{
  assert.equal(await page.$('[data-testid="gusek-r15d-run"]'),null);
  await page.waitForSelector('[data-testid="gusek-r15e-restore"]',{timeout:10000});
  assert.deepEqual(counts,beforeReload);
 });
 await page.click('[data-testid="gusek-r15e-restore"]');
 await check('R15E_EXPLICIT_RESTORE_RESETS_PROGRESS',async()=>{
  await page.waitForSelector('[data-testid="gusek-r15d-run"]',{timeout:10000});
  const attempts=await page.$$eval('[data-testid^="gusek-r15d-step-"]',els=>els.map(x=>x.getAttribute('data-attempts')));
  assert.deepEqual(attempts,['0','0','0']);
  assert.equal(await page.$eval('[data-testid="gusek-r15d-select-2"]',el=>el.disabled),true);
  assert.match(await page.$eval('[data-testid="gusek-r15d-progress"]',el=>el.textContent),/0\/3/);
  assert.deepEqual(counts,beforeReload);
 });
 await page.click('[data-testid="gusek-r15d-select-1"]');
 await check('R15E_RESTORED_FIRST_STATION_IS_MANUAL',async()=>{
  await page.waitForFunction(()=>document.querySelector('input[aria-label="Feladatvariáns"]')?.value==='43',{timeout:10000});
  assert.equal(await page.$('[aria-label="Vizsgafeladat"]'),null);
  assert.deepEqual(counts,beforeReload);
 });
 await clickText('Új feladat');
 await check('R15E_EXPLICIT_RESTORED_TASK_LOAD',async()=>{
  await loaded('transport',43);
  assert.equal(counts.get,beforeReload.get+1);
  assert.equal(counts.post,beforeReload.post);
 });
 const expected=[
  'R15E_NO_AUTORESTORE_INITIAL','R15E_OPTIN_CREATES_RUN_NO_FETCH',
  'R15E_SELECTION_NO_HTTP','R15E_FIRST_EXPLICIT_SERVER_GRADE',
  'R15E_CORRECTION_NO_HTTP_OR_COUNT_CHANGE',
  'R15E_SECOND_EXPLICIT_SERVER_GRADE_COUNTS_RETRY',
  'R15E_PAUSE_RETURNS_TO_MANUAL_SELECTION',
  'R15E_BOOKMARK_ONLY_KIND_AND_SEED','R15E_RELOAD_NEVER_RESTORES_GRADES',
  'R15E_EXPLICIT_RESTORE_RESETS_PROGRESS',
  'R15E_RESTORED_FIRST_STATION_IS_MANUAL',
  'R15E_EXPLICIT_RESTORED_TASK_LOAD'
 ];
 assert.deepEqual(checks,expected);
 console.log(JSON.stringify({schema:'learnharness.r15e.browser.v1',status:'PASS',checks,
  noAutoStart:true,noGradeRestoration:true,realServerGrades:3,bookmarkNoAnswers:true}));
}finally{await browser.close();}
