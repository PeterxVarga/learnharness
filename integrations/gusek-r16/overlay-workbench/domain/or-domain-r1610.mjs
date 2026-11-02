/** R16.10: Hungarian operations-research content & exact bounded oracles.
 * Keep the existing R15 scalar MathProg parser, verifier and equivalence
 * checker authoritative for source models. Never execute learner source.
 * No LLM, network, filesystem, glpsol, global scores or storage.
 */
import {parseGusekModel,verifyGusekModel} from '../pilots/operations-research/gusek-model-r13.mjs';
import {indexedTransportStarter,verifyIndexedTransport} from './or-indexed-transport-r1627.mjs';

const UINT32=4294967295;
const int=(n,a=0,b=UINT32)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const KINDS=Object.freeze(['assignment','production','transport','transport_indexed']);
const NAMES=Object.freeze({assignment:'Munkatárs–feladat hozzárendelés',production:'Egészértékű termeléstervezés',transport:'Szállítási modell (3×3)',transport_indexed:'Általános szállítási modell (set/param/sum)'});
const err=(points,code,scope='domain')=>({points,maxPoints:1,correct:points===null?null:points===1,
 status:points===null?'UNASSESSABLE':points===1?'FULL_CREDIT':'ZERO_CREDIT',errors:points===1?[]:[code],
 verifiedBy:'r1610_static_model_and_exact_enumeration',diagnosticScope:scope});

