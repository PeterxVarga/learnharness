"""R16.8 learning value: full add-on chain, exact extension seam and user-controlled handoff."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import test_r16 as fixtures

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_for_r168',ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r16)

UI_ANCHOR='   {r15Suggestion&&<aside'
R15_SOURCE=("'use client';\n"
    +r16.ORIGINAL_TYPE+'\n'
    +"export function GusekExam() {\n  "+r16.ORIGINAL_CHAT_BINDING+'\n'
    +"  const grade={points:0},task={kind:'transport',id:'gusek-transport-42'};\n"+UI_ANCHOR+' data-testid="gusek-r15-recommendation">\n'
    +"   </aside>}\n return null;\n}\n")

class TeachingHandoffIntegration(unittest.TestCase):
    def test_exact_realistic_r15_source_is_extended_not_overwritten(self):
        data,transform=r16.transform_workbench_type(r16.TYPE_BOUNDARY,R15_SOURCE.encode())
        s=data.decode()
        self.assertIn("import {TredvenTeachingHandoff} from './tredven-teaching-handoff';",s)
        self.assertIn('<TredvenTeachingHandoff grade={grade} taskKind={kind} task={task}',s)
        self.assertEqual(s.count('<TredvenTeachingHandoff '),1)
        self.assertNotIn(r16.ORIGINAL_TYPE,s)
        self.assertNotIn(r16.ORIGINAL_CHAT_BINDING,s)
        self.assertTrue(any('tutoring handoff' in change for change in transform['changes']))

    def test_pinned_real_source_must_have_unique_integration_marker(self):
        with patch.object(r16,'R15',r16.PINNED_R15):
            with self.assertRaisesRegex(r16.Blocked,'R168_PINNED_GUSEK_UI_SEAM_DRIFT'):
                r16.transform_workbench_type(r16.TYPE_BOUNDARY,(R15_SOURCE.replace(UI_ANCHOR,'{no_anchor&&<div') ).encode())
            with self.assertRaisesRegex(r16.Blocked,'R168_PINNED_GUSEK_UI_SEAM_DRIFT'):
                r16.transform_workbench_type(r16.TYPE_BOUNDARY,(R15_SOURCE+UI_ANCHOR+'\n').encode())

    def test_no_duplicate_handoff_in_composed_ui(self):
        data,_=r16.transform_workbench_type(r16.TYPE_BOUNDARY,R15_SOURCE.encode())
        with self.assertRaisesRegex(r16.Blocked,'R15_WORKBENCH_SEAM_DRIFT_REFUSED'):
            r16.transform_workbench_type(r16.TYPE_BOUNDARY,data)

    def create(self,root,profile='workbench'):
        # Synthetic fork has all R15 roots, no upstream internet/npm.
        up,fork,base,head=fixtures.R162WorkbenchTest()._fixture(root,native=True)
        target=fork/r16.TYPE_BOUNDARY
        target.write_text(R15_SOURCE)
        fixtures.git(fork,'add','.')
        fixtures.git(fork,'commit','-qm','R15 synthetic realistic exam marker')
        head=fixtures.git(fork,'rev-parse','HEAD')
        with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
            r16.freeze_pack(fork,root/'pack')
            r16.assemble_portable(up,root/'pack',root/'candidate','HEAD',profile)
            r16.verify_assembly(root/'candidate')
        return up,fork,root/'pack',root/'candidate'

    def test_portable_pack_workbench_integrates_private_handoff(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            up,fork,pack,candidate=self.create(root)
            app=candidate/'assembled'
            self.assertEqual((up/'README.md').read_text(),'UPSTREAM_ONLY\n')
            self.assertIn('R15 synthetic realistic exam marker',fixtures.git(fork,'log','-1','--pretty=%s'))
            ui=(app/r16.namespaced_path(r16.TYPE_BOUNDARY)).read_text()
            self.assertIn('<TredvenTeachingHandoff ',ui)
            for rel in ['components/tredven-teaching-handoff.tsx','learning/teaching-handoff-r168.mjs',
                        'learning/teaching-handoff-r168.test.mjs']:
                self.assertTrue((app/r16.namespaced_path(rel)).is_file(),rel)
                self.assertFalse((app/'src'/rel).exists())
            evidence=json.loads((candidate/'evidence/assembly.json').read_text())
            self.assertFalse(evidence['native_glpk_enabled_by_r16'])
            self.assertFalse(evidence['native_route_installed'])
            self.assertEqual(evidence['core_files_overwritten'],0)
            r=subprocess.run(['node','--test',str(app/'tredven/addons/learning/teaching-handoff-r168.test.mjs')],capture_output=True,text=True)
            self.assertEqual(r.returncode,0,r.stdout+'\n'+r.stderr)

    def test_core_profile_unaffected(self):
        with tempfile.TemporaryDirectory() as d:
            _,_,_,candidate=self.create(Path(d),'core')
            self.assertFalse((candidate/'assembled/tredven/addons/learning').exists())
            self.assertFalse((candidate/'assembled/tredven/addons/components/tredven-teaching-handoff.tsx').exists())

    def test_modified_handoff_source_is_rejected_by_full_inventory(self):
        with tempfile.TemporaryDirectory() as d:
            _,_,_,candidate=self.create(Path(d))
            f=candidate/'assembled/tredven/addons/learning/teaching-handoff-r168.mjs'
            f.write_text(f.read_text()+'\n// tampered\n')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(candidate)

    def test_overlay_source_is_not_accessible_via_app_routes(self):
        self.assertEqual(r16.overlay_target('components/tredven-teaching-handoff.tsx'),
                         'tredven/addons/components/tredven-teaching-handoff.tsx')
        self.assertEqual(r16.overlay_target('learning/teaching-handoff-r168.mjs'),
                         'tredven/addons/learning/teaching-handoff-r168.mjs')
        self.assertEqual(r16.overlay_target('app/pilot/gusek/page.tsx'),'app/pilot/gusek/page.tsx')
        component=(ROOT/'overlay-workbench/components/tredven-teaching-handoff.tsx').read_text()
        self.assertNotIn('fetch(',component)
        self.assertNotIn('getChat',component)
        self.assertNotIn('setGrade(',component)

    def test_once_at_end_operator_gate_includes_real_handoff_test(self):
        gate=(ROOT/'qualify-r16.sh').read_text()
        self.assertIn('learning/teaching-handoff-r168.test.mjs',gate)
        self.assertLess(gate.index('npm run build'),gate.index('learning/teaching-handoff-r168.test.mjs'))
        self.assertIn('verify-assembly --path "$ROOT" --post-build',gate)
        self.assertIn('releaseApproved:false',gate)

if __name__=='__main__':unittest.main()
