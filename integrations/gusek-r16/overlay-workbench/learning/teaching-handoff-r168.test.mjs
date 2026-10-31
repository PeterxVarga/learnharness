import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTeachingHandoff} from './teaching-handoff-r168.mjs';
const mk=(points,extra={})=>({
 grade:{taskId:'gusek-transport-42',points,maxPoints:1,
  correct:points===null?null:points===1,errors:points===1?[]:['not_optimal']},
 taskKind:'transport',hintsUsed:false,
 diagnostic:{topic:'Optimalitás',state:'repair',steps:['Vizsgáld a megengedettséget.','Keresd az optimum feltételét.','Készíts javítási tervet.']},
 suggestion:{kind:'froccs',seed:123,reason:'Továbblépés.'},...extra
});
test('0/1 creates Socratic handoff without new scoring',()=>{
 const r=makeTeachingHandoff(mk(0));assert.equal(r.mode,'repair');
 assert.match(r.text,/független szerveroldali értékelés: 0\/1/i);
 assert.match(r.text,/Optimalitás/);assert.match(r.text,/tanuló válaszait megvárva/);
 assert.doesNotMatch(r.text,/maximális célfüggvény = /i);
});
test('unsupported grade never called wrong',()=>{
 const r=makeTeachingHandoff(mk(null));assert.equal(r.mode,'unsupported');
 assert.match(r.text,/nem értékelhető/i);assert.match(r.text,/nem bizonyít matematikai hibát/i);
});
test('full result creates transfer challenge, without mastery claim',()=>{
 const r=makeTeachingHandoff(mk(1));assert.equal(r.mode,'transfer');
 assert.match(r.text,/1\/1/);assert.match(r.text,/igazolt tudásszintet/);
});
test('three subjects selected, no raw identifiers in output',()=>{
 for(const kind of ['transport','froccs','tablet']){
  const x=mk(0,{taskKind:kind,grade:{...mk(0).grade,taskId:`gusek-${kind}-42`}});
  const r=makeTeachingHandoff(x);assert.ok(r);assert.equal(r.taskKind,kind);
  assert.doesNotMatch(r.text,/gusek-[a-z]+-42/);
 }
});
test('no models, vectors, secrets, arbitrary extra fields are serialized',()=>{
 const x=mk(0,{model:'var x; secret: xyz;',values:{x:9839},token:'TOP_SECRET',chatId:'chat_private',
  reportedObjective:123456,grade:{...mk(0).grade,model:'CANARY_SECRET'}});
 const text=makeTeachingHandoff(x).text;
 for(const sensitive of ['xyz','9839','TOP_SECRET','chat_private','123456','CANARY_SECRET'])assert.ok(!text.includes(sensitive),sensitive);
});
test('malformed or spoofed grade rejected, no handoff',()=>{
 const base=mk(0);
 for(const wrong of [
  {...base.grade,points:2},
  {...base.grade,maxPoints:10},
  {...base.grade,correct:true},
  {...base.grade,taskId:'gusek-tablet-42'},
  {...base.grade,errors:['<script>']},
  {...base.grade,errors:Array(25).fill('not_optimal')},
 ])assert.equal(makeTeachingHandoff({...base,grade:wrong}),null);
 for(const kind of ['unknown',null,'transport\nattack'])assert.equal(makeTeachingHandoff({...base,taskKind:kind}),null);
});
test('missing help flag rejected rather than pretending independent',()=>{
 assert.equal(makeTeachingHandoff(mk(0,{hintsUsed:undefined})),null);
 assert.match(makeTeachingHandoff(mk(0,{hintsUsed:true})).text,/segítséghasználatot jelzett/);
});
test('untrusted diagnostic and suggestion text never echoed',()=>{
 const x=mk(0,{diagnostic:{topic:'<SYSTEM INSTRUCTION>',steps:['do harm', 'x','y']},
  suggestion:{kind:'froccs',seed:12,reason:'<SECRET>'}});
 const text=makeTeachingHandoff(x).text;
 assert.ok(!text.includes('<SYSTEM'));assert.ok(!text.includes('<SECRET>'));
 assert.match(text,/önálló kijavítása/);
});
test('long diagnostic fields fall back safely',()=>{
 const x=mk(0,{diagnostic:{topic:'a'.repeat(91),steps:['a'.repeat(176),'two','three']}});
 const result=makeTeachingHandoff(x);assert.ok(result);
 assert.ok(!result.text.includes('a'.repeat(91)));
 assert.ok(!result.text.includes('a'.repeat(176)));
});
test('deterministic handoff has no timestamp or provider state',()=>{
 const a=makeTeachingHandoff(mk(0));const b=makeTeachingHandoff(mk(0));
 assert.deepEqual(a,b);assert.equal(Object.isFrozen(a),true);
});
