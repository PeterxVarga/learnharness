#!/usr/bin/env node
/**
 * Offline, dependency-free pilot verification.
 * Does not start LearnHarness, contact providers, open student files or execute GLPK.
 * Portable alternative while GitHub Actions is unavailable.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const baseDir = dirname(fileURLToPath(import.meta.url));
const suites = [
  { name: 'reference-oracles', file: 'oracles.test.mjs', count: 4 },
  { name: 'glpk-contract', file: 'glpk-contract.test.mjs', count: 6 },
  { name: 'pdf-provenance', file: '../../src/agent/subagents/pdf-evidence.test.ts', count: 11, flags: ['--experimental-strip-types'] },
  { name: 'hu-course-optin', file: '../../src/agent/courses/operations-research-hu.test.ts', count: 12, flags: ['--experimental-strip-types'] },
  { name: 'exam-all-or-nothing', file: 'exam-binary.test.mjs', count: 12 },
  { name: 'r3-transport-exam', file: 'transport-exam-r3.test.mjs', count: 12 },
  { name: 'r3-transport-cli', file: 'transport-cli-r3.test.mjs', count: 5 },
  { name: 'r4-next-api-transport', file: 'transport-api-r4.test.mjs', count: 9, flags: ['--experimental-strip-types'] },
  { name: 'r4-mathprog-generation', file: 'transport-mathprog-r4.test.mjs', count: 8 },
];
const allFiles = ['oracles.mjs', ...suites.map((s) => s.file), 'glpk-contract.mjs', 'exam-binary.mjs', 'transport-exam-r3.mjs', 'transport-cli-r3.mjs', 'transport-mathprog-r4.mjs', '../../app/api/pilot/transport/route.ts', '../../src/agent/subagents/pdf-evidence.ts', '../../src/agent/courses/operations-research-hu.ts', 'start-course.mjs', 'verify-offline.mjs'];

function node(argumentsList) {
  const result = spawnSync(process.execPath, argumentsList, {
    cwd: baseDir,
    encoding: 'utf8',
    timeout: 45_000,
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  assert.ifError(result.error);
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(`Offline verifier failed (${result.status}): ${argumentsList.join(' ')}`);
  }
  return result.stdout;
}

for (const f of allFiles) node([...(f.endsWith('.ts') ? ['--experimental-strip-types'] : []), '--check', join(baseDir, f)]);
const receipts = [];
for (const suite of suites) {
  const output = node([...(suite.flags ?? []), '--test', join(baseDir, suite.file)]);
  const count = /(?:^|\n)# tests (\d+)/.exec(output);
  const pass = /(?:^|\n)# pass (\d+)/.exec(output);
  const fail = /(?:^|\n)# fail (\d+)/.exec(output);
  assert.ok(count && pass && fail, `Missing TAP summary for ${suite.name}`);
  assert.equal(Number(count[1]), suite.count, `Unexpected test count: ${suite.name}`);
  assert.equal(Number(pass[1]), suite.count, `Test pass count mismatch: ${suite.name}`);
  assert.equal(Number(fail[1]), 0, `Tests failed: ${suite.name}`);
  receipts.push({ name: suite.name, passed: suite.count });
}
const hashes = Object.fromEntries(allFiles.filter((f) => f !== 'verify-offline.mjs').map((f) => [
  f,
  createHash('sha256').update(readFileSync(join(baseDir, f))).digest('hex'),
]));
process.stdout.write(JSON.stringify({
  schema: 'learnharness.operations-research.offline-verification.v1',
  status: 'PASS',
  runtime: `Node ${process.versions.node}`,
  totalTests: receipts.reduce((n, suite) => n + suite.passed, 0),
  suites: receipts,
  sourceSha256: hashes,
  limitations: [
    'No full Next.js/TypeScript integration or npm dependency checks',
    'No real glpsol execution or sandbox qualification',
    'No PDF reading, AI learning assessment or Fedora compatibility check',
  ],
}, null, 2) + '\n');
