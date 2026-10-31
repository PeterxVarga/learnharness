"""R16.11 exact assignment equivalence integrated into portable workbench."""
from pathlib import Path
import unittest
import subprocess
import importlib.util

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_r1611',ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec);spec.loader.exec_module(r16)

class AssignmentProofIntegration(unittest.TestCase):
    def test_workbench_overlay_only(self):
        self.assertIn('domain/or-assignment-equivalence-r1611.mjs',r16.WORKBENCH_OVERLAY_PATHS)
        self.assertIn('domain/or-assignment-equivalence-r1611.test.mjs',r16.WORKBENCH_OVERLAY_PATHS)
        self.assertNotIn('domain/or-assignment-equivalence-r1611.mjs',r16.ALLOWED_OVERLAY)
        self.assertNotIn('domain/or-assignment-equivalence-r1611.mjs',r16.LEGACY_WORKBENCH_OVERLAY_PATHS)
    def test_proof_is_only_for_assignment_and_uses_r15_parser(self):
        src=(ROOT/'overlay-workbench/domain/or-domain-r1610.mjs').read_text()
        self.assertIn('proveAssignmentByEnumeration(model,expected)',src)
        self.assertIn("task.kind==='assignment'",src)
        self.assertIn('parseGusekModel(answer.mathprog)',src)
        self.assertNotIn('proveEquivalentScalarModel(model,expected)',src)
        self.assertIn('const verified=finiteProof;',src)
    def test_exact_gate_runs_in_one_final_qualification(self):
        src=(ROOT/'qualify-r16.sh').read_text()
        self.assertIn('domain/or-assignment-equivalence-r1611.test.mjs',src)
        self.assertEqual(len(__import__('re').findall(r'^npm ci$',src,__import__('re').M)),1)
        smoke=(ROOT/'r16-http-smoke.mjs').read_text()
        self.assertIn('redundant row omission',smoke)
        self.assertIn('genuine feasible-region change',smoke)
    def test_no_math_parser_or_oracle_fork(self):
        src=(ROOT/'overlay-workbench/domain/or-assignment-equivalence-r1611.mjs').read_text()
        self.assertNotIn('parseGusekModel',src)
        self.assertNotIn('gradeOrTask',src)
        self.assertNotIn('glpsol',src)
        self.assertIn('bits<512',src)
    def test_r1611_is_versioned(self):
        self.assertEqual(r16.R16_VERSION,'r16.12')
        self.assertEqual(r16.overlay_target('domain/or-assignment-equivalence-r1611.mjs'),
            'tredven/addons/domain/or-assignment-equivalence-r1611.mjs')

if __name__=='__main__':unittest.main()
