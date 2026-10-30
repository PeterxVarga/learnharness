/** R14N: bounded GNU MathProg solver executed ONLY inside rootless Podman.
 * Never spawn glpsol directly on the host, never grade based on solver stdout.
 * No host user files are mounted: only a private, temporary, read-only input.
 * Disabled by default; requires an explicit immutable local image ID.
 */
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,openSync,closeSync,fstatSync,readFileSync,constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readGlpkSolutionStatus} from './glpk-solution-status-r14.mjs';
import {parseGlpkColumns} from './glpk-columns-r14.mjs';

const IMAGE_ID=/^sha256:[a-f0-9]{64}$/;
const MODEL_MAX=65536, DATA_MAX=65536, MAX_OUTPUT=8192, MAX_LISTING=24_576;
const cleanText=(s,max)=>typeof s==='string'&&s.length>0&&Buffer.byteLength(s,'utf8')<=max&&!s.includes('\0');
const bounded=(s)=>typeof s==='string'?s.slice(0,MAX_OUTPUT):'';
const result=(status,code,more={})=>({status,code,graded:false,points:null,...more});
const allowedMode=new Set(['check','solve']);
/** Bounded, no-symlink machine file evidence; no raw contents in diagnostics. */
function readMachineFile(stage,name,max=49152){
 let fd;
 try{
  fd=openSync(join(stage,'out',name),constants.O_RDONLY|constants.O_NOFOLLOW);
  const st=fstatSync(fd);
  if(!st.isFile())return {value:null,state:'not_regular',bytes:null};
  if(st.size>max)return {value:null,state:'oversized',bytes:st.size};
  const data=readFileSync(fd);
  if(data.length>max)return {value:null,state:'oversized',bytes:data.length};
  return {value:data.toString('utf8'),state:data.length?'present':'empty',bytes:data.length};
 }catch(e){
  return {value:null,state:e?.code==='ENOENT'?'missing':e?.code==='ELOOP'?'symlink':'unreadable',bytes:null};
 }finally{if(fd!==undefined)closeSync(fd);}
}
function readCreatedContainerId(stage){
 let fd;
 try{
  fd=openSync(join(stage,'podman.cid'),constants.O_RDONLY|constants.O_NOFOLLOW);
  const st=fstatSync(fd);
  if(!st.isFile()||st.size<64||st.size>80)return null;
  const cid=readFileSync(fd).toString('utf8').trim();
  return /^[a-f0-9]{64}$/.test(cid)?cid:null;
 }catch{return null;}
 finally{if(fd!==undefined)closeSync(fd);}
}

/** The caller must supply a pinned, already-installed rootless Podman image.
 * Inject spawn for deterministic tests; injection is internal only, never HTTP.
 */
