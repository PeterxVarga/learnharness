"""Fail-closed synthetic testing for R16.12 historical-run reconciliation."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('r16_reconcile_test', HERE/'resume-r1612-evidence.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def synthetic_log(*, npm_tests=3187, npm_pass=3187, npm_fail=0, node='v26.13.0',
                  blocker='R16_BLOCKED: ASSEMBLED_FILE_TAMPER: next-env.d.ts'):
    workspace = '/tmp/fake-isolated-run'
    lines = [
        'R16_12_OWNER_RUN_START=2026-10-31T20:00:00Z',
        'WORKSPACE=' + workspace,
        'NODE=' + node + ' NPM=11.6.4 PYTHON=Python 3.14.6',
        '===== 1/5: clone exact source histories in isolated workspace =====',
        'PINNED_UPSTREAM=' + mod.UP,
        'PINNED_R15=' + mod.R15,
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
        '# tests ' + str(npm_tests),
        '# pass ' + str(npm_pass),
        '# fail ' + str(npm_fail),
        '> learnharness@0.4.1 build',
        '> next build',
        mod.HTTP,blocker,
        'R16_REAL_CODE_QUALIFICATION=FAIL_OR_BLOCKED exit=3',
        'WORKSPACE=' + workspace,
    ]
    # A genuine log is much larger; synthetic fillers make size realistic.
    lines.extend('notice log fixture '+str(n) for n in range(125))
    return '\n'.join(lines).encode(), Path(workspace)


class ReconciliationLogChecks(unittest.TestCase):
    def test_exact_expected_run(self):
        text, workspace = synthetic_log()
        report = mod.checked_log(text, workspace)
        self.assertEqual(report['npmTests'],3187)
        self.assertEqual(report['npmFailed'],0)
        self.assertEqual(report['originalExitCode'],3)

    def test_node26_pretty_reporter_is_accepted(self):
        data,w=synthetic_log()
        for field in ('tests','pass','fail'):
            data=data.replace(('# '+field+' ').encode(), ('ℹ '+field+' ').encode())
        data=data.replace('ℹ tests 3187'.encode(),
                          'ℹ tests 3187\nℹ suites 529'.encode())
        result=mod.checked_log(data,w)
        self.assertEqual((result['npmTests'],result['npmPassed'],result['npmFailed']),
                         (3187,3187,0))

    def test_pretty_reporter_with_ansi_codes(self):
        data,w=synthetic_log()
        for field in ('tests','pass','fail'):
            data=data.replace(('# '+field+' ').encode(),
                ('\x1b[32mℹ '+field+' ').encode())
        data=data.replace(b'3187\n',b'3187\x1b[0m\n')
        data=data.replace(b'# fail 0', '\x1b[32mℹ fail 0\x1b[0m'.encode())
        self.assertEqual(mod.checked_log(data,w)['npmPassed'],3187)

    def test_duplicate_reporter_summary_blocks(self):
        data,w=synthetic_log()
        data=data.replace(b'# tests 3187', '# tests 3187\nℹ tests 3187'.encode())
        with self.assertRaisesRegex(mod.Blocked,'NPM_TEST_SUMMARY_MISSING_OR_AMBIGUOUS'):
            mod.checked_log(data,w)

    def test_mixed_reporter_fields_block(self):
        data,w=synthetic_log()
        data=data.replace(b'# pass 3187','ℹ pass 3187'.encode())
        with self.assertRaisesRegex(mod.Blocked,'NPM_TEST_REPORTER_OR_ORDER_DRIFT'):
            mod.checked_log(data,w)

    def test_pretty_reporter_failure_blocks(self):
        data,w=synthetic_log(npm_pass=3186,npm_fail=1)
        for field in ('tests','pass','fail'):
            data=data.replace(('# '+field+' ').encode(), ('ℹ '+field+' ').encode())
        with self.assertRaisesRegex(mod.Blocked,'NPM_TEST_NOT_ALL_PASS'):
            mod.checked_log(data,w)

    def test_pretty_failure_marker_blocks_even_with_forged_success_summary(self):
        data,w=synthetic_log()
        data=data.replace(b'# tests 3187', '✖ failed subtest\nℹ tests 3187'.encode())
        data=data.replace(b'# pass 3187','ℹ pass 3187'.encode())
        data=data.replace(b'# fail 0','ℹ fail 0'.encode())
        with self.assertRaisesRegex(mod.Blocked,'NPM_TEST_HAS_NOT_OK'):
            mod.checked_log(data,w)

    def test_missing_actual_http_result_blocks(self):
        b,w=synthetic_log()
        with self.assertRaisesRegex(mod.Blocked,'LOG_MARKER_NOT_UNIQUE'):
            mod.checked_log(b.replace(mod.HTTP.encode(),b'R16_HTTP=FAIL'),w)

    def test_failed_or_partial_tests_block(self):
        for args in ({'npm_pass':3186,'npm_fail':1},{'npm_tests':2000,'npm_pass':2000},):
            with self.subTest(args=args):
                b,w=synthetic_log(**args)
                with self.assertRaisesRegex(mod.Blocked,'NPM_TEST_NOT_ALL_PASS'):
                    mod.checked_log(b,w)

    def test_unexpected_reason_or_node_blocks(self):
        for args in ({'node':'v22.23.1'},{'blocker':'R16_BLOCKED: ASSEMBLED_FILE_TAMPER: src/server/malicious.ts'}):
            b,w=synthetic_log(**args)
            with self.subTest(args=args), self.assertRaises(mod.Blocked):
                mod.checked_log(b,w)

    def test_duplicate_http_result_blocks(self):
        b,w=synthetic_log()
        with self.assertRaisesRegex(mod.Blocked,'LOG_MARKER_NOT_UNIQUE'):
            mod.checked_log(b+b'\n'+mod.HTTP.encode()+b'\n',w)

    def test_out_of_order_build_blocks(self):
        b,w=synthetic_log()
        b=b.replace(b'> next build\n',b'> next build PREMATURE\n')
        with self.assertRaisesRegex(mod.Blocked,'LOG_REQUIRED_MARKER_MISSING'):
            mod.checked_log(b,w)

    def test_another_blocker_blocks(self):
        b,w=synthetic_log()
        b=b.replace(mod.HTTP.encode(),b'R16_BLOCKED: OTHER_SECURITY_ERROR\n'+mod.HTTP.encode())
        with self.assertRaisesRegex(mod.Blocked,'OTHER_R16_BLOCKER_IN_LOG'):
            mod.checked_log(b,w)

    def test_no_unsafe_receipt_is_written_by_log_parser(self):
        with tempfile.TemporaryDirectory() as d:
            b,w=synthetic_log()
            mod.checked_log(b,w)
            self.assertFalse(any(Path(d).iterdir()))


if __name__ == '__main__':
    unittest.main()

class ReconciliationReceipt(unittest.TestCase):
    def fake_workspace(self, td):
        import json
        root=Path(td)/'fake-isolated-run'
        for dirname in ('upstream','r15-fork','candidate/evidence','candidate/assembled'):
            (root/dirname).mkdir(parents=True)
        log,_=synthetic_log()
        (root/'qualification.log').write_bytes(log.replace(b'/tmp/fake-isolated-run',str(root).encode()))
        assembly={
            'upstream_sha':mod.UP,'r15_sha':mod.R15,'profile':'workbench',
            'native_glpk_enabled_by_r16':False,'core_files_overwritten':0,
            'upstream_tracked_file_count':712,'new_path_count':55,
        }
        (root/'candidate/evidence/assembly.json').write_text(json.dumps(assembly))
        (root/'candidate/assembled/package-lock.json').write_text('{}\n')
        verifier=root/'r16.py'
        verifier.write_text('def verify_assembly(path, allow_build_artifacts=False):\n'
                            '    assert allow_build_artifacts and path.is_dir()\n')
        return root,verifier

    def test_evidence_only_receipt_is_private_and_cannot_overwrite(self):
        import json
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as td:
            root,verifier=self.fake_workspace(td)
            with patch.object(mod,'git', side_effect=lambda repo,*args: ('' if args[0]=='status' else mod.UP if repo.name=='upstream' else mod.R15)):
                outcome=mod.reconcile(root,verifier,write=True)
                file=root/'candidate/evidence'/mod.RECEIPT_NAME
                self.assertTrue(file.is_file())
                self.assertEqual(file.stat().st_mode&0o777,0o600)
                saved=json.loads(file.read_text())
                self.assertFalse(saved['releaseApproved'])
                self.assertTrue(saved['notAnOfficialR16QualificationReceipt'])
                self.assertEqual(saved['originalRunnerResult'],'FAIL_OR_BLOCKED_EXIT_3')
                self.assertEqual(outcome['logSha256'],saved['logSha256'])
                self.assertFalse((root/'candidate/evidence/qualification.json').exists())
                with self.assertRaises(FileExistsError):
                    mod.reconcile(root,verifier,write=True)

    def test_source_drift_blocks_before_writing(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as td:
            root,verifier=self.fake_workspace(td)
            with patch.object(mod,'git',side_effect=lambda repo,*args: 'BAD' if args[0]=='rev-parse' else ''):
                with self.assertRaisesRegex(mod.Blocked,'PINNED_REPO_DRIFT'):
                    mod.reconcile(root,verifier,write=True)
            self.assertFalse((root/'candidate/evidence'/mod.RECEIPT_NAME).exists())
