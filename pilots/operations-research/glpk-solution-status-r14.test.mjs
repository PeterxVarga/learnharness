import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {readGlpkSolutionStatus} from './glpk-solution-status-r14.mjs';
describe('R14 GNU glpsol --write machine status (diagnostic, not a grade)',()=>{
 it('MIP optimal and objective',()=>{const r=readGlpkSolutionStatus('c source\ns mip 4 9 o 123\nj 1 2');assert.equal(r.solverStatus,'OPTIMAL');assert.equal(r.objective,123);assert.equal(r.solutionKind,'mip');});
 it('MIP feasible but nonoptimal is never upgraded',()=>assert.equal(readGlpkSolutionStatus('s mip 4 9 f 120').solverStatus,'FEASIBLE_NOT_PROVEN_OPTIMAL'));
 it('MIP infeasible is surfaced',()=>assert.equal(readGlpkSolutionStatus('s mip 4 9 n 0').solverStatus,'INFEASIBLE'));
 it('MIP undefined is surfaced',()=>assert.equal(readGlpkSolutionStatus('s mip 4 9 u 0').solverStatus,'UNDEFINED'));
 it('LP optimal primal/dual basis',()=>{
  const r=readGlpkSolutionStatus('s bas 2 2 f f 1.5');
  assert.equal(r.solverStatus,'OPTIMAL');assert.equal(r.objective,1.5);
  // Actual glpsol --write includes this standalone c separator;
  // the old parser left it as the first line and returned UNKNOWN.
  const realMachine=[
   'c Problem:    sample',
   'c Rows:       1',
   'c Columns:    1',
   'c Non-zeros:  1',
   'c Status:     OPTIMAL',
   'c Objective:  obj = 3 (MAXimum)',
   'c',
   's bas 1 1 f f 3',
   'i 1 u 3 1',
   'j 1 b 3 0',
   'e o f',
   ''
  ].join('\n');
  const parsed=readGlpkSolutionStatus(realMachine);
  assert.deepEqual(parsed,{
   solverStatus:'OPTIMAL',objective:3,solutionKind:'bas',
   statusCode:'parsed_glpsol_solution_header'
  });
  // Blank standalone comments may also use CRLF or horizontal tabs.
  const tabbed=realMachine.replace(/\n/g,'\r\n').replace('\r\nc\r\n','\r\nc\t\r\n');
  assert.equal(readGlpkSolutionStatus(tabbed).solverStatus,'OPTIMAL');
 });
 it('LP primal infeasible is not called optimum',()=>assert.equal(readGlpkSolutionStatus('s bas 2 2 n f 0').solverStatus,'INFEASIBLE'));
 it('LP primal feasible dual infeasible is flagged unbounded',()=>assert.equal(readGlpkSolutionStatus('s bas 2 2 f n 0').solverStatus,'UNBOUNDED'));
 it('LP feasible but not proven optimal retains diagnostic uncertainty',()=>assert.equal(readGlpkSolutionStatus('s bas 2 2 f u 0').solverStatus,'FEASIBLE_NOT_PROVEN_OPTIMAL'));
 it('interior solution optimal and negative objective',()=>{const r=readGlpkSolutionStatus('s ipt 2 2 o -2.5e2');assert.equal(r.solverStatus,'OPTIMAL');assert.equal(r.objective,-250);});
 it('interior infeasible is surfaced',()=>assert.equal(readGlpkSolutionStatus('s ipt 2 2 n 0').solverStatus,'INFEASIBLE'));
 it('non-finite, malformed or absent statuses cannot be trusted',()=>{for(const src of ['',null,'s mip 2 2 o NaN','s mip 2 2 o Infinity','s mip 2 2 o','s mip 2 2 x 3','s mip a 2 o 3'])assert.equal(readGlpkSolutionStatus(src).solverStatus,'UNKNOWN');});
 it('arbitrary printable GLPK logs cannot masquerade as machine header',()=>{
  assert.equal(readGlpkSolutionStatus('Objective: test = 3\nStatus: OPTIMAL').solverStatus,'UNKNOWN');
  assert.equal(readGlpkSolutionStatus('c\nc Status: OPTIMAL\ne o f').solverStatus,'UNKNOWN');
  assert.equal(readGlpkSolutionStatus('c\nRANDOM\ns bas 1 1 f f 3').solverStatus,'UNKNOWN');
  assert.equal(readGlpkSolutionStatus('c\ns bas 1 1 f f NaN').solverStatus,'UNKNOWN');
 });
});
