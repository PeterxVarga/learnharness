/**
 * Safe-by-construction GLPK preparation and output verification for the
 * operations-research pilot. THIS MODULE NEVER SPAWNS A PROCESS.
 * In particular, arbitrary learner-authored MathProg is NOT executable here.
 */

const IDENT = /^[A-Za-z][A-Za-z0-9_]{0,30}$/;
const MAX_ABS = 1_000_000;
const OWN = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const ensure = (ok, msg) => { if (!ok) throw new TypeError(msg); };
const approx = (a, b) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
const num = (n, place) => { ensure(typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_ABS, `${place}: finite bounded number required`); return n; };
const identifier = (s, place) => { ensure(typeof s === 'string' && IDENT.test(s), `${place}: invalid identifier`); return s; };
const exactKeys = (o, keys, place) => {
  ensure(isObject(o) && Object.keys(o).every((k) => keys.includes(k)), `${place}: unknown or invalid fields`);
};

export function validateLinearProblem(problem) {
  exactKeys(problem, ['sense', 'variables', 'objective', 'constraints'], 'problem');
  ensure(problem.sense === 'min' || problem.sense === 'max', 'sense must be min or max');
  ensure(Array.isArray(problem.variables) && problem.variables.length >= 1 && problem.variables.length <= 16, 'variables: 1..16 required');
  ensure(Array.isArray(problem.constraints) && problem.constraints.length >= 1 && problem.constraints.length <= 40, 'constraints: 1..40 required');
  const ids = new Set();
  for (const v of problem.variables) {
    exactKeys(v, ['id', 'type', 'lower', 'upper'], 'variable');
    identifier(v.id, 'variable id');
    ensure(!ids.has(v.id), `duplicate variable ${v.id}`);
    ids.add(v.id);
    ensure(v.type === 'integer' || v.type === 'continuous', `variable ${v.id}: unsupported type`);
    ensure(OWN(v, 'lower') && num(v.lower, 'lower') >= 0, `variable ${v.id}: nonnegative lower bound required`);
    if (OWN(v, 'upper')) ensure(num(v.upper, 'upper') >= v.lower, `variable ${v.id}: upper < lower`);
  }
  const coeffs = (object, place) => {
    ensure(isObject(object) && Object.keys(object).length > 0, `${place}: coefficients required`);
    for (const [id, value] of Object.entries(object)) {
      ensure(ids.has(id), `${place}: unknown variable ${id}`);
      num(value, `${place}.${id}`);
    }
  };
  coeffs(problem.objective, 'objective');
  const constraintIds = new Set();
  for (const c of problem.constraints) {
    exactKeys(c, ['id', 'coefficients', 'op', 'rhs'], 'constraint');
    identifier(c.id, 'constraint id');
    ensure(!constraintIds.has(c.id), `duplicate constraint ${c.id}`);
    constraintIds.add(c.id);
    coeffs(c.coefficients, c.id);
    ensure(['<=', '>=', '='].includes(c.op), `${c.id}: invalid comparison`);
    num(c.rhs, `${c.id}.rhs`);
  }
  return problem;
}

export function renderTrustedMathProg(problem) {
  validateLinearProblem(problem);
  const expression = (coefficients) => problem.variables
    .filter(({ id }) => OWN(coefficients, id) && coefficients[id] !== 0)
    .map(({ id }) => `(${coefficients[id]}) * v_${id}`).join(' + ') || '0';
  const vars = problem.variables.map((v) =>
    `var v_${v.id} >= ${v.lower}${OWN(v, 'upper') ? `, <= ${v.upper}` : ''}${v.type === 'integer' ? ', integer' : ''};`);
  const constraints = problem.constraints.map((c) =>
    `s.t. c_${c.id}: ${expression(c.coefficients)} ${c.op} ${c.rhs};`);
  return [
    '# Generated ONLY from validated structured coefficients; not from an uploaded .mod.',
    ...vars,
    `${problem.sense === 'min' ? 'minimize' : 'maximize'} objective: ${expression(problem.objective)};`,
    ...constraints,
    'solve;',
    'end;',
    '',
  ].join('\n');
}

// glpsol --wglp generated.glp: n j COL NAME links ordinal to variable name.
export function readGlpkColumnMap(glpText, expectedColumns) {
  ensure(typeof glpText === 'string' && glpText.length <= 128_000, 'invalid GLP text');
  const map = new Map();
  for (const raw of glpText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('n j ')) continue;
    const match = /^n j ([1-9][0-9]*) (v_[A-Za-z][A-Za-z0-9_]*)$/.exec(line);
    ensure(match, 'malformed GLPK column descriptor');
    const index = Number(match[1]);
    ensure(Number.isSafeInteger(index) && index <= expectedColumns && !map.has(index), 'duplicate or invalid GLPK column index');
    map.set(index, match[2].slice(2));
  }
  ensure(map.size === expectedColumns, 'missing GLPK column name descriptors');
  ensure(new Set(map.values()).size === expectedColumns, 'duplicate GLPK column names');
  return map;
}