function xorshift(seed){let state=(seed^0x9e3779b9)>>>0;return()=>{
 state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;
};}
function makeAssignment(seed){
 const rand=xorshift(seed);const costs=Array.from({length:3},()=>Array.from({length:3},()=>4+Math.floor(rand()*17)));
 return {schema:'tredven.or.assignment.v1',id:`or-assignment-${seed}`,kind:'assignment',seed,
  title:NAMES.assignment,objectiveSense:'min',variableNames:Array.from({length:9},(_,i)=>`a${Math.floor(i/3)+1}${i%3+1}`),
  costs,labels:{rows:['Anna','Béla','Csilla'],columns:['Tervezés','Tesztelés','Dokumentálás']},
  statement:'Három munkatárs három különböző megbízást végez. Minden munkatárs pontosan egy, minden megbízás pontosan egy munkatárshoz kerüljön. Minimalizáld az összes munkaidőt. A döntési változók binárisak.'};
}
function makeProduction(seed){
 const rand=xorshift(seed);const material=[2+Math.floor(rand()*4),3+Math.floor(rand()*4)];
 const hours=[2+Math.floor(rand()*4),2+Math.floor(rand()*4)];
 const profit=[13+Math.floor(rand()*14),18+Math.floor(rand()*14)];
 const materialLimit=24+Math.floor(rand()*15),hoursLimit=23+Math.floor(rand()*17);
 return {schema:'tredven.or.production.v1',id:`or-production-${seed}`,kind:'production',seed,
 title:NAMES.production,objectiveSense:'max',variableNames:['alap','premium'],
 material,hours,profit,materialLimit,hoursLimit,
 statement:'Egy műhely két terméket gyárt. A darabszámok nemnegatív egészek. Az alapanyag- és munkaidőkorlát egyidejű betartása mellett maximalizáld az összes nyereséget.'};
}
// Bounded synthetic transport data; no private exam values or answer key.
function makeTransport(seed){
 const rand=xorshift(seed),supply=[4,5,6],demand=[5,4,6],routeLimit=2;
 const costs=Array.from({length:3},()=>Array.from({length:3},()=>3+Math.floor(rand()*15)));
 return {schema:'tredven.or.transport.v1',id:'or-transport-'+seed,kind:'transport',seed,
  title:NAMES.transport,objectiveSense:'min',
  variableNames:Array.from({length:9},(_,i)=>'x'+(Math.floor(i/3)+1)+(i%3+1)),
  supply,demand,routeLimit,costs,
  labels:{rows:['A telephely','B telephely','C telephely'],columns:['1. bolt','2. bolt','3. bolt']},
  statement:'Három telephely minden készletét három bolt pontos igényére szállítjuk. Az 1. telephely és 2. bolt útvonalon külön mennyiségi felső korlát van. A darabszámok nemnegatív egészek. Minimalizáld a teljes szállítási költséget. Ez generált gyakorló, nem az eredeti mintavizsga.'};
}
export function makeOrTask(kind,seed){
 if(!KINDS.includes(kind)||!int(seed))throw Error('invalid_or_task');
 if(kind==='transport_indexed'){
  const base=makeTransport(seed);
  return {...base,schema:'tredven.or.transport-indexed.v1',kind:'transport_indexed',
   id:'or-transport_indexed-'+seed,title:NAMES.transport_indexed};
 }
 return kind==='assignment'?makeAssignment(seed):kind==='transport'?makeTransport(seed):makeProduction(seed);
}
function trustedSource(task){
 if(task.kind==='transport'){
  const n=(i,j)=>'x'+(i+1)+(j+1);
  const row=[0,1,2].map(i=>'s.t. keszlet_'+(i+1)+': '+[0,1,2].map(j=>n(i,j)).join(' + ')+' = '+task.supply[i]+';');
  const col=[0,1,2].map(j=>'s.t. igeny_'+(j+1)+': '+[0,1,2].map(i=>n(i,j)).join(' + ')+' = '+task.demand[j]+';');
  return [...task.variableNames.map(name=>'var '+name+' >= 0, integer;'),
   ...row,...col,'s.t. utvonal: x12 <= '+task.routeLimit+';',
   'minimize szallitasi_koltseg: '+task.variableNames.map((name,i)=>task.costs[Math.floor(i/3)][i%3]+'*'+name).join(' + ')+';'].join('\n');
 }
 if(task.kind==='assignment'){
  const x=(i,j)=>`a${i+1}${j+1}`;
  const declarations=task.variableNames.map(name=>`var ${name} binary;`);
  const rows=[0,1,2].map(i=>`s.t. munkatars_${i+1}: ${[0,1,2].map(j=>x(i,j)).join(' + ')} = 1;`);
  const cols=[0,1,2].map(j=>`s.t. munka_${j+1}: ${[0,1,2].map(i=>x(i,j)).join(' + ')} = 1;`);
  const objective=task.variableNames.map((name,i)=>`${task.costs[Math.floor(i/3)][i%3]}*${name}`).join(' + ');
  return [...declarations,...rows,...cols,`minimize osszido: ${objective};`].join('\n');
 }
 const [a,b]=task.variableNames;
 return [
  `var ${a} >= 0, integer;`, `var ${b} >= 0, integer;`,
  `s.t. alapanyag: ${task.material[0]}*${a} + ${task.material[1]}*${b} <= ${task.materialLimit};`,
  `s.t. munkaido: ${task.hours[0]}*${a} + ${task.hours[1]}*${b} <= ${task.hoursLimit};`,
  `maximize profit: ${task.profit[0]}*${a} + ${task.profit[1]}*${b};`
 ].join('\n');
}
function expectedModel(task){
 const parsed=parseGusekModel(trustedSource(task));
 if(!parsed.ok)throw Error('trusted_r1610_model_invalid:'+parsed.code);
 return {vars:Object.fromEntries([...parsed.vars]),
  objective:{sense:parsed.objective.sense,constant:parsed.objective.constant,
   coeff:Object.fromEntries(parsed.objective.coeff)},
  constraints:parsed.constraints.map(c=>({sense:c.sense,bound:c.bound,coeff:Object.fromEntries(c.coeff)}))};
}
/** Public starter does not expose constraints, objective coefficients, or optimum. */
export function orStarter(task){
 const kind=task?.kind;
 if(kind==='transport_indexed')return indexedTransportStarter(task);
 if(kind==='assignment')return [
  '# GUSEK / MathProg: hozzárendelés (bináris 3x3 modell)',
  ...task.variableNames.map(n=>`var ${n} binary;`),
  '# TODO: minden munkatars pontosan egy feladatot kapjon',
  '# TODO: minden feladat pontosan egy munkatarshoz keruljon',
  '# TODO: a teljes munkara forditott ido minimalizalasa',
  'solve;','end;'
 ].join('\n');
 if(kind==='transport')return [
  '# Generalt 3x3 szallitasi modell (nem az eredeti vizsga)',
  ...task.variableNames.map(n=>'var '+n+' >= 0, integer;'),
  '# TODO: 3 telephely pontos teljes keszlete (egyenletek)',
  '# TODO: 3 bolt pontos igenye (egyenletek)',
  '# TODO: x12 kulon utvonalkorlata',
  '# TODO: a fuvaronkenti koltsegek minimalizalasa',
  'solve;','end;'
 ].join('\n');
 if(kind==='production')return [
  '# GUSEK / MathProg: egesz termelesi modell',
  ...task.variableNames.map(n=>`var ${n} >= 0, integer;`),
  '# TODO: alapanyag korlat', '# TODO: munkaido korlat',
  '# TODO: teljes nyereseg maximalizalasa','solve;','end;'
 ].join('\n');
 throw Error('invalid_task');
}
function assignmentOracle(task){
 const permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
 let optimum=Infinity;let exemplar=null;
 for(const perm of permutations){const total=perm.reduce((sum,j,i)=>sum+task.costs[i][j],0);
  if(total<optimum){optimum=total;exemplar=perm;}
 }
 return {objective:optimum,exemplar,checked:6};
}
function productionOracle(task){
 // Every unit consumes at least 2 of both resources; upper bounds are finite.
 const maxA=Math.min(Math.floor(task.materialLimit/task.material[0]),Math.floor(task.hoursLimit/task.hours[0]));
 const maxB=Math.min(Math.floor(task.materialLimit/task.material[1]),Math.floor(task.hoursLimit/task.hours[1]));
 let optimum=-Infinity,exemplar=null,checked=0;
 for(let a=0;a<=maxA;a++)for(let b=0;b<=maxB;b++){
  if(a*task.material[0]+b*task.material[1]>task.materialLimit||
    a*task.hours[0]+b*task.hours[1]>task.hoursLimit)continue;
  checked++;const p=a*task.profit[0]+b*task.profit[1];
  if(p>optimum){optimum=p;exemplar=[a,b];}
 }
 return {objective:optimum,exemplar,checked};
}
// Exact finite 3x3 transportation oracle, server/test only; no user source execution.
function transportOracle(task){
 let optimum=Infinity,exemplar=null,checked=0;
 const [a,b,c]=task.supply,[d0,d1,d2]=task.demand;
 for(let x11=0;x11<=Math.min(a,d0);x11++)
  for(let x12=0;x12<=Math.min(a-x11,d1,task.routeLimit);x12++){
   const x13=a-x11-x12;
   if(x13<0||x13>d2)continue;
   for(let x21=0;x21<=Math.min(b,d0-x11);x21++)
    for(let x22=0;x22<=Math.min(b-x21,d1-x12);x22++){
     const x23=b-x21-x22,x31=d0-x11-x21,x32=d1-x12-x22,x33=d2-x13-x23;
     if([x23,x31,x32,x33].some(v=>v<0)||x31+x32+x33!==c)continue;
     checked++;
     const vals=[x11,x12,x13,x21,x22,x23,x31,x32,x33];
     const obj=vals.reduce((sum,x,i)=>sum+x*task.costs[Math.floor(i/3)][i%3],0);
     if(obj<optimum){optimum=obj;exemplar=vals;}
    }
  }
 if(!exemplar)throw Error('trusted_transport_not_feasible');
 return {objective:optimum,exemplar,checked};
}
function gradeTransport(task,answer){
 if(!answer||typeof answer!=='object'||Array.isArray(answer))return err(0,'invalid_answer');
 if(typeof answer.mathprog!=='string')return err(null,'unsupported_source','grammar');
 const model=parseGusekModel(answer.mathprog);
 if(!model.ok)return err(null,'unsupported_source','grammar');
 // The structural verifier proves the canonical form only.
 // A different mathematically equivalent formulation is NOT called wrong.
 const proof=verifyGusekModel(model,expectedModel(task));
 if(proof.status!=='MATCH')return proof.code==='wrong_objective'
  ?err(0,'transport_model_cost','model'):
  err(null,'transport_canonical_proof_not_available','model');
 const values=answer.values;
 if(!values||typeof values!=='object'||Array.isArray(values)||
    Object.keys(values).length!==9||
    task.variableNames.some(n=>!Object.hasOwn(values,n)||!int(values[n],0,1000)))
  return err(0,'solution_requires_nonnegative_integers','solution');
 const xs=task.variableNames.map(n=>values[n]);
 for(let i=0;i<3;i++)if(xs.slice(i*3,i*3+3).reduce((a,b)=>a+b,0)!==task.supply[i])
  return err(0,'transport_supply_not_exact','solution');
 for(let j=0;j<3;j++)if(xs[j]+xs[j+3]+xs[j+6]!==task.demand[j])
  return err(0,'transport_demand_not_exact','solution');
 if(xs[1]>task.routeLimit)return err(0,'transport_route_limit','solution');
 const cost=xs.reduce((sum,x,i)=>sum+x*task.costs[Math.floor(i/3)][i%3],0);
 if(typeof answer.reportedObjective!=='number'||!eq(answer.reportedObjective,cost))
  return err(0,'objective_mismatch','solution');
 if(!eq(cost,transportOracle(task).objective))return err(0,'not_optimal','solution');
 if(answer.hintsUsed!==false)return err(0,'independence_not_demonstrated','evidence');
 return err(1,null,'exam');
}
export function orReference(task){
 // Intentionally not exported by the HTTP route; only local test/server side.
 if(task?.kind==='assignment')return assignmentOracle(task);
 if(task?.kind==='production')return productionOracle(task);
 if(task?.kind==='transport')return transportOracle(task);
 throw Error('invalid_task');
}
const eq=(a,b)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
function checkValues(task,answer){
 const values=answer.values;
 if(!values||typeof values!=='object'||Array.isArray(values)||Object.keys(values).length!==task.variableNames.length||
   task.variableNames.some(n=>!Object.hasOwn(values,n)||typeof values[n]!=='number'||!Number.isFinite(values[n])))
  return 'solution_values_invalid';
 if(task.variableNames.some(n=>!int(values[n],0,1000)))return 'solution_requires_nonnegative_integers';
 if(task.kind==='assignment'){
  if(task.variableNames.some(n=>values[n]>1))return 'assignment_requires_binary';
  for(let i=0;i<3;i++)if([0,1,2].reduce((sum,j)=>sum+values[`a${i+1}${j+1}`],0)!==1)
   return `assignment_worker_${i+1}_not_once`;
  for(let j=0;j<3;j++)if([0,1,2].reduce((sum,i)=>sum+values[`a${i+1}${j+1}`],0)!==1)
   return `assignment_job_${j+1}_not_once`;
 }else{
  const [a,b]=task.variableNames.map(n=>values[n]);
  if(a*task.material[0]+b*task.material[1]>task.materialLimit)return 'production_material_capacity';
  if(a*task.hours[0]+b*task.hours[1]>task.hoursLimit)return 'production_labor_capacity';
 }
 return null;
}
import {knownOrError} from './or-diagnostics-r1610.mjs';
import {proveAssignmentByEnumeration} from './or-assignment-equivalence-r1611.mjs';
import {proveProductionByEnumeration} from './or-production-equivalence-r1612.mjs';

