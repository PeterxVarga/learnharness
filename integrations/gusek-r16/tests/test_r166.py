"""R16.6 upstream 0.4.1 import-law reality gate, synthetic Git sources only."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import test_r16 as _fixture

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('r16_for_r166', ROOT / 'r16.py')
r16 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r16)

class R166ImportLawTest(unittest.TestCase):
    def create(self, profile='workbench', native_route=False):
        context=tempfile.TemporaryDirectory()
        root=Path(context.name)
        up, fork, base, head, pack=_fixture.R163PortablePackTest().create_pack(root)
        with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
            r16.assemble_portable(up,pack,root/'assembled-candidate','HEAD',profile,native_route)
            r16.verify_assembly(root/'assembled-candidate')
        return context,root/'assembled-candidate'

    def test_namespace_is_not_upstream_restricted_src_directory(self):
        self.assertEqual(r16.ADDON_NAMESPACE,'tredven/addons/')
        self.assertFalse(r16.ADDON_NAMESPACE.startswith('src/'))
        self.assertEqual(r16.namespaced_path('components/gusek-workbench.tsx'),
                         'tredven/addons/components/gusek-workbench.tsx')

    def test_workbench_page_and_api_bridge_obey_real_upstream_import_law(self):
        ctx,where=self.create('workbench',True)
        try:
            receipt=json.loads((where/'evidence/assembly.json').read_text())
            self.assertEqual(receipt['addon_namespace'],'tredven/addons/')
            app=where/'assembled'
            paths=('app/pilot/gusek/page.tsx','app/api/pilot/gusek/route.ts',
                   'app/api/pilot/gusek/native/route.ts')
            for path in paths:
                data=(app/path).read_text()
                self.assertIn('@/tredven/addons/',data)
                self.assertNotIn('@/src/tredven/addons/',data)
                self.assertNotIn('from \'@/src/',data)
        finally:
            ctx.cleanup()

    def test_core_page_obeys_import_law(self):
        ctx,where=self.create('core')
        try:
            page=(where/'assembled/app/pilot/gusek/page.tsx').read_text()
            self.assertIn('@/tredven/addons/components/tredven-gusek-standalone',page)
            self.assertNotIn('@/src/tredven/addons/',page)
        finally:
            ctx.cleanup()

    def test_fail_closed_if_generated_app_route_imports_restricted_src(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            path='app/api/pilot/gusek/route.ts'
            target=root/path;target.parent.mkdir(parents=True)
            target.write_text("export {GET,POST} from '@/src/tredven/addons/app/api/pilot/gusek/route';\n")
            other=root/'src/tredven/addons/app/api/pilot/gusek/route.ts'
            other.parent.mkdir(parents=True);other.write_text('export const GET=()=>null;\n')
            with self.assertRaisesRegex(r16.Blocked,'UPSTREAM_APP_IMPORT_LAW'):
                r16.verify_overlay(root,set(),{path:r16.sha256(target.read_bytes())})

    def test_qualified_shell_rejects_old_namespace(self):
        sh=(ROOT/'qualify-r16.sh').read_text()
        self.assertIn('"$ADDON_PREFIX" == "tredven/addons/"',sh)
        self.assertNotIn('"$ADDON_PREFIX" == ""',sh)
        self.assertIn("procedure:'qualify-r16.sh-r16.7'",sh)

    def test_source_verification_recomputes_new_namespace(self):
        ctx,where=self.create('workbench')
        try:
            generated=where/'assembled/tredven/addons/components/gusek-exam.tsx'
            generated.write_bytes(generated.read_bytes()+b'// drift\n')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(where)
        finally:
            ctx.cleanup()

if __name__=='__main__':unittest.main()
