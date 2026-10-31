import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proveProductionByEnumeration as prove} from './or-production-equivalence-r1612.mjs';
const names=['alap','premium'];
const vars=()=>new Map(names.map(n=>[n,{integer:true,lower:0,upper:Infinity}]));
const row=(label,a,b,sense,limit)=>({name:label,sense,bound:limit,coeff:new Map([['alap',a],['premium',b]])});
const testModel=()=>({ok:true,vars:vars(),constraints:[row('anyag',2,3,'<=',12),row('munkaido',1,1,'<=',20)],
 objective:{sense:'max',constant:0,coeff:new Map([['alap',5],['premium',7]])}});
const fromExpected=ref=>({vars:Object.fromEntries([...ref.vars].map(([n,v])=>[n,{...v}])),
 constraints:ref.constraints.map(x=>({name:x.name,sense:x.sense,bound:x.bound,coeff:Object.fromEntries(x.coeff)})),
 objective:{sense:ref.objective.sense,constant:ref.objective.constant,coeff:Object.fromEntries(ref.objective.coeff)}});
const fixture=()=>{const parsed=testModel();return {parsed,expected:fromExpected(parsed)}};
test('identical production model has exact integer-lattice proof',()=>{
 const {parsed,expected}=fixture();assert.equal(prove(parsed,expected).status,'MATCH');
});
test('redundant labor row may be omitted without failing mathematical correctness',()=>{
 const {parsed,expected}=fixture();parsed.constraints.pop();assert.equal(prove(parsed,expected).status,'MATCH');
});
test('redundant row can be duplicated, reordered, scaled or reversed',()=>{
 const {parsed,expected}=fixture();parsed.constraints=[
  row('negated_material',-4,-6,'>=',-24),row('extra',2,3,'<=',12),row('labor',10,10,'<=',200)];
 assert.equal(prove(parsed,expected).status,'MATCH');
});
test('true extra feasible integer plan emits material diagnostic',()=>{
 const {parsed,expected}=fixture();parsed.constraints=[row('loose',2,3,'<=',13)];
 assert.deepEqual([prove(parsed,expected).status,prove(parsed,expected).code],['ZERO_CREDIT','production_model_material']);
});
test('removing all meaningful constraints with bounded but permissive limits is rejected',()=>{
 const {parsed,expected}=fixture();parsed.constraints=[row('loose',1,1,'<=',20)];
 assert.equal(prove(parsed,expected).code,'production_model_material');
});
test('restricting production plans too much is not accepted',()=>{
 const {parsed,expected}=fixture();parsed.constraints=[row('tight',2,3,'<=',11)];
 assert.equal(prove(parsed,expected).code,'production_model_feasible_set');
});
test('legitimate alternative plan optimum does not excuse wrong objective',()=>{
 const {parsed,expected}=fixture();parsed.objective.coeff.set('alap',8);
 assert.equal(prove(parsed,expected).code,'production_model_profit');
});
test('constant shift is a wrong reported objective even when argmax stays same',()=>{
 const {parsed,expected}=fixture();parsed.objective.constant=1;
 assert.equal(prove(parsed,expected).code,'production_model_profit');
});
test('wrong optimization direction rejected',()=>{
 const {parsed,expected}=fixture();parsed.objective.sense='min';
 assert.equal(prove(parsed,expected).code,'wrong_objective');
});
test('missing upper bounds never turn finite sample into false mathematical proof',()=>{
 const {parsed,expected}=fixture();parsed.constraints=[];
 assert.deepEqual([prove(parsed,expected).status,prove(parsed,expected).code],
 ['UNASSESSABLE','production_unbounded_proof_not_available']);
});
test('oversize candidate bounded search is unassessable, not wrong by default',()=>{
 const {parsed,expected}=fixture();parsed.constraints=[row('big',1,1,'<=',10000)];
 assert.equal(prove(parsed,expected).code,'production_proof_budget_exceeded');
});
test('fractional coefficients conservatively stay unassessable',()=>{
 const {parsed,expected}=fixture();parsed.constraints[0].coeff.set('alap',0.5);
 assert.equal(prove(parsed,expected).status,'UNASSESSABLE');
});
test('continuous or negative-domain inputs are never certified on the integer lattice',()=>{
 const {parsed,expected}=fixture();parsed.vars.get('alap').integer=false;
 assert.equal(prove(parsed,expected).status,'UNASSESSABLE');
 parsed.vars.get('alap').integer=true;parsed.vars.get('alap').lower=-1;
 assert.equal(prove(parsed,expected).status,'UNASSESSABLE');
});
test('integer variable upper bounds are enforced during feasible-set comparison',()=>{
 const {parsed,expected}=fixture();parsed.vars.get('alap').upper=1;
 assert.equal(prove(parsed,expected).status,'ZERO_CREDIT');
});
test('witness outside integer domain cannot be mistaken for a false positive',()=>{
 const {parsed,expected}=fixture();parsed.constraints=[row('halfspace',-1,1,'<=',5)];
 assert.equal(prove(parsed,expected).status,'UNASSESSABLE');
});
test('unknown variables or malformed expected models are not certified',()=>{
 const {parsed,expected}=fixture();parsed.objective.coeff.set('secret',1);
 assert.equal(prove(parsed,expected).status,'UNASSESSABLE');
 assert.equal(prove(null,expected).status,'UNASSESSABLE');
});
test('no student code execution, network requests or separate parser in proof module',()=>{
 const src=readFileSync(new URL('./or-production-equivalence-r1612.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/\b(?:eval|Function|spawn|execFile|fetch|require|glpsol|parseGusekModel)\s*\(/);
 assert.match(src,/MAX_POINTS=4096/);
});

test('256 bounded production models: reference and positive row scaling remain exact',()=>{
 for(let seed=0;seed<256;seed++){
  const materialA=2+(seed%4), materialB=3+((seed>>2)%4);
  const laborA=2+((seed>>4)%4),laborB=2+((seed>>6)%4);
  const materialLimit=24+((seed*7)%15),laborLimit=23+((seed*11)%17);
  const parsed={ok:true,vars:vars(),constraints:[
   row('anyag',materialA,materialB,'<=',materialLimit),
   row('munkaido',laborA,laborB,'<=',laborLimit)],
   objective:{sense:'max',constant:0,coeff:new Map([['alap',13+seed%14],['premium',18+(seed*3)%14]])}};
  const expected=fromExpected(parsed);
  assert.equal(prove(parsed,expected).status,'MATCH',`seed ${seed}`);
  parsed.constraints[0]=row('scaled',2*materialA,2*materialB,'<=',2*materialLimit);
  assert.equal(prove(parsed,expected).status,'MATCH',`scaled seed ${seed}`);
 }
});
