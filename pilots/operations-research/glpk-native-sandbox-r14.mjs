/** R14N: bounded GNU MathProg solver executed ONLY inside rootless Podman.
 * Never spawn glpsol directly on the host, never grade based on solver stdout.
 * No host user files are mounted: only a private, temporary, read-only input.
 * Disabled by default; requires an explicit immutable local image ID.
 */
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const IMAGE_ID=/^sha256:[a-f0-9]{64}$/;
const MODEL_MAX=65536, DATA_MAX=65536, MAX_OUTPUT=8192;
const cleanText=(s,max)=>typeof s==='string'&&s.length>0&&Buffer.byteLength(s,'utf8')<=max&&!s.includes('\0');
const bounded=(s)=>typeof s==='string'?s.slice(0,MAX_OUTPUT):'';
const result=(status,code,more={})=>({status,code,graded:false,points:null,...more});
const allowedMode=new Set(['check','solve']);

/** The caller must supply a pinned, already-installed rootless Podman image.
 * Inject spawn for deterministic tests; injection is internal only, never HTTP.
 */
export function runNativeGmpl({model,data='',mode='solve',imageId,spawn=spawnSync}={}){
  if(!cleanText(model,MODEL_MAX)||typeof data!=='string'||Buffer.byteLength(data,'utf8')>DATA_MAX||data.includes('\0'))
    return result('BLOCKED','invalid_model_or_data');
  if(!allowedMode.has(mode))return result('BLOCKED','invalid_mode');
  if(!IMAGE_ID.test(imageId??''))return result('BLOCKED','image_id_not_pinned');
  if(typeof spawn!=='function')return result('BLOCKED','invalid_runtime');
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
  const pin=spawn('podman',['image','inspect','--format','{{.Id}}',imageId],opts);
  if(pin.error||pin.status!==0||pin.stdout?.trim()!==imageId)
    return result('BLOCKED','immutable_image_unavailable');
  let stage;
  try{
    stage=mkdtempSync(join(tmpdir(),'learnharness-r14n-'));
    writeFileSync(join(stage,'model.mod'),model,{mode:0o600,flag:'wx'});
    if(data)writeFileSync(join(stage,'data.dat'),data,{mode:0o600,flag:'wx'});
    const args=[
      'run','--rm','--pull=never','--network=none','--http-proxy=false',
      '--userns=keep-id','--read-only','--read-only-tmpfs=false',
      '--cap-drop=all','--security-opt=no-new-privileges',
      '--pids-limit=32','--cpus=1','--memory=256m','--memory-swap=256m',
      '--ipc=private','--image-volume=ignore',
      '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m',
      '--ulimit=nofile=64:64','--ulimit=fsize=1048576:1048576',
      '--volume='+stage+':/input:ro,Z','--workdir=/tmp','--timeout=12',
      imageId,'/usr/bin/glpsol',...(mode==='check'?['--check']:[]),
      '--model','/input/model.mod',...(data?['--data','/input/data.dat']:[]),
      '--tmlim','8','--seed','0'
    ];
    const run=spawn('podman',args,{encoding:'utf8',timeout:20000,maxBuffer:65536,shell:false,env});
    if(run.error?.code==='ETIMEDOUT')return result('TIME_LIMIT','outer_timeout');
    if(run.error?.code==='ENOBUFS')return result('BLOCKED','output_limit');
    if(run.error)return result('BLOCKED','podman_run_failed');
    if(run.signal)return result('TIME_LIMIT','container_terminated');
    if(run.status!==0)return result('GLPK_ERROR','solver_or_runtime_error',{
      exitCode:run.status,diagnostic:bounded(run.stderr||run.stdout)
    });
    // Solver console output is deliberately informational, NOT a trusted
    // proof of correctness: source can contain display/printf statements.
    return result('GLPK_COMPLETED','completed',{
      exitCode:0,mode,diagnostic:bounded(run.stdout),
      solverOutputTrusted:false
    });
  }catch{
    return result('BLOCKED','staging_failed');
  }finally{
    if(stage)rmSync(stage,{recursive:true,force:true});
  }
}
