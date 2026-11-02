#!/usr/bin/env python3
"""R16.20 offline course-entry contract; no network, provider or server."""
from pathlib import Path
import hashlib
import unittest

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "overlay-workbench/components/tredven-or-domain.tsx"
GOLD = ROOT / "docs/R16.10-MAGYAR-OPERACIOKUTATAS-TANULOKARTYAK.md"
MANIFEST = ROOT / "SHA256SUMS"


class TheoryFirstContract(unittest.TestCase):
    def setUp(self):
        self.src = UI.read_text(encoding="utf-8")

    def test_theory_first_and_quiz_gate(self):
        self.assertIn("useState<'theory'|'practice'>('theory')", self.src)
        self.assertIn("disabled={quizChoice===null}", self.src)
        self.assertIn('data-testid="or-theory"', self.src)
        self.assertIn('data-testid="or-theory-feedback"', self.src)
        self.assertIn('data-testid="or-study-navigation"', self.src)

    def test_source_grounded_two_topics(self):
        self.assertIn("Hozzárendelés", self.src)
        self.assertIn("Termeléstervezés", self.src)
        self.assertIn("Minden oszlop összege pontosan 1.", self.src)
        self.assertIn("Nemnegatív egész szám.", self.src)
        cards = GOLD.read_text(encoding="utf-8")
        self.assertIn("Minden munkát pontosan egy szakember végez el", cards)
        self.assertIn("var x >= 0, integer;", cards)

    def test_no_false_source_or_grading_claim(self):
        self.assertIn("egyetemi PDF-ek", self.src)
        self.assertIn("nem vizsgapont", self.src)
        self.assertIn("A tanítói beszélgetéshez külön AI-modell", self.src)
        self.assertIn("const endpoint='/api/pilot/gusek/szakmai'", self.src)
        self.assertIn("method:'POST'", self.src)
        self.assertIn("maxPoints!==1", self.src)
        self.assertNotIn("localStorage", self.src)

    def test_local_launcher_fails_closed(self):
        source = (ROOT / "run-study-local.sh").read_text(encoding="utf-8")
        for item in ("LH_OWNER_APPROVED_LOCAL_PILOT", "127.0.0.1",
                     "LH_DATA_DIR", "LH_AUTH_FILE", "LH_GLPK_ENABLE_LOCAL=0",
                     "--post-build", "native_glpk_enabled_by_r16"):
            self.assertIn(item, source)

    def test_hash_manifest_matches_lesson(self):
        items = dict(line.split("  ", 1)[::-1] for line in MANIFEST.read_text().splitlines())
        key = "overlay-workbench/components/tredven-or-domain.tsx"
        self.assertEqual(hashlib.sha256(UI.read_bytes()).hexdigest(), items[key])


if __name__ == "__main__":
    unittest.main()
