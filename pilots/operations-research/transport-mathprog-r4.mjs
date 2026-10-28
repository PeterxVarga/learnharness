/** R4 safe MathProg source-generation adapter, seeded synthetic tasks only.
 * No learner-authored MathProg code is executed or used as a source template.
 */
import { makeTransportTask, solveTransportTask } from './transport-exam-r3.mjs';
import { renderTrustedMathProg, validateLinearProblem } from './glpk-contract.mjs';

/** Use continuous network flow: integral demands and capacities ensure an integral optimum. */
export function seededTransportToLinearProblem(seed) {
  const task = makeTransportTask(seed); // bounded trusted generator, rejects invalid seeds
  const variables = [];
  const objective = {};
  for (let i=0;i<3;i++)for(let j=0;j<3;j++) {
    const id=`x${i}${j}`;
    variables.push({id,type:'continuous',lower:0,upper:task.capacities[i][j]});
    objective[id]=task.costs[i][j];
  }
  const constraints=[];
  for(let i=0;i<3;i++) {
    const coefficients={};
    for(let j=0;j<3;j++)coefficients[`x${i}${j}`]=1;
    constraints.push({id:`s${i}`,coefficients,op:'=',rhs:task.supply[i]});
  }
  for(let j=0;j<3;j++) {
    const coefficients={};
    for(let i=0;i<3;i++)coefficients[`x${i}${j}`]=1;
    constraints.push({id:`d${j}`,coefficients,op:'=',rhs:task.demand[j]});
  }
  return validateLinearProblem({sense:'min',variables,objective,constraints});
}
export function seededTransportMathProg(seed) {
  return renderTrustedMathProg(seededTransportToLinearProblem(seed));
}
/** Feasible objective witness for external comparison, never a GLPK proof by itself. */
export function seededTransportWitness(seed) {
  const task=makeTransportTask(seed),oracle=solveTransportTask(task);
  if(oracle.status!=='optimal')throw new Error('Unexpected infeasible synthetic task');
  return {objective:oracle.objective,flow:oracle.exemplar};
}
