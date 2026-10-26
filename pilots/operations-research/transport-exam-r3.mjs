/**
 * R3: deterministic 3x3 transport exam practice. Synthetic data only.
 * No solver process, model provider or untrusted MathProg execution.
 * All-or-nothing grade; error codes are *teaching diagnostics*, not partial credit.
 */
import { createHash } from 'node:crypto';

const safeInt = x => Number.isSafeInteger(x) && x >= 0;
const arr3 = x => Array.isArray(x) && x.length === 3 && x.every(safeInt);
const matrix3 = x => Array.isArray(x) && x.length === 3 && x.every(arr3);
const sum = a => a.reduce((t, v) => t + v, 0);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function assertTask(task) {
  if (!task || task.sense !== 'min' || !arr3(task.supply) || !arr3(task.demand) ||
      !matrix3(task.costs) || !matrix3(task.capacities) || !task.costs.flat().every(c => c > 0) ||
      !task.capacities.flat().every(safeInt) || sum(task.supply) !== sum(task.demand) ||
      sum(task.supply) > 60 || task.supply.some(v => v === 0) || task.demand.some(v => v === 0)) {
    throw new Error('Invalid trusted transport task');
  }
}
function rng(seed) {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}
export function makeTransportTask(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new Error('Seed must be uint32');
  const random = rng(seed);
  const rand = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const supply = [rand(5, 9), rand(5, 9), rand(5, 9)];
  const total = sum(supply);
  const d0 = rand(4, Math.min(8, total-8)), d1 = rand(4, Math.min(8, total-d0-4));
  const demand = [d0, d1, total - d0 - d1];
  const costs = Array.from({length:3}, () => Array.from({length:3}, () => rand(2, 15)));
  const capacities = Array.from({length:3}, () => Array.from({length:3}, () => total));
  capacities[0][2] = rand(1, 4);
  const task = { id: `synthetic-transport-r3-${seed}`, sense: 'min', supply, demand, costs, capacities };
  assertTask(task);
  return task;
}

/** Exact bounded integer enumeration: row 0 and 1 are free, row 2 follows from demand.
 * For integer transportation supplies/demands/caps the network-flow polytope
 * has integral extreme points, so one integral optimum exists.
 * This oracle does NOT certify arbitrary continuous/non-network linear models.
 */
export function solveTransportTask(task) {
  assertTask(task);
  const {supply:S, demand:D, capacities:U, costs:C} = task;
  let optimum = Infinity;
  let exemplar = null;
  let optima = 0;
  let checked = 0;
  for (let a = 0; a <= Math.min(S[0], D[0], U[0][0]); a++) {
    for (let b = 0; b <= Math.min(S[0]-a, D[1], U[0][1]); b++) {
      const c = S[0] - a - b;
      if (c < 0 || c > D[2] || c > U[0][2]) continue;
      const rem = [D[0]-a, D[1]-b, D[2]-c];
      for (let d = 0; d <= Math.min(S[1], rem[0], U[1][0]); d++) {
        for (let e = 0; e <= Math.min(S[1]-d, rem[1], U[1][1]); e++) {
          const f = S[1]-d-e;
          if (f < 0 || f > rem[2] || f > U[1][2]) continue;
          const row2 = [rem[0]-d, rem[1]-e, rem[2]-f];
          if (row2.some((x,j) => x < 0 || x > U[2][j]) || sum(row2) !== S[2]) continue;
          const flow = [[a,b,c],[d,e,f],row2];
          const value = flow.reduce((acc,row,i) => acc + row.reduce((v,x,j) => v+x*C[i][j],0),0);
          checked++;
          if (value < optimum) { optimum = value; exemplar = flow; optima = 1; }
          else if (value === optimum) optima++;
        }
      }
    }
  }
  if (!exemplar) return {status:'infeasible', verifiedBy:'bounded_integer_enumeration', checked};
  return {status:'optimal', objective:optimum, exemplar, optimalAllocationCount:optima,
    verifiedBy:'bounded_integer_enumeration', checked};
}

/** No self-supplied answer keys, scores, or arbitrary code execution. */
export function gradeTransportExam(task, answer, {independent=true}={}) {
  assertTask(task);
  const errors = [];
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
    return {points:0, maxPoints:1, correct:false, errors:['invalid_answer'], verifiedBy:'bounded_integer_enumeration'};
  }
  const model = answer.model;
  if (!model || typeof model !== 'object' || Array.isArray(model) || model.sense !== 'min' || model.nonnegative !== true ||
    !equal(model.supply,task.supply) || !equal(model.demand,task.demand) ||
    !equal(model.costs,task.costs) || !equal(model.capacities,task.capacities)) {
      errors.push('model_incorrect_or_incomplete');
  }
  const flow = answer.allocation;
  if (!matrix3(flow)) errors.push('invalid_allocation');
  else {
    for (let i=0; i<3; i++) if (sum(flow[i]) !== task.supply[i]) { errors.push('supply_balance_violation'); break; }
    for (let j=0; j<3; j++) if (sum(flow.map(r=>r[j])) !== task.demand[j]) { errors.push('demand_balance_violation'); break; }
    if (flow.some((row,i)=>row.some((x,j)=>x>task.capacities[i][j]))) errors.push('route_capacity_violation');
    const objective = flow.reduce((acc,row,i)=>acc+sum(row.map((x,j)=>x*task.costs[i][j])),0);
    if (answer.reportedObjective !== objective) errors.push('objective_mismatch');
    const oracle = solveTransportTask(task);
    if (oracle.status !== 'optimal' || objective !== oracle.objective) errors.push('not_optimal');
  }
  if (independent && answer.hintsUsed !== false) errors.push('independence_not_demonstrated');
  if (answer.hintsUsed !== undefined && typeof answer.hintsUsed !== 'boolean') errors.push('invalid_assistance_metadata');
  return {points: errors.length===0?1:0, maxPoints:1, correct:errors.length===0,
    errors:[...new Set(errors)], verifiedBy:'bounded_integer_enumeration'};
}

/** Reproducible task reference without exposing the answer key. */
export function publicTransportTask(seed) {
  const {id,sense,supply,demand,costs,capacities}=makeTransportTask(seed);
  return {id,sense,supply,demand,costs,capacities,
    digest:createHash('sha256').update(JSON.stringify({id,sense,supply,demand,costs,capacities})).digest('hex')};
}
export function practicePromptHu(task) {
  return [
    `Szállítási vizsgafeladat (${task.id}) – önálló megoldás; nincs részpont.`,
    `3 telephely kínálata: ${task.supply.join(', ')} egység.`,
    `3 célállomás kereslete: ${task.demand.join(', ')} egység.`,
    'Az egységnyi szállítás költségmátrixa (sor: telephely, oszlop: célállomás):',
    ...task.costs.map(row=>'  '+row.join(' | ')),
    `Az 1. telephely → 3. célállomás útvonalon legfeljebb ${task.capacities[0][2]} egység mehet.`,
    'Add meg a teljes matematikai modellt és a 3×3 nemnegatív szállítási tervet, majd az igazolt minimumköltséget.',
    'Csak teljesen helyes modell ÉS optimális megoldás ér pontot; minden más 0.',
    'A megoldás JSON-formátumát a dokumentáció mutatja. A gyakorlási hibák nem érnek részpontot.',
  ].join('\n');
}
