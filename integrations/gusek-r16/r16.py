#!/usr/bin/env python3
"""R16: reproducible read-only extraction and fail-closed upstream overlay.

Requires only Python 3.10+, Git, existing local repositories. No network, npm,
GitHub writes, production execution, or change to source repositories.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from datetime import datetime, timezone

BASE = '3dc88472eea41eed0d5e5f29c2f16f8d063c415b'
R15 = '9b7f374f4003276e67a96feb070124c244447aec'
R16_VERSION = 'r16.12'
ROUTE = 'app/api/pilot/gusek/route.ts'
ROOTS = (
    ROUTE,
    'pilots/operations-research/adaptive-practice-r15.mjs',
    'pilots/operations-research/adaptive-diagnostics-r15b.mjs',
    'pilots/operations-research/adaptive-sequence-r15c.mjs',
    'pilots/operations-research/gusek-r13.test.mjs',
    'pilots/operations-research/adaptive-practice-r15.test.mjs',
    'pilots/operations-research/adaptive-sequence-r15c.test.mjs',
)
BUNDLE_ROOT = Path(__file__).resolve().parent
OVERLAY_ROOT = BUNDLE_ROOT / 'overlay'
WORKBENCH_OVERLAY = BUNDLE_ROOT / 'overlay-workbench'
ALLOWED_OVERLAY = {'app/pilot/gusek/page.tsx', 'components/tredven-gusek-standalone.tsx', 'src/tredven/gusek/attempt-receipt-r15.ts'}
WORKBENCH_OVERLAY_PATHS = {'app/pilot/gusek/page.tsx', 'src/tredven/gusek/attempt-receipt-r15.ts',
    'components/tredven-teaching-handoff.tsx',
    'learning/teaching-handoff-r168.mjs', 'learning/teaching-handoff-r168.test.mjs',
    'learning/public-task-context-r169.mjs', 'learning/public-task-context-r169.test.mjs',
    'domain/or-domain-r1610.mjs', 'domain/or-domain-r1610.test.mjs', 'domain/or-diagnostics-r1610.mjs',
    'domain/or-indexed-transport-r1627.mjs', 'domain/or-manual-lp-r1628.mjs', 'domain/or-manual-lp-r1628.test.mjs', 'domain/or-manual-lp-r1628.test.mjs', 'domain/or-manual-lp-r1628.test.mjs',
    'domain/or-assignment-equivalence-r1611.mjs', 'domain/or-assignment-equivalence-r1611.test.mjs',
    'domain/or-production-equivalence-r1612.mjs', 'domain/or-production-equivalence-r1612.test.mjs',
    'components/tredven-or-domain.tsx',
    'app/pilot/gusek/szakmai/page.tsx', 'app/api/pilot/gusek/szakmai/route.ts'}
LEGACY_WORKBENCH_OVERLAY_PATHS = WORKBENCH_OVERLAY_PATHS - {
    'domain/or-domain-r1610.mjs', 'domain/or-domain-r1610.test.mjs',
    'domain/or-diagnostics-r1610.mjs', 'domain/or-indexed-transport-r1627.mjs', 'domain/or-manual-lp-r1628.mjs', 'domain/or-manual-lp-r1628.test.mjs', 'domain/or-manual-lp-r1628.test.mjs', 'domain/or-manual-lp-r1628.test.mjs', 'domain/or-assignment-equivalence-r1611.mjs', 'domain/or-assignment-equivalence-r1611.test.mjs',
    'domain/or-production-equivalence-r1612.mjs', 'domain/or-production-equivalence-r1612.test.mjs',
    'components/tredven-or-domain.tsx',
    'app/pilot/gusek/szakmai/page.tsx', 'app/api/pilot/gusek/szakmai/route.ts'
}
WORKBENCH_ROOTS = (
    # Reuse the pinned R15 static parser and equivalence proof for new OR kinds.
    'pilots/operations-research/gusek-model-r13.mjs',
    'pilots/operations-research/gusek-equivalence-r14.mjs',
    'components/gusek-workbench.tsx', 'components/gusek-exam.tsx',
    'components/gusek-gmpl-editor.tsx', 'components/gusek-values-grid.tsx',
    'src/features/gusek/browser-drafts.ts',
    'src/features/gusek/workspace-files.mjs',
    'src/features/gusek/gmpl-editor-core.mjs',
    'src/features/gusek/practice-draft-r14z.mjs',
    'src/features/gusek/project-contract-r14z.mjs',
    'pilots/operations-research/adaptive-run-r15d.test.mjs',
    'pilots/operations-research/adaptive-checkpoint-r15e.test.mjs',
    'pilots/operations-research/adaptive-diagnostics-r15b.test.mjs',
    'pilots/operations-research/gusek-workspace-r14.test.mjs',
    'pilots/operations-research/gmpl-editor-r14.test.mjs',
    'pilots/operations-research/gusek-values-grid-r14z.test.mjs',
    'pilots/operations-research/gusek-practice-draft-r14z.test.mjs',
    'pilots/operations-research/gusek-project-r14z.test.mjs',
    'pilots/operations-research/glpk-feedback-r14z.test.mjs',
)
NATIVE_ROOTS = ('app/api/pilot/gusek/native/route.ts',)
TYPE_BOUNDARY = 'components/gusek-exam.tsx'
ORIGINAL_TYPE = "import type {TransportAttemptReceipt} from '../src/core/contracts/chat';"
PRIVATE_TYPE = "import type {TransportAttemptReceipt} from '../src/tredven/gusek/attempt-receipt-r15';"
ORIGINAL_CHAT_BINDING = "const id=chatId??new URLSearchParams(window.location.search).get('chatId');"
DISABLED_CHAT_BINDING = 'const id=null as string|null; // R16.2 standalone: no chat store integration'

REL_IMPORT = re.compile(r'''\b(?:from|import)\s*['"](\.[^'"\n]+)['"]''')

class Blocked(Exception):
    pass

def run(args: list[str], *, cwd: Path | None = None) -> bytes:
    p = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if p.returncode != 0:
        raise Blocked(f'COMMAND_FAILED[{p.returncode}]: {args[:3]}: {p.stderr[:350].decode(errors="replace")}')
    return p.stdout

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def posix_path(s: str) -> str:
    if not isinstance(s, str) or not s or '\\' in s or '\x00' in s:
        raise Blocked('INVALID_PATH')
    p = PurePosixPath(s)
    if p.is_absolute() or '..' in p.parts or '.' in p.parts or s.startswith('-') or s != str(p):
        raise Blocked(f'UNSAFE_PATH: {s!r}')
    if p.parts[0] in ('.git', 'node_modules', '.next', 'data'):
        raise Blocked(f'PROTECTED_PATH: {s!r}')
    return s

def git(repo: Path, *args: str) -> bytes:
    if not repo.is_dir() or not (repo / '.git').exists():
        # linked worktree has .git as a file; both supported
        raise Blocked(f'NOT_GIT_CHECKOUT: {repo}')
    return run(['git', '-C', str(repo), *args])

def commit(repo: Path, ref: str) -> str:
    value = git(repo, 'rev-parse', '--verify', f'{ref}^{{commit}}').decode().strip()
    if not re.fullmatch(r'[a-f0-9]{40}', value):
        raise Blocked('INVALID_COMMIT')
    return value

def blob_at(repo: Path, ref: str, path: str) -> bytes:
    posix_path(path)
    return git(repo, 'show', f'{ref}:{path}')

def diff_status(repo: Path) -> list[tuple[str, str]]:
    raw = git(repo, 'diff', '--name-status', '--no-renames', '-z', BASE, R15)
    parts = raw.decode('utf-8').split('\0')
    if parts[-1] != '':
        raise Blocked('INVALID_GIT_DIFF')
    parts.pop()
    if len(parts) % 2:
        raise Blocked('INVALID_GIT_DIFF_RECORD')
    result = []
    for s, p in zip(parts[0::2], parts[1::2]):
        posix_path(p)
        if s not in {'A', 'M', 'D'}:
            raise Blocked(f'UNSUPPORTED_DIFF_STATUS: {s}: {p}')
        result.append((s, p))
    return result

def safe_write(root: Path, relative: str, data: bytes, mode: int = 0o644) -> None:
    posix_path(relative)
    dest = root / relative
    # The root/dest are newly created by this script, never user-provided symlinks.
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() or dest.is_symlink():
        raise Blocked(f'OVERWRITE_REFUSED: {relative}')
    with dest.open('xb') as fh:
        fh.write(data)
    dest.chmod(mode)

def check_output(root: Path, inputs: list[Path]):
    resolved = root.resolve(strict=False)
    if resolved.exists() or resolved.is_symlink():
        raise Blocked(f'DESTINATION_EXISTS: {root}')
    if resolved == Path('/'):
        raise Blocked('ROOT_DESTINATION_REFUSED')
    for input_repo in inputs:
        parent = input_repo.resolve(strict=True)
        if resolved == parent or parent in resolved.parents or resolved in parent.parents:
            raise Blocked(f'DESTINATION_OVERLAPS_REPOSITORY: {root}')
    if root.parent.is_symlink():
        raise Blocked('SYMLINK_DESTINATION_PARENT')


def export_addons(fork: Path, dest: Path) -> dict:
    if commit(fork, BASE) != BASE or commit(fork, R15) != R15:
        raise Blocked('SOURCE_PIN_UNAVAILABLE')
    if run(['git', '-C', str(fork), 'merge-base', '--is-ancestor', BASE, R15]) != b'':
        raise Blocked('BASELINE_NOT_ANCESTOR')
    entries = diff_status(fork)
    if not entries:
        raise Blocked('EMPTY_R15_DELTA')
    added = []
    modified = []
    deleted = []
    for state, name in entries:
        if state == 'A':
            data = blob_at(fork, R15, name)
            mode = git(fork, 'ls-tree', R15, '--', name).decode().split(' ', 1)[0]
            if mode not in {'100644','100755'}:
                raise Blocked(f'NON_REGULAR_SOURCE_FILE: {name} ({mode})')
            safe_write(dest / 'source', name, data, 0o755 if mode == '100755' else 0o644)
            added.append({'path': name, 'sha256': sha256(data), 'bytes': len(data)})
        elif state == 'M':
            modified.append(name)
        else:
            deleted.append(name)
    patch_paths = modified + deleted
    patch = git(fork, 'diff', '--binary', BASE, R15, '--', *patch_paths) if patch_paths else b''
    safe_write(dest, 'quarantine/upstream-modifications.patch', patch)
    # Pinned R15 guarantee: the only known type-only leaks get an exact
    # and intentionally narrow compatibility adapter.
    verify_pinned_type_contract(dest/'source', {'r15': R15})
    verify_pinned_lint_contract(dest/'source', {'r15': R15})
    manifest = {
        'schema': 'tredven.learnharness.r16.export.v1', 'version': R16_VERSION,
        'base': BASE, 'r15': R15, 'added': added,
        'modified_quarantined': modified, 'removed_quarantined': deleted,
        'quarantine_patch_sha256': sha256(patch),
        'rule': 'Only A paths are exported as add-on source; M/D are quarantined, never applied automatically.',
    }
    safe_write(dest, 'manifest.json', (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True)+'\n').encode())
    return manifest

def relative_dependencies(module: str, contents: bytes) -> list[str]:
    text = contents.decode('utf-8')
    result = []
    for raw in REL_IMPORT.findall(text):
        base = PurePosixPath(module).parent
        # posixpath.normpath allows standard ../ imports while final root guard rejects escapes
        import posixpath
        dst = posixpath.normpath(posixpath.join(str(base), raw))
        posix_path(dst)
        result.append(dst)
    return result

def closure(export_root: Path, manifest: dict, roots: tuple[str, ...] = ROOTS, profile: str = 'core') -> list[str]:
    source = export_root / 'source'
    added = {r['path']: r for r in manifest['added']}
    needed = set()
    todo = list(roots)
    while todo:
        path = todo.pop()
        if path in needed:
            continue
        if path not in added:
            raise Blocked(f'REQUIRED_ADDON_NOT_EXPORTED: {path}')
        data = (source / path).read_bytes()
        if sha256(data) != added[path]['sha256']:
            raise Blocked(f'ADDON_HASH_MISMATCH: {path}')
        needed.add(path)
        # R16.7: the portable pack itself must be source-self-contained.
        # Path aliases are not tracked by relative_dependencies(); previously
        # they could silently bind to upstream internals after assembly.
        source_text=data.decode('utf-8')
        aliases=re.findall(r"\b(?:from\s*|import\s*)['\"](@/[^'\"\n]+)['\"]",source_text)
        aliases+=re.findall(r"\bimport\s*\(\s*['\"](@/[^'\"\n]+)['\"]\s*\)",source_text)
        for spec in aliases:
            lookup=spec[2:]
            options=[lookup,*(lookup+x for x in ('.mjs','.ts','.tsx','.js','/index.ts','/index.tsx'))]
            if not any(candidate in added for candidate in options):
                raise Blocked(f'NON_SELF_CONTAINED_ALIAS: {path} -> {spec}')
        for dep in relative_dependencies(path, data):
            # The only allowed reference to fork-mutated core is an exact type-only
            # import that is replaced during assembly. Not a runtime dependency.
            if (profile == 'workbench' and path == TYPE_BOUNDARY
                and dep == 'src/core/contracts/chat'
                and ORIGINAL_TYPE.encode() in data):
                continue
            if dep not in added:
                # TS import extension omitted: resolve to known on-disk module, never to the host app.
                matches = [dep+s for s in ('.mjs','.ts','.tsx','.js')] + [dep+'/index.ts']
                dep = next((p for p in matches if p in added), dep)
            if dep not in added:
                raise Blocked(f'NON_SELF_CONTAINED_IMPORT: {path} -> {dep}')
            todo.append(dep)
    return sorted(needed)

def source_snapshot(upstream: Path, sha: str, staging: Path) -> set[str]:
    tarbytes = git(upstream, 'archive', '--format=tar', sha)
    names = set()
    folded = set()
    with tarfile.open(fileobj=io.BytesIO(tarbytes), mode='r:') as archive:
        for m in archive.getmembers():
            if m.isdir():
                continue
            path = posix_path(m.name)
            if not m.isfile():
                raise Blocked(f'UPSTREAM_NON_REGULAR_ENTRY: {path}')
            if path.casefold() in folded:
                raise Blocked(f'CASE_INSENSITIVE_PATH_COLLISION: {path}')
            folded.add(path.casefold())
            safe_write(staging, path, archive.extractfile(m).read(), 0o755 if m.mode & 0o111 else 0o644)
            names.add(path)
    return names

def transform_workbench_type(path: str, data: bytes) -> tuple[bytes, dict | None]:
    if path != TYPE_BOUNDARY:
        return data, None
    src = data.decode('utf-8')
    if src.count(ORIGINAL_TYPE) != 1 or src.count(ORIGINAL_CHAT_BINDING) != 1:
        raise Blocked('R15_WORKBENCH_SEAM_DRIFT_REFUSED')
    modified = src.replace(ORIGINAL_TYPE, PRIVATE_TYPE).replace(ORIGINAL_CHAT_BINDING, DISABLED_CHAT_BINDING)
    changes=['private R15 receipt type', 'standalone no chatId coupling']
    # R16.8 is a true product feature, NOT a second grader. Extend only the
    # addon-owned copy of the original GUSEK exam; upstream stays unmodified.
    # Exact marker from the pinned R15 source. Synthetic fixtures with no R15
    # UI may still test the base adapter, but a real pinned R15 must match.
    anchor='   {r15Suggestion&&<aside'
    if modified.count(anchor)==1:
        import_line="import {TredvenTeachingHandoff} from './tredven-teaching-handoff';\n"
        if modified.count("'use client';")!=1:
            raise Blocked('R168_CLIENT_ENTRY_SEAM_DRIFT')
        modified=modified.replace("'use client';\n","'use client';\n"+import_line,1)
        modified=modified.replace(anchor,"   <TredvenTeachingHandoff grade={grade} taskKind={kind} task={task} diagnostic={r15bBrief} suggestion={r15Suggestion} hintsUsed={hints} />\n"+anchor,1)
        changes.append('opt-in task-aware tutoring handoff; no chat mutation or grade change')
    elif R15==PINNED_R15:
        raise Blocked('R168_PINNED_GUSEK_UI_SEAM_DRIFT')
    output = modified.encode('utf-8')
    return output, {'path': path, 'old_sha256': sha256(data),
                    'assembled_sha256': sha256(output), 'changes': changes}

def apply_addons(source_root: Path, dest: Path, files: list[str], existing: set[str],
                 profile: str = 'core', frozen_overlay_root: Path | None = None) -> tuple[dict, list[dict]]:
    inserted, transforms = {}, []
    fold_existing = {x.casefold() for x in existing}
    for path in files:
        if path in existing or path.casefold() in fold_existing:
            raise Blocked(f'UPSTREAM_PATH_COLLISION: {path}')
        data = (source_root / path).read_bytes()
        if profile == 'workbench':
            data, transformation = transform_workbench_type(path, data)
            if transformation is not None:
                transforms.append(transformation)
        safe_write(dest, path, data)
        inserted[path] = sha256(data)
        fold_existing.add(path.casefold())
    overlay_dir = (frozen_overlay_root / profile) if frozen_overlay_root is not None else (WORKBENCH_OVERLAY if profile == 'workbench' else OVERLAY_ROOT)
    overlay_paths = LEGACY_WORKBENCH_OVERLAY_PATHS if profile == 'workbench' else ALLOWED_OVERLAY
    for rel in sorted(overlay_paths):
        payload = overlay_dir / rel
        if not payload.is_file() or payload.is_symlink():
            raise Blocked(f'MISSING_R16_OVERLAY: {rel}')
        if rel in existing or rel.casefold() in fold_existing or rel in inserted:
            raise Blocked(f'UPSTREAM_PATH_COLLISION: {rel}')
        data = payload.read_bytes()
        safe_write(dest, rel, data)
        inserted[rel] = sha256(data)
        fold_existing.add(rel.casefold())
    return inserted, transforms


# R16.4: namespace every source module. Only Next file-system route shims
# and the pilot page remain outside Tredven-owned source directories.
ADDON_NAMESPACE = 'tredven/addons/'
# The R15 sources are immutable. Their JSDoc links to a fork-only core type
# are an architectural dependency, despite not being runtime imports.
# The private receipt is used in both core and Workbench profiles.
PINNED_R15 = '9b7f374f4003276e67a96feb070124c244447aec'
LEGACY_JSDOC_TYPE = "import('../../src/core/contracts/chat.ts')"
PRIVATE_JSDOC_TYPE = "import('@/src/tredven/gusek/attempt-receipt-r15')"
JSDOC_COMPAT_COUNTS = {
    'pilots/operations-research/adaptive-practice-r15.mjs': 2,
    'pilots/operations-research/adaptive-diagnostics-r15b.mjs': 1,
    'pilots/operations-research/adaptive-sequence-r15c.mjs': 1,
}

# The pinned R15 UI suppresses a react-hooks lint rule, but upstream 0.4.1
# does not register that ESLint plugin. Keep frozen R15 sources immutable;
# strip ONLY the two known directives in the private namespaced copies.
R15_UNREGISTERED_ESLINT_DIRECTIVE = '// eslint-disable-next-line react-hooks/exhaustive-deps'
R15_UNREGISTERED_ESLINT_FILES = frozenset({
    'components/gusek-gmpl-editor.tsx',
    'components/gusek-workbench.tsx',
})
R16_LINT_COMPAT_NOTE = '// R16.12.1: original R15 effect dependencies retained (upstream ESLint has no react-hooks rule)'

def verify_pinned_lint_contract(source: Path, manifest: dict) -> None:
    if manifest.get('r15') != PINNED_R15:
        return
    for path in sorted(R15_UNREGISTERED_ESLINT_FILES):
        content=(source/path).read_text(encoding='utf-8')
        n=content.count(R15_UNREGISTERED_ESLINT_DIRECTIVE)
        if n!=1:
            raise Blocked(f'R15_LINT_DIRECTIVE_SEAM_DRIFT: {path} count={n}')

def verify_pinned_type_contract(source: Path, manifest: dict) -> None:
    """Verify the exact, connector-observed R15 type-only dependency surface.

    For unit fixtures that monkeypatch the source SHA, this is deliberately
    skipped: it is a claim about one pinned real commit, not arbitrary inputs.
    """
    if manifest.get('r15') != PINNED_R15:
        return
    for path, expected in JSDOC_COMPAT_COUNTS.items():
        data=(source/path).read_text(encoding='utf-8')
        actual=data.count(LEGACY_JSDOC_TYPE)
        if actual != expected:
            raise Blocked(f'R15_JSDOC_TYPE_SEAM_DRIFT: {path} expected={expected} actual={actual}')
ROUTER_ROUTES = {
    'app/api/pilot/gusek/route.ts': ('GET', 'POST'),
    'app/api/pilot/gusek/native/route.ts': ('GET', 'POST'),
}
legacy_apply_addons = apply_addons

def namespaced_path(relative: str) -> str:
    return posix_path(ADDON_NAMESPACE + posix_path(relative))

def rewrite_namespaced_source(relative: str, data: bytes, addon_names: set[str]) -> bytes:
    source = data.decode('utf-8')
    # Remove fork-core JSDoc links even from JS helpers: TypeScript's JS type
    # acquisition and editor language service can otherwise see phantom core.
    # No other R15 module may acquire this same private compatibility seam.
    if LEGACY_JSDOC_TYPE in source and relative not in JSDOC_COMPAT_COUNTS:
        raise Blocked(f'UNEXPECTED_FORK_CORE_JSDOC_REFERENCE: {relative}')
    if relative in JSDOC_COMPAT_COUNTS:
        source=source.replace(LEGACY_JSDOC_TYPE,PRIVATE_JSDOC_TYPE)
    if relative in R15_UNREGISTERED_ESLINT_FILES:
        if source.count(R15_UNREGISTERED_ESLINT_DIRECTIVE)>1:
            raise Blocked(f'R15_LINT_DIRECTIVE_SEAM_DRIFT: {relative}')
        source=source.replace(R15_UNREGISTERED_ESLINT_DIRECTIVE,R16_LINT_COMPAT_NOTE)
    # Refuse additional links to the old core contract, including altered
    # extensions/quoting. Do not invent another shim for unknown upstream APIs.
    if re.search(r"import\s*\(\s*['\"](?:\.\./)+src/core/contracts/chat(?:\.ts)?['\"]\s*\)",source):
        raise Blocked(f'UNMAPPED_FORK_CORE_TYPE_REFERENCE: {relative}')
    # Static module closure alone misses TypeScript's JSDoc import('./type')
    # and dynamic import('./path') syntax. Validate them against the actual
    # selected add-on files BEFORE the aliases are rewritten.
    for jsref in re.findall(r"\bimport\s*\(\s*['\"]([^'\"]+)['\"]\s*\)",source):
        if jsref.startswith('.'):
            import posixpath
            resolved=posixpath.normpath(posixpath.join(str(PurePosixPath(relative).parent),jsref))
            posix_path(resolved)
            candidates=[resolved,*(resolved+x for x in ('.mjs','.js','.ts','.tsx')),
                        resolved+'/index.ts',resolved+'/index.tsx']
            if not any(name in addon_names for name in candidates):
                raise Blocked(f'UNRESOLVED_TYPE_OR_DYNAMIC_IMPORT: {relative} -> {jsref}')
        elif jsref.startswith('@/') and jsref != '@/src/tredven/gusek/attempt-receipt-r15':
            lookup=jsref[2:]
            options=[lookup,*(lookup+x for x in ('.mjs','.ts','.tsx','.js','/index.ts','/index.tsx'))]
            if not any(name in addon_names for name in options):
                raise Blocked(f'ADDON_UPSTREAM_ALIAS_LEAK: {relative} -> {jsref}')
    # R16.7: no add-on may silently import a core/app/component from upstream.
    # An upstream file that happens to exist is not an add-on dependency contract.
    # This prevents a build passing today but breaking when the upstream changes.
    private_type='@/src/tredven/gusek/attempt-receipt-r15'
    def resolve_private_alias(raw: str) -> str:
        if not raw.startswith('@/'):
            return raw
        if raw == private_type:
            return raw  # exact compatibility-only receipt, supplied as frozen overlay
        lookup=raw[2:]
        options=[lookup, *(lookup+x for x in ('.ts','.tsx','.mjs','.js','/index.ts','/index.tsx'))]
        if not any(name in addon_names for name in options):
            raise Blocked(f'ADDON_UPSTREAM_ALIAS_LEAK: {relative} -> {raw}')
        return '@/'+namespaced_path(lookup)
    def fix(match: re.Match) -> str:
        before, target, after = match.groups()
        return before+resolve_private_alias(target)+after
    source=re.sub(r"(\b(?:from\s*|import\s*)['\"])([^'\"\n]+)(['\"])",fix,source)
    # JSDoc / dynamic import aliases must obey the SAME no-upstream rule.
    def fix_dynamic(match: re.Match) -> str:
        before,target,after=match.groups()
        return before+resolve_private_alias(target)+after
    source=re.sub(r"(\bimport\s*\(\s*['\"])(@/[^'\"\n]+)(['\"]\s*\))",fix_dynamic,source)
    return source.encode('utf-8')

def namespaced_route_bridge(relative: str) -> bytes:
    if relative not in ROUTER_ROUTES:
        raise Blocked('UNKNOWN_ROUTER_BRIDGE')
    api = namespaced_path(relative).removesuffix('.ts')
    exports=', '.join(ROUTER_ROUTES[relative])
    return ("/** R16 generated Next routing bridge. */\n"
            "export const runtime = 'nodejs';\n"
            "export const dynamic = 'force-dynamic';\n"
            f"export {{{exports}}} from '@/{api}';\n").encode()

def overlay_target(relative: str) -> str:
    # Next's app/ directory is the only public insertion seam. All private
    # UI and teaching logic is owned by the Tredven namespace.
    if relative.startswith(('components/tredven-', 'learning/', 'domain/')):
        return namespaced_path(relative)
    return relative

def rewrite_namespaced_overlay(profile: str, relative: str, data: bytes) -> bytes:
    if relative == 'components/tredven-gusek-standalone.tsx':
        return rewrite_namespaced_source(relative,data,{
            'pilots/operations-research/adaptive-practice-r15.mjs',
            'pilots/operations-research/adaptive-sequence-r15c.mjs'})
    if relative != 'app/pilot/gusek/page.tsx':
        return data
    src=data.decode('utf-8')
    old='../../../components/'+('gusek-workbench' if profile=='workbench' else 'tredven-gusek-standalone')
    new='@/'+namespaced_path('components/'+('gusek-workbench' if profile=='workbench' else 'tredven-gusek-standalone'))
    if src.count(old)!=1:
        raise Blocked('ROUTE_OVERLAY_SEAM_DRIFT')
    return src.replace(old,new).encode()

def apply_addons(source_root: Path, dest: Path, files: list[str], existing: set[str],
                 profile: str = 'core', frozen_overlay_root: Path | None = None,
                 namespace: bool = False) -> tuple[dict, list[dict]]:
    if not namespace:
        return legacy_apply_addons(source_root,dest,files,existing,profile,frozen_overlay_root)
    inserted, transforms = {}, []
    fold = {p.casefold() for p in existing}
    names=set(files)
    for old in files:
        path=namespaced_path(old)
        if path.casefold() in fold:
            raise Blocked(f'UPSTREAM_PATH_COLLISION: {path}')
        data=(source_root/old).read_bytes()
        if profile=='workbench':
            data, transformation=transform_workbench_type(old,data)
            if transformation:
                data=data.replace(PRIVATE_TYPE.encode(),
                    b"import type {TransportAttemptReceipt} from '@/src/tredven/gusek/attempt-receipt-r15';")
                transformation['path']=path
                transforms.append(transformation)
        data=rewrite_namespaced_source(old,data,names)
        safe_write(dest,path,data)
        inserted[path]=sha256(data)
        fold.add(path.casefold())
        if old==TYPE_BOUNDARY and transforms:
            transforms[-1]['assembled_sha256']=sha256(data)
        if old in ROUTER_ROUTES:
            if old.casefold() in fold:
                raise Blocked(f'UPSTREAM_PATH_COLLISION: {old}')
            bridge=namespaced_route_bridge(old)
            safe_write(dest,old,bridge)
            inserted[old]=sha256(bridge)
            fold.add(old.casefold())
    overlay_dir=(frozen_overlay_root/profile if frozen_overlay_root is not None else
                 (WORKBENCH_OVERLAY if profile=='workbench' else OVERLAY_ROOT))
    overlays=WORKBENCH_OVERLAY_PATHS if profile=='workbench' else ALLOWED_OVERLAY
    for old in sorted(overlays):
        path=overlay_target(old)
        if path.casefold() in fold:
            raise Blocked(f'UPSTREAM_PATH_COLLISION: {path}')
        f=overlay_dir/old
        if not f.is_file() or f.is_symlink():
            raise Blocked(f'MISSING_R16_OVERLAY: {old}')
        data=rewrite_namespaced_overlay(profile,old,f.read_bytes())
        safe_write(dest,path,data)
        inserted[path]=sha256(data)
        fold.add(path.casefold())
    return inserted,transforms

def verify_overlay(dest: Path, upstream_names: set[str], staging_hashes: dict[str,str]):
    for path, expected in staging_hashes.items():
        if sha256((dest / path).read_bytes()) != expected:
            raise Blocked(f'POST_WRITE_HASH_MISMATCH: {path}')
    for path in staging_hashes:
        if path in upstream_names:
            raise Blocked('CORE_OWNERSHIP_VIOLATION')
    # Check relative imports in newly overlaid files resolve to staged modules.
    # The app is still not considered compiled or qualified at this gate.
    for path in staging_hashes:
        if not path.endswith(('.js','.mjs','.ts','.tsx')):
            continue
        source = (dest/path).read_bytes()
        # LearnHarness 0.4.1 eslint.config.mjs explicitly prohibits app/**
        # importing arbitrary src/** modules. Validate the generated bridge
        # against that upstream import law before claiming source assembly PASS.
        # This is a boundary check, NOT a substitute for a real npm lint run.
        if path.startswith('app/'):
            for spec in re.findall(r"\b(?:from|import)\s*['\"]([^'\"\n]+)['\"]", source.decode('utf-8')):
                if spec.startswith('@/src/') and spec not in ('@/src/core', '@/src/server'):
                    raise Blocked(f'UPSTREAM_APP_IMPORT_LAW: {path} -> {spec}')
            for dep in relative_dependencies(path, source):
                if dep.startswith('src/') and dep not in ('src/core/index.ts', 'src/server/index.ts'):
                    raise Blocked(f'UPSTREAM_APP_IMPORT_LAW: {path} -> {dep}')
        for dep in relative_dependencies(path, source):
            candidates = [dep, *(dep+x for x in ('.mjs','.js','.ts','.tsx')), dep+'/index.ts', dep+'/index.tsx']
            if not any((dest/p).is_file() for p in candidates):
                raise Blocked(f'UNRESOLVED_ASSEMBLED_IMPORT: {path} -> {dep}')
        # Aliased internal imports also must resolve to actual assembled files;
        # no pretending they are validated merely because they use '@/'.
        for raw in re.findall(r"\b(?:from|import)\s*['\"](@/[^'\"\n]+)['\"]", source.decode('utf-8')):
            dep = posix_path(raw[2:])
            candidates = [dep, *(dep+x for x in ('.mjs','.js','.ts','.tsx')), dep+'/index.ts', dep+'/index.tsx']
            if not any((dest/p).is_file() for p in candidates):
                raise Blocked(f'UNRESOLVED_ASSEMBLED_ALIAS: {path} -> {dep}')

def migrate(upstream: Path, fork: Path, target: Path, upstream_ref: str,
            profile: str = 'core', native_route: bool = False):
    if profile not in {'core', 'workbench'}:
        raise Blocked('UNKNOWN_PROFILE')
    if native_route and profile != 'workbench':
        raise Blocked('NATIVE_REQUIRES_WORKBENCH')
    upstream = upstream.resolve(strict=True); fork = fork.resolve(strict=True)
    check_output(target, [upstream,fork])
    source_sha = commit(upstream, upstream_ref)
    before = {str(p): (commit(p, 'HEAD'), git(p, 'status', '--porcelain=v1', '-z', '--untracked-files=no')) for p in {upstream, fork}}
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='.r16-stage-', dir=target.parent.resolve()))
    try:
        export_root = tmp / 'addons-source'; export_root.mkdir()
        manifest = export_addons(fork, export_root)
        roots = ROOTS + (WORKBENCH_ROOTS if profile == 'workbench' else ()) + (NATIVE_ROOTS if native_route else ())
        files = closure(export_root, manifest, roots, profile)
        assembled = tmp / 'assembled'; assembled.mkdir()
        upstream_files = source_snapshot(upstream, source_sha, assembled)
        upstream_hashes = {p: sha256((assembled / p).read_bytes()) for p in sorted(upstream_files)}
        upstream_inventory = {'schema': 'tredven.learnharness.r16.upstream-inventory.v1',
                              'upstream_sha': source_sha, 'files': upstream_hashes}
        upstream_json = (json.dumps(upstream_inventory,sort_keys=True,separators=(',',':'))+'\n').encode()
        inserted, transforms = apply_addons(export_root / 'source', assembled, files, upstream_files, profile)
        verify_overlay(assembled, upstream_files, inserted)
        after = {str(p): (commit(p, 'HEAD'), git(p, 'status', '--porcelain=v1', '-z', '--untracked-files=no')) for p in {upstream, fork}}
        if before != after:
            raise Blocked('INPUT_REPOSITORY_CHANGED_DURING_MIGRATION')
        evidence = {
            'schema': 'tredven.learnharness.r16.assembly.v1', 'version': R16_VERSION,
            'created_utc': datetime.now(timezone.utc).isoformat(),
            'upstream_sha': source_sha, 'r15_sha': R15, 'legacy_base': BASE,
            'profile': profile, 'native_route_installed': native_route,
            'native_route_enabled_by_r16': False,
            'transforms': transforms,
            'selected_module_closure': files,
            'new_paths': inserted, 'new_path_count': len(inserted),
            'upstream_tracked_file_count': len(upstream_files),
            'upstream_inventory_sha256': sha256(upstream_json),
            'core_files_overwritten': 0, 'git_checkout_modified': False,
            'native_glpk_enabled_by_r16': False,
            'assessment_authority': 'R15 server-only GUSEK route; no client scoring',
            'status': 'ASSEMBLED_UNQUALIFIED',
            'not_proven': ['npm install', 'TypeScript', 'Next production build', 'browser E2E', 'native GLPK', 'release approval'],
        }
        (tmp/'evidence').mkdir()
        safe_write(tmp, 'evidence/upstream-files.json', upstream_json)
        safe_write(tmp, 'evidence/assembly.json',(json.dumps(evidence,indent=2,ensure_ascii=False,sort_keys=True)+'\n').encode())
        safe_write(tmp, 'evidence/README.txt',b'R16 source-only assembly succeeded. This does not mean runtime/Next/E2E qualified.\nRun qualify-r16.sh only after explicit operator approval.\n')
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp.rename(target)
        print(f'R16_ASSEMBLY=PASS_SOURCE_ONLY\nPROFILE={profile}\nNATIVE_ROUTE={native_route}\nUPSTREAM={source_sha}\nR15={R15}\nADDED_FILES={len(files)}\nBUILD={target / "assembled"}\nRELEASE=NO_GO_UNQUALIFIED')
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


def verify_namespace_contract(path: Path, evidence: dict, actual_addons: dict[str, str]) -> None:
    """Check a portable assembly against its frozen R15 package, not just a self-reported manifest.

    This reduces accidental release of a candidate built with a different
    selection/route scheme. It does not provide a cryptographic signature.
    """
    if evidence.get('addon_namespace') is None:
        return  # Legacy R16.1/R16.2 migration, not portable R16.4.
    if evidence['addon_namespace'] != ADDON_NAMESPACE:
        raise Blocked('UNEXPECTED_ADDON_NAMESPACE')
    pack=path/'addons-source'
    manifest=verify_pack(pack)
    profile=evidence.get('profile')
    native=evidence.get('native_route_installed') is True
    if profile not in {'core','workbench'} or (native and profile!='workbench'):
        raise Blocked('INVALID_NAMESPACED_PROFILE')
    roots=ROOTS+(WORKBENCH_ROOTS if profile=='workbench' else ())+(NATIVE_ROOTS if native else ())
    paths=closure(pack,manifest,roots,profile)
    if evidence.get('selected_module_closure')!=paths:
        raise Blocked('NAMESPACE_CLOSURE_RECEIPT_DRIFT')
    overlays=WORKBENCH_OVERLAY_PATHS if profile=='workbench' else ALLOWED_OVERLAY
    expected={namespaced_path(x) for x in paths}
    expected.update(x for x in paths if x in ROUTER_ROUTES)
    expected.update(overlay_target(x) for x in overlays)
    if set(actual_addons)!=expected:
        raise Blocked('NAMESPACE_PATH_SET_DRIFT')
    assembled=path/'assembled'
    for route in ROUTER_ROUTES:
        if route in expected and (assembled/route).read_bytes()!=namespaced_route_bridge(route):
            raise Blocked('NAMESPACE_ROUTING_BRIDGE_DRIFT')
    for old in paths:
        new=namespaced_path(old)
        data=(pack/'source'/old).read_bytes()
        if profile=='workbench':
            data,_=transform_workbench_type(old,data)
            if old==TYPE_BOUNDARY:
                data=data.replace(PRIVATE_TYPE.encode(),
                    b"import type {TransportAttemptReceipt} from '@/src/tredven/gusek/attempt-receipt-r15';")
        data=rewrite_namespaced_source(old,data,set(paths))
        if sha256(data)!=actual_addons[new]:
            raise Blocked('NAMESPACE_SOURCE_DRIFT: '+old)
    for old in overlays:
        new=overlay_target(old)
        expected_data=rewrite_namespaced_overlay(profile,old,(pack/'overlays'/profile/old).read_bytes())
        if sha256(expected_data)!=actual_addons[new]:
            raise Blocked('NAMESPACE_OVERLAY_DRIFT: '+old)

# Next 16.4.3 (upstream 0.4.1) changes this GENERATED declaration during
# dev/typecheck -> production build. This is the sole acceptable tracked-file
# post-build rewrite. The source digest must prove the EXACT pinned upstream
# preimage, and the post-build bytes must equal the EXACT production form.
# Never ignore the file, trust arbitrary imports, or accept added code.
PINNED_NEXT_ENV_DEV = (
    b'/// <reference types="next" />\n'
    b'/// <reference types="next/image-types/global" />\n'
    b'import "./.next/dev/types/routes.d.ts";\n'
    b'import "./.next/dev/types/root-params.d.ts";\n'
    b'\n'
    b'// NOTE: This file should not be edited\n'
    b'// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n'
)
PINNED_NEXT_ENV_BUILD = PINNED_NEXT_ENV_DEV.replace(
    b'"./.next/dev/types/', b'"./.next/types/'
)

def approved_next_env_postbuild(original_sha256: str, actual: bytes) -> bool:
    return (original_sha256 == sha256(PINNED_NEXT_ENV_DEV)
            and actual == PINNED_NEXT_ENV_BUILD)


def verify_assembly(path: Path, allow_build_artifacts: bool = False):
    evidence = json.loads((path / 'evidence/assembly.json').read_text())
    inventory_bytes = (path / 'evidence/upstream-files.json').read_bytes()
    if evidence.get('status') != 'ASSEMBLED_UNQUALIFIED' or evidence.get('core_files_overwritten') != 0:
        raise Blocked('INVALID_ASSEMBLY_RECEIPT')
    if sha256(inventory_bytes) != evidence.get('upstream_inventory_sha256'):
        raise Blocked('UPSTREAM_INVENTORY_HASH_MISMATCH')
    inv = json.loads(inventory_bytes)
    if inv.get('schema') != 'tredven.learnharness.r16.upstream-inventory.v1' or inv.get('upstream_sha') != evidence.get('upstream_sha'):
        raise Blocked('UPSTREAM_INVENTORY_WRONG_SOURCE')
    originals = inv['files']
    addons = evidence['new_paths']
    expected = {**originals, **addons}
    if len(expected) != len(originals) + len(addons) or len(originals) != evidence['upstream_tracked_file_count'] or len(addons) != evidence['new_path_count']:
        raise Blocked('ASSEMBLED_COLLISION_OR_COUNT_MISMATCH')
    assembled = path / 'assembled'
    actual = set()
    for current, dirs, files in os.walk(assembled,followlinks=False):
        if allow_build_artifacts and Path(current)==assembled:
            # Generated build-only directories are not trusted as source, nor executed
            # by the verifier. Every tracked actual source file remains hashed.
            for item in ('node_modules', '.next'):
                if item in dirs:
                    dirs.remove(item)
        for name in dirs:
            candidate = Path(current) / name
            if candidate.is_symlink():
                raise Blocked('ASSEMBLED_DIRECTORY_SYMLINK')
        for name in files:
            candidate = Path(current) / name
            if candidate.is_symlink() or not candidate.is_file():
                raise Blocked('ASSEMBLED_NON_REGULAR_FILE')
            rel = candidate.relative_to(assembled).as_posix()
            posix_path(rel)
            actual.add(rel)
    if allow_build_artifacts:
        for generated in ('next-env.d.ts','tsconfig.tsbuildinfo'):
            if generated not in expected:
                actual.discard(generated)
    if actual != set(expected):
        raise Blocked(f'ASSEMBLED_PATH_SET_MISMATCH: extra={len(actual-set(expected))},missing={len(set(expected)-actual)}')
    for rel, digest in expected.items():
        posix_path(rel)
        if not re.fullmatch(r'[a-f0-9]{64}', digest):
            raise Blocked(f'ASSEMBLED_FILE_TAMPER: {rel}')
        content = (assembled / rel).read_bytes()
        if sha256(content) != digest:
            # Only one exact upstream-pinned Next-generated import-path rewrite.
            # No broad ignore or source bypass, even for post-build assets.
            if not (allow_build_artifacts and rel == 'next-env.d.ts'
                    and approved_next_env_postbuild(digest, content)):
                raise Blocked(f'ASSEMBLED_FILE_TAMPER: {rel}')
    if 'addon_pack_lock_sha256' in evidence:
        pack_path=path/'addons-source'
        if sha256((pack_path/'pack-lock.json').read_bytes()) != evidence['addon_pack_lock_sha256']:
            raise Blocked('ASSEMBLY_PACK_LOCK_MISMATCH')
        verify_pack(pack_path)
    verify_namespace_contract(path,evidence,addons)
    transformed = evidence.get('transforms',[])
    if evidence.get('profile') == 'workbench':
        if len(transformed) != 1 or transformed[0].get('path') != (namespaced_path(TYPE_BOUNDARY) if evidence.get('addon_namespace')==ADDON_NAMESPACE else TYPE_BOUNDARY) or transformed[0].get('assembled_sha256') != addons.get(transformed[0].get('path')):
            raise Blocked('WORKBENCH_TRANSFORM_RECEIPT_MISMATCH')
    elif transformed:
        raise Blocked('UNEXPECTED_ASSEMBLY_TRANSFORM')
    native = 'app/api/pilot/gusek/native/route.ts' in addons
    if native != evidence.get('native_route_installed') or evidence.get('native_glpk_enabled_by_r16') is not False:
        raise Blocked('NATIVE_ROUTE_RECEIPT_MISMATCH')
    print(f'R16_ASSEMBLY_INTEGRITY=PASS_{len(expected)}\nUPSTREAM_FILES={len(originals)}\nADDON_FILES={len(addons)}\nPROFILE={evidence.get("profile")}')


def verify_export(path: Path, profile: str = 'core'):
    obj = json.loads((path/'manifest.json').read_text())
    if obj.get('r15') != R15 or obj.get('base') != BASE:
        raise Blocked('WRONG_SOURCE_MANIFEST')
    for rec in obj['added']:
        if sha256((path/'source'/rec['path']).read_bytes())!=rec['sha256']:
            raise Blocked(f'EXPORT_HASH_MISMATCH: {rec["path"]}')
    if sha256((path/'quarantine/upstream-modifications.patch').read_bytes()) != obj['quarantine_patch_sha256']:
        raise Blocked('QUARANTINE_PATCH_CHANGED')
    roots = ROOTS + (WORKBENCH_ROOTS if profile == 'workbench' else ())
    needed = closure(path,obj,roots,profile)
    print(f'R16_EXPORT=PASS_HASHES\nSOURCE_ADDED={len(obj["added"])}\nQUARANTINED_MODIFIED={len(obj["modified_quarantined"])}\nQUARANTINED_REMOVED={len(obj["removed_quarantined"])}\nMVP_CLOSURE={len(needed)}')

# R16.3 portable add-on pack: export once, assemble and refresh without an R15 checkout.
PACK_SCHEMA = 'tredven.learnharness.r16.portable-pack.v1'
UPDATE_SCHEMA = 'tredven.learnharness.r16.upstream-update-plan.v1'


def files_inventory(root: Path, *, exclude: frozenset[str] = frozenset()) -> dict[str, dict]:
    """Reject symlinks, special nodes and path spelling aliases in a frozen pack."""
    items: dict[str, dict] = {}
    folded: set[str] = set()
    for current, dirs, files in os.walk(root, followlinks=False):
        for name in dirs:
            d = Path(current)/name
            if d.is_symlink() or not d.is_dir():
                raise Blocked('PACK_UNSAFE_DIRECTORY')
        for name in files:
            f = Path(current)/name
            rel = f.relative_to(root).as_posix()
            posix_path(rel)
            if f.is_symlink() or not f.is_file() or f.stat().st_nlink != 1:
                raise Blocked(f'PACK_UNSAFE_FILE: {rel}')
            if rel.casefold() in folded:
                raise Blocked(f'PACK_CASE_COLLISION: {rel}')
            folded.add(rel.casefold())
            if rel in exclude:
                continue
            data = f.read_bytes()
            items[rel] = {'sha256': sha256(data), 'bytes': len(data)}
    return dict(sorted(items.items()))


def freeze_pack(fork: Path, target: Path):
    fork = fork.resolve(strict=True)
    check_output(target, [fork])
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix='.r163-pack-',dir=target.parent.resolve()))
    try:
        manifest = export_addons(fork,tmp)
        for profile, directory, paths in (
            ('core', OVERLAY_ROOT, ALLOWED_OVERLAY),
            ('workbench', WORKBENCH_OVERLAY, WORKBENCH_OVERLAY_PATHS),
        ):
            for path in sorted(paths):
                f=directory/path
                if not f.is_file() or f.is_symlink():
                    raise Blocked(f'MISSING_OVERLAY: {profile}:{path}')
                safe_write(tmp,f'overlays/{profile}/{path}',f.read_bytes())
        # Prove that all three supported dependency graphs close within the R15 A-only tree.
        for profile, native in (('core',False),('workbench',False),('workbench',True)):
            roots = ROOTS + (WORKBENCH_ROOTS if profile=='workbench' else ()) + (NATIVE_ROOTS if native else ())
            closure(tmp,manifest,roots,profile)
        items=files_inventory(tmp)
        lock={
            'schema':PACK_SCHEMA, 'version':R16_VERSION, 'base':BASE,'r15_sha':R15,
            'files':items, 'files_count':len(items),
            'capabilities':['core','workbench','workbench+native-route'],
            'note':'Untrusted hash inventory; not an external signature or release approval.'
        }
        safe_write(tmp,'pack-lock.json',(json.dumps(lock,sort_keys=True,indent=2)+'\n').encode())
        verify_pack(tmp)
        tmp.rename(target)
        print(f'R16_PORTABLE_PACK=PASS\nR15={R15}\nFILES={len(items)}\nOUT={target}\nRELEASE=NO_GO_UNQUALIFIED')
    except Exception:
        shutil.rmtree(tmp,ignore_errors=True)
        raise


def verify_pack(path: Path) -> dict:
    if not path.is_dir() or path.is_symlink():
        raise Blocked('PACK_ROOT_MISSING_OR_SYMLINK')
    obj=json.loads((path/'pack-lock.json').read_text())
    if obj.get('schema')!=PACK_SCHEMA or obj.get('base')!=BASE or obj.get('r15_sha')!=R15:
        raise Blocked('PACK_WRONG_SOURCE')
    expected=obj.get('files')
    if not isinstance(expected,dict) or len(expected)!=obj.get('files_count'):
        raise Blocked('PACK_BAD_INVENTORY')
    actual=files_inventory(path,exclude=frozenset({'pack-lock.json'}))
    if actual!=expected:
        missing=set(expected)-set(actual)
        extra=set(actual)-set(expected)
        raise Blocked(f'PACK_INTEGRITY_MISMATCH: missing={len(missing)},extra={len(extra)}')
    manifest=json.loads((path/'manifest.json').read_text())
    if manifest.get('base')!=BASE or manifest.get('r15')!=R15:
        raise Blocked('PACK_MANIFEST_WRONG_SOURCE')
    declared={item['path']:item['sha256'] for item in manifest['added']}
    if len(declared)!=len(manifest['added']):
        raise Blocked('PACK_DUPLICATE_SOURCE')
    source_paths={p.removeprefix('source/') for p in actual if p.startswith('source/')}
    if source_paths!=set(declared):
        raise Blocked('PACK_SOURCE_SET_MISMATCH')
    for rel, digest in declared.items():
        posix_path(rel)
        if actual['source/'+rel]['sha256']!=digest:
            raise Blocked('PACK_SOURCE_MANIFEST_MISMATCH')
    if actual['quarantine/upstream-modifications.patch']['sha256'] != manifest['quarantine_patch_sha256']:
        raise Blocked('PACK_QUARANTINE_MISMATCH')
    verify_pinned_type_contract(path/'source',manifest)
    verify_pinned_lint_contract(path/'source',manifest)
    for profile, required in (('core',ALLOWED_OVERLAY),('workbench',WORKBENCH_OVERLAY_PATHS)):
        names={p.removeprefix('overlays/'+profile+'/') for p in actual if p.startswith('overlays/'+profile+'/')}
        if names!=required:
            raise Blocked(f'PACK_OVERLAY_SET_MISMATCH: {profile}')
    if actual['overlays/core/src/tredven/gusek/attempt-receipt-r15.ts'] != actual['overlays/workbench/src/tredven/gusek/attempt-receipt-r15.ts']:
        raise Blocked('PROFILE_TYPE_CONTRACT_DRIFT')
    for profile, native in (('core',False),('workbench',False),('workbench',True)):
        roots=ROOTS+(WORKBENCH_ROOTS if profile=='workbench' else ())+(NATIVE_ROOTS if native else ())
        closure(path,manifest,roots,profile)
    return manifest


def assemble_portable(upstream: Path, pack: Path, target: Path, upstream_ref: str,
                      profile: str='workbench',native_route: bool=False,previous: Path|None=None):
    if profile not in {'core','workbench'} or (native_route and profile!='workbench'):
        raise Blocked('INVALID_PORTABLE_PROFILE')
    upstream=upstream.resolve(strict=True)
    pack=pack.resolve(strict=True)
    inputs=[upstream,pack]
    if previous is not None:
        previous=previous.resolve(strict=True)
        inputs.append(previous)
        verify_assembly(previous, allow_build_artifacts=True)
    check_output(target,inputs)
    manifest=verify_pack(pack)
    source_sha=commit(upstream,upstream_ref)
    before=(commit(upstream,'HEAD'),git(upstream,'status','--porcelain=v1','-z','--untracked-files=no'))
    target.parent.mkdir(parents=True,exist_ok=True)
    tmp=Path(tempfile.mkdtemp(prefix='.r163-stage-',dir=target.parent.resolve()))
    try:
        shutil.copytree(pack,tmp/'addons-source',symlinks=False)
        verify_pack(tmp/'addons-source')
        add=tmp/'addons-source'
        roots=ROOTS+(WORKBENCH_ROOTS if profile=='workbench' else ())+(NATIVE_ROOTS if native_route else ())
        files=closure(add,manifest,roots,profile)
        assembled=tmp/'assembled';assembled.mkdir()
        upstream_files=source_snapshot(upstream,source_sha,assembled)
        upstream_hashes={p:sha256((assembled/p).read_bytes()) for p in sorted(upstream_files)}
        upstream_inventory={'schema':'tredven.learnharness.r16.upstream-inventory.v1',
                            'upstream_sha':source_sha,'files':upstream_hashes}
        upstream_json=(json.dumps(upstream_inventory,sort_keys=True,separators=(',',':'))+'\n').encode()
        inserted,transforms=apply_addons(add/'source',assembled,files,upstream_files,profile,add/'overlays',namespace=True)
        verify_overlay(assembled,upstream_files,inserted)
        if before!=(commit(upstream,'HEAD'),git(upstream,'status','--porcelain=v1','-z','--untracked-files=no')):
            raise Blocked('UPSTREAM_REPOSITORY_CHANGED_DURING_ASSEMBLY')
        ev={
            'schema':'tredven.learnharness.r16.assembly.v1','version':R16_VERSION,
            'created_utc':datetime.now(timezone.utc).isoformat(),
            'upstream_sha':source_sha,'r15_sha':R15,'legacy_base':BASE,
            'profile':profile,'native_route_installed':native_route,
            'native_route_enabled_by_r16':False,'native_glpk_enabled_by_r16':False,
            'transforms':transforms,'selected_module_closure':files,
            'new_paths':inserted,'new_path_count':len(inserted),
            'upstream_tracked_file_count':len(upstream_files),
            'upstream_inventory_sha256':sha256(upstream_json),
            'addon_namespace':ADDON_NAMESPACE,
            'addon_pack_lock_sha256':sha256((add/'pack-lock.json').read_bytes()),
            'core_files_overwritten':0,'git_checkout_modified':False,
            'assessment_authority':'R15 server-only GUSEK route; no client scoring',
            'status':'ASSEMBLED_UNQUALIFIED',
            'not_proven':['npm install','TypeScript','Next production build','browser E2E','native GLPK','release approval'],
        }
        (tmp/'evidence').mkdir()
        safe_write(tmp,'evidence/upstream-files.json',upstream_json)
        safe_write(tmp,'evidence/assembly.json',(json.dumps(ev,sort_keys=True,ensure_ascii=False,indent=2)+'\n').encode())
        safe_write(tmp,'evidence/README.txt',b'R16 portable source assembly only. Real runtime/release not qualified.\n')
        verify_assembly(tmp)
        if previous is not None:
            report=compare_assemblies(previous,tmp)
            safe_write(tmp,'evidence/update-plan.json',(json.dumps(report,sort_keys=True,indent=2,ensure_ascii=False)+'\n').encode())
        tmp.rename(target)
        print(f'R16_PORTABLE_ASSEMBLY=PASS_SOURCE_ONLY\nUPSTREAM={source_sha}\nPROFILE={profile}\nPACK_R15={R15}\nSELECTED_ADDONS={len(files)}\nUPDATE_PLAN={previous is not None}\nRELEASE=NO_GO_UNQUALIFIED')
    except Exception:
        shutil.rmtree(tmp,ignore_errors=True)
        raise



def verify_qualification(path: Path) -> None:
    """Cross-check the local technical receipt and the complete source inventory.

    This does NOT attest that tests were run independently, prove browser or
    native GLPK behavior, or authorize merging/release.
    """
    verify_assembly(path, allow_build_artifacts=True)
    assembly_path=path/'evidence/assembly.json'
    receipt_path=path/'evidence/qualification.json'
    receipt=json.loads(receipt_path.read_text(encoding='utf-8'))
    assembly=json.loads(assembly_path.read_text(encoding='utf-8'))
    if (receipt.get('schema')!='tredven.learnharness.r16.qualification.v1' or
        receipt.get('result')!='TECHNICAL_PASS_NOT_RELEASE_APPROVAL' or
        receipt.get('procedure')!='qualify-r16.sh-r16.7' or
        receipt.get('assemblyReceiptSha256')!=sha256(assembly_path.read_bytes()) or
        receipt.get('upstreamSha')!=assembly.get('upstream_sha') or
        receipt.get('r15Sha')!=assembly.get('r15_sha') or
        receipt.get('addonPackLockSha256')!=assembly.get('addon_pack_lock_sha256') or
        receipt.get('releaseApproved') is not False or
        receipt.get('mergeApproved') is not False or
        receipt.get('signedAttestation') is not False):
        raise Blocked('QUALIFICATION_RECEIPT_INVALID_OR_SOURCE_DRIFT')
    expected=['pre-source-integrity','npm-ci','lint','typecheck','npm-test',
              'build','r15-focused-node-tests','loopback-next-http-smoke','post-source-integrity']
    if receipt.get('gates')!=expected:
        raise Blocked('QUALIFICATION_GATE_LIST_DRIFT')
    lock=path/'assembled/package-lock.json'
    digest=sha256(lock.read_bytes()) if lock.is_file() else None
    if receipt.get('packageLockSha256')!=digest:
        raise Blocked('QUALIFICATION_LOCK_HASH_DRIFT')
    print('R16_TECHNICAL_RECEIPT=PASS_NOT_RELEASE_APPROVAL')


def update_risk(path: str) -> str:
    high=('src/core/','src/server/','src/agent/','src/store/','electron/','app/api/','components/chat')
    medium=('package.json','package-lock.json','tsconfig.json','next.config','eslint.config','app/','components/')
    if path.startswith(high): return 'high'
    if path.startswith(medium): return 'medium'
    return 'low'


def compare_assemblies(previous: Path, candidate: Path) -> dict:
    verify_assembly(previous, allow_build_artifacts=True)
    verify_assembly(candidate, allow_build_artifacts=True)
    old=json.loads((previous/'evidence/assembly.json').read_text())
    new=json.loads((candidate/'evidence/assembly.json').read_text())
    if (old['profile'],old['native_route_installed'],old.get('addon_namespace'))!=(new['profile'],new['native_route_installed'],new.get('addon_namespace')):
        raise Blocked('UPDATE_PROFILE_DRIFT')
    if old['new_paths']!=new['new_paths']:
        raise Blocked('UPDATE_ADDON_DRIFT')
    if old.get('addon_pack_lock_sha256')!=new.get('addon_pack_lock_sha256'):
        raise Blocked('UPDATE_PACK_IDENTITY_CHANGED')
    old_inventory=json.loads((previous/'evidence/upstream-files.json').read_text())['files']
    next_inventory=json.loads((candidate/'evidence/upstream-files.json').read_text())['files']
    added=sorted(set(next_inventory)-set(old_inventory))
    removed=sorted(set(old_inventory)-set(next_inventory))
    changed=sorted(x for x in set(old_inventory)&set(next_inventory) if old_inventory[x]!=next_inventory[x])
    risk={'high':0,'medium':0,'low':0}
    for x in added+removed+changed: risk[update_risk(x)]+=1
    no_drift=not (added or removed or changed)
    return {
        'schema':UPDATE_SCHEMA,
        'from_upstream_sha':old['upstream_sha'],'to_upstream_sha':new['upstream_sha'],
        'addon_r15_sha':R15,'addon_pack_lock_sha256':new.get('addon_pack_lock_sha256'),
        'profile':new['profile'],'native_route_installed':new['native_route_installed'],
        'upstream_added':added,'upstream_modified':changed,'upstream_deleted':removed,
        'changed_paths_count':len(added)+len(removed)+len(changed),
        'risk_counts':risk,'recommended_review':'full-runtime-qualification-required' if not no_drift else 'same-content-source-only',
        'decision':'NO_GO_UNTIL_EXPLICIT_OPERATOR_REVIEW',
        'note':'Heuristic scope classification, not a semantic API or security compatibility proof.',
    }


def cli():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='command', required=True)
    m = sub.add_parser('migrate', help='LEGACY ONLY, disabled in R16.5; use freeze-pack + assemble-pack')
    m.add_argument('--upstream', required=True, type=Path)
    m.add_argument('--r15', required=True, type=Path)
    m.add_argument('--out', required=True, type=Path)
    m.add_argument('--upstream-ref', default='HEAD', help='Locally present commit/ref; no implicit fetch')
    m.add_argument('--profile', choices=('core','workbench'), default='workbench', help='Default: complete R15 standalone Workbench; core retains R16.1 small UI')
    m.add_argument('--native-route', action='store_true', help='Add existing R15 local-only native diagnostic route; DOES NOT enable runtime execution')
    a1 = sub.add_parser('verify-assembly', help='Reject modifications, extra paths and symlinks before npm test')
    a1.add_argument('--path', required=True, type=Path)
    a1.add_argument('--post-build', action='store_true', help='Ignore only node_modules, .next and known generated root files; hash all tracked source')
    v = sub.add_parser('verify-export', help='Verify exported add-on source hashes and transitive closure')
    v.add_argument('--path', required=True, type=Path)
    v.add_argument('--profile', choices=('core','workbench'), default='core')
    f = sub.add_parser('freeze-pack', help='Export R15 additions once into self-contained portable, immutable-locked add-on source')
    f.add_argument('--r15', required=True, type=Path)
    f.add_argument('--out', required=True, type=Path)
    vp = sub.add_parser('verify-pack', help='Reject missing/changed/added pack files, links and incomplete module closures')
    vp.add_argument('--path', required=True, type=Path)
    ap = sub.add_parser('assemble-pack', help='Build disposable upstream + frozen add-on pack, no R15 checkout required')
    ap.add_argument('--upstream', required=True, type=Path)
    ap.add_argument('--addon-pack', required=True, type=Path)
    ap.add_argument('--upstream-ref', default='HEAD')
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--profile', choices=('core','workbench'), default='workbench')
    ap.add_argument('--native-route', action='store_true')
    up = sub.add_parser('plan-update', help='Assemble updated upstream candidate and compare both source inventories')
    up.add_argument('--current', required=True, type=Path)
    up.add_argument('--upstream', required=True, type=Path)
    up.add_argument('--addon-pack', required=True, type=Path)
    up.add_argument('--upstream-ref', required=True)
    up.add_argument('--out', required=True, type=Path)
    up.add_argument('--profile', choices=('core','workbench'), default='workbench')
    up.add_argument('--native-route', action='store_true')
    qa = sub.add_parser('verify-qualification', help='Verify real-run technical receipt against source and pack inventory; never authorize release')
    qa.add_argument('--path',required=True,type=Path)
    ca = sub.add_parser('compare-assemblies', help='Read-only upstream file change/risk report for two assembled candidates')
    ca.add_argument('--previous', required=True, type=Path)
    ca.add_argument('--candidate', required=True, type=Path)
    a = p.parse_args()
    try:
        if a.command=='freeze-pack':
            freeze_pack(a.r15,a.out)
        elif a.command=='verify-pack':
            obj=verify_pack(a.path)
            print(f'R16_PACK_INTEGRITY=PASS_{len(obj["added"])}_SOURCE_FILES\nRELEASE=NO_GO_UNQUALIFIED')
        elif a.command=='assemble-pack':
            assemble_portable(a.upstream,a.addon_pack,a.out,a.upstream_ref,a.profile,a.native_route)
        elif a.command=='plan-update':
            assemble_portable(a.upstream,a.addon_pack,a.out,a.upstream_ref,a.profile,a.native_route,a.current)
        elif a.command=='verify-qualification':
            verify_qualification(a.path)
        elif a.command=='compare-assemblies':
            print(json.dumps(compare_assemblies(a.previous,a.candidate),indent=2,ensure_ascii=False))
        elif a.command=='migrate':
            raise Blocked('LEGACY_MIGRATE_DISABLED_IN_R16_5: use freeze-pack + assemble-pack')
        elif a.command == 'verify-assembly':
            verify_assembly(a.path, a.post_build)
        else:
            verify_export(a.path,a.profile)
    except (Blocked, OSError, ValueError, UnicodeError, tarfile.TarError) as e:
        print(f'R16_BLOCKED: {e}',file=sys.stderr)
        sys.exit(3)

if __name__=='__main__': cli()
