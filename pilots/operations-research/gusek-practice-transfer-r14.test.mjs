import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {preparePracticeTransfer} from './gusek-practice-transfer-r14.mjs';
const scalar={id:'gusek-tablet-42',kind:'tablet',variableNames:['epres','spenotos']};
const indexed={id:'gusek-transport-42',kind:'transport',variableNames:Array.from({length:9},(_,n)=>'Raktar'+(Math.floor(n/3)+1)+'_Bolt'+(n%3+1))};
const cols=[{name:'epres',value:3},{name:'spenotos',value:2}];
const result={status:'GLPK_COMPLETED',mode:'solve',solverStatus:'OPTIMAL',columnStatus:'OPTIMAL_COLUMNS',objective:8400,points:null,graded:false,columns:cols};
const request={result,task:scalar,dialect:'scalar',model:'mod',data:'dat',snapshot:{taskId:'gusek-tablet-42',model:'mod',data:'dat'}};
const check=patch=>preparePracticeTransfer({...request,...patch});
describe('R14 explicit solver-to-Practice transfer guard',()=>{
 it('allows exact optimal matching scalar solution with objective',()=>{
  assert.deepEqual(check(),{ok:true,code:null,values:{epres:3,spenotos:2},objective:8400});
 });
 it('refuses stale model source',()=>assert.equal(check({model:'modified'}).code,'stale_solver_result'));
 it('refuses another seeded task result',()=>assert.equal(check({task:{...scalar,id:'gusek-tablet-43'}}).code,'stale_solver_result'));
 it('refuses stale data file',()=>assert.equal(check({data:'modified'}).code,'stale_solver_result'));
 it('refuses a check-only result',()=>assert.equal(check({result:{...result,mode:'check'}}).ok,false));
 it('refuses feasible not certified optimal',()=>assert.equal(check({result:{...result,solverStatus:'FEASIBLE_NOT_PROVEN_OPTIMAL'}}).ok,false));
 it('refuses incomplete machine column proof',()=>assert.equal(check({result:{...result,columnStatus:'INVALID_MACHINE_OUTPUT'}}).ok,false));
 it('refuses a solver result with a forged grade',()=>assert.equal(check({result:{...result,points:1}}).ok,false));
 it('refuses a foreign column without accepting partial values',()=>{
  assert.equal(check({result:{...result,columns:[cols[0],{name:'secret',value:2}]}}).ok,false);
 });
 it('refuses duplicate and omitted columns',()=>{
  assert.equal(check({result:{...result,columns:[cols[0],cols[0]]}}).ok,false);
  assert.equal(check({result:{...result,columns:[cols[0]]}}).ok,false);
 });
 it('refuses NaN, infinity or excessive values',()=>{
  for(const value of [NaN,Infinity,-Infinity,1e10]){
   assert.equal(check({result:{...result,columns:[{name:'epres',value},cols[1]]}}).ok,false);
  }
 });
 it('transfers full indexed transport x[i,j] set with near-integer rounding',()=>{
  const columns=Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>({
   name:'x['+(i+1)+','+(j+1)+']',value:i===0&&j===0?1.0000000001:0
  }))).flat();
  const r=check({task:indexed,dialect:'indexed',snapshot:{taskId:indexed.id,model:'mod',data:'dat'},result:{...result,columns}});
  assert.equal(r.ok,true);assert.equal(r.values['x[1,1]'],1);assert.equal(Object.keys(r.values).length,9);
 });
 it('rejects scalar aliases for an indexed model',()=>{
  const columns=indexed.variableNames.map(name=>({name,value:0}));
  assert.equal(check({task:indexed,dialect:'indexed',result:{...result,columns}}).ok,false);
 });
});
