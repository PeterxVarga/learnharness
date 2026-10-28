/** R14I: full-credit indexed 3x3 transport within an explicitly bounded
 * GNU MathProg grammar. Uses the R7 structural proof and an independent R3
 * integer enumeration. The student's .mod and .dat are NEVER executed here.
 * All unknown general GMPL forms remain UNASSESSABLE, not automatically wrong.
 */
import {assessIndexedMathProg} from './mathprog-indexed-r7.mjs';
import {makeTransportTask,gradeTransportExam} from './transport-exam-r3.mjs';

const KEY=/^x\[([1-3]),([1-3])\]$/;
const MAX_SOURCE=16384;
const NAMES=[
 'Raktar1_Bolt1','Raktar1_Bolt2','Raktar1_Bolt3',
 'Raktar2_Bolt1','Raktar2_Bolt2','Raktar2_Bolt3',
 'Raktar3_Bolt1','Raktar3_Bolt2','Raktar3_Bolt3'
];
const answerError=(points,code)=>({status:points===null?'UNASSESSABLE':'ZERO_CREDIT',
 points,maxPoints:1,correct:points===null?null:false,errors:[code],
 verifiedBy:'r14_indexed_transport_static_and_integer_oracle'});
const full=()=>({status:'FULL_CREDIT',points:1,maxPoints:1,correct:true,
 errors:[],verifiedBy:'r14_indexed_transport_static_and_integer_oracle'});
export function looksIndexedTransport(source){
 return typeof source==='string'&&
  /\b(?:set\s+I\s*;|var\s+x\s*\{\s*i\s+in\s+I\s*,\s*j\s+in\s+J\s*\})/i.test(
   source.replace(/#[^\r\n]*/g,''));
}
function canonicalIndexedSource(source){
 if(typeof source!=='string'||source.length<20||source.length>MAX_SOURCE)
  return {ok:false,code:'invalid_or_unsupported_source'};
 // R7 does not support arbitrary strings, macro or data blocks. No evaluation.
 if(/\/\*|\*\/|["'`\\]/.test(source))
  return {ok:false,code:'unsupported_statement'};
 const clean=source.replace(/#[^\r\n]*/g,'');
 if(/\b(?:data|include|table|read|write|printf|display|check|for|let)\s*[;{]/i.test(clean))
  return {ok:false,code:'unsupported_statement'};
 const decl=/\bvar\s+x\s*\{\s*i\s+in\s+I\s*,\s*j\s+in\s+J\s*\}\s*([^;]*);/g;
 const declarations=[...clean.matchAll(decl)];
 if(declarations.length!==1)return {ok:false,code:'unsupported_indexed_variable'};
 const d=declarations[0];
 const parts=d[1].split(',').map(s=>s.replace(/\s+/g,'').toLowerCase()).filter(Boolean);
 if(new Set(parts).size!==parts.length || !parts.includes('>=0')||
    parts.some(p=>!['>=0','<=cap[i,j]','integer'].includes(p)))
  return {ok:false,code:'unsupported_variable_declaration'};
 if(!parts.includes('integer'))return {ok:false,code:'missing_integer_domain',adjudicable:true};
 // A missing <=cap[i,j] is permitted only if R7 sees the explicit
 // indexed route-cap constraint. R7 checks it itself.
 const normalized='var x{i in I, j in J} >= 0'+(parts.includes('<=cap[i,j]')?', <= cap[i,j]':'')+';';
 let model=clean.slice(0,d.index)+normalized+clean.slice(d.index+d[0].length);
 const hasSolve=/\bsolve\s*;/i.test(model),hasEnd=/\bend\s*;/i.test(model);
 if(!hasSolve&&!hasEnd)model+='\nsolve;\nend;';
 else if(hasSolve&&!hasEnd)model+='\nend;';
 else if(!hasSolve&&hasEnd)return {ok:false,code:'unsupported_solve_order'};
 return {ok:true,model};
}
function allocationOf(values){
 if(!values||typeof values!=='object'||Array.isArray(values))return null;
 const keys=Object.keys(values);
 if(keys.length!==9)return null;
 const allNamed=NAMES.every(n=>Object.hasOwn(values,n));
 const allIndexed=keys.every(k=>KEY.test(k))&&
  Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>`x[${i+1},${j+1}]`))
   .flat().every(k=>Object.hasOwn(values,k));
 if(!allNamed&&!allIndexed)return null;
 return Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>
   values[allNamed?NAMES[i*3+j]:`x[${i+1},${j+1}]`]));
}
export function gradeIndexedGusekTransport(seed,answer){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)
  return answerError(null,'invalid_seed');
 if(!answer||typeof answer!=='object'||Array.isArray(answer))
  return answerError(0,'invalid_answer');
 const parsed=canonicalIndexedSource(answer.mathprog);
 if(!parsed.ok)return answerError(parsed.adjudicable?0:null,'source_'+parsed.code);
 const task=makeTransportTask(seed);
 const verified=assessIndexedMathProg(task,parsed.model);
 if(!verified.ok)return answerError(verified.adjudicable?0:null,'source_'+verified.code);
 const allocation=allocationOf(answer.values);
 if(!allocation)return answerError(0,'invalid_solution_values');
 const result=gradeTransportExam(task,{
  model:{sense:'min',nonnegative:true,supply:task.supply,demand:task.demand,
    costs:task.costs,capacities:task.capacities},
  allocation,reportedObjective:answer.reportedObjective,
  hintsUsed:answer.hintsUsed
 });
 if(result.points!==1)return answerError(0,result.errors[0]||'incorrect_solution');
 return full();
}
/** Only a *starter*: contains no supplied objective or solution. */
export function indexedTransportStarter(){
 return [
  '# Indexelt GNU MathProg modell: a feltételeket és célfüggvényt neked kell megírnod.',
  'set I;',
  'set J;',
  'param supply{i in I};',
  'param demand{j in J};',
  'param cost{i in I, j in J};',
  'param cap{i in I, j in J};',
  'var x{i in I, j in J} >= 0, integer, <= cap[i,j];',
  '',
  '# TODO: minimize ...',
  '# TODO: s.t. supply_balance{i in I}: ...',
  '# TODO: s.t. demand_balance{j in J}: ...',
  'solve;',
  'end;'
 ].join('\n');
}
export function indexedTransportData(task){
 if(task?.kind!=='transport'||task.supply?.length!==3||task.demand?.length!==3||
   task.costs?.length!==3||task.capacities?.length!==3)
  throw Error('invalid_transport_task');
 const vector=a=>a.map((n,i)=>`${i+1} ${n}`).join(' ');
 const table=a=>a.map((row,i)=>`${i+1} ${row.join(' ')}`).join('\n');
 return `data;
set I := 1 2 3;
set J := 1 2 3;
param supply := ${vector(task.supply)};
param demand := ${vector(task.demand)};
param cost: 1 2 3 :=
${table(task.costs)};
param cap: 1 2 3 :=
${table(task.capacities)};
end;
`;
}
