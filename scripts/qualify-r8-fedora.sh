#!/usr/bin/env bash
# LearnHarness R8 pinned qualification. No sudo, force pushes or GitHub Actions.
set -Eeuo pipefail
umask 077
EXPECTED='24dcfccf412544ecd3b65d4cba0fb8116a699186'
BRANCH='pilot/operations-research-r1'
URL='https://github.com/PeterxVarga/learnharness.git'
[[ "${1:-}" == '--help' ]] && { echo 'Usage: bash qualify-r8-fedora.sh [--offline-only]'; echo 'Default: pinned clone + offline 147 + npm ci/test/typecheck/build + native GLPK (if installed).'; exit 0; }
[[ $# == 0 || ( $# == 1 && "$1" == '--offline-only' ) ]] || { echo 'BLOCKED_UNKNOWN_OPTIONS'; exit 2; }
for c in git node; do command -v "$c" >/dev/null || { echo "BLOCKED_MISSING_COMMAND=$c"; exit 2; }; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22 || (a===22&&b<16))process.exit(2)' || { echo 'BLOCKED_NODE_REQUIRES_22_16'; exit 2; }
[[ "${1:-}" == '--offline-only' ]] || command -v npm >/dev/null || { echo 'BLOCKED_MISSING_NPM'; exit 2; }
mkdir -p "$HOME/Downloads"
RUN_DIR="$(mktemp -d "$HOME/Downloads/learnharness-r8-XXXXXXXX")"
echo "R8_RUN_DIR=$RUN_DIR"
git clone --quiet --no-checkout --single-branch --branch "$BRANCH" "$URL" "$RUN_DIR/repo" || { echo 'BLOCKED_PINNED_CLONE_FAILED'; exit 2; }
cd "$RUN_DIR/repo"
git checkout --quiet --detach "$EXPECTED" || { echo 'BLOCKED_PINNED_COMMIT_MISSING'; exit 2; }
[[ "$(git rev-parse HEAD)" == "$EXPECTED" ]] || { echo 'BLOCKED_SHA_MISMATCH'; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo 'BLOCKED_DIRTY_PINNED_REPO'; exit 2; }
ARGS=(--repo "$RUN_DIR/repo" --output "$RUN_DIR/evidence")
if [[ "${1:-}" != '--offline-only' ]]; then ARGS+=(--full-build --native); fi
set +e
NODE_OPTIONS='' node pilots/operations-research/qualify-r8.mjs "${ARGS[@]}" > "$RUN_DIR/summary.json" 2> "$RUN_DIR/stderr.log"
RESULT=$?
set -e
cat "$RUN_DIR/summary.json"
echo "R8_RECEIPT=$RUN_DIR/evidence/r8-receipt.json"
echo "R8_GIT_SHA=$(git rev-parse HEAD)"
if [[ "$RESULT" -eq 0 ]]; then echo 'R8_ALL_GATES=PASS'; else echo 'R8_ALL_GATES=NOT_QUALIFIED'; fi
exit "$RESULT"
