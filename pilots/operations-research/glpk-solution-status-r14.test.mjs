import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {readGlpkSolutionStatus} from './glpk-solution-status-r14.mjs';
describe('R14 GNU glpsol --write machine status (diagnostic, not a grade)',()=>{
 it('MIP optimal and objective',()=>{const r=readGlpkSolutionStatus('c source\ns mip 4 9 o 123\nj 1 2');assert.equal(r.solverStatus,'OPTIMAL');assert.equal(r.objective,123);assert.equal(r.solutionKind,'mip');});
 it('MIP feasible but nonoptimal is never upgraded',()=>assert.equal(readGlpkSolutionStatus('s mip 4 9 f 120').solverStatus,'FEASIBLE_NOT_PROVEN_OPTIMAL'));
 it('MIP infeasible is surfaced',()=>assert.equal(readGlpkSolutionStatus('s mip 4 9 n 0').solverStatus,'INFEASIBLE'));
 it('MIP undefined is surfaced',()=>assert.equal(readGlpkSolutionStatus('s mip 4 9 u 0').solverStatus,'UNDEFINED'));
 it('LP optimal primal/dual basis',()=>{const r=readGlpkSolutionStatus('s bas 2 2 f f 1.5');assert.equal(r.solverStatus,'OPTIMAL');assert.equal(r.objective,1.5);});
 it('LP primal infeasible is not called optimum',()=>assert.equal(readGlpkSolutionStatus('s bas 2 2 n f 0').solverStatus,'INFEASIBLE'));
 it('LP primal feasible dual infeasible is flagged unbounded',()=>assert.equal(readGlpkSolutionStatus('s bas 2 2 f n 0').solverStatus,'UNBOUNDED'));
 it('LP feasible but not proven optimal retains diagnostic uncertainty',()=>assert.equal(readGlpkSolutionStatus('s bas 2 2 f u 0').solverStatus,'FEASIBLE_NOT_PROVEN_OPTIMAL'));
 it('interior solution optimal and negative objective',()=>{const r=readGlpkSolutionStatus('s ipt 2 2 o -2.5e2');assert.equal(r.solverStatus,'OPTIMAL');assert.equal(r.objective,-250);});
 it('interior infeasible is surfaced',()=>assert.equal(readGlpkSolutionStatus('s ipt 2 2 n 0').solverStatus,'INFEASIBLE'));
 it('non-finite, malformed or absent statuses cannot be trusted',()=>{for(const src of ['',null,'s mip 2 2 o NaN','s mip 2 2 o Infinity','s mip 2 2 o','s mip 2 2 x 3','s mip a 2 o 3'])assert.equal(readGlpkSolutionStatus(src).solverStatus,'UNKNOWN');});
 it('arbitrary printable GLPK logs cannot masquerade as machine header',()=>assert.equal(readGlpkSolutionStatus('Objective: test = 3\nStatus: OPTIMAL').solverStatus,'UNKNOWN'));
});
