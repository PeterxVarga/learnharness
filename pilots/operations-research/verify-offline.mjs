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
  { name: 'pdf-provenance', file: '../../src/agent/subagents/pdf-evidence.test.ts', count: 15, flags: ['--experimental-strip-types'] },
  { name: 'hu-course-optin', file: '../../src/agent/courses/operations-research-hu.test.ts', count: 17, flags: ['--experimental-strip-types'] },
  { name: 'exam-all-or-nothing', file: 'exam-binary.test.mjs', count: 12 },
  { name: 'r3-transport-exam', file: 'transport-exam-r3.test.mjs', count: 12 },
  { name: 'r3-transport-cli', file: 'transport-cli-r3.test.mjs', count: 5 },
  { name: 'r4-next-api-transport', file: 'transport-api-r4.test.mjs', count: 9, flags: ['--experimental-strip-types'] },
  { name: 'r4-mathprog-generation', file: 'transport-mathprog-r4.test.mjs', count: 8 },
  { name: 'r5-native-glpsol-preflight', file: 'qualify-glpsol-r5.test.mjs', count: 7 },
  { name: 'r6-expanded-mathprog', file: 'mathprog-expanded-r6.test.mjs', count: 23 },
  { name: 'r6-mathprog-http', file: 'mathprog-api-r6.test.mjs', count: 9, flags: ['--experimental-strip-types'] },
  { name: 'r7-indexed-mathprog', file: 'mathprog-indexed-r7.test.mjs', count: 18 },
  { name: 'r7-indexed-mathprog-http', file: 'mathprog-indexed-api-r7.test.mjs', count: 11, flags: ['--experimental-strip-types'] },
  { name: 'r9-authoritative-attempts', file: 'attempt-service-r9.test.mjs', count: 15 },
  { name: 'r11-formative-feedback', file: 'feedback-r11.test.mjs', count: 17 },
  { name: 'r12-native-practice', file: 'native-integration-r12.test.mjs', count: 12 },
  { name: 'r13-gusek-model', file: 'gusek-r13.test.mjs', count: 22 },
  { name: 'r13-gusek-http', file: 'gusek-http-r13.test.mjs', count: 6, flags: ['--experimental-strip-types'] },
  { name: 'r14-scalar-equivalence', file: 'gusek-equivalence-r14.test.mjs', count: 16 },
  { name: 'r14n-native-glpsol-sandbox', file: 'glpk-native-sandbox-r14.test.mjs', count: 18 },
  { name: 'r14-glpk-machine-status', file: 'glpk-solution-status-r14.test.mjs', count: 12 },
  { name: 'r14-native-http-security', file: 'gusek-native-api-r14.test.mjs', count: 16, flags: ['--experimental-strip-types'] },
  { name: 'r14-indexed-transport', file: 'gusek-indexed-r14.test.mjs', count: 20 },
  { name: 'r14-indexed-http', file: 'gusek-indexed-http-r14.test.mjs', count: 8, flags: ['--experimental-strip-types'] },
  { name: 'r14-workbench-files', file: 'gusek-workspace-r14.test.mjs', count: 14 },
  { name: 'r14-glpk-columns', file: 'glpk-columns-r14.test.mjs', count: 12 },
  { name: 'r14-practice-transfer', file: 'gusek-practice-transfer-r14.test.mjs', count: 13 },
  { name: 'r14-glpk-async-runtime', file: 'glpk-native-async-r14.test.mjs', count: 12 },
  { name: 'r14-gmpl-editor', file: 'gmpl-editor-r14.test.mjs', count: 16 },
  { name: 'r14z-practice-draft', file: 'gusek-practice-draft-r14z.test.mjs', count: 8 },
  { name: 'r14z-local-projects', file: 'gusek-project-r14z.test.mjs', count: 8 },
];
const hashOnlyFiles = ['../../components/chat.tsx','../../components/transport-exam.tsx','../../app/pilot/transport/page.tsx','../../src/agent/teacher-agent.ts','../../components/gusek-exam.tsx','../../components/gusek-workbench.tsx','../../components/gusek-gmpl-editor.tsx','qualify-r14z-final.sh','../../app/pilot/gusek/page.tsx'];
const allFiles = ['oracles.mjs', ...suites.map((s) => s.file), 'glpk-contract.mjs', 'exam-binary.mjs', 'transport-exam-r3.mjs', 'transport-cli-r3.mjs', 'transport-mathprog-r4.mjs', 'qualify-glpsol-r5.mjs', 'mathprog-expanded-r6.mjs', 'mathprog-indexed-r7.mjs', 'attempt-service-r9.mjs', 'feedback-r11.mjs', 'native-integration-r12.test.mjs', 'gusek-model-r13.mjs','gusek-exam-r13.mjs','gusek-equivalence-r14.mjs','gusek-indexed-r14.mjs','glpk-columns-r14.mjs','gusek-practice-transfer-r14.mjs','glpk-native-async-r14.mjs','../../src/features/gusek/gmpl-editor-core.mjs','../../src/features/gusek/practice-draft-r14z.mjs','../../src/features/gusek/project-contract-r14z.mjs','gusek-workbench-browser-r14.mjs','gusek-practice-browser-r14.mjs','../../src/features/gusek/workspace-files.mjs','../../src/features/gusek/browser-drafts.ts','glpk-solution-status-r14.mjs','glpk-native-sandbox-r14.mjs','run-glpk-r14.mjs','gusek-r13.test.mjs','gusek-http-r13.test.mjs', '../../app/api/pilot/gusek/route.ts', '../../app/api/pilot/gusek/native/route.ts', '../../src/agent/courses/operations-research-hu.test.ts', 'qualify-release-r10.mjs', 'qualify-release-r10.test.mjs', '../../app/api/pilot/transport/route.ts', '../../src/agent/subagents/pdf-evidence.ts', '../../src/agent/courses/operations-research-hu.ts', 'start-course.mjs', 'verify-offline.mjs'];

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
const hashes = Object.fromEntries([...allFiles, ...hashOnlyFiles].filter((f) => f !== 'verify-offline.mjs').map((f) => [
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