/** Parse only GLPK's machine-readable --write result, never human output. */
export function inspectGlpkResult(problem, glpText, solutionText) {
  validateLinearProblem(problem);
  ensure(typeof solutionText === 'string' && solutionText.length <= 128_000, 'invalid GLPK solution');
  const lines = solutionText.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('c '));
  ensure(lines.length >= 2 && lines.at(-1) === 'e', 'incomplete GLPK solution');
  const header = lines[0].split(/\s+/);
  ensure(header[0] === 's' && ['mip', 'bas'].includes(header[1]), 'unsupported GLPK solution type');
  const integer = (s) => { const n = Number(s); ensure(/^\d+$/.test(s) && Number.isSafeInteger(n), 'invalid GLPK count'); return n; };
  const rows = integer(header[2]);
  const cols = integer(header[3]);
  ensure(rows >= problem.constraints.length && rows <= problem.constraints.length + 1, 'GLPK row-count mismatch');
  ensure(cols === problem.variables.length, 'GLPK column-count mismatch');
  const mip = header[1] === 'mip';
  ensure(header.length === (mip ? 6 : 7), 'malformed GLPK header');
  const declaredObjective = Number(header.at(-1));
  ensure(Number.isFinite(declaredObjective), 'invalid GLPK objective');
  const status = mip
    ? ({ o: 'optimal', f: 'feasible_unproven', n: 'infeasible', u: 'unknown' })[header[4]]
    : (header[4] === 'f' && header[5] === 'f' ? 'optimal' : 'unknown');
  ensure(status, 'invalid GLPK status');
  const map = readGlpkColumnMap(glpText, cols);
  ensure(problem.variables.every((v) => [...map.values()].includes(v.id)), 'unexpected GLPK variable names');
  const values = Object.create(null);
  const seenRows = new Set();
  const seenCols = new Set();
  for (const line of lines.slice(1, -1)) {
    const parts = line.split(/\s+/);
    ensure(parts[0] === 'i' || parts[0] === 'j', 'unexpected GLPK solution record');
    const index = integer(parts[1]);
    const maxIndex = parts[0] === 'j' ? cols : rows;
    const seen = parts[0] === 'j' ? seenCols : seenRows;
    ensure(index >= 1 && index <= maxIndex && !seen.has(index), 'duplicate/out-of-range GLPK record');
    seen.add(index);
    ensure(parts.length === (mip ? 3 : 5), 'malformed GLPK record');
    const val = Number(parts[mip ? 2 : 3]);
    ensure(Number.isFinite(val), 'invalid GLPK record value');
    if (!mip) {
      ensure(['b', 'l', 'u', 'f', 's'].includes(parts[2]), 'invalid GLPK basic status');
      ensure(Number.isFinite(Number(parts[4])), 'invalid GLPK dual value');
    }
    if (parts[0] === 'j') values[map.get(index)] = val;
  }
  ensure(seenRows.size === rows && seenCols.size === cols, 'missing GLPK records');
  if (status === 'infeasible') return { status: 'infeasible' };
  if (status === 'unknown') return { status: 'unknown' };
  for (const v of problem.variables) {
    const value = values[v.id];
    ensure(Number.isFinite(value), `missing ${v.id}`);
    ensure(value >= v.lower - 1e-6, `lower bound violated: ${v.id}`);
    if (OWN(v, 'upper')) ensure(value <= v.upper + 1e-6, `upper bound violated: ${v.id}`);
    if (v.type === 'integer') ensure(approx(value, Math.round(value)), `non-integer ${v.id}`);
  }
  const weighted = (coefficients) => Object.entries(coefficients).reduce((total, [id, coefficient]) => total + coefficient * values[id], 0);
  for (const c of problem.constraints) {
    const lhs = weighted(c.coefficients);
    const close = approx(lhs, c.rhs);
    ensure(c.op === '<=' ? lhs <= c.rhs || close : c.op === '>=' ? lhs >= c.rhs || close : close, `constraint violated: ${c.id}`);
  }
  const recalculatedObjective = weighted(problem.objective);
  ensure(approx(declaredObjective, recalculatedObjective), 'GLPK objective mismatch');
  return { status, objective: recalculatedObjective, values: { ...values } };
}
