"""R16.9 one-seam task context, portable packaging, no writes to upstream."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import test_r168 as base

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_for_r169',ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r16)

class TaskAwareHandoff(unittest.TestCase):
    def test_one_seam_in_original_addon_exam_passes_same_task_used_for_grade(self):
        source=base.R15_SOURCE.replace("  const grade={points:0},task=", "  const grade={points:0},task=")
        result,_=r16.transform_workbench_type(r16.TYPE_BOUNDARY,source.encode())
        txt=result.decode()
        self.assertEqual(txt.count('<TredvenTeachingHandoff'),1)
        self.assertIn('grade={grade} taskKind={kind} task={task} diagnostic={r15bBrief}',txt)
        self.assertIn('standalone no chatId coupling',_.get('changes'))
        self.assertEqual(txt.count("import {TredvenTeachingHandoff}"),1)

    def test_task_context_is_shipped_by_portable_pack_and_reassembled_without_r15(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            up,fork,pack,candidate=base.TeachingHandoffIntegration().create(root)
            name='learning/public-task-context-r169.mjs'
            payload=pack/'overlays/workbench'/name
            self.assertTrue(payload.is_file())
            self.assertTrue((candidate/'assembled'/r16.namespaced_path(name)).is_file())
            self.assertEqual(payload.read_bytes(),(candidate/'assembled'/r16.namespaced_path(name)).read_bytes())
            # original legacy user files and original upstream unchanged
            self.assertEqual((up/'README.md').read_text(),'UPSTREAM_ONLY\n')
            self.assertEqual(json.loads((candidate/'evidence/assembly.json').read_text())['core_files_overwritten'],0)
            result=subprocess.run(['node','--test',str(candidate/'assembled'/r16.namespaced_path('learning/public-task-context-r169.test.mjs'))],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stdout+'\n'+result.stderr)
            manifest=json.loads((pack/'manifest.json').read_text())
            with patch.object(r16,'BASE',manifest['base']), patch.object(r16,'R15',manifest['r15']):
                r16.verify_assembly(candidate)

    def test_tampered_task_context_invalidates_assembly(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            _,_,_,candidate=base.TeachingHandoffIntegration().create(root)
            source=candidate/'assembled'/r16.namespaced_path('learning/public-task-context-r169.mjs')
            source.write_text(source.read_text()+'\n// unexpected change\n')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(candidate)

    def test_task_context_absent_in_core_profile(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            _,_,_,candidate=base.TeachingHandoffIntegration().create(root,'core')
            self.assertFalse((candidate/'assembled'/r16.namespaced_path('learning/public-task-context-r169.mjs')).exists())

    def test_teaching_handoff_never_sends_or_writes_a_grade(self):
        comp=(ROOT/'overlay-workbench/components/tredven-teaching-handoff.tsx').read_text()
        for forbidden in ('fetch(', 'setGrade(', 'postMessage(', 'localStorage.', 'sessionStorage.', 'getChat('):
            self.assertNotIn(forbidden,comp)
        self.assertIn('href="/chat/new?mode=teach"',comp)
        self.assertIn('task:unknown',comp)
        self.assertIn('setCopyState(\'idle\')',comp)
        pure=(ROOT/'overlay-workbench/learning/public-task-context-r169.mjs').read_text()
        for forbidden in ('fetch(', 'localStorage', 'node:fs', 'child_process', 'gradeGusekExam(', 'Math.random(', 'process.env'):
            self.assertNotIn(forbidden,pure)

    def test_final_qualification_includes_new_tests_without_new_stage(self):
        gate=(ROOT/'qualify-r16.sh').read_text()
        self.assertIn('learning/public-task-context-r169.test.mjs',gate)
        self.assertEqual(len([x for x in gate.splitlines() if x.strip()=='npm ci']),1)
        self.assertIn('verify-assembly --path "$ROOT" --post-build',gate)

if __name__=='__main__':unittest.main()
