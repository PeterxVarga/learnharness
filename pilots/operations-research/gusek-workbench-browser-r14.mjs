#!/usr/bin/env node
/** Final-acceptance only: requires a running local LearnHarness and Chromium.
 * Does not use a real solver or send student documents/providers.
 * Run at release-candidate final Fedora qualification, not per-commit.
 */
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const url=process.env.LH_R14_BROWSER_URL??'http://127.0.0.1:3000/pilot/gusek';
const executablePath=process.env.LH_R14_CHROMIUM;
if(!/^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}\/pilot\/gusek$/.test(url))
 throw new Error('Browser acceptance URL must be local /pilot/gusek');
if(!executablePath||!executablePath.startsWith('/'))throw new Error('LH_R14_CHROMIUM must be absolute Chromium path');
const report={schema:'learnharness.r14.workbench-browser.v1',checks:[]};
const check=async(name,fn)=>{await fn();report.checks.push(name);process.stdout.write('PASS '+name+'\n');};
const browser=await puppeteer.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:900});
 await page.goto(url,{waitUntil:'networkidle2',timeout:30000});
 await check('WORKBENCH_ENTRY',async()=>{
  await page.waitForSelector('[data-testid="gusek-workbench-r14"]');
  assert.equal(await page.$('[data-testid="gusek-mode-practice-r14"]')!==null,true);
 });
 await page.click('[data-testid="gusek-mode-free-r14"]');
 await check('FREE_FILE_TABS',async()=>{
  await page.waitForSelector('[data-testid="gusek-free-model-r14"]');
  assert.equal(await page.$('[data-testid="gusek-file-data-dat-r14"]')!==null,true);
 });
 const target='var y >= 0;\nminimize obj: y;\ns.t. cap: y <= 7;\nsolve;\nend;';
 const editor='[data-testid="gusek-free-model-r14"]';
 await page.click(editor);
 await page.keyboard.down('Control');await page.keyboard.press('a');await page.keyboard.up('Control');
 await page.keyboard.type(target,{delay:1});
 await check('GMPL_EDITOR_EDIT',async()=>{
  const value=await page.$eval(editor,e=>e.value);
  assert.equal(value,target);
 });
 await check('GMPL_EDITOR_SEARCH',async()=>{
  await page.click('[data-testid="gusek-free-model-r14-shell"] button');
  await page.type('input[aria-label="Keresett szöveg"]','minimize');
  await page.click('[data-testid="gusek-editor-find-r14"] button');
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-editor-find-r14"]')?.textContent?.includes('Találat:'));
 });
 await check('LOCAL_DRAFT_PERSISTENCE',async()=>{
  await page.waitForFunction(()=>document.querySelector('[data-testid="gusek-draft-status-r14"]')?.textContent?.includes('Helyben mentve'),{timeout:10000});
  await page.reload({waitUntil:'networkidle2',timeout:30000});
  await page.click('[data-testid="gusek-mode-free-r14"]');
  await page.waitForSelector(editor);
  assert.equal(await page.$eval(editor,e=>e.value),target);
 });
 await check('FREE_MODE_NO_GRADE_AUTHORITY',async()=>{
  assert.equal(await page.$('[data-testid="gusek-transfer-solution-r14"]'),null);
  assert.equal(await page.$('[data-testid="gusek-free-disabled-r14"]')!==null,true);
 });
 await page.click('[data-testid="gusek-mode-practice-r14"]');
 await check('PRACTICE_STILL_AVAILABLE',async()=>{
  const test=await page.$('[data-testid="gusek-exam-r13"]');assert.ok(test);
  const button=await page.$('[data-testid="gusek-mode-practice-r14"]');
  assert.ok(button);
 });
 await check('PRACTICE_GMPL_EDITOR',async()=>{
  const buttons=await page.$$('button');assert.ok(buttons.length>0);
  await page.evaluate(()=>{
   const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent?.includes('Új feladat'));
   if(!b)throw new Error('no_new_task_button');
   b.click();
  });
  await page.waitForSelector('[data-testid="gusek-exam-source-r14"]',{timeout:10000});
 });
 await check('FREE_DRAFT_SURVIVES_MODE_SWITCH',async()=>{
  await page.click('[data-testid="gusek-mode-free-r14"]');
  assert.equal(await page.$eval(editor,e=>e.value),target);
 });
 report.status='PASS';report.total=report.checks.length;
 process.stdout.write(JSON.stringify(report)+'\n');
}finally{await browser.close();}
