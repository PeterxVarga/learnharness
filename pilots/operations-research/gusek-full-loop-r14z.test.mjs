import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {GET,POST} from '../../app/api/pilot/gusek/route.ts';
import {makeGusekTask,solveGusekTask,trustedGusekModel} from './gusek-exam-r13.mjs';
import {preparePracticeTransfer} from './gusek-practice-transfer-r14.mjs';
import {makeGusekScalarStarter} from './gusek-starters-r14z.mjs';

const url='http://localhost/api/pilot/gusek';
async function loop(kind,seed){
 const task=makeGusekTask(kind,seed);
 const response=GET(new Request(url+'?kind='+kind+'&seed='+seed));
 assert.equal(response.status,200);
 const original=await response.json();
 assert.equal(original.task.id,task.id);
 assert.equal(original.scalar.starter,makeGusekScalarStarter(task));
 assert.equal('solution' in original,false);
 assert.equal('oracle' in original,false);
 assert.equal('objective' in original.scalar,false);
 const solved=solveGusekTask(task);
 assert.equal(solved.status,'optimal');
 // In production these columns are extracted from GLPK machine files. Here
 // they are synthetic source-only fixtures to exercise the transfer and
 // the real, independently executed authoritative HTTP grade endpoint.
 const model=trustedGusekModel(task);
 const result={status:'GLPK_COMPLETED',mode:'solve',solverStatus:'OPTIMAL',
  columnStatus:'OPTIMAL_COLUMNS',graded:false,points:null,objective:solved.objective,
  columns:task.variableNames.map(name=>({name,value:solved.values[name]}))};
 const transfer=preparePracticeTransfer({
  task,dialect:'scalar',result,model,data:'',snapshot:{taskId:task.id,model,data:''}
 });
 assert.equal(transfer.ok,true,JSON.stringify(transfer));
 const reply=await POST(new Request(url,{method:'POST',
  headers:{'content-type':'application/json'},
  body:JSON.stringify({kind,seed:String(seed),answer:{
   taskKind:kind,mathprog:model,values:transfer.values,
   reportedObjective:transfer.objective,hintsUsed:false
  }})
 }));
 assert.equal(reply.status,200);
 const grade=await reply.json();
 assert.equal(grade.points,1,JSON.stringify(grade));
 assert.equal(grade.maxPoints,1);
 assert.equal(grade.taskId,task.id);
 return {task,model,result,transfer,grade};
}
describe('R14Z scalar end-to-end: task -> solver variables -> explicit transfer -> real HTTP grade',()=>{
 it('transport seed 0',async()=>{await loop('transport',0);});
 it('transport seed 42',async()=>{await loop('transport',42);});
 it('froccs seed 0',async()=>{await loop('froccs',0);});
 it('froccs seed 42',async()=>{await loop('froccs',42);});
 it('tablet seed 0',async()=>{await loop('tablet',0);});
 it('tablet seed 42',async()=>{await loop('tablet',42);});
 it('the diagnostic solver status alone cannot produce a grade',async()=>{
  const task=makeGusekTask('froccs',42),solved=solveGusekTask(task);
  const model=trustedGusekModel(task);
  const result={status:'GLPK_COMPLETED',mode:'solve',solverStatus:'OPTIMAL',columnStatus:'OPTIMAL_COLUMNS',
   graded:false,points:null,objective:solved.objective,columns:task.variableNames.map(name=>({name,value:solved.values[name]}))};
  assert.equal(result.points,null);
  const bad=preparePracticeTransfer({task,dialect:'scalar',result,model:model+' # modified',
   data:'',snapshot:{taskId:task.id,model,data:''}});
  assert.equal(bad.ok,false);
  assert.equal(bad.code,'stale_solver_result');
 });
});
