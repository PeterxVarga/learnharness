import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {makeTransportTask, solveTransportTask, gradeTransportExam, publicTransportTask, practicePromptHu} from './transport-exam-r3.mjs';
function correct(seed) {
  const task=makeTransportTask(seed), oracle=solveTransportTask(task);
  assert.equal(oracle.status,'optimal');
  return {task, answer:{model:{sense:'min',nonnegative:true,supply:task.supply,demand:task.demand,costs:task.costs,capacities:task.capacities},allocation:oracle.exemplar,reportedObjective:oracle.objective,hintsUsed:false}};
}
describe('R3 transport full-answer-only exam, deterministic',()=>{
  it('solves 100 generated 3x3 tasks with a bounded optimum and stable digest',()=>{
    for(let seed=0;seed<100;seed++) {
      const {task,answer}=correct(seed);
      assert.equal(gradeTransportExam(task,answer).points,1,`seed=${seed}`);
      assert.equal(publicTransportTask(seed).digest,publicTransportTask(seed).digest);
    }
  });
  it('is an all-or-nothing examiner: exactly maxPoints=1 and no partial-credit field',()=>{
    const {task,answer}=correct(7),grade=gradeTransportExam(task,answer);
    assert.deepEqual({points:grade.points,maxPoints:grade.maxPoints,correct:grade.correct},{points:1,maxPoints:1,correct:true});
    assert.equal(Object.hasOwn(grade,'partialCredit'),false);
  });
  it('rejects wrong model cost, missing nonnegativity and inverted objective',()=>{
    const {task,answer}=correct(11);
    for(const model of [
      {...answer.model, costs:answer.model.costs.map((r,i)=>i? r:[r[0]+1,...r.slice(1)])},
      {...answer.model, nonnegative:false},
      {...answer.model, sense:'max'},
      {...answer.model, capacities:answer.model.capacities.map((r,i)=>i?r:[...r.slice(0,2),r[2]+1])},
    ])assert.equal(gradeTransportExam(task,{...answer,model}).points,0);
  });
  it('rejects a missing flow, balance breach and capacity breach',()=>{
    const {task,answer}=correct(3);
    assert.equal(gradeTransportExam(task,{...answer,allocation:[answer.allocation[0]]}).points,0);
    const wrong=structuredClone(answer.allocation); wrong[0][0]+=1;
    assert.equal(gradeTransportExam(task,{...answer,allocation:wrong}).points,0);
    const violation=structuredClone(answer.allocation); violation[0][2]=task.capacities[0][2]+1;
    assert.ok(gradeTransportExam(task,{...answer,allocation:violation}).errors.includes('route_capacity_violation'));
  });
  it('rejects feasible but not optimal flow',()=>{
    const {task,answer}=correct(12),optimal=answer.reportedObjective;
    let found=false;
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)for(let l=0;l<3;l++){
      if(i===k||j===l)continue;
      const v=structuredClone(answer.allocation);
      if(v[i][l]===0||v[k][j]===0 || v[i][j]>=task.capacities[i][j] || v[k][l]>=task.capacities[k][l])continue;
      v[i][j]++;v[k][l]++;v[i][l]--;v[k][j]--;
      const obj=v.reduce((s,r,ri)=>s+r.reduce((p,x,c)=>p+x*task.costs[ri][c],0),0);
      if(obj<=optimal)continue;
      const g=gradeTransportExam(task,{...answer,allocation:v,reportedObjective:obj,status:'optimal'});
      assert.equal(g.points,0);assert.ok(g.errors.includes('not_optimal'));found=true;break;
    }
    assert.equal(found,true,'fixture must have worse feasible plan');
  });
  it('accepts alternative optimal allocations on an all-tie task',()=>{
    const {task,answer}=correct(2);
    task.costs=task.costs.map(row=>row.map(()=>5));
    const solution=solveTransportTask(task);
    assert.ok(solution.optimalAllocationCount>1);
    const result=gradeTransportExam(task,{...answer,model:{...answer.model,costs:task.costs},allocation:solution.exemplar,reportedObjective:solution.objective});
    assert.equal(result.points,1);
  });
  it('rejects fractional, negative, NaN and non-finite flows',()=>{
    const {task,answer}=correct(4);
    for(const v of [0.5,-1,NaN,Infinity,'4']){
      const flow=structuredClone(answer.allocation);flow[0][0]=v;
      assert.equal(gradeTransportExam(task,{...answer,allocation:flow}).points,0);
    }
  });
  it('rejects false reported objective even when allocation optimal',()=>{
    const {task,answer}=correct(8);assert.ok(gradeTransportExam(task,{...answer,reportedObjective:answer.reportedObjective+1}).errors.includes('objective_mismatch'));
  });
  it('never grants independent mastery from a hinted or unmarked response',()=>{
    const {task,answer}=correct(9);
    assert.equal(gradeTransportExam(task,{...answer,hintsUsed:true}).points,0);
    assert.equal(gradeTransportExam(task,{...answer,hintsUsed:undefined}).points,0);
    assert.equal(gradeTransportExam(task,{...answer,hintsUsed:true},{independent:false}).points,1);
  });
  it('does not treat user-written solver-status or user answer-key as authority',()=>{
    const {task,answer}=correct(10);
    assert.equal(gradeTransportExam(task,{...answer,status:'optimal',claimedPoints:9000}).points,1);
    assert.equal(gradeTransportExam(task,{...answer,model:{...answer.model, costs:answer.model.costs.map(r=>r.map(()=>0))},claimedPoints:1}).points,0);
  });
  it('rejects invalid seeds and invalid/unbalanced trusted tasks',()=>{
    for(const seed of [-1,2**32,0.5,'1'])assert.throws(()=>makeTransportTask(seed));
    const {task}=correct(0);assert.throws(()=>solveTransportTask({...task,demand:[0,0,1]}));
  });
  it('prompt shows task but not answer key',()=>{
    const prompt=practicePromptHu(publicTransportTask(19));assert.match(prompt,/nincs részpont/);
    assert.doesNotMatch(prompt,/optimalAllocationCount|exemplar|reportedObjective/);
  });
});
