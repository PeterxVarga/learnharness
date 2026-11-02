/** R16.20: local-only source-pinned theory→exercise browser smoke. No login or send. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const app=resolve(process.argv[2]||'');
assert.ok(process.argv[2]&&app,'Usage: node r1620-theory-first-browser.mjs /absolute/candidate/assembled');
const receipt=JSON.parse(readFileSync(join(app,'../evidence/assembly.json'),'utf8'));
assert.equal(receipt.profile,'workbench');
assert.equal(receipt.upstream_sha,'80f225d1fe16483b8e018b51dbfef4465262156e');
assert.equal(receipt.native_glpk_enabled_by_r16,false);
const puppeteer=createRequire(join(app,'package.json'))('puppeteer-core');
const browserBin=process.env.LH_BROWSER_BIN || execFileSync('which',['brave-browser'],{encoding:'utf8'}).trim();
const workspace=mkdtempSync(join(tmpdir(),'lh-r1620-theory-'));
let server, browser;
const logs=[];
async function freePort() {
  return new Promise((resolvePort,reject)=>{
    const s=createServer();
    s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(err=>err?reject(err):resolvePort(p));});
  });
}
async function waitReady(url) {
  for(let i=0;i<75;i++){
    try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(r.status===200)return;}
    catch {}
    await delay(250);
  }
  throw Error('LOCAL_HTTP_NOT_READY');
}
async function clickText(page,label) {
  const buttons=await page.$$('button');
  for (const el of buttons){
    if((await el.evaluate(x=>x.textContent.trim()))===label) {await el.click();return;}
  }
  throw Error('MISSING_BUTTON '+label);
}
try {
 const port=await freePort();
 const url='http://127.0.0.1:'+port+'/pilot/gusek/szakmai';
 server=spawn(process.execPath,[join(app,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{
   cwd:app,env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',LH_GLPK_ENABLE_LOCAL:'0',
      LH_DATA_DIR:join(workspace,'data'),LH_AUTH_FILE:join(workspace,'auth.json')},
   stdio:['ignore','pipe','pipe']
 });
 server.stdout.on('data',b=>logs.push(b.toString()));
 server.stderr.on('data',b=>logs.push(b.toString()));
 await waitReady(url);
 browser=await puppeteer.launch({executablePath:browserBin,headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],userDataDir:join(workspace,'chrome')});
 const page=await browser.newPage();
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(response.status(),200);
 await page.waitForSelector('[data-testid="or-theory"]',{timeout:15000});
 assert.equal(await page.$('#or-model'),null,'theory must be shown before answer model');
 assert.equal(await page.$('[data-testid="or-theory-check"] input[type="radio"]')!==null,true);
 await page.$$eval('input[name="or-theory-answer"]',items=>items[1].click());
 await page.waitForFunction(()=>document.querySelector('[data-testid="or-theory-feedback"]')?.textContent.includes('Helyes.'));
 console.log('R1620_THEORY_ASSIGNMENT=PASS');
 await clickText(page,'Tovább a saját feladatmegoldáshoz');
 await page.waitForSelector('button');
 await clickText(page,'Feladat betöltése');
 await page.waitForSelector('#or-model',{timeout:15000});
 assert.ok((await page.$eval('#or-model',e=>e.value)).length>15);
 console.log('R1620_THEORY_TO_PRACTICE=PASS');
 await clickText(page,'1. Elmélet');
 await page.waitForSelector('[data-testid="or-theory"]');
 await page.select('[data-testid="or-theory"] select','production');
 assert.equal(await page.$('#or-model'),null);
 await page.$$eval('input[name="or-theory-answer"]',items=>items[2].click());
 await page.waitForFunction(()=>document.querySelector('[data-testid="or-theory-feedback"]')?.textContent.includes('Helyes.'));
 console.log('R1620_THEORY_PRODUCTION=PASS');
 await clickText(page,'Tovább a saját feladatmegoldáshoz');
 await clickText(page,'Feladat betöltése');
 await page.waitForSelector('#or-model',{timeout:15000});
 console.log('R1620_PRODUCTION_PRACTICE=PASS');
 console.log('R1620_THEORY_BROWSER=PASS');
} catch(e) {
 console.error('R1620_THEORY_BROWSER=FAIL',e?.stack||String(e));
 console.error('BOUNDED_SERVER_LOG',logs.join('').slice(-1800));
 process.exitCode=1;
} finally {
 if(browser)await browser.close().catch(()=>{});
 if(server){server.kill('SIGTERM');await delay(200);if(server.exitCode===null)server.kill('SIGKILL');}
 rmSync(workspace,{recursive:true,force:true});
}
