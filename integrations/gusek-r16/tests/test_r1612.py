"""R16.12 production-only finite-lattice proof, without new upstream edits."""
from pathlib import Path
import importlib.util
import unittest
import re
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_r1612',ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec);spec.loader.exec_module(r16)

class ProductionProofIntegration(unittest.TestCase):
    def test_new_proof_only_workbench(self):
        for p in ('domain/or-production-equivalence-r1612.mjs','domain/or-production-equivalence-r1612.test.mjs'):
            self.assertIn(p,r16.WORKBENCH_OVERLAY_PATHS)
            self.assertNotIn(p,r16.ALLOWED_OVERLAY)
            self.assertNotIn(p,r16.LEGACY_WORKBENCH_OVERLAY_PATHS)
            self.assertEqual(r16.overlay_target(p),'tredven/addons/'+p)
    def test_exact_proof_is_only_for_two_integer_production_variables(self):
        src=(ROOT/'overlay-workbench/domain/or-production-equivalence-r1612.mjs').read_text()
        self.assertIn("NAMES=Object.freeze(['alap','premium'])",src)
        self.assertIn('MAX_POINTS=4096',src)
        self.assertIn('production_unbounded_proof_not_available',src)
        self.assertIn('production_proof_budget_exceeded',src)
        for forbidden in ('parseGusekModel(', 'eval(', 'new Function(', 'spawn(', 'fetch('):
            self.assertNotIn(forbidden,src)
    def test_existing_r15_parser_remains_only_parser(self):
        src=(ROOT/'overlay-workbench/domain/or-domain-r1610.mjs').read_text()
        self.assertIn('parseGusekModel(answer.mathprog)',src)
        self.assertIn('proveProductionByEnumeration(model,expected)',src)
        self.assertIn('proveAssignmentByEnumeration(model,expected)',src)
        self.assertNotIn('verifyGusekModel(model,expected)',src)
    def test_domain_diagnostics_are_public_and_exclude_oracle(self):
        src=(ROOT/'overlay-workbench/domain/or-diagnostics-r1610.mjs').read_text()
        for code in ('production_model_material','production_model_labor','production_model_feasible_set',
                     'production_unbounded_proof_not_available','production_proof_budget_exceeded'):
            self.assertIn(code,src)
        self.assertNotIn('orReference(',src)
    def test_final_qualification_carries_real_production_proof(self):
        src=(ROOT/'qualify-r16.sh').read_text()
        self.assertIn('domain/or-production-equivalence-r1612.test.mjs',src)
        self.assertEqual(len(re.findall('^npm ci$',src,re.M)),1)
        smoke=(ROOT/'r16-http-smoke.mjs').read_text()
        self.assertIn('production redundant labor',smoke)
        self.assertIn('production genuinely missing material',smoke)
    def test_r1612_version(self):
        self.assertEqual(r16.R16_VERSION,'r16.12')

if __name__=='__main__':unittest.main()
