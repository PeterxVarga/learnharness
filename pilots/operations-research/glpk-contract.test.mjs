import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectGlpkResult, readGlpkColumnMap, renderTrustedMathProg } from './glpk-contract.mjs';

const production = {
  sense: 'max',
  variables: [{ id: 'first', type: 'integer', lower: 0 }, { id: 'second', type: 'integer', lower: 0 }],
  objective: { first: 9, second: 6 },
  constraints: [
    { id: 'fruit', coefficients: { first: 2, second: 1 }, op: '<=', rhs: 12 },
    { id: 'sugar', coefficients: { first: 1, second: 1 }, op: '<=', rhs: 8 },
  ],
};
const modelMap = ['p mip max 3 2 7', 'n j 1 v_second', 'n j 2 v_first', 'e'].join('\n');
const solution = (status, obj, values = [4, 4]) => [
  `s mip 3 2 ${status} ${obj}`,
  'i 1 0', 'i 2 12', 'i 3 8',
  `j 1 ${values[0]}`, `j 2 ${values[1]}`, 'e',
].join('\n');

describe('GLPK R1 structured contract (never invokes solver)', () => {
  it('renders MathProg only from a bounded structured LP', () => {
    const text = renderTrustedMathProg(production);
    assert.match(text, /var v_first >= 0, integer;/);
    assert.match(text, /maximize objective: \(9\) \* v_first \+ \(6\) \* v_second;/);
    assert.match(text, /s\.t\. c_fruit:/);
    assert.ok(text.endsWith('solve;\nend;\n'));
    assert.doesNotMatch(text, /table\s|printf\s|system\(/);
  });
  it('refuses source text, injected variable identifiers and unknown fields', () => {
    assert.throws(() => renderTrustedMathProg('var x; printf "secret";'), /invalid fields/);
    assert.throws(() => renderTrustedMathProg({ ...production, variables: [{ id: 'a;printf', type: 'integer', lower: 0 }] }), /identifier/);
    assert.throws(() => renderTrustedMathProg({ ...production, dataPath: '/home/user' }), /unknown or invalid fields/);
    assert.throws(() => renderTrustedMathProg({ ...production, objective: { ghost: 5 } }), /unknown variable/);
    assert.throws(() => renderTrustedMathProg({ ...production, variables: [{ id: 'first', type: 'integer', lower: -1 }, production.variables[1]] }), /nonnegative lower/);
  });
  it('reads symbolic names instead of assuming GLPK column order', () => {
    assert.deepEqual([...readGlpkColumnMap(modelMap, 2)], [[1, 'second'], [2, 'first']]);
    assert.deepEqual(inspectGlpkResult(production, modelMap, solution('o', 60)), {
      status: 'optimal', objective: 60, values: { first: 4, second: 4 },
    });
  });
  it('distinguishes non-optimal, infeasible and unknown outcomes', () => {
    assert.deepEqual(inspectGlpkResult(production, modelMap, solution('f', 60)), { status: 'feasible_unproven', objective: 60, values: { first: 4, second: 4 } });
    assert.deepEqual(inspectGlpkResult(production, modelMap, solution('n', 0)), { status: 'infeasible' });
    assert.deepEqual(inspectGlpkResult(production, modelMap, solution('u', 0)), { status: 'unknown' });
  });
  it('rejects fabricated solver objective, infeasible values and invalid integers', () => {
    assert.throws(() => inspectGlpkResult(production, modelMap, solution('o', 600)), /objective mismatch/);
    assert.throws(() => inspectGlpkResult(production, modelMap, solution('o', 66, [5, 4])), /constraint violated/);
    assert.throws(() => inspectGlpkResult(production, modelMap, solution('o', 60.9, [4.1, 4])), /non-integer/);
  });
  it('refuses malformed machine output without interpreting it as proof', () => {
    assert.throws(() => inspectGlpkResult(production, modelMap, 'Status: OPTIMAL'), /incomplete/);
    assert.throws(() => inspectGlpkResult(production, 'n j 1 v_first\nn j 1 v_second', solution('o', 60)), /duplicate or invalid/);
    assert.throws(() => inspectGlpkResult(production, modelMap, solution('o', 60).replace('j 2 4', 'j 2 nan')), /invalid GLPK record value/);
    assert.throws(() => inspectGlpkResult(production, modelMap, solution('o', 60).replace('i 3 8\n', '')), /missing GLPK records/);
  });
});
