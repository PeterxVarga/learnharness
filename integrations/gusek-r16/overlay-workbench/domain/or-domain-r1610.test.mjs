/** R16.10: deterministic domain checks; R15 parser integration only when assembled. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const url=new URL('./or-domain-r1610.mjs',import.meta.url);
const source=readFileSync(url,'utf8');
assert.match(source,/from '\.\.\/pilots\/operations-research\/gusek-model-r13\.mjs'/);
assert.doesNotMatch(source,/from '\.\.\/pilots\/operations-research\/gusek-equivalence-r14\.mjs'/);
const stripped=source.replace(/^import \{.*\} from '(?:\.\.\/pilots\/operations-research|\.\/or-diagnostics-r1610|\.\/or-assignment-equivalence-r1611|\.\/or-production-equivalence-r1612)[^'\n]*';\n/gm,'');
// These mocks isolate mathematics and validation. They do NOT establish that
// R15's real parser accepts the submitted MathProg source (separate E2E gate).
const doubles=`const knownOrError=(code)=>['wrong_objective','wrong_constraint','production_model_profit'].includes(code);
const explainOrError=(code)=>code==='assignment_requires_binary'?'Egy munkatárs és egy munka párosítása csak 0 vagy 1 lehet.':'A korlát hibás.';
const parseGusekModel=(source)=>source==='INVALID' ? {ok:false,code:'unsupported_statement'}:
  ({ok:true,vars:new Map(),constraints:[],objective:{sense:'min',constant:0,coeff:new Map()},__source:source});
const proveEquivalentScalarModel=()=>({status:'MATCH',code:null}); // Deliberately unsafe fallback mock must never grant points.
const proveAssignmentByEnumeration=model=>['WRONG','UNCERTAIN'].includes(model.__source)?{status:'UNASSESSABLE',code:'unsupported_numeric_form'}:{status:'MATCH',code:null};
const proveProductionByEnumeration=model=>model.__source==='WRONG'?{status:'ZERO_CREDIT',code:'production_model_profit'}:model.__source==='UNCERTAIN'?{status:'UNASSESSABLE',code:'production_lattice_proof_not_available'}:{status:'MATCH',code:null};
const verifyGusekModel=(model,expected)=>model.__source==='WRONG' ?
  ({status:'ZERO_CREDIT',code:'wrong_objective'}):({status:'MATCH',code:null});\n`;
const mod=await import('data:text/javascript;base64,'+Buffer.from(doubles+stripped).toString('base64'));
const {makeOrTask,orStarter,orReference,gradeOrTask}=mod;
const perms=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
function goldenValues(task){
 const ref=orReference(task);
 if(task.kind==='assignment')return Object.fromEntries(task.variableNames.map((name,i)=>[name,Number(ref.exemplar[Math.floor(i/3)]===i%3)]));
 return Object.fromEntries(task.variableNames.map((name,i)=>[name,ref.exemplar[i]]));
}
const answerFor=(task)=>({mathprog:'VALID_FOR_MOCK_ONLY',values:goldenValues(task),reportedObjective:orReference(task).objective,hintsUsed:false});

test('both OR kinds deterministic across 256 seeds with bounded public parameters',()=>{
 for(let seed=0;seed<256;seed++)for(const kind of ['assignment','production']){
  const task=makeOrTask(kind,seed);
  assert.deepEqual(task,makeOrTask(kind,seed));
  assert.deepEqual(Object.keys(task).filter(x=>/oracle|optimum|exemplar|solution|token/i.test(x)),[]);
  assert.match(task.id,new RegExp(`^or-${kind}-${seed}$`));
  const starter=orStarter(task);assert.ok(starter.includes('TODO'));
  assert.doesNotMatch(starter,/minimize\s+\w+\s*:/i);
  assert.doesNotMatch(starter,/maximize\s+\w+\s*:/i);
  assert.ok(orReference(task).checked>0);
 }
});
test('3x3 assignment exact optimum crosschecked against all six permutations',()=>{
 for(let s=0;s<256;s++){
  const task=makeOrTask('assignment',s),oracle=orReference(task);
  const vals=perms.map(p=>p.reduce((sum,j,i)=>sum+task.costs[i][j],0));
  assert.equal(oracle.objective,Math.min(...vals));
  assert.ok(perms.some(p=>JSON.stringify(p)===JSON.stringify(oracle.exemplar)));
 }
});
test('integer production oracle independently crosschecked with full 0..20 enumeration',()=>{
 for(let s=0;s<256;s++){
  const t=makeOrTask('production',s),o=orReference(t);let best=-Infinity;
  for(let a=0;a<=20;a++)for(let b=0;b<=20;b++)if(
   a*t.material[0]+b*t.material[1]<=t.materialLimit&&
   a*t.hours[0]+b*t.hours[1]<=t.hoursLimit){
    best=Math.max(best,a*t.profit[0]+b*t.profit[1]);
   }
  assert.equal(o.objective,best);
 }
});
test('rejects invalid kind/seed',()=>{
 for(const kind of ['other','transport','__proto__',null])assert.throws(()=>makeOrTask(kind,42));
 for(const seed of [-1,3.5,4294967296,NaN,Infinity,'42'])assert.throws(()=>makeOrTask('assignment',seed));
});
test('correct trusted witness scores 1/1 under source-matching mock only',()=>{
 for(const k of ['assignment','production']){
  const t=makeOrTask(k,42);
  assert.deepEqual(gradeOrTask(k,42,answerFor(t)).points,1);
 }
});
test('legacy approximate MATCH never upgrades an uncertain finite proof',()=>{
 for(const kind of ['assignment','production']){
  const task=makeOrTask(kind,42),answer=answerFor(task);
  answer.mathprog='UNCERTAIN';
  assert.equal(gradeOrTask(kind,42,answer).points,null,kind);
 }
});
test('unassessable grammar is not an automatic incorrect model',()=>{
 const t=makeOrTask('assignment',42);
 const a=answerFor(t);a.mathprog='INVALID';
 assert.equal(gradeOrTask('assignment',42,a).points,null);
});
test('model mismatch precedes otherwise valid values',()=>{
 const t=makeOrTask('production',42);const a=answerFor(t);a.mathprog='WRONG';
 assert.deepEqual(gradeOrTask('production',42,a).errors,['production_model_profit']);
});
test('assignment: all nine values, binary and one-to-one constraints enforced',()=>{
 const t=makeOrTask('assignment',42);const a=answerFor(t);
 a.values.extra=0;assert.deepEqual(gradeOrTask('assignment',42,a).errors,['solution_values_invalid']);
 delete a.values.extra;
 a.values.a11=2;assert.deepEqual(gradeOrTask('assignment',42,a).errors,['assignment_requires_binary']);
 a.values.a11=0;a.values.a12=0;a.values.a13=0;
 assert.equal(gradeOrTask('assignment',42,a).errors[0],'assignment_worker_1_not_once');
});
test('assignment: column uniqueness errors detected after valid row sums',()=>{
 const t=makeOrTask('assignment',42);const a=answerFor(t);
 a.values=Object.fromEntries(t.variableNames.map((v,i)=>[v,Number(i%3===0)]));
 assert.equal(gradeOrTask('assignment',42,a).errors[0],'assignment_job_1_not_once');
});
test('production: material/labor capacity, integer and shape violations',()=>{
 const t=makeOrTask('production',42);const a=answerFor(t);
 a.values.alap=0.5;assert.equal(gradeOrTask('production',42,a).errors[0],'solution_requires_nonnegative_integers');
 a.values.alap=999;assert.equal(gradeOrTask('production',42,a).errors[0],'production_material_capacity');
 a.values.alap=0;a.values.premium=0;
 assert.equal(gradeOrTask('production',42,a).errors[0],'objective_mismatch');
});
test('objective cannot be falsified by self-reported number',()=>{
 const t=makeOrTask('assignment',42),a=answerFor(t);a.reportedObjective++;
 assert.equal(gradeOrTask(t.kind,t.seed,a).errors[0],'objective_mismatch');
});
test('a feasible but nonoptimal production plan is rejected',()=>{
 const t=makeOrTask('production',42),a=answerFor(t);a.values={alap:0,premium:0};a.reportedObjective=0;
 assert.equal(gradeOrTask(t.kind,t.seed,a).errors[0],'not_optimal');
});
test('hints used cannot earn independent full credit',()=>{
 const t=makeOrTask('assignment',42),a=answerFor(t);a.hintsUsed=true;
 assert.equal(gradeOrTask(t.kind,t.seed,a).errors[0],'independence_not_demonstrated');
});
test('Hungarian diagnostic labels exist for emitted error codes',async()=>{
 const t=makeOrTask('assignment',42),a=answerFor(t);a.values.a11=2;
 const c=gradeOrTask(t.kind,t.seed,a).errors[0];
 const {explainOrError}=await import('./or-diagnostics-r1610.mjs');
 assert.match(explainOrError(c),/0 vagy 1/);
 assert.match(explainOrError('wrong_constraint'),/korlát/);
});

// Real R15 parser/structural-equivalence tests. Absent from the delivery ZIP by
// design, but required when the installed add-on is assembled with pinned R15.
const realPath=new URL('../pilots/operations-research/gusek-model-r13.mjs',import.meta.url);
const real=existsSync(realPath)?await import('./or-domain-r1610.mjs'):null;
function realModel(t){
 if(t.kind==='assignment')return [
  ...t.variableNames.map(x=>`var ${x} binary;`),
  ...[0,1,2].map(i=>`s.t. munkatars_${i+1}: ${[0,1,2].map(j=>`a${i+1}${j+1}`).join(' + ')} = 1;`),
  ...[0,1,2].map(j=>`s.t. munka_${j+1}: ${[0,1,2].map(i=>`a${i+1}${j+1}`).join(' + ')} = 1;`),
  `minimize osszido: ${t.variableNames.map((name,i)=>`${t.costs[Math.floor(i/3)][i%3]}*${name}`).join(' + ')};`,
  'solve;','end;'
 ].join('\n');
 return [...t.variableNames.map(n=>`var ${n} >= 0, integer;`),
 `s.t. alapanyag: ${t.material[0]}*alap + ${t.material[1]}*premium <= ${t.materialLimit};`,
 `s.t. munkaido: ${t.hours[0]}*alap + ${t.hours[1]}*premium <= ${t.hoursLimit};`,
 `maximize profit: ${t.profit[0]}*alap + ${t.profit[1]}*premium;`,
 'solve;','end;'].join('\n');
}
test('REAL R15 parser accepts full-credit assignment + production models', {skip:!real?'requires pinned R15 checkout':false},()=>{
 for(let seed=0;seed<36;seed++)for(const kind of ['assignment','production']){
  const t=real.makeOrTask(kind,seed);
  const a={...answerFor(t),mathprog:realModel(t)};
  assert.equal(real.gradeOrTask(kind,seed,a).points,1,`${kind}:${seed}`);
 }
});
test('REAL R15 parser rejects wrong objectives, domains, and constraints',{skip:!real?'requires pinned R15 checkout':false},()=>{
 for(const kind of ['assignment','production']){
  const t=real.makeOrTask(kind,42),a={...answerFor(t),mathprog:realModel(t)};
  a.mathprog=a.mathprog.replace(kind==='assignment'?'minimize':'maximize',kind==='assignment'?'maximize':'minimize');
  assert.equal(real.gradeOrTask(kind,42,a).points,0);
  // One relaxed equality may be redundant; remove ALL worker rows to
  // create a genuinely different feasible set in the binary assignment.
  a.mathprog=kind==='assignment'?realModel(t).replace(/^s\.t\. munkatars_[123]:.*\n/gm,''):realModel(t).replace(' <= ', ' >= ');
  assert.equal(real.gradeOrTask(kind,42,a).points,0);
  a.mathprog=realModel(t).replace(kind==='assignment'?'binary;':'integer;',kind==='assignment'?'integer;':'binary;');
  assert.notEqual(real.gradeOrTask(kind,42,a).points,1);
 }
});

test('REAL R15 parser + R16.12 production proof preserves redundant labor and rejects missing material',
 {skip:!real?'requires pinned R15 checkout':false},()=>{
 const task=real.makeOrTask('production',0),reference=real.orReference(task);
 const canonical=realModel(task),ans={mathprog:canonical,
  values:Object.fromEntries(task.variableNames.map((n,i)=>[n,reference.exemplar[i]])),
  reportedObjective:reference.objective,hintsUsed:false};
 assert.equal(real.gradeOrTask('production',0,ans).points,1);
 assert.equal(real.gradeOrTask('production',0,{...ans,
  mathprog:canonical.replace(/^s\.t\. munkaido:.*\n/m,'')}).points,1);
 assert.equal(real.gradeOrTask('production',0,{...ans,
  mathprog:canonical.replace(/^s\.t\. alapanyag:.*\n/m,'')}).points,0);
 assert.equal(real.gradeOrTask('production',0,{...ans,
  mathprog:canonical.replace(/^s\.t\. (?:alapanyag|munkaido):.*\n/gm,'')}).points,null);
});

// Public diagnostic module is separately importable without the grading oracle.
test('diagnostics accessible independently of hidden reference oracle',async()=>{
 const pub=await import('./or-diagnostics-r1610.mjs');
 assert.equal(typeof pub.orReference,'undefined');
 assert.match(pub.explainOrError('production_material_capacity'),/alapanyag/);
});
