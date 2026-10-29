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
const observed={native:[],grade:[]};
let expectedCurrent=null;
const verifiedResponses={native:[],grade:[]};
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
   const raw=request.postData()??'';
   let body;try{body=JSON.parse(raw);}catch{body=null;}
   if(u.pathname==='/api/pilot/gusek/native'){
    network.native++;
    observed.native.push({
     matchingModel:body?.model===expectedCurrent?.model,
     mode:body?.mode==='solve',data:body?.data==='',
     tokenAuthorized:request.headers()['x-lh-glpk-token']===token
    });
   }
   if(u.pathname==='/api/pilot/gusek'){
    network.grade++;
    observed.grade.push({
     matchingKind:body?.kind===expectedCurrent?.kind,
     matchingSeed:body?.seed==='42',
     matchingModel:body?.answer?.mathprog===expectedCurrent?.model,
     finiteValues:body?.answer?.values&&typeof body.answer.values==='object'&&
      expectedCurrent?.variableNames?.every(k=>Number.isFinite(body.answer.values[k])),
     finiteObjective:Number.isFinite(body?.answer?.reportedObjective)
    });
   }
  }catch{/* Observe only: never intercept or rewrite any request. */}
 });
 page.on('response',response=>{
  try{
   const request=response.request(),u=new URL(response.url());
   if(u.origin!==new URL(url).origin||request.method()!=='POST')return;
   const bucket=u.pathname==='/api/pilot/gusek/native'?'native':
    u.pathname==='/api/pilot/gusek'?'grade':null;
   if(!bucket)return;
   verifiedResponses[bucket].push((async()=>{
    try{
     const body=await response.json();
     if(bucket==='native')return {
      http:response.status(),schema:body?.schema,status:body?.status,
      solverStatus:body?.solverStatus,columnStatus:body?.columnStatus,
      graded:body?.graded,points:body?.points,
      names:Array.isArray(body?.columns)?body.columns.map(c=>c.name):[],
      validValues:Array.isArray(body?.columns)&&
       body.columns.every(c=>Number.isFinite(c?.value))
     };
     return {http:response.status(),schema:body?.schema,taskId:body?.taskId,
      points:body?.points,maxPoints:body?.maxPoints};
    }catch{return {http:response.status(),invalidJson:true};}
   })());
  }catch{/* No interception and no full response body in receipt. */}
 });
 // A quiet network is not proof that Next.js hydrated the GUSEK UI.
 // Require real document HTTP success, then exercise the rendered controls.
 const documentResponse=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(documentResponse?.status(),200,'gusek_document_must_return_http_200');
 await page.waitForSelector('[data-testid="gusek-workbench-r14"]',{timeout:15000});
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
  expectedCurrent={kind,model,variableNames:task.variableNames};
  await page.select('select[aria-label="Feladattípus"]',kind);
  // React 19 can commit select state after Puppeteer has returned.
  await page.waitForFunction(expected=>
   document.querySelector('[data-testid="gusek-task-controls-r14z"]')?.getAttribute('data-rendered-kind')===expected,
   {timeout:12000},kind);
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
    document.querySelector('[data-testid="gusek-exam-source-r14"]')?.value===expected &&
    document.querySelector('[data-testid="gusek-exam-source-state-r14z"]')?.getAttribute('data-source-length')===String(expected.length),
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
   assert.deepEqual(observed.native.at(-1),{
    matchingModel:true,mode:true,data:true,tokenAuthorized:true
   },kind+': real native request payload and local token');
   const proofs=await Promise.all(verifiedResponses.native.slice(startNative));
   assert.equal(proofs.length,1,kind+': exactly one GLPK HTTP response');
   const proof=proofs[0];
   assert.equal(proof.http,200);
   assert.equal(proof.schema,'learnharness.glpk-native-diagnostic.r14');
   assert.equal(proof.status,'GLPK_COMPLETED');
   assert.equal(proof.solverStatus,'OPTIMAL');
   assert.equal(proof.columnStatus,'OPTIMAL_COLUMNS');
   assert.equal(proof.graded,false);
   assert.equal(proof.points,null);
   assert.equal(proof.validValues,true);
   assert.deepEqual([...proof.names].sort(),[...task.variableNames].sort());
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
   const outbound=observed.grade.at(-1);
   assert.ok(outbound&&Object.values(outbound).every(Boolean),kind+': exact grade payload');
   const proof=(await Promise.all(verifiedResponses.grade.slice(startGrade)));
   assert.equal(proof.length,1,kind+': exactly one grader response');
   assert.deepEqual(proof[0],{
    http:200,schema:'learnharness.gusek-grade.r13',
    taskId:task.id,points:1,maxPoints:1
   },kind+': independent server grade response');
  });
  scenarios.push({kind,taskId:task.id,nativeCalls:network.native-startNative,
   gradeCalls:network.grade-startGrade,points:1});
 }
 assert.equal(network.native,kinds.length);
 assert.equal(network.grade,kinds.length);
 process.stdout.write(JSON.stringify({
  schema:'learnharness.r14z.live-browser.v1',status:'PASS',checks,scenarios,
  realNativeGlpk:true,realPracticeGrade:true,
  verifiedNativeResponses:verifiedResponses.native.length,
  verifiedGradeResponses:verifiedResponses.grade.length,
  verifiedExactRequestBodies:observed.native.length===3&&observed.grade.length===3&&
   observed.native.every(x=>Object.values(x).every(Boolean))&&
   observed.grade.every(x=>Object.values(x).every(Boolean)),
  nativeCalls:network.native,gradeCalls:network.grade
 })+'\n');
}finally{await browser.close();}
