#!/usr/bin/env node
/** R10 exact-commit release qualification. No learner .mod execution, no provider calls. */
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync, chmodSync, mkdirSync, realpathSync, renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const EXPECTED_SUITES=Object.freeze({
 'reference-oracles':4,'glpk-contract':6,'pdf-provenance':15,'hu-course-optin':17,
 'exam-all-or-nothing':12,'r3-transport-exam':12,'r3-transport-cli':5,
 'r4-next-api-transport':9,'r4-mathprog-generation':8,'r5-native-glpsol-preflight':7,
 'r6-expanded-mathprog':23,'r6-mathprog-http':9,'r7-indexed-mathprog':18,
 'r7-indexed-mathprog-http':11,'r9-authoritative-attempts':15,'r11-formative-feedback':17,'r12-native-practice':12,'r13-gusek-model':22,'r13-gusek-http':6,'r14-scalar-equivalence':16,'r14n-native-glpsol-sandbox':18,'r14-glpk-machine-status':12,'r14-native-http-security':16,'r14-indexed-transport':20,'r14-indexed-http':8,'r14-workbench-files':14,'r14-glpk-columns':12,'r14-practice-transfer':13,'r14-glpk-async-runtime':12,'r14-gmpl-editor':16,'r14z-practice-draft':8,'r14z-local-projects':8,
});
export const EXPECTED_TESTS=Object.values(EXPECTED_SUITES).reduce((x,y)=>x+y,0);
export const REQUIRED_STEPS=Object.freeze(['git_pin','git_tree','offline','r10_selftests','npm_ci','npm_test','typecheck','next_build','native_glpsol']);
const hex40=/^[a-f0-9]{40}$/;
const hash=s=>createHash('sha256').update(s).digest('hex');
export function validateOfflineReceipt(r){
 if(!r||r.status!=='PASS'||r.totalTests!==EXPECTED_TESTS||!Array.isArray(r.suites)||r.suites.length!==Object.keys(EXPECTED_SUITES).length)return false;
 const seen=new Set();
 for(const s of r.suites){if(!s||!Object.hasOwn(EXPECTED_SUITES,s.name)||seen.has(s.name)||s.passed!==EXPECTED_SUITES[s.name])return false;seen.add(s.name);}
 return Boolean(r.sourceSha256&&typeof r.sourceSha256==='object'&&Object.keys(r.sourceSha256).length>=24&&Object.values(r.sourceSha256).every(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)));
}
export function overallStatus(steps){
 if(!steps||typeof steps!=='object')return 'BLOCKED';
 if(REQUIRED_STEPS.some(k=>steps[k]?.status==='FAIL'))return 'FAIL';
 return REQUIRED_STEPS.every(k=>steps[k]?.status==='PASS')?'PASS':'BLOCKED';
}
export function parseArgs(args){
 const out={repo:null,expectedHead:null,output:null,fullBuild:false,native:false};
 for(let i=0;i<args.length;i++){
  const k=args[i];
  if((k==='--repo'||k==='--expected-head'||k==='--output')&&!out[k.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]&&args[i+1]&&!args[i+1].startsWith('--')){
   out[k.slice(2).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=args[++i];
  } else if(k==='--full-build'&&!out.fullBuild)out.fullBuild=true;
  else if(k==='--native'&&!out.native)out.native=true;
  else throw new Error('invalid_or_duplicate_args');
 }
 if(!out.repo||!hex40.test(out.expectedHead??''))throw new Error('exact_repo_and_expected_head_required');
 return out;
}
/** Only explicit runtime evidence can turn BLOCKED into PASS. */
export function qualify({repo,expectedHead,output=null,fullBuild=false,native=false}){
 if(!hex40.test(expectedHead))throw new Error('invalid_expected_head');
 const root=realpathSync(resolve(repo));
 const dir=output?resolve(output):mkdtempSync(join(tmpdir(),'lh-r10-'));
 if(dir===root||dir.startsWith(root+'/'))throw new Error('evidence_must_be_outside_repo');
 mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
 const receipt={schema:'learnharness.r10.qualification.v1',expectedHead,repo:root,steps:{},status:'BLOCKED',timestamp:new Date().toISOString(),limitations:['No arbitrary learner MathProg execution','No remote AI call','No GitHub Actions','Not a proctored exam']};
 const save=()=>{receipt.status=overallStatus(receipt.steps);const dest=join(dir,'r10-receipt.json');writeFileSync(dest+'.partial',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});renameSync(dest+'.partial',dest);};
 const env={PATH:process.env.PATH??'/usr/bin:/bin',HOME:process.env.HOME??tmpdir(),LANG:'C.UTF-8',LC_ALL:'C',CI:'1',NEXT_TELEMETRY_DISABLED:'1',ELECTRON_SKIP_BINARY_DOWNLOAD:'1',npm_config_update_notifier:'false'};
 const run=(key,exe,args,{timeout=180000,verify=null,blocked=null}={})=>{
  const r=spawnSync(exe,args,{cwd:root,env,encoding:'utf8',shell:false,timeout,maxBuffer:10*1024*1024});
  const payload=(r.stdout??'')+'\n---STDERR---\n'+(r.stderr??'');const logfile=join(dir,key+'.log');writeFileSync(logfile,payload,{mode:0o600});
  const ev={status:'FAIL',exitCode:r.status,sha256:hash(payload),log:logfile,error:r.error?.code??null};
  if(blocked?.(r)){ev.status='BLOCKED';ev.error='unavailable_environment';}
  else if(!r.error&&!r.signal&&r.status===0){try{verify?.(r.stdout);ev.status='PASS';}catch(e){ev.error=String(e);}}
  receipt.steps[key]=ev;save();return ev.status==='PASS';
 };
 save();
 if(!run('git_pin','git',['rev-parse','HEAD'],{verify:s=>{if(s.trim()!==expectedHead)throw Error('SHA_MISMATCH');}}))return receipt;
 if(!run('git_tree','git',['status','--porcelain','--untracked-files=normal'],{verify:s=>{if(s.trim())throw Error('DIRTY_WORKTREE');}}))return receipt;
 if(!run('offline',process.execPath,['pilots/operations-research/verify-offline.mjs'],{timeout:240000,verify:s=>{
  const v=JSON.parse(s);if(!validateOfflineReceipt(v))throw Error('OFFLINE_RECEIPT_INCOMPLETE');receipt.offlineSourceSha256=v.sourceSha256;
 }}))return receipt;
 if(!run('r10_selftests',process.execPath,['--test','pilots/operations-research/qualify-release-r10.test.mjs'],{timeout:90000,verify:s=>{if(!/# tests 12(?:\r?\n)/.test(s)||!/# pass 12(?:\r?\n)/.test(s)||!/# fail 0(?:\r?\n)/.test(s))throw Error('R10_GATE_SELFTESTS_FAILED');}}))return receipt;
 if(!fullBuild){for(const k of ['npm_ci','npm_test','typecheck','next_build'])receipt.steps[k]={status:'BLOCKED',reason:'full_build_not_requested'};}
 else{
  let ok=true;for(const [k,exe,args] of [['npm_ci','npm',['ci','--no-audit','--no-fund']],['npm_test','npm',['test']],['typecheck','npm',['run','typecheck']],['next_build','npm',['run','build']]]){
   if(!ok){receipt.steps[k]={status:'BLOCKED',reason:'previous_build_gate_failed'};continue;}
   ok=run(k,exe,args,{timeout:300000});
  }
 }
 if(!native)receipt.steps.native_glpsol={status:'BLOCKED',reason:'native_not_requested'};
 else run('native_glpsol',process.execPath,['pilots/operations-research/qualify-glpsol-r5.mjs','--seed','42'],{timeout:40000,
  blocked:r=>/GLPSOL_NOT_QUALIFIED:(BINARY_MISSING|UNTRUSTED_BINARY)/.test(r.stderr??''),
  verify:s=>{const v=JSON.parse(s);if(v.status!=='PASS_ACTUAL_NATIVE_GLPSOL'||v.scope!=='generated_synthetic_model_only'||v.objective!==v.oracleObjective||!/^[a-f0-9]{64}$/.test(v.binarySha256))throw Error('NATIVE_GLPSOL_PROOF_MISSING');receipt.nativeEvidence=v;}});
 save();return receipt;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=qualify(parseArgs(process.argv.slice(2)));console.log(JSON.stringify({status:result.status,steps:result.steps},null,2));if(result.status!=='PASS')process.exitCode=2;}
 catch(e){console.error('R10_NOT_QUALIFIED:',e instanceof Error?e.message:String(e));process.exitCode=2;}
}
