import test from 'node:test';
import assert from 'node:assert/strict';
import {manualTask,manualStarter,manualReference,gradeManual} from './or-manual-lp-r1628.mjs';
const near=(a,b)=>Math.abs(a-b)<1e-8;
function pivot(m,row,col){
 const out=m.map(r=>[...r]);const factor=out[row][col];
 out[row]=out[row].map(v=>v/factor);
 for(let r=0;r<3;r++)if(r!==row){
  const scale=out[r][col];
  for(let c=0;c<5;c++)out[r][c]-=scale*out[row][c];
 }
 return out;
}
function evidence(t){
 const r1=pivot(t.initialTableau,2,0);
 const r2=pivot(r1,1,1);
 const reference=manualReference(t);
 const values={x:reference.exemplar[0],y:reference.exemplar[1]};
 const mathprog=t.kind==='simplex'
  ?JSON.stringify({steps:[{enter:'x',leave:'s2',tableau:r1},{enter:'y',leave:'s1',tableau:r2}]})
  :JSON.stringify({vertices:reference.vertices});
 return {mathprog,values,reportedObjective:reference.objective,hintsUsed:false};
}
test('both manual tasks deterministic and never reveal optimum in public task or starter',()=>{
 for(let seed=0;seed<256;seed++)for(const kind of ['simplex','graphical']){
  const t=manualTask(kind,seed),s=manualStarter(t);
  assert.deepEqual(t,manualTask(kind,seed));
  assert.equal(t.id,'or-'+kind+'-'+seed);
  assert.ok(!('exemplar' in t)&&!('objective' in t)&&!('vertices' in t));
  assert.ok(s.includes('null'));
  assert.ok(s.length<2000);
 }
});
test('independent exhaustive vertex candidate optimum for all generated variants',()=>{
 for(let seed=0;seed<256;seed++){
  const t=manualTask('simplex',seed),ref=manualReference(t);
  const [b1,b2]=t.rhs;
  const independent=[[0,0],[0,b1],[b2/2,0],[b2-b1,2*b1-b2]];
  const scores=independent.map(([x,y])=>3*x+2*y);
  assert.equal(ref.objective,Math.max(...scores));
  assert.deepEqual(ref.exemplar,[b2-b1,2*b1-b2]);
  for(const kind of ['simplex','graphical']){
   const task=manualTask(kind,seed),answer=evidence(task);
   const result=gradeManual(task,answer);
   assert.equal(result.points,1,kind+':'+seed+':'+JSON.stringify(result));
  }
 }
});
test('simplex verifies full two-pivot numerical trace and rejects false credit',()=>{
 const t=manualTask('simplex',42),ok=evidence(t);
 const trace=JSON.parse(ok.mathprog);
 trace.steps[0].tableau[1][4]+=0.25;
 assert.deepEqual(gradeManual(t,{...ok,mathprog:JSON.stringify(trace)}).errors,['simplex_pivot_arithmetic']);
 const entering=JSON.parse(ok.mathprog);entering.steps[0].enter='y';
 assert.deepEqual(gradeManual(t,{...ok,mathprog:JSON.stringify(entering)}).errors,['simplex_entering_column']);
 const leaving=JSON.parse(ok.mathprog);leaving.steps[0].leave='s1';
 assert.deepEqual(gradeManual(t,{...ok,mathprog:JSON.stringify(leaving)}).errors,['simplex_leaving_row']);
 assert.equal(gradeManual(t,{...ok,mathprog:'not json'}).points,null);
 assert.equal(gradeManual(t,{...ok,hintsUsed:true}).points,0);
});
test('graphical verifies complete distinct vertex set, feasible optimum, objective and structure',()=>{
 const t=manualTask('graphical',4294967295),ok=evidence(t);
 const unordered=JSON.parse(ok.mathprog);unordered.vertices.reverse();
 assert.equal(gradeManual(t,{...ok,mathprog:JSON.stringify(unordered)}).points,1);
 const wrong=JSON.parse(ok.mathprog);wrong.vertices[0][0]+=1;
 assert.deepEqual(gradeManual(t,{...ok,mathprog:JSON.stringify(wrong)}).errors,['graphical_vertices_incorrect']);
 const duplicate=JSON.parse(ok.mathprog);duplicate.vertices[0]=duplicate.vertices[1];
 assert.deepEqual(gradeManual(t,{...ok,mathprog:JSON.stringify(duplicate)}).errors,['graphical_vertices_incorrect']);
 assert.deepEqual(gradeManual(t,{...ok,values:{x:99,y:99}}).errors,['graphical_point_infeasible']);
 assert.deepEqual(gradeManual(t,{...ok,reportedObjective:ok.reportedObjective+1}).errors,['objective_mismatch']);
 assert.deepEqual(gradeManual(t,{...ok,values:{x:0,y:0},reportedObjective:0}).errors,['not_optimal']);
 assert.equal(gradeManual(t,{...ok,mathprog:'{"vertices":[[0,0]]}'}).points,null);
});
test('manual grading robustly fails closed on untrusted object types',()=>{
 const t=manualTask('simplex',2),ok=evidence(t);
 for(const x of [null,[],NaN,Infinity,'7',{bad:1},-1]){
  const a={...ok,values:{x,y:0}};
  assert.notEqual(gradeManual(t,a).points,1);
 }
 for(const x of ['','{"steps":{}}','[]','{}',JSON.stringify({steps:[{},{}]})])
  assert.notEqual(gradeManual(t,{...ok,mathprog:x}).points,1);
});
