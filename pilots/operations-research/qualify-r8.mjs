#!/usr/bin/env node
/**
 * R8 evidence-oriented release gate. Does NOT run arbitrary learner MathProg.
 * A trustworthy PASS needs an exact clean Git commit, all 147 real offline tests,
 * upstream npm test/typecheck/build AND real R5 native GLPK qualification.
 * Missing or intentionally skipped evidence always yields BLOCKED, not PASS.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, realpathSync, mkdirSync, chmodSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const R8_PIN = '24dcfccf412544ecd3b65d4cba0fb8116a699186';
export const EXPECTED_OFFLINE_TESTS = 147;
export const REQUIRED_STEPS = Object.freeze(['git_pin','offline_147','npm_ci','npm_test','typecheck','next_build','native_glpsol']);
const sha = data => createHash('sha256').update(data).digest('hex');
const MAX_OUT = 10 * 1024 * 1024;

export function validateOfflineReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object' || receipt.status !== 'PASS' ||
      receipt.totalTests !== EXPECTED_OFFLINE_TESTS || !Array.isArray(receipt.suites) ||
      receipt.suites.length !== 14) return false;
  if (receipt.suites.some(s => !s || typeof s.name !== 'string' || !Number.isInteger(s.passed) || s.passed < 1)) return false;
  if (new Set(receipt.suites.map(s => s.name)).size !== receipt.suites.length) return false;
  if (receipt.suites.reduce((total,s) => total + s.passed, 0) !== EXPECTED_OFFLINE_TESTS) return false;
  if (!receipt.sourceSha256 || typeof receipt.sourceSha256 !== 'object' ||
      Object.keys(receipt.sourceSha256).length < 20 ||
      Object.values(receipt.sourceSha256).some(h => typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h))) return false;
  return true;
}

export function overallStatus(steps) {
  if (!steps || typeof steps !== 'object') return 'BLOCKED';
  if (REQUIRED_STEPS.some(key => steps[key]?.status === 'FAIL')) return 'FAIL';
  if (REQUIRED_STEPS.every(key => steps[key]?.status === 'PASS')) return 'PASS';
  return 'BLOCKED';
}

export function parseArgs(argv) {
  const opts = { repo: null, fullBuild: false, native: false, output: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i+1] && !argv[i+1].startsWith('--') && !opts.repo) opts.repo=argv[++i];
    else if (argv[i] === '--output' && argv[i+1] && !argv[i+1].startsWith('--') && !opts.output) opts.output=argv[++i];
    else if (argv[i] === '--full-build' && !opts.fullBuild) opts.fullBuild=true;
    else if (argv[i] === '--native' && !opts.native) opts.native=true;
    else throw new Error('Invalid/duplicate argument; use --repo PATH [--full-build] [--native] [--output DIR]');
  }
  if (!opts.repo) throw new Error('--repo PATH required');
  return opts;
}

/** A minimal environment prevents leaking personal provider API keys into build/test subprocesses. */
function commandEnvironment() {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME || tmpdir(),
    LANG: 'C.UTF-8',
    LC_ALL: 'C',
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    ELECTRON_SKIP_BINARY_DOWNLOAD: '1',
    npm_config_update_notifier: 'false',
  };
}

