#!/usr/bin/env bash
# R15F candidate gate: source fence + 224 unit, typecheck, one build, 16+14+12 browser.
# Never claims or rewrites the Fedora-qualified R14Z release receipt.
# Usage: bash pilots/operations-research/qualify-r15f-targeted.sh EXACT_SHA
# No build reuse on a new application-code commit.
# Always fail fast before the one production build.
set -Eeuo pipefail
umask 077
cd "$(dirname "$0")/../.."
PIN="${1:-}"
[[ "$#" == 1 && "$PIN" =~ ^[a-f0-9]{40}$ ]] ||
 { echo "BLOCKED_PIN"; exit 2; }
[[ "$(git branch --show-current)" == "pilot/operations-research-r15" ]] ||
 { echo "BLOCKED_R15_BRANCH";exit 2; }
[[ "$(git rev-parse HEAD)" == "$PIN" ]] ||
 { echo "BLOCKED_EXACT_HEAD";exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
 { echo "BLOCKED_DIRTY_WORKTREE";exit 2; }
[[ "$(id -u)" != 0 ]] || { echo "BLOCKED_ROOT";exit 2; }
for tool in node npm git timeout cmp;do
 command -v "$tool" >/dev/null 2>&1 || { echo "BLOCKED_TOOL_$tool";exit 2; }
done
[[ -x node_modules/.bin/next ]] || { echo "BLOCKED_NODE_MODULES_MISSING";exit 2; }
CHROME="${LH_R14_CHROMIUM:-}"
[[ "$CHROME" == /* && -x "$CHROME" ]] ||
 { echo "BLOCKED_CHROMIUM";exit 2; }
# Choose an unused loopback port rather than interrupting any other project.
# Optional manual override remains restricted to 4/5-digit local ports.
PORT="${LH_R15_QUALIFY_PORT:-}"
if [[ -z "$PORT" ]];then
 PORT="$(node --input-type=module <<'JS'
import net from 'node:net';
const server=net.createServer();
server.once('error',e=>{
 process.stderr.write('BLOCKED_PORT_DISCOVERY: '+e.message+'\n');
 process.exitCode=2;
});
server.listen({host:'127.0.0.1',port:0,exclusive:true},()=>{
 const address=server.address();
 if(!address||typeof address==='string'){
  process.stderr.write('BLOCKED_PORT_DISCOVERY_NO_ADDRESS\n');
  process.exitCode=2;server.close();return;
 }
 process.stdout.write(String(address.port)+'\n');
 server.close();
});
JS
 )"
fi
[[ "$PORT" =~ ^[1-9][0-9]{3,4}$ ]] &&
 (( 10#$PORT >= 1024 && 10#$PORT <= 65535 )) ||
 { echo "BLOCKED_INVALID_LOOPBACK_PORT";exit 2; }
echo "R15F_LOOPBACK_PORT=$PORT"
# Re-check just before starting work; an extremely rare bind race fails closed.
node --input-type=module - "$PORT" <<'JS'
import net from 'node:net';
const s=net.createServer();
s.once('error',()=>{process.stderr.write('BLOCKED_PORT_IN_USE\n');process.exitCode=2});
s.listen({host:'127.0.0.1',port:Number(process.argv[2]),exclusive:true},()=>s.close());
JS
EVIDENCE="$(mktemp -d /tmp/learnharness-r15f-targeted-XXXXXXXX)"
chmod 700 "$EVIDENCE"
echo "R15F_EVIDENCE_DIR=$EVIDENCE"
STEP="source-preflight"
SERVER_PID=""
cleanup(){
 local status=$?
 trap - EXIT
 if [[ -n "$SERVER_PID" ]];then
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
 fi
 if ((status!=0));then
  printf 'R15F_FAIL_STEP=%s\nEVIDENCE_DIR=%s\n' "$STEP" "$EVIDENCE" >&2
 fi
 exit "$status"
}
trap cleanup EXIT
STEP="source-fence"
if ! timeout --kill-after=5s 30s \
 node pilots/operations-research/release-fence-r15f.mjs "$PIN" \
 >"$EVIDENCE/release-fence.json" 2>"$EVIDENCE/release-fence.err";then
 cat "$EVIDENCE/release-fence.err" >&2;exit 1
fi
node --input-type=module - "$EVIDENCE/release-fence.json" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync(process.argv[2],'utf8'));
assert.equal(r.schema,'learnharness.r15f.source-scope.v1');
assert.equal(r.status,'PASS');
assert.equal(r.pathCount,36);
assert.equal(r.authoritativeScorerAndApiUnchanged,true);
assert.equal(r.dependencyAndBuildConfigUnchanged,true);
assert.equal(r.sourceScopeOnly,true);
assert.equal(r.signedAttestation,false);
assert.equal(r.releaseApproved,false);
console.log('R15F_SOURCE_SCOPE=PASS_36');
JS

STEP="unit"
if ! timeout --kill-after=5s 90s \
 node --test \
  pilots/operations-research/adaptive-practice-r15.test.mjs \
  pilots/operations-research/adaptive-diagnostics-r15b.test.mjs \
  pilots/operations-research/adaptive-sequence-r15c.test.mjs \
  pilots/operations-research/adaptive-run-r15d.test.mjs \
  pilots/operations-research/adaptive-checkpoint-r15e.test.mjs \
  pilots/operations-research/adaptive-run-r15f.test.mjs \
  pilots/operations-research/release-fence-r15f.test.mjs \
  >"$EVIDENCE/unit.log" 2>&1;then
 tail -n 65 "$EVIDENCE/unit.log" >&2;exit 1
fi
node --input-type=module - "$EVIDENCE/unit.log" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const log=readFileSync(process.argv[2],'utf8');
const count=key=>Number(new RegExp('(?:^|\\n)# '+key+' (\\d+)').exec(log)?.[1]);
assert.equal(count('tests'),224);
assert.equal(count('pass'),224);
assert.equal(count('fail'),0);
console.log('R15F_UNIT_TESTS=PASS_224');
JS

STEP="typecheck"
if ! timeout --kill-after=10s 900s npm run typecheck >"$EVIDENCE/typecheck.log" 2>&1;then
 tail -n 65 "$EVIDENCE/typecheck.log" >&2;exit 1
fi
echo "R15F_TYPESCRIPT=PASS"

STEP="build"
if ! NEXT_TELEMETRY_DISABLED=1 timeout --kill-after=10s 1200s npm run build >"$EVIDENCE/build.log" 2>&1;then
 tail -n 65 "$EVIDENCE/build.log" >&2;exit 1
fi
[[ -f .next/BUILD_ID ]] || { echo "BLOCKED_BUILD_ID";exit 2; }
echo "R15F_NEXT_BUILD=PASS"

STEP="server"
export LH_R15_BROWSER_URL="http://127.0.0.1:$PORT/pilot/gusek"
env -u LH_GLPK_RUN_TOKEN -u LH_GLPK_IMAGE_ID \
 LH_GLPK_ENABLE_LOCAL=0 NEXT_TELEMETRY_DISABLED=1 \
 node ./node_modules/next/dist/bin/next start -H 127.0.0.1 -p "$PORT" \
 >"$EVIDENCE/server.log" 2>&1 &
SERVER_PID="$!"
READY=0
for _ in $(seq 1 60);do
 kill -0 "$SERVER_PID" 2>/dev/null ||
  { echo "BLOCKED_NEXT_SERVER_EXITED";tail -n 35 "$EVIDENCE/server.log";exit 2; }
 if node --input-type=module - "$PORT" >/dev/null 2>&1 <<'JS'
const p=Number(process.argv[2]);
try{
 const r=await fetch('http://127.0.0.1:'+p+'/api/pilot/gusek?kind=transport&seed=42',
  {signal:AbortSignal.timeout(2000)});
 const j=await r.json();
 if(!r.ok||j.schema!=='learnharness.gusek-task.r13'||
  j.task?.id!=='gusek-transport-42')process.exitCode=1;
}catch{process.exitCode=1}
JS
 then READY=1;break;fi
 sleep 1
done
[[ "$READY" == 1 ]] ||
 { echo "BLOCKED_NEXT_SERVER_NOT_READY";tail -n 35 "$EVIDENCE/server.log";exit 2; }
STEP="browser"
if ! timeout --kill-after=15s 240s \
 node pilots/operations-research/adaptive-browser-r15.mjs >"$EVIDENCE/browser.log" 2>&1;then
 tail -n 75 "$EVIDENCE/browser.log" >&2;exit 1
fi
node --input-type=module - "$EVIDENCE/browser.log" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/);
const r=JSON.parse(lines.at(-1));
assert.equal(r.schema,'learnharness.r15.browser.v1');
assert.equal(r.status,'PASS');
assert.equal(r.checks.length,16);
assert.equal(new Set(r.checks).size,16);
assert.equal(r.realServerGrade,true);
assert.equal(r.nativeSolverUsed,false);
assert.equal(r.automaticRequestOnRecommendation,false);
console.log('R15F_R15C_BROWSER=PASS_16');
JS
STEP="r15d-browser"
if ! timeout --kill-after=15s 300s \
 node pilots/operations-research/adaptive-browser-r15d.mjs >"$EVIDENCE/browser-r15d.log" 2>&1;then
 tail -n 75 "$EVIDENCE/browser-r15d.log" >&2;exit 1
fi
node --input-type=module - "$EVIDENCE/browser-r15d.log" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/);
const r=JSON.parse(lines.at(-1));
assert.equal(r.schema,'learnharness.r15d.browser.v1');
assert.equal(r.status,'PASS');
assert.equal(r.checks.length,14);
assert.equal(new Set(r.checks).size,14);
assert.equal(r.realServerGrades,4);
assert.equal(r.manualSelectionOnly,true);
assert.equal(r.noAutoStart,true);
assert.equal(r.graderAuthorityUnchanged,true);
console.log('R15F_R15D_BROWSER=PASS_14');
JS
STEP="r15e-browser"
if ! timeout --kill-after=15s 300s \
 node pilots/operations-research/adaptive-browser-r15e.mjs >"$EVIDENCE/browser-r15e.log" 2>&1;then
 tail -n 75 "$EVIDENCE/browser-r15e.log" >&2;exit 1
fi
node --input-type=module - "$EVIDENCE/browser-r15e.log" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const lines=readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/);
const r=JSON.parse(lines.at(-1));
assert.equal(r.schema,'learnharness.r15e.browser.v1');
assert.equal(r.status,'PASS');
assert.equal(r.checks.length,12);
assert.equal(new Set(r.checks).size,12);
assert.equal(r.realServerGrades,3);
assert.equal(r.noAutoStart,true);
assert.equal(r.noGradeRestoration,true);
assert.equal(r.bookmarkNoAnswers,true);
console.log('R15F_R15E_BROWSER=PASS_12');
JS
STEP="source-recheck"
if ! timeout --kill-after=5s 30s \
 node pilots/operations-research/release-fence-r15f.mjs "$PIN" \
 >"$EVIDENCE/release-fence-final.json" 2>"$EVIDENCE/release-fence-final.err";then
 cat "$EVIDENCE/release-fence-final.err" >&2;exit 1
fi
cmp -s "$EVIDENCE/release-fence.json" "$EVIDENCE/release-fence-final.json" ||
 { echo "BLOCKED_SOURCE_FENCE_DRIFT";exit 2; }
echo "R15F_SOURCE_RECHECK=PASS"
[[ "$(git rev-parse HEAD)" == "$PIN" ]] ||
 { echo "BLOCKED_SHA_MOVED";exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
 { echo "BLOCKED_SOURCE_DIRTY";exit 2; }
echo "R15F_TARGETED_GATE=PASS"
echo "PIN=$PIN"
echo "EVIDENCE_DIR=$EVIDENCE"
