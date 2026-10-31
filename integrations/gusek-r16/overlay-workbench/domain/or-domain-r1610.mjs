/** R16.10: Hungarian operations-research content & exact bounded oracles.
 * Keep the existing R15 scalar MathProg parser, verifier and equivalence
 * checker authoritative for source models. Never execute learner source.
 * No LLM, network, filesystem, glpsol, global scores or storage.
 */
import {parseGusekModel} from '../pilots/operations-research/gusek-model-r13.mjs';

const UINT32=4294967295;
const int=(n,a=0,b=UINT32)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
const KINDS=Object.freeze(['assignment','production']);
const NAMES=Object.freeze({assignment:'Munkatárs–feladat hozzárendelés',production:'Egészértékű termeléstervezés'});
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
export function makeOrTask(kind,seed){
 if(!KINDS.includes(kind)||!int(seed))throw Error('invalid_or_task');
 return kind==='assignment'?makeAssignment(seed):makeProduction(seed);
}
function trustedSource(task){
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
 if(kind==='assignment')return [
  '# GUSEK / MathProg: hozzárendelés (bináris 3x3 modell)',
  ...task.variableNames.map(n=>`var ${n} binary;`),
  '# TODO: minden munkatars pontosan egy feladatot kapjon',
  '# TODO: minden feladat pontosan egy munkatarshoz keruljon',
  '# TODO: a teljes munkara forditott ido minimalizalasa',
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
export function orReference(task){
 // Intentionally not exported by the HTTP route; only local test/server side.
 if(task?.kind==='assignment')return assignmentOracle(task);
 if(task?.kind==='production')return productionOracle(task);
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
