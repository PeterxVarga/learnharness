import test from 'node:test';
import assert from 'node:assert/strict';
import {proveAssignmentByEnumeration} from './or-assignment-equivalence-r1611.mjs';

const names=Array.from({length:9},(_,i)=>`a${Math.floor(i/3)+1}${i%3+1}`);
const vars=()=>new Map(names.map(name=>[name,{integer:true,lower:0,upper:1}]));
const constraint=(name, row)=>({name,sense:'=',bound:1,coeff:new Map(row.map(n=>[n,1]))});
const coeff=()=>new Map(names.map((n,i)=>[n,1+i]));
function fixture(){
 const constraints=[...Array.from({length:3},(_,i)=>constraint(`worker${i}`,names.slice(i*3,i*3+3))),
  ...Array.from({length:3},(_,j)=>constraint(`job${j}`,names.filter((_,i)=>i%3===j)))];
 const parsed={ok:true,vars:vars(),constraints,objective:{sense:'min',constant:0,coeff:coeff()}};
 const expected={vars:Object.fromEntries(vars()),constraints:constraints.map(c=>({name:c.name,sense:c.sense,bound:c.bound,coeff:Object.fromEntries(c.coeff)})),
  objective:{sense:'min',constant:0,coeff:Object.fromEntries(coeff())}};
 return {parsed,expected};
}
test('full trusted assignment matches',()=>{const {parsed,expected}=fixture();assert.equal(proveAssignmentByEnumeration(parsed,expected).status,'MATCH')});
test('one redundant constraint may be omitted without changing feasible assignments',()=>{
 const {parsed,expected}=fixture();parsed.constraints.pop();
 assert.equal(proveAssignmentByEnumeration(parsed,expected).status,'MATCH');
});
test('duplicated rows cannot replace two independent constraints',()=>{
 const {parsed,expected}=fixture();parsed.constraints[1]=parsed.constraints[0]; parsed.constraints[2]=parsed.constraints[0];
 assert.deepEqual(proveAssignmentByEnumeration(parsed,expected).status,'ZERO_CREDIT');
});
test('scaled and reordered equalities match',()=>{
 const {parsed,expected}=fixture();parsed.constraints.reverse();
 parsed.constraints[0]={...parsed.constraints[0],bound:2,coeff:new Map([...parsed.constraints[0].coeff].map(([k,v])=>[k,2*v]))};
 assert.equal(proveAssignmentByEnumeration(parsed,expected).status,'MATCH');
});
test('changed objective coefficient gives ZERO not a false MATCH',()=>{
 const {parsed,expected}=fixture();parsed.objective.coeff.set('a11',500);
 assert.equal(proveAssignmentByEnumeration(parsed,expected).code,'wrong_objective');
});
test('changed feasible region gives specific constraint mismatch',()=>{
 const {parsed,expected}=fixture();parsed.constraints[0]={...parsed.constraints[0],bound:2};
 assert.equal(proveAssignmentByEnumeration(parsed,expected).code,'wrong_constraint');
});
test('all six single-row omissions are equivalent but multiple missing independent rows are not',()=>{
 for(let i=0;i<6;i++){
  const {parsed,expected}=fixture();parsed.constraints.splice(i,1);
  assert.equal(proveAssignmentByEnumeration(parsed,expected).status,'MATCH',`removed row ${i}`);
 }
 const {parsed,expected}=fixture();parsed.constraints.splice(0,2);
 assert.equal(proveAssignmentByEnumeration(parsed,expected).status,'ZERO_CREDIT');
});
test('nonbinary or missing domains cannot be claimed equivalent',()=>{
 const {parsed,expected}=fixture();parsed.vars.get('a11').upper=Infinity;
 assert.equal(proveAssignmentByEnumeration(parsed,expected).status,'UNASSESSABLE');
});
test('non-integer objective coefficient and constraints remain bounded',()=>{
 const {parsed,expected}=fixture();parsed.objective.coeff.set('a11',1e9);
 assert.equal(proveAssignmentByEnumeration(parsed,expected).status,'UNASSESSABLE');
});
test('no executable source or hidden answer key is exposed',async()=>{
 const source=await import('node:fs').then(fs=>fs.readFileSync(new URL('./or-assignment-equivalence-r1611.mjs',import.meta.url),'utf8'));
 assert.doesNotMatch(source,/\b(?:eval|new Function|spawn|execFile|fetch)\s*\(/);
 assert.doesNotMatch(source,/orReference|solveTransport|makeOrTask/);
});
