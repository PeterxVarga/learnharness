#!/usr/bin/env python3
"""Fail-closed reconciliation of a prior R16.12 Node 26 run, without rerunning npm.

This is a SEPARATE, unsigned evidence receipt. It cannot retroactively mark the
original runner (which exited 3) as successful or authorize release/merge.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys

UP = 'e69e85269c064c6c9c49a8b06ae78c06e79c4a63'
R15 = '9b7f374f4003276e67a96feb070124c244447aec'
HTTP = 'R16_HTTP=PASS_TASK_GRADE_ASSISTED_REJECTED_BAD_MODEL_BAD_SEED_NATIVE_ABSENT_UI'
RECEIPT_NAME = 'r16.12-reconciled-technical-evidence.json'

class Blocked(RuntimeError):
    pass


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def exact_line(lines: list[str], value: str, from_at: int = 0) -> int:
    for idx in range(from_at, len(lines)):
        if lines[idx].strip() == value:
            return idx
    raise Blocked(f'LOG_REQUIRED_MARKER_MISSING: {value}')


def unique_line(lines: list[str], value: str, from_at: int = 0) -> int:
    hits = [i for i, line in enumerate(lines) if i >= from_at and line.strip() == value]
    if len(hits) != 1:
        raise Blocked(f'LOG_MARKER_NOT_UNIQUE: {value} count={len(hits)}')
    return hits[0]


def git(repo: Path, *args: str) -> str:
    if not repo.is_dir() or repo.is_symlink():
        raise Blocked('PINNED_SOURCE_REPOSITORY_MISSING')
    proc = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True, check=False)
    if proc.returncode:
        raise Blocked('SOURCE_GIT_CHECK_FAILED')
    return proc.stdout.strip()


def checked_log(log: bytes, workspace: Path) -> dict:
    try:
        lines = log.decode('utf-8', errors='strict').splitlines()
    except UnicodeDecodeError as exc:
        raise Blocked('LOG_NOT_UTF8') from exc
    if len(lines) < 100:
        raise Blocked('LOG_TOO_SHORT')
    if not any(re.fullmatch(r'NODE=v26\.[0-9.]+ NPM=\S+ PYTHON=Python \d+\.\d+.*', x.strip()) for x in lines):
        raise Blocked('UNSUPPORTED_NODE_FOR_THIS_EVIDENCE')
    exact_line(lines, f'WORKSPACE={workspace}')
    before = 0
    for expected in (
        '===== 1/5: clone exact source histories in isolated workspace =====',
        f'PINNED_UPSTREAM={UP}',
        f'PINNED_R15={R15}',
        '===== 2/5: freeze and verify private add-on pack =====',
        'R16_PORTABLE_PACK=PASS',
        'R16_PACK_INTEGRITY=PASS_167_SOURCE_FILES',
        '===== 3/5: assemble workbench against upstream 0.4.1 =====',
        'R16_PORTABLE_ASSEMBLY=PASS_SOURCE_ONLY',
        '===== 4/5: one combined npm/Next.js/GUSEK/HTTP qualification =====',
        'R16_SCOPE=PASS_55',
        '> learnharness@0.4.1 lint',
        '> eslint .',
        '> learnharness@0.4.1 typecheck',
        '> tsc --noEmit',
        '> learnharness@0.4.1 test',
    ):
        before = exact_line(lines, expected, before) + 1
    npm_start = before - 1
    # A complete successful node:test TAP summary is required before build.
    build_at = unique_line(lines, '> learnharness@0.4.1 build', npm_start)
    segment = lines[npm_start:build_at]
    def one_summary(field: str) -> int:
        values = [int(m.group(1)) for line in segment if (m := re.fullmatch(r'# '+field+r'\s+(\d+)\s*', line.strip()))]
        if len(values) != 1:
            raise Blocked('NPM_TEST_SUMMARY_MISSING_OR_AMBIGUOUS: ' + field)
        return values[0]
    total, passed, failed = (one_summary(field) for field in ('tests', 'pass', 'fail'))
    if not (total >= 3000 and passed == total and failed == 0):
        raise Blocked(f'NPM_TEST_NOT_ALL_PASS: tests={total} pass={passed} fail={failed}')
    if any(re.match(r'^not ok\s+\d+\b', line.strip()) for line in segment):
        raise Blocked('NPM_TEST_HAS_NOT_OK')
    after_build = exact_line(lines, '> next build', build_at + 1)
    http_at = unique_line(lines, HTTP, after_build)
    final_block_at = unique_line(lines, 'R16_BLOCKED: ASSEMBLED_FILE_TAMPER: next-env.d.ts', http_at)
    final_status_at = unique_line(lines, 'R16_REAL_CODE_QUALIFICATION=FAIL_OR_BLOCKED exit=3', final_block_at)
    if any(line.startswith('R16_BLOCKED:') and i != final_block_at for i, line in enumerate(lines)):
        raise Blocked('OTHER_R16_BLOCKER_IN_LOG')
    if any(re.match(r'R16_REAL_CODE_QUALIFICATION=', line) and i != final_status_at for i, line in enumerate(lines)):
        raise Blocked('AMBIGUOUS_RUN_OUTCOME')
    if any(x == '===== 5/5: verify receipts and pristine source checkouts =====' for x in lines):
        raise Blocked('PRIOR_RUN_REACHED_UNEXPECTED_FINAL_STAGE')
    return {'nodeMajor': 26, 'npmTests': total, 'npmPassed': passed,
            'npmFailed': failed, 'httpResult': HTTP,
            'originalExitCode': 3,
            'originalFinalFailure': 'postbuild_next_env_exact_rewrite_not_allowlisted'}


def reconcile(workspace: Path, verifier: Path, write: bool = False) -> dict:
    workspace = workspace.resolve(strict=True)
    if workspace.is_symlink() or not workspace.is_dir():
        raise Blocked('UNSAFE_WORKSPACE')
    candidate = workspace / 'candidate'
    log = workspace / 'qualification.log'
    if not (log.is_file() and not log.is_symlink()):
        raise Blocked('MISSING_QUALIFICATION_LOG')
    original = candidate / 'evidence' / 'qualification.json'
    if original.exists() or original.is_symlink():
        raise Blocked('EXISTING_OFFICIAL_QUALIFICATION_RECEIPT')
    for folder, pin in [('upstream', UP), ('r15-fork', R15)]:
        repo = workspace / folder
        if git(repo, 'rev-parse', 'HEAD') != pin or git(repo, 'status', '--porcelain=v1'):
            raise Blocked('PINNED_REPO_DRIFT: ' + folder)
    # Reuse the existing full SHA256 inventory, pack and namespaced overlay checks.
    spec = importlib.util.spec_from_file_location('r16_reconcile_verifier', verifier)
    if spec is None or spec.loader is None:
        raise Blocked('VERIFIER_UNAVAILABLE')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.verify_assembly(candidate, allow_build_artifacts=True)
    receipt_data = json.loads((candidate / 'evidence' / 'assembly.json').read_text())
    if not (receipt_data['upstream_sha'] == UP
            and receipt_data['r15_sha'] == R15
            and receipt_data['profile'] == 'workbench'
            and receipt_data['native_glpk_enabled_by_r16'] is False
            and receipt_data['core_files_overwritten'] == 0
            and receipt_data['upstream_tracked_file_count'] == 712
            and receipt_data['new_path_count'] == 55):
        raise Blocked('ASSEMBLY_SCOPE_NOT_PINNED')
    log_data = log.read_bytes()
    status = checked_log(log_data, workspace)
    result = {
        'schema': 'tredven.learnharness.r16.12.reconciled-evidence.v1',
        'result': 'TECHNICAL_GATES_RECONCILED_FROM_EXISTING_RUN',
        'originalRunnerResult': 'FAIL_OR_BLOCKED_EXIT_3',
        'sourceGates': 'verified_by_pinned_sha256_inventory',
        'testGates': 'prior_log_fail_closed_review',
        'postBuildIntegrity': 'PASS_EXACT_NEXT_GENERATED_REWRITE',
        'notAnOfficialR16QualificationReceipt': True,
        'signedAttestation': False, 'releaseApproved': False, 'mergeApproved': False,
        'workspaceName': workspace.name,
        'upstreamSha': UP, 'r15Sha': R15,
        'logSha256': sha(log_data),
        'assemblyReceiptSha256': sha((candidate / 'evidence' / 'assembly.json').read_bytes()),
        'verifierSha256': sha(verifier.read_bytes()),
        'packageLockSha256': sha((candidate/'assembled/package-lock.json').read_bytes()),
        'gates': status,
        'notProven': ['official-runner-exit-zero', 'independent-review',
                      'native-GLPK', 'Chromium-visual', 'dependency-advisory-triage',
                      'release-approval'],
        'observedAtUtc': datetime.now(timezone.utc).isoformat(),
    }
    if write:
        dest = candidate / 'evidence' / RECEIPT_NAME
        data = (json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False) + '\n').encode('utf-8')
        fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(fd, 'wb') as output:
                output.write(data)
                output.flush()
                os.fsync(output.fileno())
        except Exception:
            dest.unlink(missing_ok=True)
            raise
        print('R16_RECONCILIATION_RECEIPT=' + str(dest))
    print('R16_RECONCILED_TECHNICAL_GATES=PASS_NOT_OFFICIAL_RUNNER_PASS')
    print('R16_MERGE_RELEASE=NO_GO')
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', required=True, type=Path)
    parser.add_argument('--write', action='store_true', help='Write a separate, one-shot, non-official evidence receipt.')
    args = parser.parse_args()
    try:
        reconcile(args.workspace, Path(__file__).with_name('r16.py'), args.write)
    except Exception as e:
        print('R16_RECONCILIATION_BLOCKED: ' + str(e), file=sys.stderr)
        raise SystemExit(3) from e

if __name__ == '__main__':
    main()
