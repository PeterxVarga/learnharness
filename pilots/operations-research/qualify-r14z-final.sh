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
for tool in node npm git podman curl timeout sha256sum; do
 command -v "$tool" >/dev/null || { echo "BLOCKED_MISSING_TOOL_$tool"; exit 2; }
done
[[ "$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null)" == true ]] || {
 echo "BLOCKED_ROOTLESS_PODMAN"; exit 2;
}
# Pin validation is sha256:hex, while Podman's inspect .Id is bare hex.
RAW_IMAGE_ID="${IMAGE#sha256:}"
[[ "$(podman image inspect --format '{{.Id}}' "$RAW_IMAGE_ID" 2>/dev/null)" == "$RAW_IMAGE_ID" ]] || {
 echo "BLOCKED_PINNED_IMAGE_MISSING"; exit 2;
}
export NEXT_TELEMETRY_DISABLED=1 ELECTRON_SKIP_BINARY_DOWNLOAD=1
export PUPPETEER_SKIP_DOWNLOAD=1 npm_config_update_notifier=false
ulimit -c 0 || true
AVAILABLE_KB="$(df -Pk "$ROOT" | awk 'END{print $4}')"
[[ "$AVAILABLE_KB" =~ ^[0-9]+$ && "$AVAILABLE_KB" -ge 2097152 ]] || {
 echo "BLOCKED_LESS_THAN_2GIB_FREE"; exit 2;
}
TMP_AVAILABLE_KB="$(df -Pk /tmp | awk 'END{print $4}')"
[[ "$TMP_AVAILABLE_KB" =~ ^[0-9]+$ && "$TMP_AVAILABLE_KB" -ge 524288 ]] || {
 echo "BLOCKED_TMP_SPACE_UNDER_512MIB"; exit 2;
}
EVIDENCE="$(mktemp -d "/tmp/learnharness-r14z-final-XXXXXXXX")"
chmod 700 "$EVIDENCE"
# Print the evidence location before any later failure/explicit exit.
echo "R14Z_EVIDENCE_DIR=$EVIDENCE"
SERVER_PID=""
STEP="preflight"
cleanup(){
 local status=$?
 trap - EXIT
 if [[ -n "$SERVER_PID" ]]; then
  # The final gate owns the process it started, not any pre-existing server.
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
 fi
 if ((status!=0)); then
  node pilots/operations-research/final-evidence-r14z.mjs "$EVIDENCE" "$PIN" FAIL "$STEP" >/dev/null 2>&1 || true
 fi
 return "$status"
}
trap cleanup EXIT
trap 'echo "R14Z_FAIL_STEP=$STEP"; echo "EVIDENCE_DIR=$EVIDENCE" >&2' ERR
PORT="$(printenv LH_R14_FINAL_PORT || printf 33770)"
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] && ((10#$PORT>=1024 && 10#$PORT<=65535)) || {
 echo "BLOCKED_INVALID_PORT"; exit 2;
}
# Refuse to mistake an unrelated process already serving this port for Next.js.
node --input-type=module - "$PORT" <<'JS'
import net from 'node:net';
const port=Number(process.argv[2]);
const server=net.createServer();
server.once('error',()=>{console.error('BLOCKED_PORT_ALREADY_IN_USE');process.exitCode=2;});
server.listen({host:'127.0.0.1',port,exclusive:true},()=>server.close());
JS
echo "R14Z_FINAL_HEAD=$PIN"
echo "=== actual immutable rootless GNU GLPK ==="
STEP="native_glpsol"
export LH_GLPK_IMAGE_ID="$IMAGE"
timeout --kill-after=15s 180s node --input-type=module <<'JS' >"$EVIDENCE/native-glpk.json"
import assert from 'node:assert/strict';
import {runNativeGmplAsync} from './pilots/operations-research/glpk-native-async-r14.mjs';
import {EXAMPLE_INDEXED_MODEL,trustedIndexedData} from './pilots/operations-research/mathprog-indexed-r7.mjs';
import {makeGusekTask,trustedGusekModel,solveGusekTask,gradeGusekExam} from './pilots/operations-research/gusek-exam-r13.mjs';
const imageId=process.env.LH_GLPK_IMAGE_ID;
const translated=await runNativeGmplAsync({
 imageId,mode:'check',model:'var x >= 0; minimize obj: x; s.t. mincap: x >= 1; solve; end;'
});
assert.equal(translated.status,'GLPK_COMPLETED','actual glpsol --check');
assert.equal(translated.mode,'check');
assert.equal(translated.columnStatus,'NOT_TRANSFERABLE');
assert.equal(translated.points,null);
const malformed=await runNativeGmplAsync({
 imageId,model:'var x >= 0; minimize broken: ; solve; end;'
});
assert.equal(malformed.status,'GLPK_ERROR','invalid MathProg must not be completed');
assert.equal(malformed.graded,false);
assert.equal(malformed.points,null);
const single=await runNativeGmplAsync({
 imageId,model:'var x >= 0; maximize obj: x; s.t. upper: x <= 3; solve; end;'
});
assert.equal(single.status,'GLPK_COMPLETED');
if(single.solverStatus!=='OPTIMAL'||single.columnStatus!=='OPTIMAL_COLUMNS'){
  // Synthetic source only. No model text, tokens, paths, or solver stdout.
  process.stderr.write('R14Z_SCALAR_MACHINE_EVIDENCE='+JSON.stringify({
   status:single.status,code:single.code,statusCode:single.statusCode,
   solverStatus:single.solverStatus,solutionKind:single.solutionKind,
   columnStatus:single.columnStatus,machineEvidence:single.machineEvidence
  })+'\n');
}
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
// Real, NOT mocked GLPK interpretation for each university task type.
const universityKinds=['transport','froccs','tablet'];
const nativeTasks=[];
for(const kind of universityKinds){
 const seed=42,task=makeGusekTask(kind,seed);
 const source=trustedGusekModel(task)+'\nsolve;\nend;\n';
 const outcome=await runNativeGmplAsync({imageId,model:source});
 assert.equal(outcome.status,'GLPK_COMPLETED',kind+' glpsol completion');
 assert.equal(outcome.solverStatus,'OPTIMAL',kind+' GLPK optimum');
 assert.equal(outcome.columnStatus,'OPTIMAL_COLUMNS',kind+' named columns');
 assert.ok(Array.isArray(outcome.columns),kind+' missing columns');
 const values=Object.fromEntries(outcome.columns.map(x=>[x.name,x.value]));
 assert.deepEqual(Object.keys(values).sort(),[...task.variableNames].sort(),kind+' variable names');
 const reference=solveGusekTask(task);
 assert.equal(reference.status,'optimal',kind+' oracle');
 const tolerance=1e-6*Math.max(1,Math.abs(reference.objective));
 assert.ok(Math.abs(outcome.objective-reference.objective)<=tolerance,kind+' objective mismatch');
 const grade=gradeGusekExam(kind,seed,{
  taskKind:kind,mathprog:source,values,reportedObjective:outcome.objective,hintsUsed:false
 });
 assert.equal(grade.points,1,kind+' independent grade after GLPK');
 assert.equal(grade.maxPoints,1,kind+' grading contract');
 nativeTasks.push({kind,status:outcome.solverStatus,variables:outcome.columns.length,points:grade.points});
}
const infeasible=await runNativeGmplAsync({
 imageId,model:'var x >= 2, integer; minimize obj: x; s.t. cap: x <= 1; solve; end;'
});
assert.notEqual(infeasible.solverStatus,'OPTIMAL');
assert.equal(infeasible.points,null);
assert.equal(infeasible.graded,false);
console.log(JSON.stringify({
 schema:'learnharness.r14z.native-final.v1',status:'PASS',
 translationOnly:translated.status,syntaxError:malformed.status,
 scalar:{status:single.solverStatus,objective:single.objective},
 indexed:{status:indexed.solverStatus,variables:indexed.columns.length},
 universityTasks:nativeTasks,
 infeasible:{status:infeasible.solverStatus}
}));
JS
echo "R14Z_REAL_GLPK=PASS"
echo "=== exact source, dependencies and build ==="
STEP="npm_ci"
timeout --kill-after=15s 1200s npm ci --no-audit --no-fund >"$EVIDENCE/npm-ci.log" 2>&1 || { tail -n 30 "$EVIDENCE/npm-ci.log"; exit 1; }
STEP="typecheck"
timeout --kill-after=15s 900s npm run typecheck >"$EVIDENCE/typecheck.log" 2>&1 || { tail -n 40 "$EVIDENCE/typecheck.log"; exit 1; }
STEP="next_build"
timeout --kill-after=15s 1200s npm run build >"$EVIDENCE/build.log" 2>&1 || { tail -n 40 "$EVIDENCE/build.log"; exit 1; }
echo "R14Z_NPM_TYPESCRIPT_BUILD=PASS"
STEP="chromium_smoke"
# Cheap launchability check before the expensive full test suites.
timeout --kill-after=5s 45s node --input-type=module <<'JS' >"$EVIDENCE/browser-bootstrap.log" 2>&1
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const path=process.env.LH_R14_CHROMIUM;
assert.ok(path?.startsWith('/'),'absolute distro Chromium required');
const browser=await puppeteer.launch({executablePath:path,headless:true,args:['--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.goto('about:blank');
 assert.equal(page.url(),'about:blank');
 console.log('R14Z_CHROMIUM_BOOTSTRAP=PASS');
}finally{await browser.close();}
JS
STEP="offline"
timeout --kill-after=15s 360s node pilots/operations-research/verify-offline.mjs >"$EVIDENCE/offline.json"
node --input-type=module - "$EVIDENCE/offline.json" <<'JS'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const receipt=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(receipt.status,'PASS');
assert.equal(receipt.totalTests,469);
assert.equal(receipt.suites.length,37);
console.log('R14Z_OFFLINE=PASS_469_IN_37');
JS
STEP="npm_test"
timeout --kill-after=15s 1200s npm test >"$EVIDENCE/npm-test.log" 2>&1 || { tail -n 40 "$EVIDENCE/npm-test.log"; exit 1; }
node --input-type=module - "$EVIDENCE/npm-test.log" <<'JS'
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const log=readFileSync(process.argv[2],'utf8');
const value=name=>[...log.matchAll(new RegExp('(?:^|\\n)# '+name+' (\\d+)','g'))].at(-1)?.[1];
assert.equal(Number(value('tests')),2825,'Unexpected full npm test count');
assert.equal(Number(value('pass')),2825,'A new test silently skipped or failed');
assert.equal(Number(value('fail')),0,'Nonzero npm test failures');
console.log('R14Z_FULL_NPM_TESTS=PASS_2825');
JS
echo "=== Next.js + two final browser flows ==="
STEP="server"
TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
export LH_GLPK_RUN_TOKEN="$TOKEN" LH_GLPK_ENABLE_LOCAL=1
# Launch Next directly, not under npm's extra shell/process wrapper:
# cleanup must signal precisely the process owned by this qualification.
node ./node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$PORT" >"$EVIDENCE/next-server.log" 2>&1 &
SERVER_PID="$!"
URL="http://127.0.0.1:$PORT/pilot/gusek"
READY=0
for _ in $(seq 1 60); do
 if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "BLOCKED_NEXT_PROCESS_EXITED"; exit 2;
 fi
 # Verify the actual task API and schema, not just a stray HTTP 200 page.
 if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/api/pilot/gusek?kind=tablet&seed=42" 2>/dev/null |
  node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{try{const r=JSON.parse(s);if(r.schema!=="learnharness.gusek-task.r13"||r.task?.id!=="gusek-tablet-42")process.exitCode=1;}catch{process.exitCode=1;}})' >/dev/null 2>&1; then
  READY=1; break;
 fi
 sleep 1
done
[[ "$READY" == 1 ]] || { echo "BLOCKED_NEXT_NOT_READY"; exit 2; }
export LH_R14_BROWSER_URL="$URL"
STEP="browser_workbench"
timeout --kill-after=15s 240s node pilots/operations-research/gusek-workbench-browser-r14.mjs >"$EVIDENCE/browser-workbench.log" 2>&1 || {
 tail -n 60 "$EVIDENCE/browser-workbench.log"; exit 1;
}
STEP="browser_practice"
timeout --kill-after=15s 240s node pilots/operations-research/gusek-practice-browser-r14.mjs >"$EVIDENCE/browser-practice.log" 2>&1 || {
 tail -n 60 "$EVIDENCE/browser-practice.log"; exit 1;
}
STEP="browser_live_native"
timeout --kill-after=15s 240s node pilots/operations-research/gusek-live-native-browser-r14z.mjs >"$EVIDENCE/browser-live-native.log" 2>&1 || {
 tail -n 60 "$EVIDENCE/browser-live-native.log"; exit 1;
}
STEP="final_git"
[[ "$(git rev-parse HEAD)" == "$PIN" ]] || { echo "BLOCKED_HEAD_CHANGED"; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo "BLOCKED_DIRTY_AFTER_CHECK"; exit 2; }
STEP="final_receipt"
node pilots/operations-research/final-evidence-r14z.mjs "$EVIDENCE" "$PIN" PASS "$STEP" >"$EVIDENCE/receipt-check.log" || {
 cat "$EVIDENCE/receipt-check.log"; exit 1;
}
echo "R14Z_FINAL_QUALIFICATION=PASS"
echo "HEAD=$PIN"
echo "EVIDENCE_DIR=$EVIDENCE"
echo "RECEIPT=$EVIDENCE/r14z-release-receipt.json"
