"""Fail closed if the domain proof cannot certify exact integer equivalence."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
SCORER=(ROOT/'overlay-workbench/domain/or-domain-r1610.mjs').read_text()
ASSIGNMENT=(ROOT/'overlay-workbench/domain/or-assignment-equivalence-r1611.mjs').read_text()
class ProofReview(unittest.TestCase):
    def test_no_approximate_grading_fallback(self):
        self.assertNotIn('proveEquivalentScalarModel',SCORER)
        self.assertIn('const verified=finiteProof;',SCORER)
    def test_exact_integer_assignment(self):
        self.assertIn('const delta = 0;',ASSIGNMENT)
        self.assertIn('Number.isSafeInteger(n)',ASSIGNMENT)
    def test_review_cases_in_final_node_gate(self):
        script=(ROOT/'qualify-r16.sh').read_text()
        self.assertIn('domain/or-domain-r1610.test.mjs',script)
        self.assertIn('domain/or-assignment-equivalence-r1611.test.mjs',script)
        self.assertIn('legacy approximate MATCH never upgrades', (ROOT/'overlay-workbench/domain/or-domain-r1610.test.mjs').read_text())
        self.assertIn('fractionally perturbed assignment equality', (ROOT/'overlay-workbench/domain/or-assignment-equivalence-r1611.test.mjs').read_text())
if __name__=='__main__': unittest.main()
