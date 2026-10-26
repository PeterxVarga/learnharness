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
];
const allFiles = ['oracles.mjs', ...suites.map((s) => s.file), 'glpk-contract.mjs', 'verify-offline.mjs'];

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

for (const f of allFiles) node(['--check', join(baseDir, f)]);
const receipts = [];
for (const suite of suites) {
  const output = node(['--test', join(baseDir, suite.file)]);
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