/** Exam-style 0/1/null; model correctness AND feasible optimal answer required.
 * No automatic partial credit; hints-used means no independent full score.
 * Only the trusted task generator determines the answer key/optimum.
 */
export function gradeOrTask(kind,seed,answer){
 const task=makeOrTask(kind,seed);
 if(kind==='transport')return gradeTransport(task,answer);
 if(kind==='transport_indexed'){
  if(!answer||typeof answer!=='object'||Array.isArray(answer))return err(0,'invalid_answer');
  const verify=verifyIndexedTransport(task,answer.mathprog);
  if(verify.status==='UNASSESSABLE')return err(null,verify.code,'model');
  if(verify.status==='MISMATCH')return err(0,verify.code,'model');
  // Equivalence of this strict canonical indexed model + task-matching data
  // to the scalar model is guaranteed by the verified expansion. Reuse the
  // proven server-only solution/optimum checker; never execute source.
  const scalar={...task,kind:'transport'};
  return gradeTransport(scalar,{...answer,mathprog:trustedSource(scalar)});
 }
 if(!answer||typeof answer!=='object'||Array.isArray(answer))return err(0,'invalid_answer');
 if(typeof answer.mathprog!=='string')return err(null,'unsupported_source','grammar');
 const model=parseGusekModel(answer.mathprog);
 if(!model.ok)return err(null,'unsupported_source','grammar');
 const expected=expectedModel(task);
 // Exact integer-lattice proof for assignment (2^9) and bounded two-variable
 // production; the R15 parser remains the only source-model parser.
 // The proof checks feasible sets AND reported objective semantics.
 const finiteProof=task.kind==='assignment'
  ?proveAssignmentByEnumeration(model,expected)
  :proveProductionByEnumeration(model,expected);
 // R14's approximate halfspace normal form cannot certify integer-boundary
 // equivalence; never upgrade an inconclusive exact proof to FULL_CREDIT.
 const verified=finiteProof;
 if(verified.status!=='MATCH'){
  // Fail-safe distinction: unknown equivalence is not a proof of error.
  // Only a proven semantic mismatch can yield ZERO_CREDIT.
  const code=verified.code??'unsupported_source';
  if(verified.status==='UNASSESSABLE')return err(null,
   task.kind==='assignment'?'assignment_binary_proof_not_available':
   knownOrError(verified.code)?verified.code:'unsupported_source','model');
  const familyErrors={
   assignment:{wrong_variable_domain:'assignment_model_binary_domain',
    wrong_objective:'assignment_model_total_cost',wrong_constraint_count:'assignment_model_rule_count',
    wrong_constraint:'assignment_model_one_to_one'},
   production:{wrong_variable_domain:'production_model_integer_domain',
    wrong_objective:'production_model_profit',wrong_constraint_count:'production_model_rule_count',
    wrong_constraint:'production_model_resources'}
  };
  const familyCode=familyErrors[task.kind]?.[code]??code;
  return err(0,knownOrError(familyCode)?familyCode:'wrong_constraint','model');
 }
 const bad=checkValues(task,answer);if(bad)return err(0,bad,'solution');
 const vals=task.variableNames.map(n=>answer.values[n]);
 const objective=task.kind==='assignment'?vals.reduce((s,x,i)=>s+x*task.costs[Math.floor(i/3)][i%3],0):
  vals.reduce((s,x,i)=>s+x*task.profit[i],0);
 if(typeof answer.reportedObjective!=='number'||!Number.isFinite(answer.reportedObjective)||
    !eq(answer.reportedObjective,objective))return err(0,'objective_mismatch','solution');
 if(!eq(objective,orReference(task).objective))return err(0,'not_optimal','solution');
 if(answer.hintsUsed!==false)return err(0,'independence_not_demonstrated','evidence');
 return err(1,null,'exam');
}
export const OR_KINDS=KINDS;
