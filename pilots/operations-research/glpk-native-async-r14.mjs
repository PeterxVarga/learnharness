/** R14N async rootless GLPSOL: no synchronous subprocess in Next HTTP path.
 * Same pinned-image/no-network contract as the conservative CLI runner.
 * No host GLPK fallback, no provider calls, no credential inheritance.
 */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,openSync,closeSync,fstatSync,readFileSync,constants} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {readGlpkSolutionStatus} from './glpk-solution-status-r14.mjs';
import {parseGlpkColumns} from './glpk-columns-r14.mjs';
const exec=promisify(execFile);
const imagePattern=/^sha256:[a-f0-9]{64}$/;
const reply=(status,code,other={})=>({status,code,graded:false,points:null,...other});
const bounded=s=>typeof s==='string'?s.slice(0,8192):'';
const fail=(e,code)=>{
 if(e?.killed||e?.signal==='SIGTERM'||e?.signal==='SIGKILL'||e?.code==='ETIMEDOUT')
  return reply('TIME_LIMIT','outer_timeout');
 if(e?.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')return reply('BLOCKED','output_limit');
 return reply('BLOCKED',code);
};
function localEnvironment(){
 const env=Object.fromEntries(['HOME','USER','LOGNAME','XDG_RUNTIME_DIR','DBUS_SESSION_BUS_ADDRESS']
  .filter(k=>typeof process.env[k]==='string'&&process.env[k].length>0)
  .map(k=>[k,process.env[k]]));
 env.PATH='/usr/bin:/bin';env.LANG='C.UTF-8';
 return env;
}
function readBounded(stage,name,max=49152){
 let fd;
 try{
  fd=openSync(join(stage,'out',name),constants.O_RDONLY|constants.O_NOFOLLOW);
  const st=fstatSync(fd);
  if(!st.isFile()||st.size>max)return null;
  const content=readFileSync(fd);
  return content.length<=max?content.toString('utf8'):null;
 }catch{return null;}
 finally{if(fd!==undefined)closeSync(fd);}
}
function readCreatedContainerId(stage){
 // Podman's --cidfile is private to this run. Never accept an arbitrary
 // user-supplied container name for cleanup.
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
export async function runNativeGmplAsync({model,data='',mode='solve',imageId,signal,execCommand=exec}={}){
 if(signal?.aborted)return reply('CANCELLED','request_cancelled');
 if(typeof model!=='string'||model.length<1||Buffer.byteLength(model)>65536||model.includes('\0')||
    typeof data!=='string'||Buffer.byteLength(data)>65536||data.includes('\0'))
  return reply('BLOCKED','invalid_model_or_data');
 if(!['solve','check'].includes(mode))return reply('BLOCKED','invalid_mode');
 if(!imagePattern.test(imageId??''))return reply('BLOCKED','image_id_not_pinned');
 const env=localEnvironment();
 const opts={encoding:'utf8',timeout:5000,maxBuffer:32768,shell:false,env,signal};
 try{
  const info=await execCommand('podman',['info','--format','{{.Host.Security.Rootless}}'],opts);
  if(info.stdout?.trim()!=='true')return reply('BLOCKED','rootless_podman_unavailable');
 }catch(e){return signal?.aborted?reply('CANCELLED','request_cancelled'):reply('BLOCKED','rootless_podman_unavailable');}
 try{
  const image=await execCommand('podman',['image','inspect','--format','{{.Id}}',imageId],opts);
  if(image.stdout?.trim()!==imageId)return reply('BLOCKED','immutable_image_unavailable');
 }catch(e){return signal?.aborted?reply('CANCELLED','request_cancelled'):reply('BLOCKED','immutable_image_unavailable');}
 if(signal?.aborted)return reply('CANCELLED','request_cancelled');
 let stage;
 let terminatedBeforeCleanExit=false;
 try{
  stage=mkdtempSync(join(tmpdir(),'learnharness-r14na-'));
  writeFileSync(join(stage,'model.mod'),model,{mode:0o600,flag:'wx'});
  if(data)writeFileSync(join(stage,'data.dat'),data,{mode:0o600,flag:'wx'});
  if(mode==='solve')mkdirSync(join(stage,'out'),{mode:0o700});
  const args=['run','--rm','--cidfile='+join(stage,'podman.cid'),'--pull=never','--network=none','--http-proxy=false',
   '--userns=keep-id','--read-only','--read-only-tmpfs=false',
   '--cap-drop=all','--security-opt=no-new-privileges',
   '--pids-limit=32','--cpus=1','--memory=256m','--memory-swap=256m',
   '--ipc=private','--image-volume=ignore',
   '--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=16m',
   '--ulimit=nofile=64:64','--ulimit=fsize=1048576:1048576',
   '--volume='+stage+':/input:ro,Z',
   ...(mode==='solve'?['--volume='+join(stage,'out')+':/output:rw,Z']:[]),
   '--workdir=/tmp','--timeout=12',
   imageId,'/usr/bin/glpsol',...(mode==='check'?['--check']:[]),
   '--model','/input/model.mod',...(data?['--data','/input/data.dat']:[]),
   '--tmlim','8','--memlim','192','--seed','0',
   ...(mode==='solve'?['--output','/output/solution.txt','--write','/output/solution.raw','--wglp','/output/problem.glp']:[])
  ];
  if(signal?.aborted)return reply('CANCELLED','request_cancelled');
  let result;
  try{
   result=await execCommand('podman',args,{...opts,timeout:20000,maxBuffer:65536});
  }catch(e){
   terminatedBeforeCleanExit=true;
   if(signal?.aborted||e?.code==='ABORT_ERR')return reply('CANCELLED','request_cancelled');
   if(e?.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER')return reply('BLOCKED','output_limit');
   if(e?.killed||e?.signal)return reply('TIME_LIMIT','container_timeout');
   return reply('GLPK_ERROR','solver_or_runtime_error',{
    exitCode:typeof e?.code==='number'?e.code:null,
    diagnostic:bounded(e?.stderr||e?.stdout)
   });
  }
  const status=mode==='solve'?readGlpkSolutionStatus(readBounded(stage,'solution.raw')):readGlpkSolutionStatus(null);
  const parsed=mode==='solve'
   ?parseGlpkColumns(readBounded(stage,'solution.raw'),readBounded(stage,'problem.glp'),status)
   :{status:'NOT_TRANSFERABLE',columns:[]};
  return reply('GLPK_COMPLETED','completed',{
   mode,exitCode:0,diagnostic:bounded(result.stdout),
   solutionListing:mode==='solve'?readBounded(stage,'solution.txt',24576):null,
   ...status,columnStatus:parsed.status,columns:parsed.columns,
   solverOutputTrusted:false
  });
 }catch(e){return signal?.aborted?reply('CANCELLED','request_cancelled'):fail(e,'staging_failed');}
 finally{
  if(stage){
   if(terminatedBeforeCleanExit){
    const cid=readCreatedContainerId(stage);
    if(cid){
     // execFile cancellation terminates the CLI; --rm alone does not
     // establish that a detached container was removed. Best effort,
     // bounded, rootless and scoped to the exact cidfile of this run.
     try{
      await execCommand('podman',['rm','--force','--ignore',cid],{
       encoding:'utf8',timeout:5000,maxBuffer:8192,shell:false,
       env:localEnvironment()
      });
     }catch{/* Never convert an aborted/failed execution to success. */}
    }
   }
   rmSync(stage,{force:true,recursive:true});
  }
 }
}
