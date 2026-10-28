import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {runNativeGmplAsync} from './glpk-native-async-r14.mjs';
const IMAGE='sha256:'+'a'.repeat(64);
const model='var x >= 0; maximize objective: x; s.t. cap: x <= 4; solve; end;';
function mockExec({rootless=true,image=true,fail=null,hold=null,output=true}={}){
 const calls=[];let stage=null;
 const exec=async(binary,args,opts)=>{
  assert.equal(binary,'podman');assert.equal(opts.shell,false);
  assert.equal(opts.env.LH_GLPK_RUN_TOKEN,undefined);calls.push({args,opts});
  if(args[0]==='info'){if(!rootless)throw new Error('rootless denied');return {stdout:'true\n'};}
  if(args[0]==='image'){if(!image)throw new Error('image missing');return {stdout:IMAGE+'\n'};}
  assert.equal(args[0],'run');
  assert.ok(args.includes('--network=none'));
  assert.ok(args.includes('--read-only'));
  assert.ok(args.includes('--pull=never'));
  assert.ok(args.includes('--cap-drop=all'));
  assert.ok(args.includes('--timeout=12'));
  stage=args.find(x=>x.startsWith('--volume=')&&x.includes(':/input:')).slice('--volume='.length).split(':/input:')[0];
  assert.equal(readFileSync(stage+'/model.mod','utf8'),model);
  if(hold)await hold;
  if(fail)throw fail;
  if(output&&args.includes('--write')){
   writeFileSync(stage+'/out/solution.raw','s mip 1 1 o 4\nj 1 4\ne o f\n');
   writeFileSync(stage+'/out/problem.glp','p mip max 1 1 1\nn j 1 x\ne o f\n');
   writeFileSync(stage+'/out/solution.txt','Problem: x\nStatus: OPTIMAL\n');
  }
  return {stdout:'GLPK completed'};
 };
 return {exec,calls,get stage(){return stage;}};
}
describe('R14 async GLPK Podman controller (does not call real Podman)',()=>{
 it('rejects unpinned image and malformed inputs before exec',async()=>{
  const x=mockExec();
  assert.equal((await runNativeGmplAsync({model,imageId:'latest',execCommand:x.exec})).code,'image_id_not_pinned');
  assert.equal((await runNativeGmplAsync({model:'',imageId:IMAGE,execCommand:x.exec})).status,'BLOCKED');
  assert.equal(x.calls.length,0);
 });
 it('blocks rootful or inaccessible Podman',async()=>{
  const x=mockExec({rootless:false});
  assert.equal((await runNativeGmplAsync({model,imageId:IMAGE,execCommand:x.exec})).code,'rootless_podman_unavailable');
 });
 it('blocks missing immutable image without fallback',async()=>{
  const x=mockExec({image:false});
  assert.equal((await runNativeGmplAsync({model,imageId:IMAGE,execCommand:x.exec})).code,'immutable_image_unavailable');
 });
 it('check mode is async and does not expose scoring',async()=>{
  const x=mockExec();
  const r=await runNativeGmplAsync({model,mode:'check',imageId:IMAGE,execCommand:x.exec});
  assert.equal(r.status,'GLPK_COMPLETED');assert.equal(r.points,null);assert.equal(r.graded,false);
  assert.equal(r.columnStatus,'NOT_TRANSFERABLE');
  assert.equal(x.calls.length,3);assert.equal(existsSync(x.stage),false);
 });
 it('solve returns verified optimal named column, objective and listing',async()=>{
  const x=mockExec();
  const r=await runNativeGmplAsync({model,imageId:IMAGE,execCommand:x.exec});
  assert.equal(r.status,'GLPK_COMPLETED');assert.equal(r.solverStatus,'OPTIMAL');
  assert.equal(r.objective,4);assert.equal(r.columnStatus,'OPTIMAL_COLUMNS');
  assert.deepEqual(r.columns,[{name:'x',value:4}]);
  assert.equal(r.points,null);assert.equal(existsSync(x.stage),false);
 });
 it('cleans staged files when the subprocess fails',async()=>{
  const x=mockExec({fail:Object.assign(new Error('bad MathProg'),{code:1,stderr:'syntax error'})});
  const r=await runNativeGmplAsync({model,imageId:IMAGE,execCommand:x.exec});
  assert.equal(r.status,'GLPK_ERROR');assert.equal(existsSync(x.stage),false);
 });
 it('timeout never becomes a success',async()=>{
  const x=mockExec({fail:Object.assign(new Error('terminated'),{killed:true,signal:'SIGTERM'})});
  const r=await runNativeGmplAsync({model,imageId:IMAGE,execCommand:x.exec});
  assert.equal(r.status,'TIME_LIMIT');assert.equal(r.points,null);assert.equal(existsSync(x.stage),false);
 });
 it('output missing machine evidence does not become an optimum',async()=>{
  const x=mockExec({output:false});
  const r=await runNativeGmplAsync({model,imageId:IMAGE,execCommand:x.exec});
  assert.equal(r.status,'GLPK_COMPLETED');assert.equal(r.solverStatus,'UNKNOWN');
  assert.equal(r.columnStatus,'NOT_TRANSFERABLE');assert.deepEqual(r.columns,[]);
 });
 it('does not spawn any process when the request was already cancelled',async()=>{
  const controller=new AbortController(),x=mockExec();controller.abort();
  const r=await runNativeGmplAsync({model,imageId:IMAGE,signal:controller.signal,execCommand:x.exec});
  assert.equal(r.status,'CANCELLED');assert.equal(r.points,null);
  assert.equal(x.calls.length,0);
 });
 it('cancels an active native run, cleans staged inputs, and never awards points',async()=>{
  const controller=new AbortController();let stage=null;
  const x=mockExec(),wait=async(binary,args,opts)=>{
   if(args[0]==='run'){
    stage=args.find(a=>a.includes(':/input:')).slice('--volume='.length).split(':/input:')[0];
    assert.equal(opts.signal,controller.signal);
    return new Promise((resolve,reject)=>{
     if(opts.signal.aborted)return reject(Object.assign(new Error('Aborted'),{code:'ABORT_ERR'}));
     opts.signal.addEventListener('abort',()=>reject(Object.assign(new Error('Aborted'),{code:'ABORT_ERR'})),{once:true});
    });
   }
   return x.exec(binary,args,opts);
  };
  const pending=runNativeGmplAsync({model,imageId:IMAGE,signal:controller.signal,execCommand:wait});
  for(let n=0;n<20&&!stage;n++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(stage);controller.abort();
  const r=await pending;assert.equal(r.status,'CANCELLED');assert.equal(r.points,null);
  assert.equal(existsSync(stage),false);
 });
 it('an abort during image inspection returns cancelled rather than an image failure',async()=>{
  const controller=new AbortController();
  const x=mockExec();
  const command=async(binary,args,opts)=>{
   if(args[0]==='image'){controller.abort();throw Object.assign(new Error('Abort'),{code:'ABORT_ERR'});}
   return x.exec(binary,args,opts);
  };
  const r=await runNativeGmplAsync({model,imageId:IMAGE,signal:controller.signal,execCommand:command});
  assert.equal(r.status,'CANCELLED');assert.equal(r.points,null);
 });
 it('a failed Podman CLI cleans its exact, private cidfile container by ID',async()=>{
  const cid='b'.repeat(64),commands=[],x=mockExec();let stage;
  const wrapped=async(binary,args,opts)=>{
   commands.push(args);
   if(args[0]==='rm'){
    assert.deepEqual(args,['rm','--force','--ignore',cid]);
    assert.equal(opts.signal,undefined);
    assert.ok(opts.timeout<=5000);
    return {stdout:''};
   }
   if(args[0]==='run'){
    stage=args.find(a=>a.includes(':/input:')).slice('--volume='.length).split(':/input:')[0];
    assert.ok(args.includes('--cidfile='+stage+'/podman.cid'));
    writeFileSync(stage+'/podman.cid',cid+'\n');
    throw Object.assign(new Error('dead Podman CLI'),{signal:'SIGTERM'});
   }
   return x.exec(binary,args,opts);
  };
  const r=await runNativeGmplAsync({model,imageId:IMAGE,execCommand:wrapped});
  assert.equal(r.status,'TIME_LIMIT');assert.equal(r.points,null);
  assert.equal(commands.filter(a=>a[0]==='rm').length,1);
  assert.equal(existsSync(stage),false);
 });
 it('malformed cidfile never becomes an arbitrary container-delete instruction',async()=>{
  const x=mockExec();let stage;const commands=[];
  const wrapped=async(binary,args,opts)=>{
   commands.push(args);
   if(args[0]==='run'){
    stage=args.find(a=>a.includes(':/input:')).slice('--volume='.length).split(':/input:')[0];
    writeFileSync(stage+'/podman.cid','../some-container\n');
    throw Object.assign(new Error('abort'),{code:'ABORT_ERR'});
   }
   if(args[0]==='rm')throw Error('unexpected container delete');
   return x.exec(binary,args,opts);
  };
  const r=await runNativeGmplAsync({model,imageId:IMAGE,execCommand:wrapped});
  assert.equal(r.status,'CANCELLED');assert.equal(r.points,null);
  assert.equal(commands.filter(a=>a[0]==='rm').length,0);
  assert.equal(existsSync(stage),false);
 });
 it('normal --rm completion never invokes force delete even with a cidfile',async()=>{
  const cid='c'.repeat(64),x=mockExec();let stage,forced=0;
  const wrapped=async(binary,args,opts)=>{
   if(args[0]==='rm'){forced++;return {stdout:''};}
   if(args[0]==='run'){
    stage=args.find(a=>a.includes(':/input:')).slice('--volume='.length).split(':/input:')[0];
    writeFileSync(stage+'/podman.cid',cid+'\n');
   }
   return x.exec(binary,args,opts);
  };
  const r=await runNativeGmplAsync({model,imageId:IMAGE,execCommand:wrapped});
  assert.equal(r.status,'GLPK_COMPLETED');
  assert.equal(forced,0);assert.equal(existsSync(stage),false);
 });
 it('an unresolved subprocess promise is awaited without blocking the event loop',async()=>{
  let resolveRun;let called=false;
  const gate=new Promise(resolve=>{resolveRun=resolve;});
  const x=mockExec({hold:gate});
  const pending=runNativeGmplAsync({model,imageId:IMAGE,execCommand:x.exec});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(called,false);called=true;resolveRun();
  const r=await pending;assert.equal(called,true);assert.equal(r.status,'GLPK_COMPLETED');
 });
});
