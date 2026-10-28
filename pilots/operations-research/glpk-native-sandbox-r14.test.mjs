import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {existsSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs';
import {runNativeGmpl} from './glpk-native-sandbox-r14.mjs';
const image='sha256:'+'a'.repeat(64);
const model='var x >= 0; maximize total: x; s.t. limit: x <= 3; solve; end;';
const setup=({rootless=true,exists=true,executionStatus=0,error=null}={})=>{
 const calls=[];let stage=null;
 const spawn=(binary,args,opts)=>{
   assert.equal(binary,'podman');assert.equal(opts.shell,false);calls.push(args);
   if(args[0]==='info')return {status:rootless?0:1,stdout:rootless?'true\n':'false\n'};
   if(args[0]==='image')return {status:exists?0:1,stdout:exists?image+'\n':''};
   assert.equal(args[0],'run');
   stage=args.find(x=>x.startsWith('--volume='))?.slice('--volume='.length).split(':/input:')[0];
   assert.ok(stage&&existsSync(stage));
   assert.equal(readFileSync(stage+'/model.mod','utf8'),model);
   assert.ok(args.includes('--network=none'));
   assert.ok(args.includes('--pull=never'));
   assert.ok(args.includes('--read-only'));
   assert.ok(args.includes('--cap-drop=all'));
   assert.ok(args.includes('--userns=keep-id'));
   assert.ok(args.includes('--memory=256m'));
   assert.ok(args.includes('--security-opt=no-new-privileges'));
   assert.ok(args.includes('--image-volume=ignore'));
   assert.ok(args.includes('--http-proxy=false'));
   assert.ok(args.includes('--timeout=12'));
   assert.ok(args.includes('--seed'));assert.equal(args[args.indexOf('--seed')+1],'0');
   assert.ok(args.includes('--memlim'));assert.equal(args[args.indexOf('--memlim')+1],'192');
   if(args.includes('--output'))assert.equal(args[args.indexOf('--output')+1],'/output/solution.txt');
   assert.ok(!args.includes('--privileged'));
   assert.ok(!args.includes('--network=host'));
   return {status:executionStatus,stdout:'GLPK summary; UNVERIFIED',stderr:'GLPK error',error};
 };
 return {calls,spawn,get stage(){return stage;}};
};
describe('R14N rootless native GNU MathProg isolated runtime',()=>{
 it('refuses unpinned image before spawning Podman',()=>{const {spawn,calls}=setup();assert.equal(runNativeGmpl({model,imageId:'fedora:44',spawn}).code,'image_id_not_pinned');assert.equal(calls.length,0);});
 it('refuses missing or oversized model without spawning',()=>{const {spawn,calls}=setup();for(const m of ['', 'x'.repeat(70000),'x\0'])assert.equal(runNativeGmpl({model:m,imageId:image,spawn}).status,'BLOCKED');assert.equal(calls.length,0);});
 it('refuses huge data and wrong mode before spawning',()=>{const {spawn,calls}=setup();assert.equal(runNativeGmpl({model,data:'a'.repeat(70000),imageId:image,spawn}).code,'invalid_model_or_data');assert.equal(runNativeGmpl({model,mode:'arbitrary',imageId:image,spawn}).code,'invalid_mode');assert.equal(calls.length,0);});
 it('fails closed when rootless Podman is missing',()=>{const x=setup({rootless:false});assert.equal(runNativeGmpl({model,imageId:image,spawn:x.spawn}).code,'rootless_podman_unavailable');assert.equal(x.calls.length,1);});
 it('fails closed if immutable image is missing',()=>{const x=setup({exists:false});assert.equal(runNativeGmpl({model,imageId:image,spawn:x.spawn}).code,'immutable_image_unavailable');assert.equal(x.calls.length,2);});
 it('runs checked no-network read-only bounded container, never an OS shell',()=>{const x=setup();const r=runNativeGmpl({model,imageId:image,spawn:x.spawn});assert.equal(r.status,'GLPK_COMPLETED');assert.equal(r.graded,false);assert.equal(r.points,null);assert.equal(r.solverOutputTrusted,false);assert.equal(x.calls.length,3);assert.ok(!existsSync(x.stage));});
 it('separate model and data are private temporary inputs',()=>{const x=setup();const d='data; param cap := 4; end;';const read=x.spawn;let checked=false;const inject=(binary,args,opts)=>{if(args[0]==='run'){const stage=args.find(a=>a.startsWith('--volume=')).slice(9).split(':/input:')[0];assert.equal(readFileSync(stage+'/data.dat','utf8'),d);assert.ok(args.includes('--data'));checked=true;}return read(binary,args,opts);};const r=runNativeGmpl({model,data:d,imageId:image,spawn:inject});assert.equal(r.status,'GLPK_COMPLETED');assert.equal(checked,true);assert.ok(!existsSync(x.stage));});
 it('check mode adds actual GLPK translation-only flag',()=>{const x=setup();const r=runNativeGmpl({model,mode:'check',imageId:image,spawn:x.spawn});assert.equal(r.mode,'check');assert.ok(x.calls[2].includes('--check'));});
 it('solver nonzero status is not accepted as a grade',()=>{const x=setup({executionStatus:1});const r=runNativeGmpl({model,imageId:image,spawn:x.spawn});assert.equal(r.status,'GLPK_ERROR');assert.equal(r.graded,false);assert.equal(r.points,null);});
 it('outer timeout fails closed',()=>{const x=setup({error:Object.assign(new Error('timed out'),{code:'ETIMEDOUT'})});const r=runNativeGmpl({model,imageId:image,spawn:x.spawn});assert.equal(r.status,'TIME_LIMIT');assert.equal(r.code,'outer_timeout');assert.ok(!existsSync(x.stage));});
 it('oversized process output fails closed',()=>{const x=setup({error:Object.assign(new Error('maxBuffer'),{code:'ENOBUFS'})});const r=runNativeGmpl({model,imageId:image,spawn:x.spawn});assert.equal(r.code,'output_limit');assert.equal(r.status,'BLOCKED');});
 it('truncates solver-provided diagnostics',()=>{const x=setup();const base=x.spawn;const custom=(b,a,o)=>a[0]==='run'?{status:0,stdout:'A'.repeat(40000),stderr:''}:base(b,a,o);const r=runNativeGmpl({model,imageId:image,spawn:custom});assert.equal(r.diagnostic.length,8192);assert.equal(r.graded,false);});
 it('does not inherit BYOK secrets or remote Podman configuration',()=>{
   const oldSecret=process.env.LH_TEST_R14_SECRET,oldRemote=process.env.CONTAINER_HOST;
   process.env.LH_TEST_R14_SECRET='should_not_reach_podman';
   process.env.CONTAINER_HOST='ssh://remote.example/run/user/1000/podman.sock';
   try{
     const x=setup(),base=x.spawn;
     let saw=false;
     const spawn=(binary,args,opts)=>{
       assert.equal(opts.env.LH_TEST_R14_SECRET,undefined);
       assert.equal(opts.env.CONTAINER_HOST,undefined);
       assert.equal(opts.env.LH_GLPK_RUN_TOKEN,undefined);
       assert.ok(opts.env.PATH);
       saw=true;return base(binary,args,opts);
     };
     assert.equal(runNativeGmpl({model,imageId:image,spawn}).status,'GLPK_COMPLETED');
     assert.equal(saw,true);
   }finally{
     if(oldSecret===undefined)delete process.env.LH_TEST_R14_SECRET;else process.env.LH_TEST_R14_SECRET=oldSecret;
     if(oldRemote===undefined)delete process.env.CONTAINER_HOST;else process.env.CONTAINER_HOST=oldRemote;
   }
 });
 it('returns bounded GLPK printed solution listing, never a certified grade',()=>{
   const x=setup(),base=x.spawn;
   const mock=(binary,args,opts)=>{
     if(args[0]==='run'){
       const mount=args.find(v=>v.startsWith('--volume=')&&v.includes(':/output:'));
       assert.ok(mount);const dir=mount.slice('--volume='.length).split(':/output:')[0];
       writeFileSync(dir+'/solution.txt','Problem: model\\nObjective: total = 3 (MAXimum)\\nColumn name Activity\\nx 3\\n');
     }
     return base(binary,args,opts);
   };
   const r=runNativeGmpl({model,imageId:image,spawn:mock});
   assert.match(r.solutionListing,/Objective: total = 3/);
   assert.equal(r.graded,false);assert.equal(r.points,null);
   assert.ok(!existsSync(x.stage));
 });
 it('does not follow a symlinked solver output into host files',()=>{
   const x=setup(),base=x.spawn;
   const mock=(binary,args,opts)=>{
     if(args[0]==='run'){
       const mount=args.find(v=>v.startsWith('--volume=')&&v.includes(':/output:'));
       const dir=mount.slice('--volume='.length).split(':/output:')[0];
       symlinkSync('/etc/passwd',dir+'/solution.txt');
     }
     return base(binary,args,opts);
   };
   const r=runNativeGmpl({model,imageId:image,spawn:mock});
   assert.equal(r.solutionListing,null);assert.equal(r.graded,false);
   assert.ok(!existsSync(x.stage));
 });
 it('reads real GLPK machine header as optimum but not a Practice grade',()=>{
  const x=setup(),base=x.spawn;
  const fake=(binary,args,opts)=>{
   if(args[0]==='run'){
    const mount=args.find(v=>v.startsWith('--volume=')&&v.includes(':/output:'));
    const dir=mount.slice('--volume='.length).split(':/output:')[0];
    assert.ok(args.includes('--write'));assert.ok(args.includes('/output/solution.raw'));
    writeFileSync(dir+'/solution.raw','s mip 4 9 o 123\n');
   }
   return base(binary,args,opts);
  };
  const r=runNativeGmpl({model,imageId:image,spawn:fake});
  assert.equal(r.solverStatus,'OPTIMAL');assert.equal(r.objective,123);
  assert.equal(r.graded,false);assert.equal(r.points,null);
 });
 it('reports machine-confirmed infeasibility, without scoring the student',()=>{
  const x=setup(),base=x.spawn;
  const fake=(binary,args,opts)=>{
   if(args[0]==='run'){
    const mount=args.find(v=>v.startsWith('--volume=')&&v.includes(':/output:'));
    const dir=mount.slice('--volume='.length).split(':/output:')[0];
    writeFileSync(dir+'/solution.raw','s mip 4 9 n 0\n');
   }
   return base(binary,args,opts);
  };
  const r=runNativeGmpl({model,imageId:image,spawn:fake});
  assert.equal(r.solverStatus,'INFEASIBLE');assert.equal(r.graded,false);
  assert.equal(r.points,null);
 });
 it('synchronous Podman timeout cleans only its private cidfile container',()=>{
  const cid='d'.repeat(64),x=setup(),calls=[];let stage;
  const mocked=(binary,args,opts)=>{
   calls.push(args);
   if(args[0]==='rm'){
    assert.deepEqual(args,['rm','--force','--ignore',cid]);
    assert.ok(opts.timeout<=5000);return {status:0,stdout:''};
   }
   if(args[0]==='run'){
    stage=args.find(a=>a.includes(':/input:')).slice('--volume='.length).split(':/input:')[0];
    assert.ok(args.includes('--cidfile='+stage+'/podman.cid'));
    writeFileSync(stage+'/podman.cid',cid+'\n');
    return {status:null,error:Object.assign(new Error('deadline'),{code:'ETIMEDOUT'})};
   }
   return x.spawn(binary,args,opts);
  };
  const result=runNativeGmpl({model,imageId:image,spawn:mocked});
  assert.equal(result.status,'TIME_LIMIT');
  assert.equal(result.points,null);
  assert.equal(calls.filter(c=>c[0]==='rm').length,1);
  assert.equal(existsSync(stage),false);
 });
 it('synchronous cleanup never accepts an untrusted cidfile',()=>{
  const x=setup(),calls=[];let stage;
  const mocked=(binary,args,opts)=>{
   calls.push(args);
   if(args[0]==='rm')throw Error('must not run podman rm');
   if(args[0]==='run'){
    stage=args.find(a=>a.includes(':/input:')).slice('--volume='.length).split(':/input:')[0];
    writeFileSync(stage+'/podman.cid','../../not-a-container\n');
    return {status:null,error:Object.assign(new Error('deadline'),{code:'ETIMEDOUT'})};
   }
   return x.spawn(binary,args,opts);
  };
  const result=runNativeGmpl({model,imageId:image,spawn:mocked});
  assert.equal(result.status,'TIME_LIMIT');
  assert.equal(calls.filter(c=>c[0]==='rm').length,0);
  assert.equal(existsSync(stage),false);
 });
 it('an unavailable Podman binary is blocked, never falls back to host glpsol',()=>{const x=setup();const custom=(binary,args,opts)=>args[0]==='info'?{error:Object.assign(new Error('not found'),{code:'ENOENT'}),status:null}:x.spawn(binary,args,opts);const r=runNativeGmpl({model,imageId:image,spawn:custom});assert.equal(r.code,'rootless_podman_unavailable');});
});
