#!/usr/bin/env bash
# R10 explicit SHA-pinned Fedora qualification. No sudo, no GitHub Actions, no .mod execution.
set -Eeuo pipefail
umask 077
BRANCH='pilot/operations-research-r1'
URL='https://github.com/PeterxVarga/learnharness.git'
[[ $# == 1 || $# == 2 ]] || { echo 'Usage: bash qualify-release-r10-fedora.sh EXACT_SHA [--offline-only]'; exit 2; }
PIN="$1"
[[ "$PIN" =~ ^[a-f0-9]{40}$ ]] || { echo 'BLOCKED_EXACT_COMMIT_SHA_REQUIRED'; exit 2; }
[[ $# == 1 || "$2" == '--offline-only' ]] || { echo 'BLOCKED_UNKNOWN_OPTION'; exit 2; }
for cmd in git node; do command -v "$cmd" >/dev/null || { echo "BLOCKED_MISSING=$cmd"; exit 2; }; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22 || (a===22&&b<16))process.exit(2)' || { echo 'BLOCKED_NODE_REQUIRES_22_16'; exit 2; }
[[ "${2:-}" == '--offline-only' ]] || command -v npm >/dev/null || { echo 'BLOCKED_MISSING=npm'; exit 2; }
mkdir -p "$HOME/Downloads"
RUN_DIR="$(mktemp -d "$HOME/Downloads/learnharness-r10-XXXXXXXX")"
echo "R10_RUN_DIR=$RUN_DIR"
git clone --quiet --no-checkout --single-branch --branch "$BRANCH" "$URL" "$RUN_DIR/repo" || { echo 'BLOCKED_CLONE_UNAVAILABLE'; exit 2; }
cd "$RUN_DIR/repo"
git checkout --quiet --detach "$PIN" || { echo 'BLOCKED_COMMIT_NOT_FETCHED'; exit 2; }
[[ "$(git rev-parse HEAD)" == "$PIN" ]] || { echo 'BLOCKED_PIN_MISMATCH'; exit 2; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo 'BLOCKED_DIRTY_SOURCE'; exit 2; }
ARGS=(--repo "$RUN_DIR/repo" --expected-head "$PIN" --output "$RUN_DIR/evidence")
if [[ "${2:-}" != '--offline-only' ]]; then ARGS+=(--full-build --native); fi
set +e
NODE_OPTIONS='' node pilots/operations-research/qualify-release-r10.mjs "${ARGS[@]}" > "$RUN_DIR/summary.json" 2> "$RUN_DIR/stderr.log"
result=$?
set -e
cat "$RUN_DIR/summary.json"
echo "R10_RECEIPT=$RUN_DIR/evidence/r10-receipt.json"
echo "R10_GIT_SHA=$PIN"
if [[ "$result" -eq 0 ]]; then echo 'R10_ALL_GATES=PASS'; else echo 'R10_ALL_GATES=NOT_QUALIFIED'; fi
exit "$result"
