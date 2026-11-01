"""R16.15 request-generation and cancellation source contract regression."""
from pathlib import Path
import re
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'overlay-workbench/components/tredven-or-domain.tsx'

class R1615SubmissionRace(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = SOURCE.read_text(encoding='utf-8')

    def test_edits_invalidate_and_abort(self):
        self.assertRegex(self.s, r'const invalidate=\(\)=>\{epoch\.current\+\+;active\.current\?\.abort\(\);active\.current=null;')
        self.assertIn("onChange={e=>{invalidate();setModel(e.target.value);}}", self.s)
        self.assertIn("onChange={e=>{invalidate();setValues(e.target.value);}}", self.s)
        self.assertIn("onChange={e=>{invalidate();setObjective(e.target.value);}}", self.s)
        self.assertIn("onChange={e=>{invalidate();setHints(e.target.checked);}}", self.s)

    def test_submission_uses_its_own_abort_controller(self):
        self.assertIn('const request=new AbortController();active.current=request;', self.s)
        self.assertIn('signal:request.signal', self.s)
        self.assertIn('if(active.current===request)active.current=null', self.s)

    def test_stale_response_does_not_publish(self):
        self.assertIn('if(ticket===epoch.current)setGrade(data);', self.s)
        self.assertIn('if(ticket===epoch.current)setError(', self.s)
        self.assertIn('if(ticket===epoch.current)setBusy(false);', self.s)

    def test_task_change_invalidates_inflight_post(self):
        self.assertIn("const reset=()=>{invalidate();setTask(null);", self.s)
        self.assertIn("invalidate();const ticket=epoch.current;setBusy(true);", self.s)

    def test_server_remains_the_only_grade_authority(self):
        self.assertIn("const r=await fetch(endpoint,{method:'POST'", self.s)
        self.assertNotIn('setGrade({points:', self.s)
        self.assertIn('data.maxPoints!==1', self.s)

if __name__ == '__main__':
    unittest.main()