export function executeR8({repo,fullBuild=false,native=false,output=null}) {
  const work=realpathSync(resolve(repo));
  const artifacts=output ? resolve(output) : mkdtempSync(join(tmpdir(),'lh-r8-qualify-'));
  mkdirSync(artifacts,{recursive:true,mode:0o700});
  chmodSync(artifacts,0o700);
  if (work === artifacts || artifacts.startsWith(work+'/')) throw new Error('Receipt directory MUST be outside the repository');
  const receipt={schema:'learnharness.r8.qualification.v1', pinnedHead:R8_PIN,
    executedAt:new Date().toISOString(), repository:work, artifacts,
    runOptions:{fullBuild,native}, steps:{}, status:'BLOCKED',
    limits:['No arbitrary learner MathProg execution','No provider keys forwarded','No GitHub Actions','No merge or push','No proctoring claim']};
  const writeReceipt=()=>{
    receipt.status=overallStatus(receipt.steps);
    const dest=join(artifacts,'r8-receipt.json'),temp=dest+'.partial';
    writeFileSync(temp,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});renameSync(temp,dest);
  };
  const run=(name,program,args,{timeout=120_000,check=null,blockedWhen=null}={})=>{
    const entry={status:'FAIL',command:[program,...args],exitCode:null,log:null,error:null,sha256:null};
    const result=spawnSync(program,args,{cwd:work,env:commandEnvironment(),encoding:'utf8',shell:false,timeout,maxBuffer:MAX_OUT});
    const contents=(result.stdout??'')+'\n--- STDERR ---\n'+(result.stderr??'');
    const log=join(artifacts,`${name}.log`);
    writeFileSync(log,contents,{mode:0o600});
    entry.log=log;entry.sha256=sha(contents);entry.exitCode=result.status;
    if(result.error)entry.error=result.error.code||String(result.error);
    if(blockedWhen && blockedWhen(result)) {entry.status='BLOCKED';entry.error='missing_unqualified_environment';}
    if(entry.status!=='BLOCKED' && !result.error && result.signal===null && result.status===0){
      try { if(check) check(result.stdout); entry.status='PASS'; }
      catch(e){entry.error=e instanceof Error?e.message:String(e);}
    }
    receipt.steps[name]=entry;writeReceipt();
    return entry.status==='PASS';
  };
  writeReceipt();
  // The checked-out source is the sole authority: do not grade unpinned or dirty code.
  if(!run('git_pin','git',['rev-parse','HEAD'],{check:out=>{if(out.trim()!==R8_PIN)throw new Error('HEAD is not pinned R7 commit');}})) return receipt;
  if(!run('git_tree','git',['status','--porcelain','--untracked-files=normal'],{check:out=>{if(out.trim())throw new Error('Dirty worktree');}})) {
    receipt.steps.git_pin.status='FAIL';writeReceipt();return receipt;
  }
  const offlineArgs=['pilots/operations-research/verify-offline.mjs'];
  if(!run('offline_147',process.execPath,offlineArgs,{timeout:180_000,check:out=>{
    const result=JSON.parse(out);
    if(!validateOfflineReceipt(result))throw new Error('Offline results do not prove 147/147');
    receipt.offlineSourceSha256=result.sourceSha256;
    receipt.offlineSuites=result.suites;
  }}))return receipt;
  if(!fullBuild){for(const n of ['npm_ci','npm_test','typecheck','next_build'])receipt.steps[n]={status:'BLOCKED',reason:'--full-build not requested'};}
  else {
    const jobs=[
      ['npm_ci','npm',['ci','--no-audit','--no-fund'],300_000],
      ['npm_test','npm',['test'],300_000],
      ['typecheck','npm',['run','typecheck'],240_000],
      ['next_build','npm',['run','build'],300_000],
    ];
    let active=true;
    for(const [name,program,args,timeout] of jobs){
      if(!active){receipt.steps[name]={status:'BLOCKED',reason:'previous build gate failed'};continue;}
      active=run(name,program,args,{timeout});
    }
  }
  if(!native){receipt.steps.native_glpsol={status:'BLOCKED',reason:'--native not requested'};}
  else {
    run('native_glpsol',process.execPath,['pilots/operations-research/qualify-glpsol-r5.mjs','--seed','42'],{timeout:40_000,blockedWhen:result=>/GLPSOL_NOT_QUALIFIED:(BINARY_MISSING|UNTRUSTED_BINARY)/.test(result.stderr??''),check:out=>{
      const result=JSON.parse(out);
      if(result.status!=='PASS_ACTUAL_NATIVE_GLPSOL' || result.scope!=='generated_synthetic_model_only' ||
        result.objective!==result.oracleObjective || !/^[a-f0-9]{64}$/.test(result.binarySha256))
        throw new Error('Native GLPK PASS proof missing or invalid');
      receipt.nativeGlpkEvidence=result;
    }});
  }
  writeReceipt();return receipt;
}

const here=process.argv[1] && resolve(process.argv[1]);
if(here && here===fileURLToPath(import.meta.url)){
  try {
    const options=parseArgs(process.argv.slice(2));
    const evidence=executeR8(options);
    console.log(JSON.stringify({status:evidence.status,artifacts:evidence.artifacts,steps:evidence.steps},null,2));
    if(evidence.status!=='PASS')process.exitCode=2;
  }catch(e){console.error('R8_BLOCKED:',e instanceof Error?e.message:String(e));process.exitCode=2;}
}
