"""R16.13 fail-closed, offline security-source integration regressions."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('r1613_gate', Path(__file__).resolve().parents[1] / 'r1613-security-upstream.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


def call(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args]).decode().strip()


def put(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


class SecurityGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        call(self.repo, 'init', '-q')
        call(self.repo, 'config', 'user.email', 'tests@example.invalid')
        call(self.repo, 'config', 'user.name', 'Security tests')
        self.base_package = {'name': 'fixture', 'scripts': {'test': 'exit 0'},
                             'overrides': {'katex': '$katex'}}
        self.base_lock = {'name': 'fixture', 'version': '1.0.0', 'lockfileVersion': 3,
                          'packages': {'': {'name': 'fixture'}, 'node_modules/linkify-it':
                                       {'version': '3.0.3', 'integrity': 'sha512-old',
                                        'resolved': 'https://registry.npmjs.org/linkify-it/-/linkify-it-3.0.3.tgz'}}}
        put(self.repo / 'package.json', self.base_package)
        put(self.repo / 'package-lock.json', self.base_lock)
        call(self.repo, 'add', '.')
        call(self.repo, 'commit', '-qm', 'base')
        self.base = call(self.repo, 'rev-parse', 'HEAD')
        self.sec_package = dict(self.base_package)
        self.sec_package['overrides'] = {'katex': '$katex',
                                         'ansi-to-react': {'linkify-it': '5.0.2'}}
        self.sec_lock = json.loads(json.dumps(self.base_lock))
        self.sec_lock['packages']['node_modules/linkify-it'] = {
            'version': '5.0.2', 'integrity': 'sha512-new',
            'resolved': 'https://registry.npmjs.org/linkify-it/-/linkify-it-5.0.2.tgz'}
        put(self.repo / 'package.json', self.sec_package)
        put(self.repo / 'package-lock.json', self.sec_lock)
        call(self.repo, 'add', '.')
        call(self.repo, 'commit', '-qm', 'security')
        self.sec = call(self.repo, 'rev-parse', 'HEAD')

    def gate(self, **kwargs):
        return gate.source_gate(self.repo, base=self.base, head=self.sec,
                                expected_changes=1,
                                required_versions={'node_modules/linkify-it': '5.0.2'},
                                **kwargs)

    def test_legitimate_security_commit(self):
        self.gate()

    def test_dirty_repo_blocks(self):
        (self.repo / 'unexpected.txt').write_text('untracked')
        with self.assertRaisesRegex(gate.Blocked, 'NOT_CLEAN'):
            self.gate()

    def test_wrong_head_blocks(self):
        with self.assertRaisesRegex(gate.Blocked, 'HEAD_DRIFT'):
            gate.source_gate(self.repo, base=self.base, head=self.base)

    def test_extra_source_file_blocks(self):
        (self.repo / 'new.txt').write_text('bad')
        call(self.repo, 'add', '.')
        call(self.repo, 'commit', '-qm', 'extra')
        extra = call(self.repo, 'rev-parse', 'HEAD')
        with self.assertRaisesRegex(gate.Blocked, 'DIFF_SCOPE'):
            gate.source_gate(self.repo, base=self.base, head=extra,
                             expected_changes=1, required_versions={})

    def test_package_json_unapproved_script_blocks(self):
        original = json.loads((self.repo / 'package.json').read_text())
        original['scripts']['test'] = 'echo changed'
        put(self.repo / 'package.json', original)
        call(self.repo, 'add', '.')
        call(self.repo, 'commit', '-qm', 'bad script')
        with self.assertRaisesRegex(gate.Blocked, 'NOT_SCOPED'):
            gate.source_gate(self.repo, base=self.base,
                             head=call(self.repo, 'rev-parse', 'HEAD'),
                             expected_changes=1, required_versions={})

    def test_unknown_registry_blocks(self):
        new = json.loads((self.repo / 'package-lock.json').read_text())
        new['packages']['node_modules/linkify-it']['resolved'] = 'https://untrusted.invalid/package.tgz'
        put(self.repo / 'package-lock.json', new)
        call(self.repo, 'add', '.')
        call(self.repo, 'commit', '-qm', 'bad source')
        with self.assertRaisesRegex(gate.Blocked, 'UNKNOWN_REGISTRY'):
            gate.source_gate(self.repo, base=self.base,
                             head=call(self.repo, 'rev-parse', 'HEAD'),
                             expected_changes=1, required_versions={})

    def test_install_script_change_blocks(self):
        new = json.loads((self.repo / 'package-lock.json').read_text())
        new['packages']['node_modules/linkify-it']['hasInstallScript'] = True
        put(self.repo / 'package-lock.json', new)
        call(self.repo, 'add', '.')
        call(self.repo, 'commit', '-qm', 'bad install script')
        with self.assertRaisesRegex(gate.Blocked, 'INSTALL_SCRIPT_CHANGE'):
            gate.source_gate(self.repo, base=self.base,
                             head=call(self.repo, 'rev-parse', 'HEAD'),
                             expected_changes=1, required_versions={})

    def test_changed_count_mismatch_blocks(self):
        with self.assertRaisesRegex(gate.Blocked, 'CHANGED_ENTRIES'):
            gate.source_gate(self.repo, base=self.base, head=self.sec,
                             expected_changes=33, required_versions={})

    def test_inventory_matches_actual_git_archive(self):
        inventory = gate.git_inventory(self.repo, self.sec)
        self.assertEqual(len(inventory), 2)
        self.assertEqual(inventory['package.json'], gate.digest((self.repo / 'package.json').read_bytes()))

    def test_missing_ancestor_commit_blocks(self):
        with self.assertRaisesRegex(gate.Blocked, 'GIT_FAILED'):
            gate.source_gate(self.repo, base='0'*40, head=self.sec,
                             expected_changes=1, required_versions={})

    def test_external_source_inventory_mismatch_blocks(self):
        candidate = self.root / 'candidate'
        (candidate/'evidence').mkdir(parents=True)
        put(candidate/'evidence/assembly.json', {
            'upstream_sha': self.sec, 'profile': 'workbench',
            'native_glpk_enabled_by_r16': False, 'native_route_installed': False,
            'status': 'ASSEMBLED_UNQUALIFIED'})
        put(candidate/'evidence/upstream-files.json', {
            'upstream_sha': self.sec, 'files': {'package.json': 'a'*64}})
        real_run = subprocess.run

        def harmless_verify(args, *a, **kw):
            if len(args)>1 and str(args[1]).endswith('/r16.py'):
                return subprocess.CompletedProcess(args, 0, stdout='R16_ASSEMBLY_INTEGRITY=PASS', stderr='')
            return real_run(args, *a, **kw)

        with patch.object(gate.subprocess, 'run', side_effect=harmless_verify):
            with self.assertRaisesRegex(gate.Blocked, 'EXTERNAL_GIT_SOURCE_INVENTORY'):
                gate.candidate_gate(self.repo, candidate, self.sec)


if __name__ == '__main__':
    unittest.main()
