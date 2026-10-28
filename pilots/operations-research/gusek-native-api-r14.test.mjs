import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {GET,POST} from '../../app/api/pilot/gusek/native/route.ts';

const TOKEN='a'.repeat(64);
const OTHER='b'.repeat(64);
const IMAGE='sha256:'+'c'.repeat(64);
const URI='http://localhost:3000/api/pilot/gusek/native';
function env(config,cb){
 const keys=['LH_GLPK_ENABLE_LOCAL','LH_GLPK_IMAGE_ID','LH_GLPK_RUN_TOKEN'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)delete process.env[k];
 for(const [k,v] of Object.entries(config))process.env[k]=v;
 try{return cb();}
 finally{for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
}
const ready={LH_GLPK_ENABLE_LOCAL:'1',LH_GLPK_IMAGE_ID:IMAGE,LH_GLPK_RUN_TOKEN:TOKEN};
function request({host='localhost:3000',origin='http://localhost:3000',token=TOKEN,type='application/json',body='{"model":"var x;","mode":"check"}',extra={}}={}){
 return new Request(URI,{method:'POST',headers:{host,origin,'content-type':type,'x-lh-glpk-token':token,...extra},body});
}
const get=(host='localhost:3000',extra={})=>GET(new Request(URI,{headers:{host,...extra}}));
describe('R14 native GLPK diagnostic route -- opt-in, local auth, no score authority',()=>{
 it('GET reports unavailable by default without image/token leakage',async()=>env({},async()=>{
  const r=get(),j=await r.json();assert.equal(r.status,200);assert.equal(j.available,false);assert.equal(j.scoreAuthority,false);assert.equal('imageId' in j,false);assert.equal('token' in j,false);
 }));
 it('GET reports available only when the feature, image and token are configured',async()=>env(ready,async()=>{
  const j=await get().json();assert.equal(j.available,true);assert.equal(j.scoreAuthority,false);
 }));
 it('GET is blocked on a nonlocal host',async()=>env(ready,async()=>assert.equal(get('example.com').status,403)));
 it('GET refuses forwarded host metadata',async()=>env(ready,async()=>assert.equal(get('localhost:3000',{'x-forwarded-host':'evil.com'}).status,403)));
 it('POST fails closed without explicit opt-in',async()=>env({},async()=>assert.equal((await POST(request())).status,503)));
 it('POST refuses absent or malformed token',async()=>env(ready,async()=>{
  for(const token of ['', 'short','nothex'.repeat(11)])assert.equal((await POST(request({token}))).status,403);
 }));
 it('POST refuses incorrect 64-byte token',async()=>env(ready,async()=>assert.equal((await POST(request({token:OTHER}))).status,403)));
 it('POST rejects cross-site Origin even with a valid token',async()=>env(ready,async()=>assert.equal((await POST(request({origin:'http://attacker.example'}))).status,403)));
 it('POST rejects forged Host despite otherwise valid Origin/token',async()=>env(ready,async()=>assert.equal((await POST(request({host:'app.example.org',origin:'http://app.example.org'}))).status,403)));
 it('POST rejects forwarded-host headers',async()=>env(ready,async()=>assert.equal((await POST(request({extra:{'x-forwarded-host':'attacker.example'}}))).status,403)));
 it('POST rejects cross-site fetch metadata',async()=>env(ready,async()=>assert.equal((await POST(request({extra:{'sec-fetch-site':'cross-site'}}))).status,403)));
 it('POST requires application/json',async()=>env(ready,async()=>assert.equal((await POST(request({type:'text/plain'}))).status,415)));
 it('POST enforces declared content length',async()=>env(ready,async()=>assert.equal((await POST(request({extra:{'content-length':'150000'}}))).status,413)));
 it('POST enforces actual byte length',async()=>env(ready,async()=>assert.equal((await POST(request({body:JSON.stringify({model:'x'.repeat(150000),mode:'check'})}))).status,413)));
 it('POST refuses malformed JSON without reaching Podman',async()=>env(ready,async()=>assert.equal((await POST(request({body:'{{'}))).status,400)));
 it('POST refuses extra fields, wrong mode and nonstring data',async()=>env(ready,async()=>{
  for(const body of [
   {model:'var x;',mode:'check',path:'/etc/passwd'},
   {model:'var x;',mode:'delete'},
   {model:'var x;',mode:'check',data:42}
  ])assert.equal((await POST(request({body:JSON.stringify(body)}))).status,400);
 }));
});
