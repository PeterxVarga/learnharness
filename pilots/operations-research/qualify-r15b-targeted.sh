#!/usr/bin/env bash
# R15B fail-fast gate: 62 pure tests, typecheck, build, 9 browser checks.
# Never claims or rewrites the Fedora-qualified R14Z release receipt.
# Usage: bash pilots/operations-research/qualify-r15b-targeted.sh EXACT_SHA
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
for tool in node npm git timeout;do
 command -v "$tool" >/dev/null 2>&1 || { echo "BLOCKED_TOOL_$tool";exit 2; }
done
[[ -x node_modules/.bin/next ]] || { echo "BLOCKED_NODE_MODULES_MISSING";exit 2; }
CHROME="${LH_R14_CHROMIUM:-}"
[[ "$CHROME" == /* && -x "$CHROME" ]] ||
 { echo "BLOCKED_CHROMIUM";exit 2; }
PORT=33770
node --input-type=module - "$PORT" <<'JS'
import net from 'node:net';
const s=net.createServer();
s.once('error',()=>{process.stderr.write('BLOCKED_PORT_IN_USE\n');process.exitCode=2});
s.listen({host:'127.0.0.1',port:Number(process.argv[2]),exclusive:true},()=>s.close());
JS
EVIDENCE="$(mktemp -d /tmp/learnharness-r15b-targeted-XXXXXXXX)"
chmod 700 "$EVIDENCE"
echo "R15_EVIDENCE_DIR=$EVIDENCE"
STEP="unit"
SERVER_PID=""
cleanup(){
 local status=$?
 trap - EXIT
 if [[ -n "$SERVER_PID" ]];then
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
 fi
 if ((status!=0));then
  printf 'R15_FAIL_STEP=%s\nEVIDENCE_DIR=%s\n' "$STEP" "$EVIDENCE" >&2
 fi
 exit "$status"
}
trap cleanup EXIT

if ! timeout --kill-after=5s 90s \
 node --test \
  pilots/operations-research/adaptive-practice-r15.test.mjs \
  pilots/operations-research/adaptive-diagnostics-r15b.test.mjs \
  >"$EVIDENCE/unit.log" 2>&1;then
 tail -n 65 "$EVIDENCE/unit.log" >&2;exit 1
fi
node --input-type=module - "$EVIDENCE/unit.log" <<'JS'
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const log=readFileSync(process.argv[2],'utf8');
const count=key=>Number(new RegExp('(?:^|\\n)# '+key+' (\\d+)').exec(log)?.[1]);
assert.equal(count('tests'),62);
assert.equal(count('pass'),62);
assert.equal(count('fail'),0);
console.log('R15B_UNIT_TESTS=PASS_62');
JS

STEP="typecheck"
if ! timeout --kill-after=10s 900s npm run typecheck >"$EVIDENCE/typecheck.log" 2>&1;then
 tail -n 65 "$EVIDENCE/typecheck.log" >&2;exit 1
fi
echo "R15B_TYPESCRIPT=PASS"

STEP="build"
if ! NEXT_TELEMETRY_DISABLED=1 timeout --kill-after=10s 1200s npm run build >"$EVIDENCE/build.log" 2>&1;then
 tail -n 65 "$EVIDENCE/build.log" >&2;exit 1
fi
[[ -f .next/BUILD_ID ]] || { echo "BLOCKED_BUILD_ID";exit 2; }
echo "R15B_NEXT_BUILD=PASS"

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
assert.equal(r.checks.length,9);
assert.equal(new Set(r.checks).size,9);
assert.equal(r.realServerGrade,true);
assert.equal(r.nativeSolverUsed,false);
assert.equal(r.automaticRequestOnRecommendation,false);
console.log('R15B_BROWSER=PASS_9');
JS
STEP="source"
[[ "$(git rev-parse HEAD)" == "$PIN" ]] ||
 { echo "BLOCKED_SHA_MOVED";exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
 { echo "BLOCKED_SOURCE_DIRTY";exit 2; }
echo "R15B_TARGETED_GATE=PASS"
echo "PIN=$PIN"
echo "EVIDENCE_DIR=$EVIDENCE"
