#!/usr/bin/env bash
# Owner-initiated single final qualification for an already assembled R16 candidate.
set -Eeuo pipefail
umask 077
[[ $# == 1 ]] || { echo 'Usage: bash qualify-r16.sh /path/to/r16-result'; exit 2; }
ROOT="$(realpath -e -- "$1")"
[[ -d "$ROOT/assembled" && -f "$ROOT/evidence/assembly.json" ]] || { echo BLOCKED_MISSING_ASSEMBLY; exit 2; }
NODE_DIR="$ROOT/assembled"
BUNDLE="$(dirname -- "$(realpath -e -- "$0")")"
# This must run before npm ci / Next generates any additional files.
# An already-qualified checkout must not silently overwrite its receipt.
[[ ! -e "$ROOT/evidence/qualification.json" ]] || { echo BLOCKED_QUALIFICATION_RECEIPT_ALREADY_EXISTS; exit 3; }
python3 "$BUNDLE/r16.py" verify-assembly --path "$ROOT"
# Never enable native GLPK as a side effect of a test, even if an operator shell has secrets.
export LH_GLPK_ENABLE_LOCAL=0
unset LH_GLPK_IMAGE_ID LH_GLPK_RUN_TOKEN
command -v node >/dev/null && command -v npm >/dev/null || { echo BLOCKED_NODE_MISSING; exit 2; }
node - "$ROOT/evidence/assembly.json" <<'NODE'
const fs=require('node:fs');
const assert=require('node:assert/strict');
const ev=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
assert.equal(ev.status,'ASSEMBLED_UNQUALIFIED');
assert.equal(ev.core_files_overwritten,0);
assert.equal(ev.native_glpk_enabled_by_r16,false);
assert.ok(['core','workbench'].includes(ev.profile));
assert.equal(ev.native_route_enabled_by_r16,false);
console.log(`R16_SCOPE=PASS_${ev.new_path_count}`);
NODE
cd "$NODE_DIR"
# Path comes from the verified assembly receipt, never caller input.
ADDON_PREFIX="$(node -e 'const f=require(process.argv[1]); process.stdout.write(f.addon_namespace||"")' "$ROOT/evidence/assembly.json")"
[[ "$ADDON_PREFIX" == "tredven/addons/" ]] || { echo BLOCKED_ADDON_PREFIX; exit 2; }

# Fail-fast; no external API or model calls. npm ci may access the npm registry.
npm ci
npm run lint
npm run typecheck
npm test
npm run build
# Standalone local contract checks, no server needed.
node --test "${ADDON_PREFIX}"pilots/operations-research/gusek-r13.test.mjs \
  "${ADDON_PREFIX}"pilots/operations-research/adaptive-practice-r15.test.mjs \
  "${ADDON_PREFIX}"pilots/operations-research/adaptive-sequence-r15c.test.mjs
if [[ -f "${ADDON_PREFIX}"pilots/operations-research/gusek-workspace-r14.test.mjs ]]; then
  node --test \
    "${ADDON_PREFIX}"pilots/operations-research/gusek-workspace-r14.test.mjs \
    "${ADDON_PREFIX}"pilots/operations-research/gmpl-editor-r14.test.mjs \
    "${ADDON_PREFIX}"pilots/operations-research/gusek-values-grid-r14z.test.mjs \
    "${ADDON_PREFIX}"pilots/operations-research/gusek-practice-draft-r14z.test.mjs \
    "${ADDON_PREFIX}"pilots/operations-research/gusek-project-r14z.test.mjs \
    "${ADDON_PREFIX}"pilots/operations-research/adaptive-run-r15d.test.mjs \
    "${ADDON_PREFIX}"pilots/operations-research/adaptive-checkpoint-r15e.test.mjs \
    "${ADDON_PREFIX}"pilots/operations-research/adaptive-diagnostics-r15b.test.mjs \
    "${ADDON_PREFIX}"pilots/operations-research/glpk-feedback-r14z.test.mjs \
    "${ADDON_PREFIX}"learning/teaching-handoff-r168.test.mjs \
    "${ADDON_PREFIX}"learning/public-task-context-r169.test.mjs \
    "${ADDON_PREFIX}"domain/or-domain-r1610.test.mjs \
    "${ADDON_PREFIX}"domain/or-assignment-equivalence-r1611.test.mjs \
    "${ADDON_PREFIX}"domain/or-production-equivalence-r1612.test.mjs
fi
node "$BUNDLE/r16-http-smoke.mjs" "$NODE_DIR"
# A second complete source proof after npm/typecheck/tests/build + Next runtime.
# Only explicit generated build directories are ignored. Modified upstream or add-on
# source, unexpected injected script or a changed portable pack remains fatal.
python3 "$BUNDLE/r16.py" verify-assembly --path "$ROOT" --post-build
# Evidence is written only after EVERY real command and source-integrity gate
# returned success. This is a local technical receipt, NOT signed provenance.
node - "$ROOT/evidence/assembly.json" "$ROOT/evidence/qualification.json" "$NODE_DIR/package-lock.json" <<'NODE'
const fs=require('node:fs');
const crypto=require('node:crypto');
const [assemblyPath, outPath, lockPath]=process.argv.slice(2);
const hash=x=>crypto.createHash('sha256').update(fs.readFileSync(x)).digest('hex');
const assembly=JSON.parse(fs.readFileSync(assemblyPath,'utf8'));
const evidence={
  schema:'tredven.learnharness.r16.qualification.v1',
  result:'TECHNICAL_PASS_NOT_RELEASE_APPROVAL',
  procedure:'qualify-r16.sh-r16.7',
  createdUtc:new Date().toISOString(),
  upstreamSha:assembly.upstream_sha,
  r15Sha:assembly.r15_sha,
  addonPackLockSha256:assembly.addon_pack_lock_sha256,
  assemblyReceiptSha256:hash(assemblyPath),
  packageLockSha256:fs.existsSync(lockPath)?hash(lockPath):null,
  nodeVersion:process.version,
  gates:['pre-source-integrity','npm-ci','lint','typecheck','npm-test','build','r15-focused-node-tests','loopback-next-http-smoke','post-source-integrity'],
  untested:['real-native-GLPK','Chromium-visual','independent-review','release-approval'],
  releaseApproved:false,
  mergeApproved:false,
  signedAttestation:false
};
fs.writeFileSync(outPath,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
NODE
python3 "$BUNDLE/r16.py" verify-qualification --path "$ROOT"
printf '\nR16_CODE_QUALIFICATION=PASS\nR16_RELEASE_APPROVED=NO_PENDING_BROWSER_REVIEW\n'
