#!/usr/bin/env python3
"""R16.13: pin and independently verify reviewed dependency-only upstream.

A narrow preflight for the existing r16.py portable assembler. No new
assembler, source rewrites, npm install, network calls or release authority.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile

OFFICIAL = 'e69e85269c064c6c9c49a8b06ae78c06e79c4a63'
SECURITY = '80f225d1fe16483b8e018b51dbfef4465262156e'
FILENAMES = {'package.json', 'package-lock.json'}
REQUIRED_VERSIONS = {
    'node_modules/dompurify': '3.4.17',
    'node_modules/linkify-it': '5.0.2',
    'node_modules/puppeteer-core': '25.16.0',
    'node_modules/chromium-bidi': '157.0.8090-0',
    'node_modules/source-map-js': '1.2.2',
    'node_modules/undici': '7.30.1',
    'node_modules/zod': '4.6.7',
    'node_modules/fast-uri': '3.1.9',
}


class Blocked(Exception):
    pass


def git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(['git', '-C', str(repo), *args],
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise Blocked(f'GIT_FAILED: {args[:2]} (exit={result.returncode})')
    return result.stdout


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def decode_json(data: bytes, label: str) -> dict:
    value = json.loads(data)
    if not isinstance(value, dict):
        raise Blocked(f'INVALID_JSON_OBJECT: {label}')
    return value


def source_gate(repo: Path, *, base: str = OFFICIAL, head: str = SECURITY,
                expected_changes: int = 33,
                required_versions: dict[str, str] | None = None) -> None:
    repo = repo.resolve(strict=True)
    if git(repo, 'rev-parse', 'HEAD').decode().strip() != head:
        raise Blocked('SECURITY_HEAD_DRIFT')
    if git(repo, 'status', '--porcelain=v1', '-z', '--untracked-files=all'):
        raise Blocked('SECURITY_WORKTREE_NOT_CLEAN')
    git(repo, 'merge-base', '--is-ancestor', base, head)
    changed = set(filter(None, git(repo, 'diff', '--no-renames', '--name-only', '-z',
                                   base, head).decode().split('\0')))
    if changed != FILENAMES:
        raise Blocked(f'SECURITY_DIFF_SCOPE: {sorted(changed)}')

    old = decode_json(git(repo, 'show', f'{base}:package.json'), 'base package')
    new = decode_json(git(repo, 'show', f'{head}:package.json'), 'security package')
    expected = dict(old)
    expected['overrides'] = {
        **old.get('overrides', {}),
        'ansi-to-react': {'linkify-it': '5.0.2'},
    }
    if new != expected:
        raise Blocked('PACKAGE_JSON_NOT_SCOPED_OVERRIDE_ONLY')

    before = decode_json(git(repo, 'show', f'{base}:package-lock.json'), 'base lock')
    after = decode_json(git(repo, 'show', f'{head}:package-lock.json'), 'security lock')
    if {k: v for k, v in before.items() if k != 'packages'} != {
            k: v for k, v in after.items() if k != 'packages'}:
        raise Blocked('LOCKFILE_HEADER_CHANGED')
    a, b = before['packages'], after['packages']
    if a.get('') != b.get(''):
        raise Blocked('LOCKFILE_ROOT_CHANGED')
    changed_paths = [p for p in set(a) | set(b) if a.get(p) != b.get(p)]
    if len(changed_paths) != expected_changes:
        raise Blocked(f'LOCKFILE_CHANGED_ENTRIES: {len(changed_paths)}')
    for p in changed_paths:
        old_record, new_record = a.get(p), b.get(p)
        if old_record is None:
            raise Blocked(f'LOCKFILE_ADDED_PACKAGE: {p}')
        if new_record is None:
            continue  # Removal of obsolete nested dependency only.
        if old_record.get('version') == new_record.get('version'):
            raise Blocked(f'UNCHANGED_VERSION_METADATA_DRIFT: {p}')
        if new_record.get('hasInstallScript') != old_record.get('hasInstallScript'):
            raise Blocked(f'INSTALL_SCRIPT_CHANGE: {p}')
        if not new_record.get('resolved', '').startswith('https://registry.npmjs.org/'):
            raise Blocked(f'UNKNOWN_REGISTRY: {p}')
        if not new_record.get('integrity', '').startswith('sha512-'):
            raise Blocked(f'INVALID_INTEGRITY: {p}')
    for path, version in (REQUIRED_VERSIONS if required_versions is None
                          else required_versions).items():
        if b.get(path, {}).get('version') != version:
            raise Blocked(f'REQUIRED_SECURITY_VERSION_MISMATCH: {path}')


def git_inventory(repo: Path, head: str) -> dict[str, str]:
    data = git(repo, 'archive', '--format=tar', head)
    result: dict[str, str] = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as archive:
        for member in archive.getmembers():
            if member.isdir():
                continue
            if not member.isfile() or member.name in result:
                raise Blocked('SECURITY_ARCHIVE_UNSAFE_ENTRY')
            result[member.name] = digest(archive.extractfile(member).read())
    return result


def candidate_gate(repo: Path, candidate: Path, head: str = SECURITY,
                   *, post_build: bool = False) -> None:
    candidate = candidate.resolve(strict=True)
    r16 = Path(__file__).with_name('r16.py')
    args = [sys.executable, str(r16), 'verify-assembly', '--path', str(candidate)]
    if post_build:
        args.append('--post-build')
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode:
        raise Blocked('R16_VERIFY_ASSEMBLY_FAILED: ' + result.stderr[-350:])
    ev = decode_json((candidate / 'evidence/assembly.json').read_bytes(), 'assembly')
    inv = decode_json((candidate / 'evidence/upstream-files.json').read_bytes(), 'inventory')
    if (ev.get('upstream_sha') != head or inv.get('upstream_sha') != head
            or ev.get('profile') != 'workbench'
            or ev.get('native_glpk_enabled_by_r16') is not False
            or ev.get('native_route_installed') is not False
            or ev.get('status') != 'ASSEMBLED_UNQUALIFIED'):
        raise Blocked('SECURITY_ASSEMBLY_CONTRACT_MISMATCH')
    if inv.get('files') != git_inventory(repo, head):
        raise Blocked('EXTERNAL_GIT_SOURCE_INVENTORY_MISMATCH')
    print(result.stdout.strip())
    print('R16_13_EXTERNAL_SOURCE_INVENTORY=PASS')


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('command', choices=('assemble', 'verify'))
    p.add_argument('--security-repo', type=Path, required=True)
    p.add_argument('--addon-pack', type=Path)
    p.add_argument('--out', type=Path)
    p.add_argument('--candidate', type=Path)
    p.add_argument('--post-build', action='store_true')
    args = p.parse_args()
    try:
        source_gate(args.security_repo)
        if args.command == 'assemble':
            if args.addon_pack is None or args.out is None or args.candidate or args.post_build:
                raise Blocked('INVALID_ASSEMBLE_ARGUMENTS')
            command = [sys.executable, str(Path(__file__).with_name('r16.py')),
                       'assemble-pack', '--upstream', str(args.security_repo),
                       '--upstream-ref', SECURITY, '--addon-pack', str(args.addon_pack),
                       '--profile', 'workbench', '--out', str(args.out)]
            subprocess.run(command, check=True)
            candidate_gate(args.security_repo, args.out)
            print('R16_13_SECURITY_ASSEMBLY=PASS_SOURCE_ONLY')
        else:
            if args.candidate is None or args.addon_pack or args.out:
                raise Blocked('INVALID_VERIFY_ARGUMENTS')
            candidate_gate(args.security_repo, args.candidate, post_build=args.post_build)
            print('R16_13_SECURITY_VERIFY=PASS_SOURCE_ONLY')
        print('MERGE_RELEASE=NO_GO')
    except (Blocked, OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(f'R16_13_BLOCKED: {exc}', file=sys.stderr)
        sys.exit(3)


if __name__ == '__main__':
    main()
