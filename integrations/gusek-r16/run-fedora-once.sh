#!/usr/bin/env bash
# R16.12: one owner-initiated, isolated Fedora source+Next.js qualification.
# No pushes, merges, deployments, edits to existing repos or native GLPK runs.
set -Eeuo pipefail
umask 077

UP_SHA='e69e85269c064c6c9c49a8b06ae78c06e79c4a63'
R15_SHA='9b7f374f4003276e67a96feb070124c244447aec'
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
[[ -f "$SCRIPT_DIR/r16.py" && -f "$SCRIPT_DIR/qualify-r16.sh" && -f "$SCRIPT_DIR/SHA256SUMS" ]] || {
  printf '%s\n' 'BLOCKED_INCOMPLETE_R1612_BUNDLE' >&2; exit 2;
}
command -v git >/dev/null && command -v unzip >/dev/null && command -v sha256sum >/dev/null &&
command -v python3 >/dev/null && command -v node >/dev/null && command -v npm >/dev/null || {
  printf '%s\n' 'BLOCKED_PREREQUISITES: git unzip sha256sum python3 node npm required' >&2; exit 2;
}
python3 - <<'PY_VERSION'
import sys
assert sys.version_info >= (3,10), f'Python 3.10+ required: {sys.version}'
PY_VERSION
node -e 'const v=process.versions.node.split(".").map(Number); if(v[0]<20 || v[0]===20&&v[1]<9) { console.error("BLOCKED_NODE_VERSION: need Node 20.9+ (prefer 22+), got",process.version); process.exit(2); }'
(
  cd "$SCRIPT_DIR"
  sha256sum -c SHA256SUMS >/dev/null
)

mkdir -p -- "$HOME/Downloads"
BASE="$(mktemp -d "$HOME/Downloads/learnharness-r1612-real-XXXXXXXX")"
LOG="$BASE/qualification.log"
exec > >(tee -a "$LOG") 2>&1
finish() {
  result=$?
  trap - EXIT
  printf '\n===== R16.12 result =====\n'
  if [[ $result == 0 ]]; then
    printf '%s\n' 'R16_REAL_CODE_QUALIFICATION=PASS_NOT_RELEASE_APPROVAL'
  else
    printf '%s\n' "R16_REAL_CODE_QUALIFICATION=FAIL_OR_BLOCKED exit=$result"
  fi
  printf 'LOG=%s\n' "$LOG"
  printf 'WORKSPACE=%s\n' "$BASE"
  printf 'QUALIFICATION_RECEIPT=%s\n' "$BASE/candidate/evidence/qualification.json"
  printf '%s\n' 'Do not merge/deploy; review real logs and qualification receipt first.'
  exit "$result"
}
trap finish EXIT
printf 'R16_12_OWNER_RUN_START=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf 'WORKSPACE=%s\n' "$BASE"
printf 'NODE=%s NPM=%s PYTHON=%s\n' "$(node --version)" "$(npm --version)" "$(python3 --version)"

# Work strictly inside a newly generated output folder, never within user repos.
UP="$BASE/upstream"
FORK="$BASE/r15-fork"
PACK="$BASE/addon-pack"
TARGET="$BASE/candidate"
export GIT_TERMINAL_PROMPT=0
export NEXT_TELEMETRY_DISABLED=1
export LH_GLPK_ENABLE_LOCAL=0
unset LH_GLPK_IMAGE_ID LH_GLPK_RUN_TOKEN
# Do not accidentally load/write any existing LearnHarness account or lesson data.
export LH_DATA_DIR="$BASE/test-only-lh-data"
export LH_AUTH_FILE="$BASE/test-only-lh-auth.json"

printf '\n===== 1/5: clone exact source histories in isolated workspace =====\n'
git clone --quiet --filter=blob:none --single-branch --branch main \
  https://github.com/amosblomqvist/learnharness.git "$UP"
git -C "$UP" checkout --quiet --detach "$UP_SHA"
git clone --quiet --filter=blob:none --single-branch --branch pilot/operations-research-r15 \
  https://github.com/PeterxVarga/learnharness.git "$FORK"
git -C "$FORK" checkout --quiet --detach "$R15_SHA"
[[ "$(git -C "$UP" rev-parse HEAD)" == "$UP_SHA" ]] || { echo 'BLOCKED_WRONG_UPSTREAM_SHA'; exit 3; }
[[ "$(git -C "$FORK" rev-parse HEAD)" == "$R15_SHA" ]] || { echo 'BLOCKED_WRONG_R15_SHA'; exit 3; }
[[ -z "$(git -C "$UP" status --porcelain=v1)" && -z "$(git -C "$FORK" status --porcelain=v1)" ]] || { echo 'BLOCKED_SOURCE_DIRTY'; exit 3; }
printf 'PINNED_UPSTREAM=%s\nPINNED_R15=%s\n' "$UP_SHA" "$R15_SHA"

printf '\n===== 2/5: freeze and verify private add-on pack =====\n'
python3 "$SCRIPT_DIR/r16.py" freeze-pack --r15 "$FORK" --out "$PACK"
python3 "$SCRIPT_DIR/r16.py" verify-pack --path "$PACK"

printf '\n===== 3/5: assemble workbench against upstream 0.4.1 =====\n'
python3 "$SCRIPT_DIR/r16.py" assemble-pack --upstream "$UP" \
  --addon-pack "$PACK" --upstream-ref "$UP_SHA" --profile workbench --out "$TARGET"
python3 "$SCRIPT_DIR/r16.py" verify-assembly --path "$TARGET"

printf '\n===== 4/5: one combined npm/Next.js/GUSEK/HTTP qualification =====\n'
bash "$SCRIPT_DIR/qualify-r16.sh" "$TARGET"

printf '\n===== 5/5: verify receipts and pristine source checkouts =====\n'
python3 "$SCRIPT_DIR/r16.py" verify-qualification --path "$TARGET"
[[ "$(git -C "$UP" rev-parse HEAD)" == "$UP_SHA" && -z "$(git -C "$UP" status --porcelain=v1)" ]] || { echo 'BLOCKED_UPSTREAM_CHANGED'; exit 3; }
[[ "$(git -C "$FORK" rev-parse HEAD)" == "$R15_SHA" && -z "$(git -C "$FORK" status --porcelain=v1)" ]] || { echo 'BLOCKED_R15_CHANGED'; exit 3; }
printf '%s\n' 'SOURCE_REPOS_UNMODIFIED=PASS' 'RELEASE=NO_GO_PENDING_INDEPENDENT_REVIEW_AND_BROWSER_GLKP'
