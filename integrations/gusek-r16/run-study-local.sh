#!/usr/bin/env bash
# R16.20 owner-started, loopback-only study pilot. No auto-run or deploy.
set -Eeuo pipefail
umask 077

[[ "$(printenv LH_OWNER_APPROVED_LOCAL_PILOT 2>/dev/null || :)" == "YES" ]] || {
  echo "BLOCKED_OWNER_PILOT_APPROVAL: explicit local-only risk acceptance required" >&2
  exit 2
}
[[ $# -ge 1 && $# -le 2 ]] || {
  echo "Usage: LH_OWNER_APPROVED_LOCAL_PILOT=YES bash run-study-local.sh /absolute/assembled [port]" >&2
  exit 2
}
[[ "$1" = /* ]] || { echo "BLOCKED_NONABSOLUTE_APP_PATH" >&2; exit 2; }
APP="$(realpath -- "$1")"
PORT=37417
if [[ $# -eq 2 ]]; then PORT="$2"; fi
[[ "$PORT" =~ ^[0-9]{4,5}$ && "$PORT" -ge 1025 && "$PORT" -le 65535 ]] || {
  echo "BLOCKED_INVALID_PORT" >&2; exit 2
}
[[ -f "$APP/.next/BUILD_ID" && -f "$APP/node_modules/next/dist/bin/next" ]] || {
  echo "BLOCKED_INCOMPLETE_TESTED_BUILD" >&2; exit 2
}
BUNDLE="$(cd -- "$(dirname -- "$0")" && pwd -P)"
SEC="$HOME/Downloads/lh-r1613-final-yx5WP7Ap/security-repo"
if [[ -v LH_SECURITY_REPO ]]; then SEC="$LH_SECURITY_REPO"; fi
[[ -d "$SEC" ]] || { echo "BLOCKED_SECURITY_CHECKOUT_MISSING" >&2; exit 2; }
python3 "$BUNDLE/r1613-security-upstream.py" verify --security-repo "$SEC" --candidate "$(dirname -- "$APP")" --post-build > /dev/null
python3 - "$APP" <<'PY'
from pathlib import Path
import json,sys
app=Path(sys.argv[1])
receipt=json.loads((app.parent/"evidence/assembly.json").read_text())
assert receipt["profile"]=="workbench"
assert receipt["upstream_sha"]=="80f225d1fe16483b8e018b51dbfef4465262156e"
assert receipt["r15_sha"]=="9b7f374f4003276e67a96feb070124c244447aec"
assert receipt["core_files_overwritten"]==0
assert receipt["native_glpk_enabled_by_r16"] is False
PY

STATE="$HOME/.local/state/learnharness-gusek-study"
if [[ -v XDG_STATE_HOME ]]; then STATE="$XDG_STATE_HOME/learnharness-gusek-study"; fi
mkdir -p -- "$STATE"
chmod 700 -- "$STATE"
export LH_DATA_DIR="$STATE/data"
export LH_AUTH_FILE="$STATE/auth.json"
export LH_GLPK_ENABLE_LOCAL=0
unset LH_GLPK_IMAGE_ID LH_GLPK_RUN_TOKEN
export NEXT_TELEMETRY_DISABLED=1
echo "R1620_LOCAL_STUDY_SOURCE=PASS"
echo "LOCAL_URL=http://127.0.0.1:$PORT/pilot/gusek/szakmai"
echo "DATA_SCOPE=isolated local study directory"
echo "SOURCE_SCOPE=R16.10 internal primers; earlier PDF lecture notes not imported"
echo "Stop with Ctrl+C. No model is configured automatically."
cd -- "$APP"
exec node "$APP/node_modules/next/dist/bin/next" start --hostname 127.0.0.1 --port "$PORT"
