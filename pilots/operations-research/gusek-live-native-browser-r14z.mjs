#!/usr/bin/env node
/** FINAL FEDORA ONLY: real Chromium -> local Next -> rootless Podman glpsol
 * -> machine-file named columns -> explicit Practice transfer -> real HTTP
 * binary grade. NO request interception, no simulated native endpoint.
 * No solver token, student source or raw HTTP response is printed.
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {makeGusekTask,trustedGusekModel} from './gusek-exam-r13.mjs';

const url=process.env.LH_R14_BROWSER_URL;
const executablePath=process.env.LH_R14_CHROMIUM;
const token=process.env.LH_GLPK_RUN_TOKEN;
if(!/^http:\/\/127\.0\.0\.1:\d{4,5}\/pilot\/gusek$/.test(url??''))
 throw Error('loopback_browser_url_required');
if(!executablePath?.startsWith('/')||!/^[a-f0-9]{64}$/.test(token??''))
 throw Error('explicit_chromium_and_native_token_required');
const task=makeGusekTask('tablet',42);
const model=trustedGusekModel(task)+'\nsolve;\nend;\n';
const checks=[],network={native:0,grade:0};
const check=async(label,fn)=>{await fn();checks.push(label);};
const browser=await puppeteer.launch({
 executablePath,headless:true,args:['--disable-dev-shm-usage']
});
try{
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:900});
 page.on('request',request=>{
  try{
   const u=new URL(request.url());
   if(u.origin!==new URL(url).origin||request.method()!=='POST')return;
   if(u.pathname==='/api/pilot/gusek/native')network.native++;
   if(u.pathname==='/api/pilot/gusek')network.grade++;
  }catch{/* Observational only. No request interception or mutation. */}
 });
 await page.goto(url,{waitUntil:'networkidle2',timeout:30000});
 await check('ACTUAL_PRACTICE_AND_NATIVE_UI',async()=>{
  assert.ok(await page.$('[data-testid="gusek-workbench-r14"]'));
  await page.waitForSelector('[data-testid="gusek-native-r14"]',{timeout:15000});
  assert.equal(await page.$('[data-testid="gusek-native-disabled-r14"]'),null);
 });
 await page.select('select[aria-label="Feladattípus"]','tablet');
 await page.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Új feladat');
  if(!b)throw Error('new_task_button_missing');b.click();
 });
 await check('EXACT_SEEDED_TABLET_FROM_REAL_NEXT_API',async()=>{
  await page.waitForFunction(id=>
   document.querySelector('[aria-label="Vizsgafeladat"]')?.textContent?.includes(id),
   {timeout:15000},task.id);
  assert.ok(await page.$('[data-testid="gusek-exam-source-r14"]'));
 });
 await page.$eval('[data-testid="gusek-exam-source-r14"]',(element,source)=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')?.set;
  if(!setter)throw Error('textarea_native_setter_missing');
  setter.call(element,source);
  element.dispatchEvent(new Event('input',{bubbles:true}));
 },model);
 await check('CURRENT_SOURCE_IS_THE_EXACT_TRUSTED_MODEL',async()=>{
  await page.waitForFunction(expected=>
   document.querySelector('[data-testid="gusek-exam-source-r14"]')?.value===expected,
   {timeout:10000},model);
  assert.equal(await page.$eval('[data-testid="gusek-exam-source-r14"]',el=>el.value),model);
 });
 await page.$eval('#gusek-native-token',(el,secret)=>{
  const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  if(!setter)throw Error('input_native_setter_missing');
  setter.call(el,secret);
  el.dispatchEvent(new Event('input',{bubbles:true}));
 },token);
 await page.waitForFunction(()=>
  document.querySelector('[data-testid="gusek-native-solve-r14"]')?.disabled===false,
  {timeout:15000});
 await page.click('[data-testid="gusek-native-solve-r14"]');
 await check('LIVE_GLPK_OPTIMAL_MACHINE_COLUMNS',async()=>{
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-transfer-solution-r14"]')?.disabled===false,
   {timeout:45000});
  assert.equal(network.native,1,'Expected one REAL local GLPK HTTP call');
  const result=await page.$eval('[data-testid="gusek-native-result-r14"]',el=>el.textContent);
  assert.match(result,/OPTIMAL/);
 });
 await page.click('[data-testid="gusek-transfer-solution-r14"]');
 await check('EXPLICIT_OPTIMUM_TRANSFER_TO_REAL_NUMERICAL_GRID',async()=>{
  await page.waitForFunction(()=>document.querySelector('#gusek-objective')?.value?.trim()!=='' &&
   document.querySelector('[data-testid="gusek-value-cell-0"]')?.value?.trim()!=='',
   {timeout:10000});
  const values=JSON.parse(await page.$eval('#gusek-values',el=>el.value));
  assert.deepEqual(Object.keys(values).sort(),[...task.variableNames].sort());
  for(const n of task.variableNames)assert.ok(Number.isFinite(values[n]),'Finite '+n);
  assert.equal((await page.$$('[data-testid^="gusek-value-cell-"]')).length,2);
 });
 await page.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Teljes megoldás ellenőrzése');
  if(!b)throw Error('grade_button_missing');b.click();
 });
 await check('REAL_BINARY_FULL_CREDIT_FROM_INDEPENDENT_NEXT_GRADE',async()=>{
  await page.waitForFunction(id=>{
   const g=document.querySelector('[data-testid="gusek-grade-r14z"]');
   return g?.getAttribute('data-task-id')===id&&g?.getAttribute('data-grade-points')==='1';
  },{timeout:20000},task.id);
  const grade=await page.$eval('[data-testid="gusek-grade-r14z"]',el=>({
   taskId:el.getAttribute('data-task-id'),
   points:el.getAttribute('data-grade-points')
  }));
  assert.deepEqual(grade,{taskId:task.id,points:'1'});
  assert.equal(network.grade,1,'Expected one REAL grade POST');
 });
 process.stdout.write(JSON.stringify({
  schema:'learnharness.r14z.live-browser.v1',status:'PASS',
  checks,realNativeGlpk:true,realPracticeGrade:true,
  nativeCalls:network.native,gradeCalls:network.grade,
  taskKind:task.kind,taskId:task.id
 })+'\n');
}finally{await browser.close();}
