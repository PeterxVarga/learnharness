#!/usr/bin/env node
/**
 * R5 native GLPK runtime qualification, SYNTHETIC TRUSTED MODEL ONLY.
 * This is NOT a general student .mod interpreter or sandbox.
 * A successful status requires an ACTUAL executed glpsol binary and a
 * comparison with an independent bounded integer-enumeration oracle.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectGlpkResult } from './glpk-contract.mjs';
import { seededTransportMathProg, seededTransportToLinearProblem, seededTransportWitness } from './transport-mathprog-r4.mjs';

const GLPSOL = '/usr/bin/glpsol';
const LIMIT = 128 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = (code) => { throw new Error(`GLPSOL_NOT_QUALIFIED:${code}`); };

export function qualificationPlan(seed) {
  const model = seededTransportMathProg(seed);
  const problem = seededTransportToLinearProblem(seed);
  const witness = seededTransportWitness(seed);
  // Inputs are generated from bounded fixed identifiers and numbers only.
  if (model.length > 16 * 1024 || witness.objective < 0) fail('UNEXPECTED_MODEL');
  return { seed, model, problem, witness, modelSha256: sha(model),
    arguments: ['--math', 'generated.mod', '--wglp', 'generated.glp', '--write', 'generated.sol', '--tmlim', '5', '--memlim', '64'] };
}

/** Only root-owned, non-symlink, non-writable-by-others /usr/bin/glpsol is accepted. */
export function trustedBinaryMetadata(path = GLPSOL) {
  if (path !== GLPSOL) fail('UNAPPROVED_BINARY_PATH');
  let st;
  try { st = lstatSync(path); } catch { fail('BINARY_MISSING'); }
  if (!st.isFile() || st.isSymbolicLink() || st.uid !== 0 || (st.mode & 0o022) !== 0 || st.size < 1 || st.size > 100 * 1024 * 1024)
    fail('UNTRUSTED_BINARY');
  let bytes;
  try { bytes = readFileSync(path); } catch { fail('BINARY_READ_FAILED'); }
  return {path, sha256:sha(bytes), size:st.size};
}

function readOutput(path) {
  let st;
  try { st = lstatSync(path); } catch { fail('MISSING_SOLVER_OUTPUT'); }
  if (!st.isFile() || st.isSymbolicLink() || st.size < 1 || st.size > LIMIT) fail('INVALID_SOLVER_OUTPUT');
  return readFileSync(path, 'utf8');
}

export function qualifyGeneratedGlpsol(seed) {
  const plan = qualificationPlan(seed);
  const binary = trustedBinaryMetadata();
  const dir = mkdtempSync(join(tmpdir(), 'lh-glpsol-'));
  chmodSync(dir, 0o700);
  try {
    writeFileSync(join(dir,'generated.mod'), plan.model, {flag:'wx',mode:0o600});
    // No shell, no inherited user HOME/PATH, no learner .mod or external input path.
    const completed = spawnSync(binary.path, plan.arguments, {cwd:dir, shell:false, timeout:10_000,
      maxBuffer:LIMIT, encoding:'utf8', env:{PATH:'/usr/bin:/bin', HOME:dir, LANG:'C', LC_ALL:'C'}});
    if (completed.error || completed.signal || completed.status !== 0) fail('EXECUTION_FAILED_OR_TIMED_OUT');
    const glp = readOutput(join(dir,'generated.glp'));
    const sol = readOutput(join(dir,'generated.sol'));
    let parsed;
    try { parsed = inspectGlpkResult(plan.problem, glp, sol); }
    catch { fail('MACHINE_RESULT_INVALID'); }
    if (parsed.status !== 'optimal' || Math.abs(parsed.objective - plan.witness.objective) > 1e-6)
      fail('ORACLE_DISAGREEMENT');
    const after = trustedBinaryMetadata();
    if (after.sha256 !== binary.sha256) fail('BINARY_CHANGED');
    return { status:'PASS_ACTUAL_NATIVE_GLPSOL', seed, binarySha256:binary.sha256,
      modelSha256:plan.modelSha256, objective:parsed.objective,
      oracleObjective:plan.witness.objective, variablesChecked:plan.problem.variables.length,
      constraintsChecked:plan.problem.constraints.length, scope:'generated_synthetic_model_only' };
  } finally { rmSync(dir,{recursive:true,force:true}); }
}

function cli(argv) {
  if (argv.length !== 2 || argv[0] !== '--seed' || !/^(0|[1-9]\d{0,9})$/.test(argv[1])) fail('EXPECTED_SEED_ARGUMENT');
  const seed = Number(argv[1]);
  if (!Number.isSafeInteger(seed) || seed > 4294967295) fail('EXPECTED_SEED_ARGUMENT');
  return qualifyGeneratedGlpsol(seed);
}
if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  try { console.log(JSON.stringify(cli(process.argv.slice(2)),null,2)); }
  catch (e) { console.error(e instanceof Error ? e.message : 'GLPSOL_NOT_QUALIFIED:UNKNOWN'); process.exitCode=2; }
}
