#!/usr/bin/env bash
# Read-only Fedora preflight for the one final operator-run R14Z qualification.
# No npm, no pull, no server/GLPK execution, no token read or external request.
# Usage: bash pilots/operations-research/preflight-r14z.sh EXACT_40_HEX_HEAD
set -Eeuo pipefail
umask 077
ROOT="$(cd -- "$(dirname -- "$0")/../.." && pwd -P)"
cd "$ROOT"
PIN="${1:-}"
RESULT=0
pass(){ printf 'PASS  %s\n' "$1"; }
block(){ printf 'BLOCKED  %s\n' "$1"; RESULT=2; }
if [[ "$PIN" =~ ^[a-f0-9]{40}$ ]];then pass EXACT_SHA_FORMAT;else block EXACT_SHA_REQUIRED;fi
for tool in git node npm podman curl timeout sha256sum df awk;do
 if command -v "$tool" >/dev/null 2>&1;then pass "TOOL_$tool";else block "TOOL_MISSING_$tool";fi
done
if [[ "$(id -u)" != 0 ]];then pass NONROOT_OPERATOR;else block ROOT_FORBIDDEN;fi
if command -v git >/dev/null 2>&1;then
 HEAD="$(git rev-parse HEAD 2>/dev/null || true)"
 BRANCH="$(git branch --show-current 2>/dev/null || true)"
 STATUS="$(git status --porcelain --untracked-files=normal 2>/dev/null || printf 'UNAVAILABLE')"
 if [[ "$PIN" =~ ^[a-f0-9]{40}$ && "$HEAD" == "$PIN" ]];then pass EXACT_GIT_HEAD;else block WRONG_GIT_HEAD;fi
 if [[ "$BRANCH" == 'pilot/operations-research-r14' ]];then pass EXPECTED_BRANCH;else block WRONG_BRANCH;fi
 if [[ -z "$STATUS" ]];then pass CLEAN_WORKTREE;else block DIRTY_WORKTREE;fi
 # Never track Next's machine-generated type bridge: dev and build rewrite
 # its import paths differently and would dirty a pinned release source.
 if [[ -z "$(git ls-files -- next-env.d.ts)" ]] &&
    git check-ignore -q -- next-env.d.ts;then
  pass NEXT_GENERATED_TYPES_IGNORED
 else
  block NEXT_GENERATED_TYPES_TRACKED_OR_NOT_IGNORED
 fi
fi
if command -v node >/dev/null 2>&1;then
 if node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=9)?0:1)' >/dev/null 2>&1;
 then pass NODE_VERSION;else block NODE_BELOW_NEXT16_MINIMUM;fi
fi
if command -v df >/dev/null 2>&1 && command -v awk >/dev/null 2>&1;then
 for spec in "$ROOT:2097152:REPOSITORY_2GIB" "/tmp:524288:TMP_512MIB";do
  IFS=: read -r TARGET MIN LABEL <<<"$spec"
  AVAILABLE="$(df -Pk "$TARGET" 2>/dev/null | awk 'END{print $4}')"
  if [[ "$AVAILABLE" =~ ^[0-9]+$ ]] && ((AVAILABLE>=MIN));then pass "SPACE_$LABEL";else block "INSUFFICIENT_SPACE_$LABEL";fi
 done
fi
IMAGE="${LH_GLPK_IMAGE_ID:-}"
if [[ "$IMAGE" =~ ^sha256:[a-f0-9]{64}$ ]];then
 pass IMMUTABLE_IMAGE_ID_FORMAT
 if command -v podman >/dev/null 2>&1;then
  if [[ "$(podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null)" == true ]];then pass ROOTLESS_PODMAN;else block ROOTLESS_PODMAN_UNAVAILABLE;fi
  # Podman exposes .Id as 64 bare hex characters; the operator pin stays sha256:hex.
  RAW_IMAGE_ID="${IMAGE#sha256:}"
  if [[ "$(podman image inspect --format '{{.Id}}' "$RAW_IMAGE_ID" 2>/dev/null)" == "$RAW_IMAGE_ID" ]];then pass PINNED_IMAGE_LOCAL;else block PINNED_IMAGE_NOT_PRESENT;fi
 fi
else
 block LH_GLPK_IMAGE_ID_NOT_EXACT
fi
CHROME="${LH_R14_CHROMIUM:-}"
if [[ "$CHROME" == /* && -x "$CHROME" ]];then pass EXECUTABLE_CHROMIUM;else block CHROMIUM_ABSOLUTE_EXECUTABLE_REQUIRED;fi
PORT="${LH_R14_FINAL_PORT:-33770}"
if [[ "$PORT" =~ ^[0-9]{4,5}$ ]] && ((10#$PORT>=1024&&10#$PORT<=65535));then
 pass VALID_LOCAL_PORT
 if command -v node >/dev/null 2>&1;then
  if node --input-type=module - "$PORT" <<'JS'
import net from 'node:net';
const port=Number(process.argv[2]);
const server=net.createServer();
server.once('error',()=>{process.exitCode=2;});
server.listen({host:'127.0.0.1',port,exclusive:true},()=>server.close());
JS
  then pass LOCAL_PORT_FREE;else block LOCAL_PORT_IN_USE;fi
 fi
else
 block INVALID_LOCAL_PORT
fi
if (( RESULT == 0 )); then echo 'R14Z_PREFLIGHT=PASS_NO_MUTATION';else echo 'R14Z_PREFLIGHT=BLOCKED_NO_MUTATION';fi
exit "$RESULT"
