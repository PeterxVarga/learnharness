#!/usr/bin/env node
/**
 * R15 acceptance: a real server-grade drives an advisory recommendation,
 * but selecting that suggestion must NOT launch a task or an API grade.
 * Never contacts a model provider or a native GLPK solver.
 * Requires already running, local Next.js production server and Chromium.
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {makeGusekTask,trustedGusekModel} from './gusek-exam-r13.mjs';
const url=process.env.LH_R15_BROWSER_URL;
const executablePath=process.env.LH_R14_CHROMIUM;
if(!/^http:\/\/127\.0\.0\.1:\d{4,5}\/pilot\/gusek$/.test(url??'')||
 !executablePath?.startsWith('/'))throw Error('explicit_loopback_and_chromium_required');
const task=makeGusekTask('transport',42);
const model=trustedGusekModel(task);
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
  }catch{/* Observe metadata only. Never intercept or log learner text. */}
 });
 const doc=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(doc?.status(),200,'R15 requires HTTP 200 on fresh entry');
 await page.waitForFunction(
  ()=>document.querySelector('[data-testid="gusek-workbench-r14"]')?.getAttribute('data-hydrated')==='true',
  {timeout:15000});
 await check('R15_NO_SUGGESTION_BEFORE_GRADE',async()=>{
  assert.equal(await page.$('[data-testid="gusek-r15-recommendation"]'),null);
 });
 await check('R15C_NO_ITINERARY_BEFORE_GRADE',async()=>{
  assert.equal(await page.$('[data-testid="gusek-r15c-plan"]'),null);
 });
 await page.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()==='Új feladat');
  if(!b)throw Error('missing_user_requested_task_button');b.click();
 });
 await check('R15_REAL_TASK_LOADED',async()=>{
  await page.waitForFunction(id=>document.querySelector('[aria-label="Vizsgafeladat"]')?.textContent?.includes(id),{timeout:15000},task.id);
  assert.equal(counts.get,1);
  assert.equal(counts.post,0);
 });
 const text=async(selector,value)=>{
  await page.$eval(selector,(el,source)=>{
   const base=el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;
   const setter=Object.getOwnPropertyDescriptor(base.prototype,'value')?.set;
   if(!setter)throw Error('native_input_setter_required');
   setter.call(el,source);
   el.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
 };
 await text('[data-testid="gusek-exam-source-r14"]',model);
 await page.waitForFunction(expected=>
  document.querySelector('[data-testid="gusek-exam-source-state-r14z"]')?.getAttribute('data-source-length')===String(expected),
  {timeout:15000},model.length);
 await text('#gusek-objective','0');
 await page.$eval('#gusek-objective',el=>el.blur());
 await check('R15_GRADE_IS_EXPLICIT',async()=>{
  assert.equal(counts.post,0);
  assert.equal(await page.$('[data-testid="gusek-r15-recommendation"]'),null);
 });
 await page.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()==='Teljes megoldás ellenőrzése');
  if(!b||b.disabled)throw Error('grade_button_unavailable');b.click();
 });
 await check('R15_REAL_BINARY_SERVER_GRADE',async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-grade-r14z"]')?.getAttribute('data-grade-points')==='0',
   {timeout:20000});
  assert.equal(counts.post,1);
 });
 await check('R15_BOUNDED_REPAIR_SUGGESTION',async()=>{
  await page.waitForSelector('[data-testid="gusek-r15-recommendation"]',{timeout:12000});
  const text=await page.$eval('[data-testid="gusek-r15-recommendation"]',el=>el.textContent);
  assert.match(text,/Következő gyakorlási javaslat/);
  assert.match(text,/43\. variáns/);
  assert.doesNotMatch(text,/optimális érték:|biztosan felkészült/);
 });
 await check('R15B_GROUNDED_THREE_STEP_PLAN',async()=>{
  const plan=await page.$('[data-testid="gusek-r15b-diagnostic"]');
  assert.ok(plan,'repair guidance must appear only after real grade');
  const state=await page.$eval('[data-testid="gusek-r15b-diagnostic"]',el=>el.getAttribute('data-repair-state'));
  assert.equal(state,'repair');
  const steps=await page.$$eval('[data-testid="gusek-r15b-steps"] li',els=>els.map(el=>el.textContent?.trim()));
  assert.equal(steps.length,3);
  assert.ok(steps.every(t=>typeof t==='string'&&t.length>10));
  const raw=await page.$eval('[data-testid="gusek-r15b-diagnostic"]',el=>el.textContent);
  assert.doesNotMatch(raw,/answerSha256|secret_token|1\/1 – TELJESEN HELYES/);
  assert.equal(counts.post,1);
 });
 await check('R15C_THREE_DISTINCT_MANUAL_STOPS',async()=>{
  const section=await page.$('[data-testid="gusek-r15c-plan"]');
  assert.ok(section,'a real server grade must produce the itinerary');
  const tasks=await page.$$eval('[data-testid="gusek-r15c-steps"] li',els=>els.map(el=>el.textContent?.trim()));
  assert.equal(tasks.length,3);
  const buttons=await page.$$('[data-testid^="gusek-r15c-select-"]');
  assert.equal(buttons.length,3);
  const labels=await page.$$eval('[data-testid="gusek-r15c-steps"] li',els=>els.map(el=>el.textContent));
  assert.match(labels[0],/43\. variáns/);
  assert.match(labels[1],/Fröccs/);
  assert.match(labels[2],/44\. variáns/);
  assert.equal(counts.post,1);
 });
 await check('R15C_EVIDENCE_COUNTS_ONLY',async()=>{
  const rows=await page.$$('[data-testid^="gusek-r15c-progress-"]');
  assert.equal(rows.length,3);
  const count=await page.$eval('[data-testid="gusek-r15c-count"]',el=>el.textContent);
  assert.match(count,/1 ellenőrzött kísérlet/);
  assert.equal(counts.post,1);
 });
 const before={...counts};
 await page.click('[data-testid="gusek-r15-choose"]');
 await check('R15_SELECTION_NEVER_AUTOSTARTS',async()=>{
  await page.waitForFunction(()=>document.querySelector('input[aria-label="Feladatvariáns"]')?.value==='43',
   {timeout:12000});
  assert.equal(await page.$('[aria-label="Vizsgafeladat"]'),null);
  assert.deepEqual(counts,before,'no task GET or scoring POST on choosing recommendation');
 });
 await check('R15B_PLAN_CLEARS_ON_SELECTION',async()=>{
  assert.equal(await page.$('[data-testid="gusek-r15b-diagnostic"]'),null);
  assert.deepEqual(counts,before,'selection alone must not trigger a request');
 });
 await check('R15C_PLAN_CLEARS_ON_SELECTION',async()=>{
  assert.equal(await page.$('[data-testid="gusek-r15c-plan"]'),null);
  assert.deepEqual(counts,before);
 });
 await page.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()==='Új feladat');
  if(!b||b.disabled)throw Error('new_task_button_unavailable');b.click();
 });
 await check('R15_EXPLICIT_NEXT_TASK',async()=>{
  await page.waitForFunction(()=>document.querySelector('[aria-label="Vizsgafeladat"]')?.textContent?.includes('gusek-transport-43'),
   {timeout:15000});
  assert.equal(counts.get,before.get+1);
  assert.equal(counts.post,before.post);
 });
 await text('#gusek-objective','0');
 await page.$eval('#gusek-objective',el=>el.blur());
 await page.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()==='Teljes megoldás ellenőrzése');
  if(!b||b.disabled)throw Error('second_grade_unavailable');b.click();
 });
 await check('R15C_SECOND_REAL_GRADE_FOR_ITINERARY',async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-grade-r14z"]')?.getAttribute('data-grade-points')==='0',
   {timeout:20000});
  await page.waitForSelector('[data-testid="gusek-r15c-plan"]',{timeout:10000});
  assert.equal(counts.post,2);
 });
 const beforeSequence={...counts};
 await page.click('[data-testid="gusek-r15c-select-2"]');
 await check('R15C_INTERLEAVE_MANUAL_SELECTION_NO_REQUEST',async()=>{
  await page.waitForFunction(()=>document.querySelector('select[aria-label="Feladattípus"]')?.value==='froccs'&&
    document.querySelector('input[aria-label="Feladatvariáns"]')?.value==='44',{timeout:10000});
  assert.equal(await page.$('[aria-label="Vizsgafeladat"]'),null);
  assert.equal(await page.$('[data-testid="gusek-r15c-plan"]'),null);
  assert.deepEqual(counts,beforeSequence);
 });
 await page.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(el=>el.textContent?.trim()==='Új feladat');
  if(!b||b.disabled)throw Error('third_task_button_unavailable');b.click();
 });
 await check('R15C_INTERLEAVE_REQUIRES_EXPLICIT_TASK',async()=>{
  await page.waitForFunction(()=>document.querySelector('[aria-label="Vizsgafeladat"]')?.textContent?.includes('gusek-froccs-44'),{timeout:15000});
  assert.equal(counts.get,beforeSequence.get+1);
  assert.equal(counts.post,beforeSequence.post);
 });
 assert.deepEqual(checks,[
  'R15_NO_SUGGESTION_BEFORE_GRADE','R15C_NO_ITINERARY_BEFORE_GRADE','R15_REAL_TASK_LOADED',
  'R15_GRADE_IS_EXPLICIT','R15_REAL_BINARY_SERVER_GRADE',
  'R15_BOUNDED_REPAIR_SUGGESTION','R15B_GROUNDED_THREE_STEP_PLAN',
  'R15C_THREE_DISTINCT_MANUAL_STOPS','R15C_EVIDENCE_COUNTS_ONLY',
  'R15_SELECTION_NEVER_AUTOSTARTS','R15B_PLAN_CLEARS_ON_SELECTION','R15C_PLAN_CLEARS_ON_SELECTION',
  'R15_EXPLICIT_NEXT_TASK','R15C_SECOND_REAL_GRADE_FOR_ITINERARY',
  'R15C_INTERLEAVE_MANUAL_SELECTION_NO_REQUEST','R15C_INTERLEAVE_REQUIRES_EXPLICIT_TASK']);
 process.stdout.write(JSON.stringify({
  schema:'learnharness.r15.browser.v1',status:'PASS',checks,
  realServerGrade:true,nativeSolverUsed:false,automaticRequestOnRecommendation:false
 })+'\n');
}finally{await browser.close();}
