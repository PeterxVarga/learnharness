"""R16.12.2 strict TypeScript API input boundary and frozen contract."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
ROUTE=ROOT/'overlay-workbench/app/api/pilot/gusek/szakmai/route.ts'

class RouteStrictTyping(unittest.TestCase):
    def test_seed_input_is_narrowed_from_unknown(self):
        src=ROUTE.read_text()
        self.assertIn("const seed=(x:unknown):number|null=>",src)
        self.assertIn("typeof x==='string'",src)
        self.assertIn("Number(x)<=4294967295",src)
        self.assertNotIn('const seed=x=>',src)

    def test_kind_is_a_real_string_type_guard(self):
        src=ROUTE.read_text()
        self.assertIn("const supported=(x:unknown):x is string=>",src)
        self.assertIn('OR_KINDS.includes(x)',src)
        self.assertNotIn('const supported=x=>',src)

    def test_scoring_scope_and_validation_are_unchanged(self):
        src=ROUTE.read_text()
        self.assertIn('gradeOrTask(input.kind as string,seed(input.seed)!,answer)',src)
        self.assertIn("scoreAuthority:'r1610_server_only'",src)
        self.assertIn("kind:input.kind",src)
        self.assertIn('total>65536',src)
        self.assertNotIn('any',src)

if __name__=='__main__':unittest.main()
