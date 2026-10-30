#!/usr/bin/env node
/**
 * R15F source-scope gate, not a signed supply-chain attestation.
 * The authoritative R14Z routes, score authority, dependencies, build
 * configuration and database code must remain untouched by the R15 pilot.
 * Fail closed on any unexpected added, renamed, deleted or modified path.
 */
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve} from 'node:path';
export const R15F_BASELINE='9c017fe7636a2c0ae7f68e9f52bdb2174d3dbd22';
const prefix='pilots/operations-research/';
const additions=[
 'README-R15.md','README-R15B.md','README-R15C.md','README-R15D.md',
 'README-R15E.md','README-R15F.md',
 'adaptive-browser-r15.mjs','adaptive-browser-r15d.mjs','adaptive-browser-r15e.mjs',
 'adaptive-checkpoint-r15e.mjs','adaptive-checkpoint-r15e.test.mjs',
 'adaptive-diagnostics-r15b.mjs','adaptive-diagnostics-r15b.test.mjs',
 'adaptive-practice-r15.mjs','adaptive-practice-r15.test.mjs',
 'adaptive-run-r15d.mjs','adaptive-run-r15d.test.mjs','adaptive-run-r15f.test.mjs',
 'adaptive-sequence-r15c.mjs','adaptive-sequence-r15c.test.mjs',
 'qualify-r15-targeted.sh','qualify-r15b-targeted.sh','qualify-r15c-targeted.sh',
 'qualify-r15d-targeted.sh','qualify-r15e-targeted.sh','qualify-r15f-targeted.sh',
 'release-fence-r15f.mjs','release-fence-r15f.test.mjs'
].map(name=>prefix+name);
const testWrappers=[
 'operations-research-adaptive-r15.test.ts',
 'operations-research-adaptive-r15b.test.ts',
 'operations-research-adaptive-r15c.test.ts',
 'operations-research-adaptive-r15d.test.ts',
 'operations-research-adaptive-r15e.test.ts',
 'operations-research-adaptive-r15f.test.ts',
 'operations-research-release-r15f.test.ts'
].map(name=>'tests/'+name);
export const R15F_ALLOWED_CHANGES=Object.freeze(
 [['components/gusek-exam.tsx','M'],
  ...additions.map(path=>[path,'A']),
  ...testWrappers.map(path=>[path,'A'])]
 .map(([path,status])=>Object.freeze({path,status}))
 .sort((a,b)=>a.path.localeCompare(b.path,'en'))
);
/**
 * @param {Array<{path:string,status:string}>} changes
 * @returns {{passed:boolean,expectedCount:number,actualCount:number,unexpected:ReadonlyArray<string>,missing:ReadonlyArray<string>,duplicate:ReadonlyArray<string>}}
 */
export function r15fAuditChangeSet(changes){
 const expected=new Map(R15F_ALLOWED_CHANGES.map(x=>[x.path,x.status]));
 const invalid=[],seen=new Set(),duplicate=[];
 if(!Array.isArray(changes))return Object.freeze({
  passed:false,expectedCount:expected.size,actualCount:0,
  unexpected:Object.freeze(['invalid_change_list']),missing:Object.freeze([...expected.keys()]),duplicate:Object.freeze([])
 });
 for(const row of changes){
  if(!row||typeof row.path!=='string'||typeof row.status!=='string'||
   row.path.length===0||row.path.includes('\\')||row.path.includes('\0')||
   !['A','M'].includes(row.status)||expected.get(row.path)!==row.status){
   invalid.push(String(row?.path??'invalid_entry').slice(0,160));continue;
  }
  if(seen.has(row.path))duplicate.push(row.path);
  else seen.add(row.path);
 }
 const missing=[...expected.keys()].filter(path=>!seen.has(path));
 return Object.freeze({passed:invalid.length===0&&missing.length===0&&duplicate.length===0,
  expectedCount:expected.size,actualCount:changes.length,
  unexpected:Object.freeze(invalid),missing:Object.freeze(missing),duplicate:Object.freeze(duplicate)});
}
function git(root,...args){return execFileSync('git',args,{
 cwd:root,encoding:'utf8',maxBuffer:1024*1024,stdio:['ignore','pipe','pipe']
}).trim();}
export function r15fVerifyCheckout(pin){
 if(typeof pin!=='string'||!/^[0-9a-f]{40}$/.test(pin))throw Error('BLOCKED_INVALID_PIN');
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 if(git(root,'branch','--show-current')!=='pilot/operations-research-r15')
  throw Error('BLOCKED_WRONG_BRANCH');
 if(git(root,'rev-parse','HEAD')!==pin)throw Error('BLOCKED_EXACT_HEAD');
 if(git(root,'status','--porcelain','--untracked-files=normal')!=='')
  throw Error('BLOCKED_DIRTY_WORKTREE');
 if(git(root,'rev-parse',R15F_BASELINE+'^{commit}')!==R15F_BASELINE)
  throw Error('BLOCKED_UNKNOWN_BASELINE');
 git(root,'merge-base','--is-ancestor',R15F_BASELINE,pin);
 const raw=git(root,'diff','--no-renames','--name-status',R15F_BASELINE,pin);
 const changes=raw.split('\n').filter(Boolean).map(line=>{
  const segments=line.split('\t');
  return segments.length===2?{status:segments[0],path:segments[1]}:{status:'invalid',path:line};
 });
 const audit=r15fAuditChangeSet(changes);
 if(!audit.passed)throw Error('BLOCKED_R15_SCOPE_DRIFT '+JSON.stringify(audit));
 const tree=git(root,'ls-tree','-r','--name-only',pin).split('\n');
 const present=new Set(tree);
 if(R15F_ALLOWED_CHANGES.some(f=>!present.has(f.path)))throw Error('BLOCKED_MISSING_CANDIDATE_FILE');
 return Object.freeze({
  schema:'learnharness.r15f.source-scope.v1',
  baselineSha:R15F_BASELINE,sourceSha:pin,
  status:'PASS',pathCount:audit.actualCount,
  authoritativeScorerAndApiUnchanged:true,
  dependencyAndBuildConfigUnchanged:true,
  sourceScopeOnly:true,signedAttestation:false,releaseApproved:false
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==3)throw Error('BLOCKED_ARG_COUNT');
  console.log(JSON.stringify(r15fVerifyCheckout(process.argv[2])));
 }catch(err){
  console.error(err instanceof Error?err.message:String(err));
  process.exitCode=2;
 }
}
