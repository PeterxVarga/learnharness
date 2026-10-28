import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {parseGlpkColumns} from './glpk-columns-r14.mjs';
const problem='p mip min 2 3 6\nn j 1 x[1,1]\nn j 2 x[1,2]\nn j 3 x[2,1]\ne o f\n';
const machine='c GLPK solution\ns mip 2 3 o 57\nj 1 2\nj 2 0\nj 3 4\n';
const meta={solverStatus:'OPTIMAL',objective:57,solutionKind:'mip'};
const parse=(s=machine,p=problem,m=meta)=>parseGlpkColumns(s,p,m);
describe('R14 original GLPK machine output column mapping',()=>{
 it('joins indexed names and activities deterministically',()=>{
  assert.deepEqual(parse(),{status:'OPTIMAL_COLUMNS',columns:[
   {name:'x[1,1]',value:2},{name:'x[1,2]',value:0},{name:'x[2,1]',value:4}
  ]});
 });
 it('works with scalar variable names',()=>{
  const p=problem.replace('x[1,1]','epres').replace('x[1,2]','spenotos').replace('x[2,1]','third');
  assert.deepEqual(parse(machine,p).columns.map(x=>x.name),['epres','spenotos','third']);
 });
 it('rejects non-optimal, missing and infeasible metadata',()=>{
  for(const status of ['UNKNOWN','INFEASIBLE','FEASIBLE_NOT_PROVEN_OPTIMAL'])
   assert.equal(parse(machine,problem,{...meta,solverStatus:status}).status,'NOT_TRANSFERABLE');
  assert.equal(parse(machine,problem,{...meta,objective:null}).status,'NOT_TRANSFERABLE');
 });
 it('does not guess from GLPK stdout or printable listing',()=>{
  assert.equal(parse('Objective: x = 5 (MINimum)',problem).status,'INVALID_MACHINE_OUTPUT');
 });
 it('requires all variables to be present in both files',()=>{
  assert.equal(parse(machine.replace('j 3 4\n',''),problem).status,'INVALID_MACHINE_OUTPUT');
  assert.equal(parse(machine,problem.replace('n j 3 x[2,1]\n','')).status,'INVALID_MACHINE_OUTPUT');
 });
 it('refuses duplicate column indexes and column names',()=>{
  assert.equal(parse(machine+'j 1 5\n',problem).status,'INVALID_MACHINE_OUTPUT');
  assert.equal(parse(machine,problem.replace('n j 3 x[2,1]','n j 3 x[1,1]')).status,'INVALID_MACHINE_OUTPUT');
 });
 it('refuses wrong dimensions, out-of-range IDs and malformed headers',()=>{
  assert.equal(parse(machine.replace('s mip 2 3','s mip 2 4'),problem).status,'INVALID_MACHINE_OUTPUT');
  assert.equal(parse(machine.replace('j 3 4','j 4 4'),problem).status,'INVALID_MACHINE_OUTPUT');
  assert.equal(parse(machine,problem.replace('p mip min 2 3','p mip min 2 4')).status,'INVALID_MACHINE_OUTPUT');
 });
 it('refuses nonnumeric, infinite and malformed activities',()=>{
  for(const v of ['NaN','Infinity','1e999','x','1,2'])
   assert.equal(parse(machine.replace('j 3 4','j 3 '+v),problem).status,'INVALID_MACHINE_OUTPUT');
 });
 it('maps LP basis output with indexed activities',()=>{
  const s='s bas 2 3 f f 57\nj 1 b 2 0\nj 2 l 0 0\nj 3 u 4 -0.25\n';
  assert.equal(parse(s,problem,{...meta,solutionKind:'bas'}).columns[2].value,4);
 });
 it('maps interior-point output',()=>{
  const s='s ipt 2 3 o 57\nj 1 2 0\nj 2 0 0\nj 3 4 0\n';
  assert.equal(parse(s,problem,{...meta,solutionKind:'ipt'}).columns[0].value,2);
 });
 it('caps output length and limits memory exposure',()=>{
  assert.equal(parse('s mip 2 3 o 57\n'+' '.repeat(50000),problem).status,'INVALID_MACHINE_OUTPUT');
  assert.equal(parse(machine,problem+'x'.repeat(50000)).status,'INVALID_MACHINE_OUTPUT');
 });
 it('rejects unsupported names rather than surfacing hostile paths',()=>{
  assert.equal(parse(machine,problem.replace('x[2,1]','../../secret')).status,'INVALID_MACHINE_OUTPUT');
 });
});
