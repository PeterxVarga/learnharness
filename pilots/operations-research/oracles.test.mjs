import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  highestScoreWithComposition,
  productionOptimum,
  proportionalBoundConflict,
  transportOptimum,
} from "./oracles.mjs";

describe("operations research R1: synthetic reference oracles (not AI evaluation)", () => {
  it("production optimum is 60 with both capacities respected", () => {
    const optimum = productionOptimum();
    assert.deepEqual(optimum, { first: 4, second: 4, profit: 60 });
    assert.ok(2 * optimum.first + optimum.second <= 12);
    assert.ok(optimum.first + optimum.second <= 8);
  });

  it("capacitated transport optimum respects supplies and demands", () => {
    const optimum = transportOptimum();
    assert.deepEqual(optimum, { ac: 4, ad: 3, bc: 2, bd: 3, cost: 68 });
    assert.equal(optimum.ac + optimum.ad, 7);
    assert.equal(optimum.bc + optimum.bd, 5);
    assert.equal(optimum.ac + optimum.bc, 6);
    assert.equal(optimum.ad + optimum.bd, 6);
    assert.ok(optimum.ac <= 4);
  });

  it("proportional opposing bounds prove an empty feasible region", () => {
    const proof = proportionalBoundConflict(
      { coefficients: [4, 4], limit: 12 },
      { coefficients: [1, 1], limit: 4 },
    );
    assert.deepEqual(proof, { effectiveUpper: 3, effectiveLower: 4, infeasible: true });
    assert.equal(proportionalBoundConflict(
      { coefficients: [4, 3], limit: 12 },
      { coefficients: [1, 1], limit: 4 },
    ), null);
  });

  it("rejects an impossible threshold instead of hallucinating an optimum", () => {
    const best = highestScoreWithComposition();
    assert.deepEqual(best, { a: 3, b: 3, score: 30 });
    assert.ok(best.score < 31, "threshold >=31 is infeasible");
    assert.ok(best.score >= 30, "threshold >=30 is feasible");
  });
});
