#!/usr/bin/env bash
# Owner-only local wrapper, rootless, readonly dependencies, no copy/install.
set -Eeuo pipefail
umask 077

[[ "$(printenv LH_OWNER_APPROVED_LOCAL_PILOT 2>/dev/null || :)" == "YES" ]] || {
  echo "BLOCKED_OWNER_PILOT_APPROVAL: explicit local-only risk acceptance required" >&2
  exit 2
}
[[ "$#" -eq 2 || "$#" -eq 3 ]] || {
  echo "Usage: LH_OWNER_APPROVED_LOCAL_PILOT=YES bash run-study-local-bwrap.sh /absolute/assembled /absolute/prequalified/assembled [port]" >&2
  exit 2
}
[[ "$1" = /* && "$2" = /* ]] || { echo BLOCKED_NONABSOLUTE_PATH >&2;exit 2; }
APP="$(realpath -- "$1")"
PREQUALIFIED="$(realpath -- "$2")"
PORT=37417
if [[ "$#" -eq 3 ]];then PORT="$3";fi
[[ "$PORT" =~ ^[0-9]{4,5}$ && "$PORT" -ge 1025 && "$PORT" -le 65535 ]] || {
 echo BLOCKED_INVALID_PORT >&2;exit 2;
}
command -v bwrap >/dev/null || { echo BLOCKED_BWRAP_MISSING >&2;exit 2; }
[[ -d "$APP/node_modules" && ! -L "$APP/node_modules" ]] || { echo BLOCKED_MOUNTPOINT_NOT_DIRECTORY >&2;exit 2; }
[[ -z "$(ls -A -- "$APP/node_modules")" ]] || { echo BLOCKED_MOUNTPOINT_NOT_EMPTY >&2;exit 2; }
[[ -f "$APP/.next/BUILD_ID" && -f "$APP/package-lock.json" &&
   -f "$PREQUALIFIED/package-lock.json" && -f "$PREQUALIFIED/node_modules/next/dist/bin/next" ]] || {
 echo BLOCKED_INCOMPLETE_BUILD_OR_DEPS >&2;exit 2;
}
cmp -s "$APP/package-lock.json" "$PREQUALIFIED/package-lock.json" || {
 echo BLOCKED_LOCKFILE_DRIFT >&2;exit 2;
}
BUNDLE="$(cd -- "$(dirname -- "$0")" && pwd -P)"
# The canonical launcher retains owner approval, security receipt/source checks,
# loopback-only binding, and isolated, no-GLPK student data.
exec bwrap --bind / / --ro-bind "$PREQUALIFIED/node_modules" "$APP/node_modules" \
 --proc /proc --dev-bind /dev /dev --chdir "$APP" \
 /usr/bin/bash "$BUNDLE/run-study-local.sh" "$APP" "$PORT"
