/** R14Z one-shot release evidence.
 * Only bounded local evidence hashes and non-sensitive summary fields are
 * exported. No runner token, model source, chat data, environment or stdout.
 * Does not execute commands, make requests, or alter the source checkout.
 */
import {createHash} from 'node:crypto';
import {existsSync,lstatSync,readFileSync,renameSync,writeFileSync} from 'node:fs';
import {basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const SHA=/^[a-f0-9]{40}$/;
const STEPS=new Set(['preflight','npm_ci','offline','npm_test','typecheck','next_build',
 'native_glpsol','server','browser_workbench','browser_practice','browser_live_native','final_git','final_receipt']);
const LOGS=Object.freeze([
 'npm-ci.log','offline.json','npm-test.log','typecheck.log','build.log',
 'native-glpk.json','next-server.log','browser-workbench.log','browser-practice.log','browser-live-native.log'
]);
const EXPECTED={offline:468,suites:37,npm:2824};
const LIVE_BROWSER_CHECKS=[
 'LIVE_NATIVE_UI_READY',
 ...['transport','froccs','tablet'].flatMap(kind=>[
  kind+'_SEEDED_TASK_LOADED',
  kind+'_EXACT_TRUSTED_SOURCE_ENTERED',
  kind+'_REAL_GLPK_OPTIMAL_COLUMNS',
  kind+'_EXPLICIT_TRANSFER_TO_NAMED_GRID',
  kind+'_REAL_INDEPENDENT_FULL_CREDIT'
 ])
];
const validName=n=>typeof n==='string'&&LOGS.includes(n);
const boundedLog=b=>b.length<=64*1024*1024;
export function validateFinalR14z({head,status,step,logs,offline,native,browsers}){
 if(!SHA.test(head??'')||!['PASS','FAIL'].includes(status)||!STEPS.has(step)||
    !logs||typeof logs!=='object'||Array.isArray(logs))return {status:'BLOCKED',reason:'invalid_final_inputs'};
 for(const [name,d] of Object.entries(logs))
  if(!validName(name)||!d||!Number.isSafeInteger(d.bytes)||d.bytes<0||
     !/^[a-f0-9]{64}$/.test(d.sha256??''))return {status:'BLOCKED',reason:'untrusted_evidence_metadata'};
 if(status==='FAIL')return {status:'FAIL',reason:'qualification_failed_at_'+step};
 if(step!=='final_receipt'||LOGS.some(n=>!logs[n]))return {status:'BLOCKED',reason:'missing_final_artifacts'};
 if(!offline||offline.schema!=='learnharness.operations-research.offline-verification.v1'||
    offline.status!=='PASS'||offline.totalTests!==EXPECTED.offline||
    !Array.isArray(offline.suites)||offline.suites.length!==EXPECTED.suites)
  return {status:'BLOCKED',reason:'offline_receipt_not_qualified'};
 if(!native||native.schema!=='learnharness.r14z.native-final.v1'||
    native.status!=='PASS'||native.translationOnly!=='GLPK_COMPLETED'||
    native.syntaxError!=='GLPK_ERROR'||native.scalar?.status!=='OPTIMAL'||
    native.indexed?.status!=='OPTIMAL'||native.indexed?.variables!==9||
    !Array.isArray(native.universityTasks)||native.universityTasks.length!==3||
    !['transport','froccs','tablet'].every(kind=>native.universityTasks.some(x=>
      x.kind===kind&&x.status==='OPTIMAL'&&x.points===1)))
  return {status:'BLOCKED',reason:'native_solver_receipt_not_qualified'};
 if(!Array.isArray(browsers)||browsers.length!==3||
    browsers.some(x=>!x||x.status!=='PASS'||!Array.isArray(x.checks))||
    browsers[0].schema!=='learnharness.r14.workbench-browser.v1'||
    browsers[0].checks.length!==11||
    browsers[1].schema!=='learnharness.r14z.practice-browser.v1'||
    browsers[1].checks.length!==15||
    browsers[1].mockedNativeOnly!==true||browsers[1].realPracticeGrade!==true||
    browsers[2].schema!=='learnharness.r14z.live-browser.v1'||
    browsers[2].checks.length!==LIVE_BROWSER_CHECKS.length||
    browsers[2].checks.some((name,index)=>name!==LIVE_BROWSER_CHECKS[index])||
    browsers[2].realNativeGlpk!==true||browsers[2].realPracticeGrade!==true||
    browsers[2].nativeCalls!==3||browsers[2].gradeCalls!==3||
    !Array.isArray(browsers[2].scenarios)||browsers[2].scenarios.length!==3||
    !['transport','froccs','tablet'].every((kind,index)=>{
      const x=browsers[2].scenarios[index];
      return x&&x.kind===kind&&x.taskId==='gusek-'+kind+'-42'&&
       x.nativeCalls===1&&x.gradeCalls===1&&x.points===1;
    }))
  return {status:'BLOCKED',reason:'browser_receipts_not_qualified'};
 return {status:'PASS',reason:null};
}
function readBrowserLog(file){
 const raw=readFileSync(file,'utf8').trim().split(/\r?\n/);
 const line=raw.at(-1);
 if(!line||line.length>32768)return null;
 try{return JSON.parse(line);}catch{return null;}
}
export function writeFinalR14zEvidence(dir,head,status,step){
 if(typeof dir!=='string'||!/^learnharness-r14z-final-[A-Za-z0-9]{8}$/.test(basename(dir))||
    !dir.startsWith('/tmp/'))throw Error('invalid_private_evidence_directory');
 if(!existsSync(dir)||!lstatSync(dir).isDirectory()||lstatSync(dir).isSymbolicLink())
  throw Error('evidence_directory_missing_or_symlinked');
 const logs={};
 for(const name of LOGS){
  const path=join(dir,name);
  if(!existsSync(path))continue;
  const stat=lstatSync(path);
  if(!stat.isFile()||stat.isSymbolicLink()||!boundedLog({length:stat.size}))
   throw Error('unsafe_evidence_log_'+name);
  const content=readFileSync(path);
  logs[name]={bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')};
 }
 const load=name=>{
  const file=join(dir,name);
  if(!logs[name])return null;
  try{const raw=readFileSync(file,'utf8');return raw.length<=512*1024?JSON.parse(raw):null;}catch{return null;}
 };
 const browsers=['browser-workbench.log','browser-practice.log','browser-live-native.log'].map(name=>
   logs[name]?readBrowserLog(join(dir,name)):null);
 const verdict=validateFinalR14z({head,status,step,logs,offline:load('offline.json'),
  native:load('native-glpk.json'),browsers});
 const receipt={
  schema:'learnharness.r14z.final-evidence.v1',
  expectedHead:head,status:verdict.status,reason:verdict.reason,
  lastStep:step,
  expected:{offline:EXPECTED.offline,suites:EXPECTED.suites,npm:EXPECTED.npm},
  logs,browserCheckCounts:browsers.map(x=>x?.checks?.length??null),
  limitations:['No provider send','Only operator-run local Fedora qualification']
 };
 const output=join(dir,'r14z-release-receipt.json'),temp=output+'.partial';
 writeFileSync(temp,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'w'});
 renameSync(temp,output);
 return receipt;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [dir,head,status,step]=process.argv.slice(2);
 const receipt=writeFinalR14zEvidence(dir,head,status,step);
 process.stdout.write(JSON.stringify({status:receipt.status,reason:receipt.reason,
  file:'r14z-release-receipt.json'})+'\n');
 if(status==='PASS'&&receipt.status!=='PASS')process.exitCode=1;
}
