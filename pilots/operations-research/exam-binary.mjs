/**
 * Synthetic 2x2 transport exam oracle. NO arbitrary MathProg execution.
 * A task scores exactly 0 or 1; diagnostics are formative, NEVER partial marks.
 * This deliberately grades a structured submission, not an arbitrary .mod file.
 */
export const TRANSPORT_REFERENCE = Object.freeze({
  sense: 'min',
  costs: Object.freeze({ ac: 4, ad: 9, bc: 8, bd: 3 }),
  supply: Object.freeze({ a: 7, b: 5 }),
  demand: Object.freeze({ c: 6, d: 6 }),
  upperAC: 4,
  nonnegative: true,
});

const routes = ['ac', 'ad', 'bc', 'bd'];
const sameNumbers = (a, b, names) => a && typeof a === 'object' && !Array.isArray(a)
  && Object.keys(a).length === names.length
  && names.every(k => Object.hasOwn(a, k) && typeof a[k] === 'number' && Number.isFinite(a[k]) && a[k] === b[k]);
const isIntegerNonnegative = n => Number.isSafeInteger(n) && n >= 0;

/** For 2x2 balanced transport, every plan is determined by ac; integer endpoints certify LP optimum. */
export function transportOracle(reference = TRANSPORT_REFERENCE) {
  const { supply, demand, costs, upperAC } = reference;
  const total = supply.a + supply.b;
  if (![supply.a, supply.b, demand.c, demand.d, upperAC].every(isIntegerNonnegative)
    || total !== demand.c + demand.d || !routes.every(k => Number.isFinite(costs[k]))) {
    throw new Error('invalid trusted transport reference');
  }
  let optimum = Infinity;
  const optimalAllocations = [];
  for (let ac = 0; ac <= Math.min(supply.a, demand.c, upperAC); ac++) {
    const ad = supply.a - ac;
    const bc = demand.c - ac;
    const bd = supply.b - bc;
    if (![ad, bc, bd].every(isIntegerNonnegative) || ad + bd !== demand.d) continue;
    const allocation = { ac, ad, bc, bd };
    const objective = routes.reduce((sum, k) => sum + allocation[k] * costs[k], 0);
    if (objective < optimum) { optimum = objective; optimalAllocations.length = 0; }
    if (objective === optimum) optimalAllocations.push(allocation);
  }
  if (!Number.isFinite(optimum)) return { status: 'infeasible' };
  return { status: 'optimal', objective: optimum, optimalAllocations };
}

/** Examiners supply only trusted references. Student submissions can NEVER inject their own answer key. */
export function gradeTransportBinary(submission, { reference = TRANSPORT_REFERENCE, independent = true } = {}) {
  const errors = [];
  if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
    return { points: 0, correct: false, errors: ['invalid_submission'], verifiedBy: 'bounded_enumeration' };
  }
  const model = submission.model;
  if (!model || typeof model !== 'object' || Array.isArray(model)
    || model.sense !== 'min' || model.nonnegative !== true
    || !sameNumbers(model.costs, reference.costs, routes)
    || !sameNumbers(model.supply, reference.supply, ['a', 'b'])
    || !sameNumbers(model.demand, reference.demand, ['c', 'd'])
    || model.upperAC !== reference.upperAC) errors.push('model_incorrect_or_incomplete');
  const x = submission.allocation;
  if (!x || typeof x !== 'object' || Array.isArray(x)
    || Object.keys(x).length !== 4 || !routes.every(k => isIntegerNonnegative(x[k]))) {
    errors.push('invalid_allocation');
  } else {
    if (x.ac + x.ad !== reference.supply.a || x.bc + x.bd !== reference.supply.b
      || x.ac + x.bc !== reference.demand.c || x.ad + x.bd !== reference.demand.d) errors.push('balance_violation');
    if (x.ac > reference.upperAC) errors.push('route_capacity_violation');
    const calculated = routes.reduce((sum, k) => sum + x[k] * reference.costs[k], 0);
    if (!Number.isFinite(submission.reportedObjective) || submission.reportedObjective !== calculated) errors.push('objective_mismatch');
    const oracle = transportOracle(reference);
    if (oracle.status !== 'optimal' || calculated !== oracle.objective) errors.push('not_proven_optimal');
  }
  if (independent && submission.hintsUsed === true) errors.push('assisted_attempt_not_independent');
  if (submission.hintsUsed !== undefined && typeof submission.hintsUsed !== 'boolean') errors.push('invalid_assistance_metadata');
  return { points: errors.length === 0 ? 1 : 0, correct: errors.length === 0,
    errors, verifiedBy: 'bounded_enumeration' };
}
