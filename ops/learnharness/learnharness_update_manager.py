#!/usr/bin/env python3
"""LearnHarness GUSEK persistent, fail-closed localhost upgrade manager.

No network downloads, npm install, source writes, model calls or automatic merges.
Usage:
  python3 learnharness_update_manager.py bootstrap
  ~/.local/bin/learnharness-update status
  ~/.local/bin/learnharness-update upgrade --app /path/to/assembled --tag vNEXT --receipt /path/to/qualified.txt
  ~/.local/bin/learnharness-update rollback --accept-data-rollback
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

HOME = Path.home().resolve()
ROOT = HOME / '.local' / 'state' / 'learnharness-managed'
WORK = HOME / 'Downloads' / 'learnharness-v050-gusek-R4-OH9UP8uo'
BASE_APP = WORK / 'assembly-r6' / 'assembled'
ACTIVE_PORT = 37420
PROBE_PORT = 37421
MIN_HEADROOM = 512 * 1024 * 1024
MANAGER_VERSION = '1.0.0'
PIN_GUSEK = '0ffd4cf5026105ba6df402120341b9da7a533fe7'
PIN_INTEGRATION = '96c684029c2116ad5117168951598a2fd57fcd2b'


def fail(message: str):
    raise RuntimeError('BLOCKED_' + message)


def require_regular(path: Path):
    if path.is_symlink() or not path.is_file():
        fail('UNSAFE_OR_MISSING_FILE_' + path.name)
    return path


def safe_dir(path: Path, create: bool = False):
    if create:
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not path.is_dir() or path.is_symlink():
        fail('UNSAFE_DIRECTORY_' + path.name)
    if path.stat().st_uid != os.getuid():
        fail('DIRECTORY_NOT_OWNED_' + path.name)
    if create:
        path.chmod(0o700)
    return path


def read_receipt(path: Path):
    require_regular(path)
    lines = path.read_text('utf-8').splitlines()
    result = {}
    for line in lines:
        if '=' in line and not line.startswith('#'):
            key, value = line.split('=', 1)
            result[key] = value
    return result


def atomic_json(path: Path, value):
    safe_dir(path.parent, create=True)
    fd, name = tempfile.mkstemp(prefix='.write-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as fh:
            json.dump(value, fh, indent=2, sort_keys=True)
            fh.write('\n')
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(name, path)
        dirfd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try: os.fsync(dirfd)
        finally: os.close(dirfd)
    finally:
        if os.path.exists(name): os.unlink(name)


def load():
    p = require_regular(ROOT / 'state.json')
    d = json.loads(p.read_text('utf-8'))
    if d.get('schema') != 1 or 'active' not in d or 'runtime' not in d:
        fail('UNKNOWN_STATE_SCHEMA')
    return d


def lock():
    safe_dir(ROOT, create=True)
    f = open(ROOT / '.lock', 'a+', encoding='utf8')
    try:
        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        f.close()
        fail('MANAGER_ALREADY_RUNNING')
    return f


def file_sha(p: Path):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def inventory(folder: Path):
    safe_dir(folder)
    result = {}
    for base, dirs, files in os.walk(folder, followlinks=False):
        for d in dirs:
            p = Path(base) / d
            if p.is_symlink() or not p.is_dir(): fail('SYMLINK_IN_DATA')
        for name in files:
            p = Path(base) / name
            st = p.lstat()
            if not stat.S_ISREG(st.st_mode) or p.is_symlink() or st.st_nlink != 1:
                fail('UNSAFE_DATA_ENTRY')
            rel = p.relative_to(folder).as_posix()
            if name.lower() in ('auth.json', '.env', '.env.local') or name.lower().endswith('-credentials.json'):
                fail('CREDENTIAL_INSIDE_DATA')
            if len(result) >= 35000: fail('TOO_MANY_DATA_FILES')
            if st.st_size > 512 * 1024 * 1024: fail('OVERSIZED_SINGLE_DATA_FILE')
            result[rel] = (st.st_size, file_sha(p))
    chat_ids, messages = {}, 0
    for rel in result:
        if rel.startswith('chats/') and rel.endswith('.json') and rel.count('/') == 1:
            p = folder / rel
            doc = json.loads(p.read_text('utf8'))
            if not isinstance(doc, dict) or not isinstance(doc.get('messages'), list) or doc.get('id') != p.stem:
                fail('INVALID_CHAT_RECORD')
            chat_ids[doc['id']] = len(doc['messages'])
            messages += len(doc['messages'])
    if not chat_ids or 'graph/sources.json' not in result:
        fail('EXPECTED_LEARNER_STATE_NOT_FOUND')
    if not isinstance(json.loads((folder/'graph/sources.json').read_text('utf8')), (dict, list)):
        fail('INVALID_GRAPH_SOURCES')
    return dict(sorted(result.items())), chat_ids, messages


def snapshot(source: Path, target: Path):
    if target.exists() or target.is_symlink(): fail('SNAPSHOT_TARGET_EXISTS')
    before, ids, messages = inventory(source)
    amount = sum(a for a, _ in before.values())
    free = shutil.disk_usage(ROOT).free
    if free < amount * 2 + MIN_HEADROOM: fail('LOW_DISK_NO_SNAPSHOT')
    target.mkdir(mode=0o700, parents=False)
    try:
        for relative in before:
            src = source / relative
            dest = target / relative
            dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            # Opened source descriptors cannot follow a last-minute symlink replacement.
            fd = os.open(src, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
            try:
                st = os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1: fail('DATA_CHANGED_DURING_COPY')
                out = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
                with os.fdopen(out, 'wb') as sink, os.fdopen(fd, 'rb', closefd=False) as stream:
                    shutil.copyfileobj(stream, sink, 1024 * 1024)
            finally: os.close(fd)
        after, _, _ = inventory(source)
        copied, copied_ids, copied_messages = inventory(target)
        if before != after or before != copied or ids != copied_ids or messages != copied_messages:
            fail('SOURCE_MOVED_OR_SNAPSHOT_MISMATCH')
        return dict(files=len(before), bytes=amount, chats=len(ids), messages=messages, ids=ids, fingerprint=fingerprint(before))
    except Exception:
        # Never delete an interrupted snapshot. Preserve for local forensics.
        raise


def fingerprint(inv: dict):
    payload = json.dumps(inv, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(payload).hexdigest()


def new_generation():
    gens = safe_dir(ROOT / 'generations', create=True)
    gen = 'g-' + time.strftime('%Y%m%d-%H%M%S') + '-' + os.urandom(4).hex()
    slot = gens / gen
    slot.mkdir(mode=0o700)
    return gen, slot


def app_ok(path: Path):
    if path.is_symlink() or not path.is_dir(): fail('UNSAFE_APP_PATH')
    path = path.resolve(strict=True)
    require_regular(path / '.next' / 'standalone' / 'server.js')
    safe_dir(path / '.next' / 'standalone' / '.next' / 'static')
    return path


def freeze_app(app: Path, tag: str):
    """Put a qualified standalone payload outside Downloads, preserving Btrfs reflinks.

    The original build is not moved, linked, chmodded or edited. A future
    Downloads cleanup therefore cannot silently remove the active program.
    """
    app = app_ok(app)
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}', tag):
        fail('INVALID_VERSION_TAG')
    releases = safe_dir(ROOT / 'releases', create=True)
    release = releases / (tag + '-' + os.urandom(4).hex())
    release.mkdir(mode=0o700)
    dest_root = release / 'app'
    (dest_root / '.next').mkdir(parents=True, mode=0o700)
    src = app / '.next' / 'standalone'
    target = dest_root / '.next' / 'standalone'
    # Coreutils cp --reflink=auto avoids doubling Btrfs data blocks when
    # the source and destination share a filesystem. Never use hardlinks:
    # a write must not alter the old release through a shared inode.
    if shutil.disk_usage(ROOT).free < MIN_HEADROOM:
        fail('LOW_DISK_BEFORE_RELEASE_COPY')
    try:
        subprocess.run(['cp','-a','--reflink=auto','--',str(src),str(target)],
                       check=True, capture_output=True, text=True)
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        fail('RELEASE_COPY_FAILED_' + type(exc).__name__)
    # Protect against standalone node_modules symlinks escaping the release
    # boundary. Allow the relative, internal symlinks normally emitted by Next.
    source_files = {}
    target_files = {}
    for root, output in [(src, source_files), (target, target_files)]:
        for here, dirs, files in os.walk(root, followlinks=False):
            for name in dirs + files:
                path = Path(here) / name
                relative = path.relative_to(root).as_posix()
                st = path.lstat()
                if stat.S_ISLNK(st.st_mode):
                    link = os.readlink(path)
                    if os.path.isabs(link): fail('ABSOLUTE_SYMLINK_IN_RELEASE')
                    if not (path.parent / link).resolve().is_relative_to(root.resolve()):
                        fail('ESCAPING_SYMLINK_IN_RELEASE')
                    output[relative] = ('link', link)
                elif stat.S_ISREG(st.st_mode):
                    output[relative] = ('file', st.st_size)
                elif stat.S_ISDIR(st.st_mode):
                    output[relative] = ('dir', 0)
                else:
                    fail('UNSUPPORTED_RELEASE_ENTRY')
    if source_files != target_files:
        fail('RELEASE_COPY_TREE_MISMATCH')
    if file_sha(src / 'server.js') != file_sha(target / 'server.js'):
        fail('RELEASE_SERVER_HASH_MISMATCH')
    app_ok(dest_root)
    return dest_root


def port_free(port):
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try: s.bind(('127.0.0.1', port))
        except OSError: fail('PORT_BUSY_' + str(port))


def running(session):
    if not isinstance(session, dict): return False
    pid, token = session.get('pid'), session.get('token')
    if not isinstance(pid, int) or not isinstance(token, str): return False
    try:
        env = Path(f'/proc/{pid}/environ').read_bytes().split(b'\x00')
        cmd = Path(f'/proc/{pid}/cmdline').read_bytes()
        status = Path(f'/proc/{pid}/stat').read_text('utf8')
        return (b'LH_MANAGER_TOKEN=' + token.encode() in env
                and b'server.js' in cmd and status.rsplit(')', 1)[1].split()[0] != 'Z')
    except (OSError, ValueError): return False


def start(app: Path, data: Path, port: int, managed_keys: bool):
    port_free(port)
    app_ok(app)
    safe_dir(data)
    runtime = safe_dir(ROOT / 'runtime', create=True)
    for name in ['home', 'cache', 'state', 'config', 'logs', 'secrets']:
        safe_dir(runtime / name, create=True)
    auth = runtime / 'secrets' / 'auth.json' if managed_keys else runtime / 'secrets' / 'UNCONFIGURED_PROBE_AUTH.json'
    if managed_keys and not auth.exists():
        atomic_json(auth, {})
    # Only a fixed, explicitly whitelisted environment enters the model server.
    token = os.urandom(16).hex()
    env = {
        'PATH': os.environ.get('PATH', '/usr/bin:/bin'),
        'HOME': str(runtime / 'home'),
        'XDG_CACHE_HOME': str(runtime / 'cache'),
        'XDG_STATE_HOME': str(runtime / 'state'),
        'XDG_CONFIG_HOME': str(runtime / 'config'),
        'LH_DATA_DIR': str(data),
        'LH_AUTH_FILE': str(auth),
        'NEXT_TELEMETRY_DISABLED': '1',
        'LH_GLPK_ENABLE_LOCAL': '0',
        'NODE_ENV': 'production',
        'HOSTNAME': '127.0.0.1',
        'PORT': str(port),
        'LH_MANAGER_TOKEN': token,
    }
    exe = shutil.which('node')
    if not exe: fail('NODE_MISSING')
    logfile = runtime / 'logs' / ('server-' + str(port) + '.log')
    with logfile.open('ab') as output:
        proc = subprocess.Popen([exe, str(app/'.next/standalone/server.js')],
                                cwd=app, env=env, stdin=subprocess.DEVNULL,
                                stdout=output, stderr=subprocess.STDOUT,
                                start_new_session=True)
    session = {'pid': proc.pid, 'token': token, 'port': port, 'log': str(logfile)}
    # /proc/<pid>/environ can be unreadable until execve completes. Never
    # mistake that startup race for a dead process or abandon an orphan.
    for _ in range(100):
        if running(session): return session
        if proc.poll() is not None:
            fail('SERVER_EXITED_EARLY_LOG_' + str(logfile))
        time.sleep(.05)
    proc.terminate()
    with contextlib.suppress(subprocess.TimeoutExpired): proc.wait(timeout=5)
    fail('SERVER_STARTUP_IDENTITY_TIMEOUT')


def stop(session):
    if not running(session): return False
    pid = session['pid']
    os.kill(pid, signal.SIGTERM)
    for _ in range(40):
        if not running(session):
            # /proc may report a zombie before its listening socket is released.
            # Do not start the replacement until the OS accepts the port again.
            for _ in range(80):
                with socket.socket() as probe:
                    probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                    try:
                        probe.bind(('127.0.0.1', session['port']))
                        return True
                    except OSError:
                        time.sleep(.1)
            fail('PORT_NOT_RELEASED_AFTER_MANAGED_STOP')
        time.sleep(.25)
    # Do not escalate to SIGKILL without operator involvement.
    fail('MANAGED_SERVER_DID_NOT_STOP')


def verify_http(session, expected_ids, expected_files, expected_messages, expected_digest):
    base = 'http://127.0.0.1:' + str(session['port'])
    last = 'not ready'
    for _ in range(80):
        if not running(session): fail('SERVER_PROCESS_DIED')
        try:
            with urlopen(base + '/api/chats', timeout=2) as response:
                if response.status != 200: fail('HTTP_NOT_200')
                doc = json.loads(response.read(4_000_000))
            got = {c['id']: c['messageCount'] for c in doc['chats']}
            if got != expected_ids:
                fail('CHAT_ID_OR_MESSAGE_COUNT_MISMATCH')
            with urlopen(base + '/api/graph/sources', timeout=2) as response:
                if response.status != 200: fail('GRAPH_SOURCE_HTTP_ERROR')
                graph = json.loads(response.read(4_000_000))
                if isinstance(graph, dict) and graph.get('error'): fail('GRAPH_SOURCE_API_ERROR')
            for kind in ['assignment', 'production', 'transport', 'transport_indexed', 'simplex', 'graphical']:
                with urlopen(base + f'/api/pilot/gusek/szakmai?kind={kind}&seed=7', timeout=2) as response:
                    if response.status != 200: fail('GUSEK_HTTP_NOT_200')
                    t = json.loads(response.read(400_000))
                    if t.get('task', {}).get('kind') != kind: fail('GUSEK_WRONG_TASK_KIND')
            # Read-only HTTP qualification must never rewrite learner records.
            files, ids, messages = inventory(Path(session['data']))
            if len(files) != expected_files or messages != expected_messages or ids != expected_ids or fingerprint(files) != expected_digest:
                fail('LEARNER_DATA_MUTATED_DURING_HTTP_QUALIFICATION')
            return True
        except RuntimeError:
            raise
        except Exception as exc:
            last = str(exc)[:160]
            time.sleep(.25)
    fail('HTTP_TIMEOUT_' + last)


def expect_receipt(tag, path, base=False):
    d = read_receipt(path)
    if base:
        if d.get('STATUS') != 'COMPLETED_ISOLATED_NATIVE_HTTP_BROWSER' or d.get('GUSEK_GIT_TREE') != PIN_GUSEK or d.get('INTEGRATED_SOURCE') != PIN_INTEGRATION:
            fail('R8_BASE_RECEIPT_MISMATCH')
    else:
        # A future integrator must produce an explicit, unambiguous qualification receipt.
        if d.get('NATIVE_QUALIFICATION') != 'PASS' or d.get('STANDALONE_HTTP') != 'PASS' or d.get('BROWSER_E2E') != 'PASS' or d.get('GUSEK_SOURCE_INTEGRITY') != 'PASS':
            fail('CANDIDATE_RELEASE_RECEIPT_UNQUALIFIED')
    return {'tag': tag, 'receipt': str(path), 'receipt_sha256': file_sha(path)}


def verify_slot(state):
    act = state['active']
    app = app_ok(Path(act['app']))
    data = safe_dir(ROOT / 'generations' / act['generation'] / 'data')
    return app, data


def install_self():
    dest_dir = safe_dir(HOME / '.local' / 'bin', create=True)
    dest = dest_dir / 'learnharness-update'
    this = Path(__file__).resolve()
    if dest.exists() and file_sha(dest) != file_sha(this):
        fail('DIFFERENT_MANAGER_ALREADY_INSTALLED')
    if not dest.exists():
        shutil.copyfile(this, dest)
    dest.chmod(0o700)
    return dest


def bootstrap(args):
    if (ROOT / 'state.json').exists(): fail('ALREADY_BOOTSTRAPPED')
    source_report = read_receipt(WORK / 'R10_FINAL_STATUS.txt')
    if source_report.get('STATUS') != 'COMPLETED' or source_report.get('MODEL_KEYS_COPIED') != 'NO':
        fail('R10_RECOVERY_RECEIPT_UNQUALIFIED')
    snap = Path(source_report.get('RECOVERY_SNAPSHOT', ''))
    if not str(snap).startswith(str(WORK) + '/') or snap.is_symlink() or not snap.is_dir():
        fail('R10_SNAPSHOT_PATH_UNSAFE')
    source = safe_dir(snap / 'preview' / 'data')
    app = app_ok(BASE_APP)
    receipt = expect_receipt('v0.5.0-gusek-r8', WORK / 'R8_FINAL_STATUS.txt', base=True)
    # Stage a new data copy. Never point the manager at the original live R10 files.
    gen, slot = new_generation()
    proof = snapshot(source, slot / 'data')
    state = {'schema':1,'manager_version':MANAGER_VERSION,
             'active': {'app': str(app), 'generation':gen, **receipt},
             'previous':None,'runtime':None,'bootstrap':{'source':str(source),'chat_count':proof['chats'],'messages':proof['messages']}}
    binary = install_self()
    app = freeze_app(app, 'v0.5.0-gusek-r8')
    state['active']['app'] = str(app)
    act = start(app, slot / 'data', ACTIVE_PORT, managed_keys=True)
    act['data'] = str(slot / 'data')
    try: verify_http(act, proof['ids'], proof['files'], proof['messages'], proof['fingerprint'])
    except Exception:
        stop(act)
        raise
    state['runtime'] = act
    atomic_json(ROOT / 'state.json', state)
    print('BOOTSTRAP=PASS_ISOLATED_MANAGED_INSTANCE')
    print('LEARNER_CHATS_PRESERVED=' + str(proof['chats']))
    print('LEARNER_MESSAGES_PRESERVED=' + str(proof['messages']))
    print('STABLE_URL=http://127.0.0.1:37420')
    print('MANAGER=' + str(binary))
    print('ORIGINAL_R10_37419=UNCHANGED')
    print('IMPORTANT_USE_37420_FOR_ALL_NEW_WORK=YES')
    print('OLD_37419_WRITES_ARE_NOT_SYNCHRONIZED=YES')
    print('NEXT_UPGRADE=learnharness-update upgrade --app /new/assembled --tag vNEXT --receipt /new/qualified.txt')


def status(args):
    state = load(); app, data = verify_slot(state)
    files, ids, messages = inventory(data)
    alive = running(state['runtime'])
    print('MANAGER_VERSION=' + MANAGER_VERSION)
    print('ACTIVE_TAG=' + state['active']['tag'])
    print('ACTIVE_APP=' + str(app))
    print('ACTIVE_GENERATION=' + state['active']['generation'])
    print('ACTIVE_MANAGED_SERVER=' + ('RUNNING' if alive else 'NOT_RUNNING'))
    print('ACTIVE_LEARNER_CHATS=' + str(len(ids)))
    print('ACTIVE_LEARNER_MESSAGES=' + str(messages))
    print('STABLE_URL=http://127.0.0.1:37420')
    print('PREVIOUS_GENERATION=' + (state.get('previous') or {}).get('generation', 'NONE'))
    print('DATA_SEPARATE_FROM_BUILD=YES')
    print('OLD_37419_WRITES_ARE_NOT_SYNCHRONIZED=YES')
    print('ACTIVE_BUILD_IN_PERSISTENT_RELEASE_DIR=' + str(app.is_relative_to(ROOT / 'releases')).upper())
    print('REAL_STUDENT_MODEL_E2E=NOT_PROVEN')


def restart(args):
    state = load()
    if running(state['runtime']): fail('SERVER_ALREADY_RUNNING')
    app, data = verify_slot(state)
    files, ids, messages = inventory(data)
    started = start(app, data, ACTIVE_PORT, True)
    started['data'] = str(data)
    try: verify_http(started, ids, len(files), messages, fingerprint(files))
    except Exception:
        stop(started); raise
    state['runtime'] = started
    atomic_json(ROOT / 'state.json', state)
    print('START=PASS_URL_http://127.0.0.1:37420')


def upgrade(args):
    state = load()
    prev = dict(state['active'])
    app_old, data_old = verify_slot(state)
    new_app = app_ok(Path(args.app).expanduser())
    if new_app == app_old: fail('NEW_VERSION_SAME_AS_ACTIVE')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}', args.tag): fail('INVALID_VERSION_TAG')
    candidate = expect_receipt(args.tag, Path(args.receipt).expanduser().resolve())
    gen, slot = new_generation()
    proof = snapshot(data_old, slot / 'data')
    # The promoted release must be independent of temporary build folders.
    new_app = freeze_app(new_app, args.tag)
    shadow = start(new_app, slot / 'data', PROBE_PORT, False)
    shadow['data'] = str(slot / 'data')
    try:
        verify_http(shadow, proof['ids'], proof['files'], proof['messages'], proof['fingerprint'])
    finally:
        stop(shadow)
    # Preserve the old service if a user wrote any record while the shadow was tested.
    if fingerprint(inventory(data_old)[0]) != proof['fingerprint']:
        fail('ACTIVE_DATA_CHANGED_DURING_UPGRADE_RETRY')
    old_runtime = state['runtime']
    if running(old_runtime):
        stop(old_runtime)
    elif state['runtime'] is not None:
        print('ACTIVE_SERVER_WAS_NOT_RUNNING=YES')
    # Verify again after stopping, so no silent loss of the final user message.
    if fingerprint(inventory(data_old)[0]) != proof['fingerprint']:
        old = start(app_old, data_old, ACTIVE_PORT, True)
        old['data'] = str(data_old)
        state['runtime'] = old
        atomic_json(ROOT/'state.json', state)
        fail('ACTIVE_DATA_CHANGED_DURING_CUTOVER_OLD_RESTARTED')
    try:
        active = start(new_app, slot / 'data', ACTIVE_PORT, True)
        active['data'] = str(slot / 'data')
        verify_http(active, proof['ids'], proof['files'], proof['messages'], proof['fingerprint'])
    except Exception:
        with contextlib.suppress(Exception):
            if 'active' in locals(): stop(active)
        # The original version and original generation are still untouched.
        old = start(app_old, data_old, ACTIVE_PORT, True)
        old['data'] = str(data_old)
        state['runtime'] = old
        atomic_json(ROOT/'state.json', state)
        raise
    state['previous'] = prev
    state['active'] = {'app':str(new_app), 'generation':gen, **candidate}
    state['runtime'] = active
    atomic_json(ROOT/'state.json', state)
    print('UPGRADE=PASS_STAGED_AND_PROMOTED')
    print('STABLE_URL=http://127.0.0.1:37420')
    print('CHAT_MESSAGES_PRESERVED=' + str(proof['messages']))
    print('ROLLBACK_DATA_GENERATION_RETAINED=' + prev['generation'])
    print('LIVE_MODEL_CALLS_NOT_TESTED=YES')


def rollback(args):
    if not args.accept_data_rollback: fail('ROLLBACK_REQUIRES_EXPLICIT_DATA_CHOICE')
    state = load()
    previous = state.get('previous')
    if not previous: fail('NO_PREVIOUS_VERSION')
    app_old = app_ok(Path(previous['app']))
    data_old = safe_dir(ROOT/'generations'/previous['generation']/'data')
    current = dict(state['active'])
    # Preserve current generation with all writes, do NOT delete it.
    if running(state['runtime']): stop(state['runtime'])
    try:
        files, ids, messages = inventory(data_old)
        old = start(app_old, data_old, ACTIVE_PORT, True)
        old['data'] = str(data_old)
        verify_http(old, ids, len(files), messages, fingerprint(files))
    except Exception:
        with contextlib.suppress(Exception):
            if 'old' in locals(): stop(old)
        app_current = app_ok(Path(current['app']))
        current_data = safe_dir(ROOT/'generations'/current['generation']/'data')
        with contextlib.suppress(Exception):
            new = start(app_current, current_data, ACTIVE_PORT, True)
            new['data'] = str(current_data)
            state['runtime'] = new
            atomic_json(ROOT/'state.json', state)
        raise
    state['previous'] = current
    state['active'] = previous
    state['runtime'] = old
    atomic_json(ROOT/'state.json', state)
    print('ROLLBACK=PASS_OLD_GENERATION_RESTORED')
    print('IMPORTANT=POST_UPGRADE_WRITES_RETAINED_IN_ARCHIVED_GENERATION_NOT_MERGED')
    print('STABLE_URL=http://127.0.0.1:37420')


def main():
    p = argparse.ArgumentParser(description='Persistent, versioned and reversible LearnHarness upgrades')
    sub = p.add_subparsers(dest='cmd', required=True)
    sub.add_parser('bootstrap')
    sub.add_parser('status')
    sub.add_parser('start')
    up = sub.add_parser('upgrade')
    up.add_argument('--app', required=True)
    up.add_argument('--tag', required=True)
    up.add_argument('--receipt', required=True)
    rb = sub.add_parser('rollback')
    rb.add_argument('--accept-data-rollback', action='store_true')
    args = p.parse_args()
    try:
        with lock():
            {'bootstrap':bootstrap, 'status':status, 'start':restart,
             'upgrade':upgrade, 'rollback':rollback}[args.cmd](args)
    except Exception as exc:
        print('MANAGER_STATUS=BLOCKED', file=sys.stderr)
        print('REASON=' + str(exc), file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__': main()