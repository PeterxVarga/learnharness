/**
 * Fully synthetic, small integer linear-programming reference cases.
 * No learner data, course PDFs, API keys, external services or LearnHarness IO.
 * Mathematical oracles only: these do NOT test AI teaching.
 */

/** Exhaustive optimum for a two-product integer production problem. */
export function productionOptimum() {
  let best = null;
  for (let first = 0; first <= 12; first += 1) {
    for (let second = 0; second <= 12; second += 1) {
      // Synthetic capacities: 2*first + second <= 12; first + second <= 8.
      if (2 * first + second > 12 || first + second > 8) continue;
      const profit = 9 * first + 6 * second;
      if (!best || profit > best.profit) best = { first, second, profit };
    }
  }
  return best;
}

/** Conservation-constrained, capacitated 2x2 transport problem. */
export function transportOptimum() {
  const supplyA = 7;
  const supplyB = 5;
  const demandC = 6;
  const demandD = 6;
  const capAC = 4;
  let best = null;
  for (let ac = 0; ac <= supplyA; ac += 1) {
    const ad = supplyA - ac;
    const bc = demandC - ac;
    const bd = supplyB - bc;
    if ([ad, bc, bd].some((n) => n < 0)) continue;
    if (ac > capAC || ad + bd !== demandD) continue;
    const cost = 4 * ac + 9 * ad + 8 * bc + 3 * bd;
    if (!best || cost < best.cost) best = { ac, ad, bc, bd, cost };
  }
  return best;
}

/**
 * Certificate for opposing linear inequalities sharing proportional
 * coefficients: U*x <= upperLimit and L*x >= lowerLimit.
 * Null means THIS certificate cannot prove infeasibility.
 */
export function proportionalBoundConflict(upper, lower) {
  const [u0, u1] = upper.coefficients;
  const [l0, l1] = lower.coefficients;
  if (l0 <= 0 || l1 <= 0 || u0 <= 0 || u1 <= 0) return null;
  if (u0 * l1 !== u1 * l0) return null;
  const scale = u0 / l0;
  const effectiveUpper = upper.limit / scale;
  return {
    effectiveUpper,
    effectiveLower: lower.limit,
    infeasible: effectiveUpper < lower.limit,
  };
}

/** Synthetic model: up to 6 items; B >= A; score = 6*A + 4*B. */
export function highestScoreWithComposition() {
  let best = null;
  for (let a = 0; a <= 6; a += 1) {
    for (let b = 0; b <= 6; b += 1) {
      if (a + b > 6 || b < a) continue;
      const score = 6 * a + 4 * b;
      if (!best || score > best.score) best = { a, b, score };
    }
  }
  return best;
}
