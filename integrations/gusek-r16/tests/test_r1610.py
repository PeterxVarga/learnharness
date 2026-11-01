"""R16.10 product-only OR extension and portable profile invariants."""
from pathlib import Path
from unittest.mock import patch
import importlib.util
import re
import subprocess
import tempfile
import unittest
import test_r168 as base

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_r1610',ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r16)

class OperationsResearchDomain(unittest.TestCase):
    def test_subject_specific_extension_has_no_default_core_profile_route(self):
        self.assertNotIn('app/pilot/gusek/szakmai/page.tsx',r16.ALLOWED_OVERLAY)
        self.assertIn('app/pilot/gusek/szakmai/page.tsx',r16.WORKBENCH_OVERLAY_PATHS)
        self.assertIn('app/api/pilot/gusek/szakmai/route.ts',r16.WORKBENCH_OVERLAY_PATHS)
        self.assertIn('domain/or-domain-r1610.mjs',r16.WORKBENCH_OVERLAY_PATHS)
        self.assertIn('domain/or-diagnostics-r1610.mjs',r16.WORKBENCH_OVERLAY_PATHS)

    def test_public_next_entrypoints_thin_and_namespaced(self):
        for path in ('app/pilot/gusek/szakmai/page.tsx','app/api/pilot/gusek/szakmai/route.ts'):
            text=(ROOT/'overlay-workbench'/path).read_text()
            self.assertIn('@/tredven/addons/',text)
            self.assertNotIn('@/src/agent',text)
            self.assertNotIn('@/src/server',text)
            self.assertEqual(r16.overlay_target(path),path)
        self.assertEqual(r16.overlay_target('domain/or-domain-r1610.mjs'),
                         'tredven/addons/domain/or-domain-r1610.mjs')

    def test_oracle_not_imported_into_client(self):
        ui=(ROOT/'overlay-workbench/components/tredven-or-domain.tsx').read_text()
        self.assertNotIn('or-domain-r1610.mjs',ui)
        self.assertIn('or-diagnostics-r1610.mjs',ui)
        self.assertNotIn('orReference(',ui)
        self.assertNotIn('eval(',ui)
        self.assertNotIn('exec(',ui)
        self.assertNotIn('localStorage',ui)
        self.assertIn('href="/pilot/gusek"',ui)

    def test_api_is_bounded_and_never_sends_reference_solution(self):
        route=(ROOT/'overlay-workbench/app/api/pilot/gusek/szakmai/route.ts').read_text()
        self.assertIn('65536',route)
        self.assertIn('65',route)
        self.assertIn("answer,kind,seed",route)
        self.assertIn('gradeOrTask(',route)
        self.assertNotIn('orReference(',route)
        self.assertNotIn('spawn(',route)
        self.assertNotIn('Math.random(',route)
        self.assertNotIn('glpsol',route)
        source=(ROOT/'overlay-workbench/domain/or-domain-r1610.mjs').read_text()
        self.assertIn('gusek-model-r13.mjs',source)
        self.assertNotIn('gusek-equivalence-r14.mjs',source)

    def test_r169_frozen_pack_restores_r1610_overlay(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            upstream,fork,pack,candidate=base.TeachingHandoffIntegration().create(root)
            for name in ('domain/or-domain-r1610.mjs','domain/or-diagnostics-r1610.mjs',
                         'components/tredven-or-domain.tsx'):
                expected=ROOT/'overlay-workbench'/name
                self.assertEqual((candidate/'assembled'/r16.namespaced_path(name)).read_bytes(),expected.read_bytes())
                self.assertEqual((pack/'overlays/workbench'/name).read_bytes(),expected.read_bytes())
            for name in ('app/pilot/gusek/szakmai/page.tsx','app/api/pilot/gusek/szakmai/route.ts'):
                self.assertEqual((candidate/'assembled'/name).read_bytes(),(ROOT/'overlay-workbench'/name).read_bytes())
            manifest=__import__('json').loads((pack/'manifest.json').read_text())
            with patch.object(r16,'BASE',manifest['base']), patch.object(r16,'R15',manifest['r15']):
                r16.verify_assembly(candidate)
            self.assertEqual((upstream/'README.md').read_text(),'UPSTREAM_ONLY\n')

    def test_bad_overlay_tampering_blocks_integrity_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            _,_,_,candidate=base.TeachingHandoffIntegration().create(root)
            mod=candidate/'assembled'/r16.namespaced_path('domain/or-domain-r1610.mjs')
            mod.write_text(mod.read_text()+'\n// changed after freezing\n')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(candidate)

    def test_one_shot_qualification_includes_actual_r15_parser_tests(self):
        script=(ROOT/'qualify-r16.sh').read_text()
        self.assertIn('domain/or-domain-r1610.test.mjs',script)
        self.assertEqual(len(re.findall(r'^npm ci$',script,re.M)),1)
        self.assertIn('verify-assembly --path "$ROOT" --post-build',script)

    def test_source_no_forced_original_core_edits(self):
        text=(ROOT/'r16.py').read_text()
        self.assertIn("R16_VERSION = 'r16.12'",text)
        self.assertIn('UPSTREAM_PATH_COLLISION',text)
        self.assertNotIn('create_plugin_runtime(',text)
        self.assertNotIn('modify_upstream_chat(',text)

if __name__=='__main__': unittest.main()
