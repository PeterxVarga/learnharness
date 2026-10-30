#!/usr/bin/env bash
# Targeted, exact-SHA R14Z browser replay; not a full release qualification.
# Usage: bash pilots/operations-research/qualify-browser-r14z.sh SHA --build
#        bash pilots/operations-research/qualify-browser-r14z.sh SHA --reuse
set -Eeuo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd -P)"
cd "$ROOT"
PIN="\${1:-}"
MODE="\${2:-}"
[[ "$#" == 2 && "$PIN" =~ ^[a-f0-9]{40}$ ]] ||
 { echo "BLOCKED_EXACT_PIN_OR_ARGUMENTS"; exit 2; }
[[ "$MODE" == "--build" || "$MODE" == "--reuse" ]] ||
 { echo "BLOCKED_BUILD_MODE"; exit 2; }
[[ "$(id -u)" != 0 ]] || { echo "BLOCKED_ROOT"; exit 2; }
[[ "$(git branch --show-current)" == "pilot/operations-research-r14" ]] ||
 { echo "BLOCKED_BRANCH"; exit 2; }
[[ "$(git rev-parse HEAD)" == "$PIN" ]] ||
 { echo "BLOCKED_SHA"; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
 { echo "BLOCKED_DIRTY_SOURCE"; exit 2; }
for tool in node npm git podman timeout; do
 command -v "$tool" >/dev/null 2>&1 ||
 { echo "BLOCKED_TOOL_$tool"; exit 2; }
done
[[ -f package-lock.json && -x node_modules/.bin/next ]] ||
 { echo "BLOCKED_DEPENDENCIES"; exit 2; }
IMAGE="\${LH_GLPK_IMAGE_ID:-}"
[[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]] ||
 { echo "BLOCKED_IMAGE_PIN"; exit 2; }
RAW_IMAGE_ID="\${IMAGE#sha256:}"
[[ "$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null)" == true ]] ||
 { echo "BLOCKED_ROOTLESS"; exit 2; }
[[ "$(podman image inspect --format '{{.Id}}' "$RAW_IMAGE_ID" 2>/dev/null)" == "$RAW_IMAGE_ID" ]] ||
 { echo "BLOCKED_IMAGE_MISSING"; exit 2; }
CHROME="\${LH_R14_CHROMIUM:-}"
[[ "$CHROME" == /* && -x "$CHROME" ]] ||
 { echo "BLOCKED_CHROMIUM"; exit 2; }
PORT="\${LH_R14_FINAL_PORT:-33770}"
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] &&
 ((10#$PORT>=1024 && 10#$PORT<=65535)) ||
 { echo "BLOCKED_PORT"; exit 2; }
node --input-type=module - "$PORT" <<'JS'
import net from 'node:net';
const server=net.createServer();
server.once('error',()=>{process.stderr.write('BLOCKED_PORT_BUSY\n');process.exitCode=2;});
server.listen({host:'127.0.0.1',port:Number(process.argv[2]),exclusive:true},()=>server.close());
JS

EVIDENCE="$(mktemp -d /tmp/learnharness-r14z-browser-XXXXXXXX)"
chmod 700 "$EVIDENCE"
echo "R14Z_BROWSER_EVIDENCE_DIR=$EVIDENCE"
SERVER_PID=""
STEP="build"
cleanup(){
 local result=$?
 trap - EXIT
 if [[ -n "$SERVER_PID" ]]; then
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
 fi
 if ((result!=0)); then
  printf 'R14Z_BROWSER_FAIL_STEP=%s\nR14Z_BROWSER_EVIDENCE_DIR=%s\n' "$STEP" "$EVIDENCE" >&2
 fi
 exit "$result"
}
trap cleanup EXIT

STAMP=".next/r14z-browser-build-head"
if [[ "$MODE" == "--build" ]]; then
 # Never reuse a stamp after a failed subsequent build.
 rm -f -- "$STAMP"
 if ! NEXT_TELEMETRY_DISABLED=1 npm run build >"$EVIDENCE/build.log" 2>&1; then
  tail -n 45 "$EVIDENCE/build.log" >&2
  exit 1
 fi
 [[ -f .next/BUILD_ID && "$(git rev-parse HEAD)" == "$PIN" ]] ||
  { echo "BLOCKED_BUILD_OUTPUT"; exit 2; }
 [[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
  { echo "BLOCKED_BUILD_DIRTY"; exit 2; }
 printf '%s\n' "$PIN" > "$STAMP"
 echo "R14Z_BROWSER_BUILD=PASS"
else
 [[ -f .next/BUILD_ID && -f "$STAMP" ]] ||
  { echo "BLOCKED_UNSTAMPED_BUILD"; exit 2; }
 [[ "$(cat "$STAMP")" == "$PIN" ]] ||
  { echo "BLOCKED_BUILD_PIN_MISMATCH"; exit 2; }
 echo "R14Z_BROWSER_REUSING_PINNED_BUILD=YES"
fi
STEP="server"
TOKEN="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
export LH_GLPK_RUN_TOKEN="$TOKEN" LH_GLPK_ENABLE_LOCAL=1
export LH_R14_BROWSER_URL="http://127.0.0.1:$PORT/pilot/gusek"
export NEXT_TELEMETRY_DISABLED=1
node ./node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$PORT" \
 >"$EVIDENCE/server.log" 2>&1 &
SERVER_PID="$!"
READY=0
for _ in $(seq 1 60); do
 if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "BLOCKED_SERVER_PROCESS_EXITED"; tail -n 35 "$EVIDENCE/server.log"; exit 2
 fi
 if node --input-type=module - "$PORT" >/dev/null 2>&1 <<'JS'
const port=Number(process.argv[2]);
try{
 const r=await fetch('http://127.0.0.1:'+port+'/api/pilot/gusek?kind=tablet&seed=42',
  {signal:AbortSignal.timeout(2000)});
 const j=await r.json();
 if(!r.ok||j.schema!=='learnharness.gusek-task.r13'||
    j.task?.id!=='gusek-tablet-42')process.exitCode=1;
}catch{process.exitCode=1;}
JS
 then READY=1; break; fi
 sleep 1
done
[[ "$READY" == 1 ]] ||
 { echo "BLOCKED_SERVER_NOT_READY"; tail -n 35 "$EVIDENCE/server.log"; exit 2; }

SCRIPTS=(gusek-workbench-browser-r14.mjs gusek-practice-browser-r14.mjs gusek-live-native-browser-r14z.mjs)
LABELS=(workbench practice live-native)
for i in 0 1 2; do
 STEP="browser_\${LABELS[$i]}"
 LOG="$EVIDENCE/\${LABELS[$i]}.log"
 echo "R14Z_BROWSER_RUNNING=\${LABELS[$i]}"
 if ! timeout --kill-after=15s 240s \
  node "pilots/operations-research/\${SCRIPTS[$i]}" >"$LOG" 2>&1; then
  tail -n 55 "$LOG" >&2
  exit 1
 fi
 echo "R14Z_BROWSER_STAGE_\${LABELS[$i]}=PASS"
done
STEP="receipts"
node --input-type=module - "$EVIDENCE" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const dir=process.argv[2];
const cases=[
 ['workbench',11,'learnharness.r14.workbench-browser.v1'],
 ['practice',15,'learnharness.r14z.practice-browser.v1'],
 ['live-native',16,'learnharness.r14z.live-browser.v1']
];
const expectedLive=['LIVE_NATIVE_UI_READY',...['transport','froccs','tablet'].flatMap(k=>[
 k+'_SEEDED_TASK_LOADED',k+'_EXACT_TRUSTED_SOURCE_ENTERED',
 k+'_REAL_GLPK_OPTIMAL_COLUMNS',k+'_EXPLICIT_TRANSFER_TO_NAMED_GRID',
 k+'_REAL_INDEPENDENT_FULL_CREDIT'
])];
for(const [name,count,schema] of cases){
 const lines=readFileSync(join(dir,name+'.log'),'utf8').trim().split(/\r?\n/);
 const receipt=JSON.parse(lines.at(-1));
 assert.equal(receipt.schema,schema,name);
 assert.equal(receipt.status,'PASS',name);
 assert.equal(receipt.checks.length,count,name);
 assert.equal(new Set(receipt.checks).size,count,name);
 if(name==='practice'){
  assert.equal(receipt.mockedNativeOnly,true);
  assert.equal(receipt.realPracticeGrade,true);
 }
 if(name==='live-native'){
  assert.deepEqual(receipt.checks,expectedLive);
  assert.equal(receipt.realNativeGlpk,true);
  assert.equal(receipt.realPracticeGrade,true);
  assert.equal(receipt.nativeCalls,3);
  assert.equal(receipt.gradeCalls,3);
  assert.equal(receipt.verifiedNativeResponses,3);
  assert.equal(receipt.verifiedGradeResponses,3);
  assert.equal(receipt.verifiedExactRequestBodies,true);
  assert.deepEqual(receipt.scenarios.map(x=>[x.kind,x.nativeCalls,x.gradeCalls,x.points]),
   ['transport','froccs','tablet'].map(k=>[k,1,1,1]));
 }
 console.log('R14Z_BROWSER_'+name.toUpperCase()+'='+count+'/'+count);
}
console.log('R14Z_BROWSER_REPLAY=PASS_42');
JS
STEP="final_git"
[[ "$(git rev-parse HEAD)" == "$PIN" ]] ||
 { echo "BLOCKED_HEAD_CHANGED"; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
 { echo "BLOCKED_SOURCE_DIRTY"; exit 2; }
echo "R14Z_BROWSER_REPLAY_GATE=PASS"
echo "PIN=$PIN"
echo "EVIDENCE_DIR=$EVIDENCE"