export function runNativeGmpl({model,data='',mode='solve',imageId,spawn=spawnSync}={}){
  if(!cleanText(model,MODEL_MAX)||typeof data!=='string'||Buffer.byteLength(data,'utf8')>DATA_MAX||data.includes('\0'))
    return result('BLOCKED','invalid_model_or_data');
  if(!allowedMode.has(mode))return result('BLOCKED','invalid_mode');
  if(!IMAGE_ID.test(imageId??''))return result('BLOCKED','image_id_not_pinned');
  if(typeof spawn!=='function')return result('BLOCKED','invalid_runtime');
  // Use Podman's full bare 64-hex image ID after validating the sha256:hex pin.
  const rawImageId=imageId.slice(7);
  // No fallback to host glpsol if rootless containers cannot be qualified.
  // Do not pass the app's BYOK/API credentials or remote-Podman settings
  // to any Podman child process. Keep only rootless local session metadata.
  const env=Object.fromEntries(
    ['HOME','USER','LOGNAME','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS']
      .filter(k=>typeof process.env[k]==='string' && process.env[k].length>0)
      .map(k=>[k,process.env[k]])
  );
  env.PATH='/usr/bin:/bin';
  env.LANG='C.UTF-8';
  const opts={encoding:'utf8',timeout:5000,maxBuffer:32768,shell:false,env};
  const info=spawn('podman',['info','--format','{{.Host.Security.Rootless}}'],opts);
  if(info.error||info.status!==0||info.stdout?.trim()!=='true')
    return result('BLOCKED','rootless_podman_unavailable');
  const pin=spawn('podman',['image','inspect','--format','{{.Id}}',rawImageId],opts);
  if(pin.error||pin.status!==0||pin.stdout?.trim()!==rawImageId)
    return result('BLOCKED','immutable_image_unavailable');
  let stage;
  let interrupted=false;
  try{
    stage=mkdtempSync(join(tmpdir(),'learnharness-r14n-'));
    writeFileSync(join(stage,'model.mod'),model,{mode:0o600,flag:'wx'});
    if(data)writeFileSync(join(stage,'data.dat'),data,{mode:0o600,flag:'wx'});
    if(mode==='solve')mkdirSync(join(stage,'out'),{mode:0o700});
    const args=[
      'run','--rm','--cidfile='+join(stage,'podman.cid'),'--pull=never','--network=none','--http-proxy=false',
      '--userns=keep-id','--read-only','--read-only-tmpfs=false',
      '--cap-drop=all','--security-opt=no-new-privileges',
      '--pids-limit=32','--cpus=1','--memory=256m','--memory-swap=256m',
      '--ipc=private','--image-volume=ignore',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m',
      '--ulimit=nofile=64:64','--ulimit=fsize=1048576:1048576',
      '--volume='+stage+':/input:ro,Z',
      ...(mode==='solve'?['--volume='+join(stage,'out')+':/output:rw,Z']:[]),
      '--workdir=/tmp','--timeout=12',
      rawImageId,'/usr/bin/glpsol',...(mode==='check'?['--check']:[]),
      '--model','/input/model.mod',...(data?['--data','/input/data.dat']:[]),
      '--tmlim','8','--memlim','192','--seed','0',
      ...(mode==='solve'?['--output','/output/solution.txt','--write','/output/solution.raw','--wglp','/output/problem.glp']:[])
    ];
    const run=spawn('podman',args,{encoding:'utf8',timeout:20000,maxBuffer:65536,shell:false,env});
    if(run.error||run.signal||run.status!==0)interrupted=true;
    if(run.error?.code==='ETIMEDOUT')return result('TIME_LIMIT','outer_timeout');
    if(run.error?.code==='ENOBUFS')return result('BLOCKED','output_limit');
    if(run.error)return result('BLOCKED','podman_run_failed');
    if(run.signal)return result('TIME_LIMIT','container_terminated');
    if(run.status!==0)return result('GLPK_ERROR','solver_or_runtime_error',{
      exitCode:run.status,diagnostic:bounded(run.stderr||run.stdout)
    });
    // glpsol --output writes an optional human-readable primal/row listing.
    // Do not follow links or read oversized files: MathProg's printf/table
    // might have influenced the sandbox output. It is NEVER a grade proof.
    const machine=mode==='solve'?{
      solution:readMachineFile(stage,'solution.raw'),
      problem:readMachineFile(stage,'problem.glp'),
      listing:readMachineFile(stage,'solution.txt',MAX_LISTING)
    }:null;
    const solutionListing=machine?.listing.value??null;
    const solutionMeta=readGlpkSolutionStatus(machine?.solution.value??null);
    const variables=mode==='solve'
      ?parseGlpkColumns(machine.solution.value,machine.problem.value,solutionMeta)
      :{status:'NOT_TRANSFERABLE',columns:[]};
    const machineEvidence=machine?Object.fromEntries(
      Object.entries(machine).map(([name,{state,bytes}])=>[name,{state,bytes}])
    ):null;
    return result('GLPK_COMPLETED','completed',{
      exitCode:0,mode,diagnostic:bounded(run.stdout),
      solutionListing,...solutionMeta,
      columns: variables.columns,columnStatus:variables.status,
      machineEvidence,solverOutputTrusted:false
    });
  }catch{
    return result('BLOCKED','staging_failed');
  }finally{
    if(stage){
      if(interrupted){
        const cid=readCreatedContainerId(stage);
        if(cid){
          try{
            spawn('podman',['rm','--force','--ignore',cid],{
              encoding:'utf8',timeout:5000,maxBuffer:8192,shell:false,env
            });
          }catch{/* Best-effort rootless cleanup; never a successful grade. */}
        }
      }
      rmSync(stage,{recursive:true,force:true});
    }
  }
}
