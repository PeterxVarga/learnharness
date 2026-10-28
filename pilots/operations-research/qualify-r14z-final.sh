#!/usr/bin/env bash
# ONE final R14Z qualification on Fedora. Never executed during coding.
# Usage: LH_GLPK_IMAGE_ID=sha256:... LH_R14_CHROMIUM=/usr/bin/chromium \
# bash pilots/operations-research/qualify-r14z-final.sh EXACT_40_HEX_HEAD
set -Eeuo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd -P)"
cd "$ROOT"
PIN="$(printf '%s' "$*")"
[[ "$PIN" =~ ^[a-f0-9]{40}$ ]] || { echo "BLOCKED_EXACT_SHA_REQUIRED"; exit 2; }
[[ "$(git rev-parse HEAD)" == "$PIN" ]] || { echo "BLOCKED_WRONG_HEAD"; exit 2; }
[[ "$(git branch --show-current)" == "pilot/operations-research-r14" ]] || { echo "BLOCKED_WRONG_BRANCH"; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo "BLOCKED_DIRTY_SOURCE"; exit 2; }
[[ "$(id -u)" != 0 ]] || { echo "BLOCKED_NO_ROOT"; exit 2; }
IMAGE="$(printenv LH_GLPK_IMAGE_ID || true)"
[[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "BLOCKED_PINNED_IMAGE_REQUIRED"; exit 2; }
CHROME="$(printenv LH_R14_CHROMIUM || true)"
[[ "$CHROME" == /* && -x "$CHROME" ]] || { echo "BLOCKED_ABSOLUTE_CHROMIUM_REQUIRED"; exit 2; }
for tool in node npm git podman curl; do
 command -v "$tool" >/dev/null || { echo "BLOCKED_MISSING_TOOL_$tool"; exit 2; }
done
[[ "$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null)" == true ]] || {
 echo "BLOCKED_ROOTLESS_PODMAN"; exit 2;
}
[[ "$(podman image inspect --format '{{.Id}}' "$IMAGE" 2>/dev/null)" == "$IMAGE" ]] || {
 echo "BLOCKED_PINNED_IMAGE_MISSING"; exit 2;
}
AVAILABLE_KB="$(df -Pk "$ROOT" | awk 'END{print $4}')"
[[ "$AVAILABLE_KB" =~ ^[0-9]+$ && "$AVAILABLE_KB" -ge 2097152 ]] || {
 echo "BLOCKED_LESS_THAN_2GIB_FREE"; exit 2;
}
EVIDENCE="$(mktemp -d "/tmp/learnharness-r14z-final-XXXXXXXX")"
chmod 700 "$EVIDENCE"
PORT="$(printenv LH_R14_FINAL_PORT || printf 33770)"
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] || { echo "BLOCKED_INVALID_PORT"; exit 2; }
SERVER_PID=""
cleanup(){
 if [[ -n "$SERVER_PID" ]]; then
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
 fi
}
trap cleanup EXIT
STEP="initial"
trap 'echo "R14Z_FAIL_STEP=$STEP"; echo "EVIDENCE_DIR=$EVIDENCE" >&2' ERR
echo "R14Z_FINAL_HEAD=$PIN"
echo "R14Z_EVIDENCE_DIR=$EVIDENCE"
echo "=== exact source, dependencies and build ==="
STEP="npm_ci"
npm ci >"$EVIDENCE/npm-ci.log" 2>&1 || { tail -n 30 "$EVIDENCE/npm-ci.log"; exit 1; }
STEP="offline"
node pilots/operations-research/verify-offline.mjs >"$EVIDENCE/offline.json"
node --input-type=module - "$EVIDENCE/offline.json" <<'JS'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const receipt=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(receipt.status,'PASS');
assert.equal(receipt.totalTests,416);
assert.equal(receipt.suites.length,34);
console.log('R14Z_OFFLINE=PASS_416_IN_34');
JS
STEP="npm_test"
npm test >"$EVIDENCE/npm-test.log" 2>&1 || { tail -n 40 "$EVIDENCE/npm-test.log"; exit 1; }
node --input-type=module - "$EVIDENCE/npm-test.log" <<'JS'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const log=readFileSync(process.argv[2],'utf8');
const value=name=>[...log.matchAll(new RegExp('(?:^|\\n)# '+name+' (\\d+)','g'))].at(-1)?.[1];
assert.equal(Number(value('tests')),2772,'Unexpected full npm test count');
assert.equal(Number(value('pass')),2772,'A new test silently skipped or failed');
assert.equal(Number(value('fail')),0,'Nonzero npm test failures');
console.log('R14Z_FULL_NPM_TESTS=PASS_2772');
JS
STEP="typecheck"
npm run typecheck >"$EVIDENCE/typecheck.log" 2>&1 || { tail -n 40 "$EVIDENCE/typecheck.log"; exit 1; }
STEP="next_build"
npm run build >"$EVIDENCE/build.log" 2>&1 || { tail -n 40 "$EVIDENCE/build.log"; exit 1; }
echo "R14Z_NPM_TYPESCRIPT_BUILD=PASS"
echo "=== actual immutable rootless GNU GLPK ==="
STEP="native_glpsol"
export LH_GLPK_IMAGE_ID="$IMAGE"
node --input-type=module <<'JS' >"$EVIDENCE/native-glpk.json"
import assert from 'node:assert/strict';
import {runNativeGmplAsync} from './pilots/operations-research/glpk-native-async-r14.mjs';
import {EXAMPLE_INDEXED_MODEL,trustedIndexedData} from './pilots/operations-research/mathprog-indexed-r7.mjs';
const imageId=process.env.LH_GLPK_IMAGE_ID;
const single=await runNativeGmplAsync({
 imageId,model:'var x >= 0; maximize obj: x; s.t. upper: x <= 3; solve; end;'
});
assert.equal(single.status,'GLPK_COMPLETED');
assert.equal(single.solverStatus,'OPTIMAL');
assert.equal(single.objective,3);
assert.equal(single.columnStatus,'OPTIMAL_COLUMNS');
assert.equal(single.columns?.find(x=>x.name==='x')?.value,3);
const indexed=await runNativeGmplAsync({
 imageId,
 model:EXAMPLE_INDEXED_MODEL.replace('>= 0, <= cap[i,j]','>= 0, integer, <= cap[i,j]'),
 data:trustedIndexedData(42)
});
assert.equal(indexed.status,'GLPK_COMPLETED');
assert.equal(indexed.solverStatus,'OPTIMAL');
assert.equal(indexed.columnStatus,'OPTIMAL_COLUMNS');
assert.equal(indexed.columns?.filter(x=>/^x\[[1-3],[1-3]\]$/.test(x.name)).length,9);
const infeasible=await runNativeGmplAsync({
 imageId,model:'var x >= 2, integer; minimize obj: x; s.t. cap: x <= 1; solve; end;'
});
assert.notEqual(infeasible.solverStatus,'OPTIMAL');
assert.equal(infeasible.points,null);
assert.equal(infeasible.graded,false);
console.log(JSON.stringify({
 schema:'learnharness.r14z.native-final.v1',status:'PASS',
 scalar:{status:single.solverStatus,objective:single.objective},
 indexed:{status:indexed.solverStatus,variables:indexed.columns.length},
 infeasible:{status:infeasible.solverStatus}
}));
JS
echo "R14Z_REAL_GLPK=PASS"
echo "=== Next.js + two final browser flows ==="
STEP="server"
TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
export LH_GLPK_RUN_TOKEN="$TOKEN" LH_GLPK_ENABLE_LOCAL=1
npm run start -- -H 127.0.0.1 -p "$PORT" >"$EVIDENCE/next-server.log" 2>&1 &
SERVER_PID="$!"
URL="http://127.0.0.1:$PORT/pilot/gusek"
READY=0
for _ in $(seq 1 60); do
 if curl -fsS --max-time 2 "$URL" >/dev/null 2>&1; then READY=1; break; fi
 sleep 1
done
[[ "$READY" == 1 ]] || { echo "BLOCKED_NEXT_NOT_READY"; exit 2; }
export LH_R14_BROWSER_URL="$URL"
STEP="browser_workbench"
node pilots/operations-research/gusek-workbench-browser-r14.mjs >"$EVIDENCE/browser-workbench.log" 2>&1 || {
 tail -n 60 "$EVIDENCE/browser-workbench.log"; exit 1;
}
STEP="browser_practice"
node pilots/operations-research/gusek-practice-browser-r14.mjs >"$EVIDENCE/browser-practice.log" 2>&1 || {
 tail -n 60 "$EVIDENCE/browser-practice.log"; exit 1;
}
STEP="final_git"
[[ "$(git rev-parse HEAD)" == "$PIN" ]] || { echo "BLOCKED_HEAD_CHANGED"; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo "BLOCKED_DIRTY_AFTER_CHECK"; exit 2; }
echo "R14Z_FINAL_QUALIFICATION=PASS"
echo "HEAD=$PIN"
echo "EVIDENCE_DIR=$EVIDENCE"
