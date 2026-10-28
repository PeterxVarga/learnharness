#!/usr/bin/env node
/** FINAL FEDORA ONLY: all THREE real Chromium -> Next.js -> rootless
 * Podman/GLPK -> machine-file columns -> explicit transfer -> independent
 * HTTP binary-grade journeys. Native endpoint is NEVER intercepted.
 *
 * The operator token and models are NEVER emitted to stdout/logs.
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

const checks=[],network={native:0,grade:0},scenarios=[];
const check=async(name,fn)=>{await fn();checks.push(name);};
const kinds=['transport','froccs','tablet'];
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
  }catch{/* Observe only: never intercept or rewrite any request. */}
 });
 await page.goto(url,{waitUntil:'networkidle2',timeout:30000});
 await check('LIVE_NATIVE_UI_READY',async()=>{
  assert.ok(await page.$('[data-testid="gusek-workbench-r14"]'));
  await page.waitForSelector('[data-testid="gusek-native-r14"]',{timeout:15000});
  assert.equal(await page.$('[data-testid="gusek-native-disabled-r14"]'),null);
 });
 const setText=async(selector,value)=>{
  await page.$eval(selector,(el,source)=>{
   const type=el.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;
   const setter=Object.getOwnPropertyDescriptor(type.prototype,'value')?.set;
   if(!setter)throw Error('native_input_setter_missing');
   setter.call(el,source);el.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
 };
 for(const kind of kinds){
  const task=makeGusekTask(kind,42);
  const model=trustedGusekModel(task)+'\nsolve;\nend;\n';
  const startNative=network.native,startGrade=network.grade;
  await page.select('select[aria-label="Feladattípus"]',kind);
  await page.evaluate(()=>{
   const button=[...document.querySelectorAll('button')].find(
    b=>b.textContent?.trim()==='Új feladat');
   if(!button||button.disabled)throw Error('new_task_button_unavailable');
   button.click();
  });
  await check(kind+'_SEEDED_TASK_LOADED',async()=>{
   await page.waitForFunction(id=>
    document.querySelector('[aria-label="Vizsgafeladat"]')?.textContent?.includes(id),
    {timeout:20000},task.id);
   assert.ok(await page.$('[data-testid="gusek-exam-source-r14"]'));
  });
  await setText('[data-testid="gusek-exam-source-r14"]',model);
  await check(kind+'_EXACT_TRUSTED_SOURCE_ENTERED',async()=>{
   await page.waitForFunction(expected=>
    document.querySelector('[data-testid="gusek-exam-source-r14"]')?.value===expected,
    {timeout:12000},model);
   assert.equal(await page.$eval('[data-testid="gusek-exam-source-r14"]',
    el=>el.value),model);
  });
  // Token stays only inside this local browser session. No storage or log.
  await setText('#gusek-native-token',token);
  await page.waitForFunction(()=>
   document.querySelector('[data-testid="gusek-native-solve-r14"]')?.disabled===false,
   {timeout:15000});
  await page.click('[data-testid="gusek-native-solve-r14"]');
  await check(kind+'_REAL_GLPK_OPTIMAL_COLUMNS',async()=>{
   await page.waitForFunction(()=>
    document.querySelector('[data-testid="gusek-transfer-solution-r14"]')?.disabled===false,
    {timeout:45000});
   assert.equal(network.native,startNative+1,kind+': exactly one native HTTP call');
   const output=await page.$eval('[data-testid="gusek-native-result-r14"]',el=>el.textContent);
   assert.match(output,/OPTIMAL/);
  });
  await page.click('[data-testid="gusek-transfer-solution-r14"]');
  await check(kind+'_EXPLICIT_TRANSFER_TO_NAMED_GRID',async()=>{
   await page.waitForFunction(()=>
    document.querySelector('#gusek-objective')?.value?.trim()!=='' &&
    document.querySelector('[data-testid="gusek-value-cell-0"]')?.value?.trim()!=='',
    {timeout:12000});
   const values=JSON.parse(await page.$eval('#gusek-values',el=>el.value));
   assert.deepEqual(Object.keys(values).sort(),[...task.variableNames].sort());
   for(const name of task.variableNames)
    assert.ok(Number.isFinite(values[name]),kind+': finite '+name);
   assert.equal((await page.$$('[data-testid^="gusek-value-cell-"]')).length,
    task.variableNames.length,kind+': every decision variable visible');
  });
  await page.evaluate(()=>{
   const button=[...document.querySelectorAll('button')].find(
    b=>b.textContent?.trim()==='Teljes megoldás ellenőrzése');
   if(!button||button.disabled)throw Error('grade_button_unavailable');
   button.click();
  });
  await check(kind+'_REAL_INDEPENDENT_FULL_CREDIT',async()=>{
   await page.waitForFunction(id=>{
    const grade=document.querySelector('[data-testid="gusek-grade-r14z"]');
    return grade?.getAttribute('data-task-id')===id &&
     grade?.getAttribute('data-grade-points')==='1';
   },{timeout:20000},task.id);
   const grade=await page.$eval('[data-testid="gusek-grade-r14z"]',el=>({
    taskId:el.getAttribute('data-task-id'),
    points:el.getAttribute('data-grade-points')
   }));
   assert.deepEqual(grade,{taskId:task.id,points:'1'});
   assert.equal(network.grade,startGrade+1,kind+': exactly one real grade POST');
  });
  scenarios.push({kind,taskId:task.id,nativeCalls:network.native-startNative,
   gradeCalls:network.grade-startGrade,points:1});
 }
 assert.equal(network.native,kinds.length);
 assert.equal(network.grade,kinds.length);
 process.stdout.write(JSON.stringify({
  schema:'learnharness.r14z.live-browser.v1',status:'PASS',checks,scenarios,
  realNativeGlpk:true,realPracticeGrade:true,
  nativeCalls:network.native,gradeCalls:network.grade
 })+'\n');
}finally{await browser.close();}
