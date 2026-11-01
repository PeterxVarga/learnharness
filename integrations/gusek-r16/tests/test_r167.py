"""R16.7: falsification of covert imports into upstream application internals."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import test_r16 as fixtures

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_for_r167',ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r16)

class AliasBoundaryTests(unittest.TestCase):
    TARGET='components/gusek-workbench.tsx'
    OWN='src/features/gusek/browser-drafts.ts'
    def rewrite(self, src, own=None, target=None):
        return r16.rewrite_namespaced_source(target or self.TARGET,src.encode(),own or {self.OWN}).decode()

    def test_valid_own_alias_rewrites_to_namespace(self):
        src="import {save} from '@/src/features/gusek/browser-drafts';"
        expected="import {save} from '@/tredven/addons/src/features/gusek/browser-drafts';"
        self.assertEqual(self.rewrite(src),expected)

    def test_legitimate_relative_import_remains_relative(self):
        src="import {save} from '../pilots/operations-research/adaptive-practice-r15.mjs';"
        self.assertEqual(self.rewrite(src),src)

    def test_upstream_core_and_server_aliases_are_refused(self):
        for alias in ('@/src/core','@/src/server','@/src/core/contracts/chat',
                      '@/src/agent/teacher-agent','@/components/chat','@/lib/other'):
            with self.subTest(alias=alias),self.assertRaisesRegex(r16.Blocked,'ADDON_UPSTREAM_ALIAS_LEAK'):
                self.rewrite(f"import {{x}} from '{alias}';")

    def test_unapproved_dynamic_type_alias_is_refused(self):
        for alias in ('@/src/core','@/components/chat'):
            with self.subTest(alias=alias),self.assertRaisesRegex(r16.Blocked,'ADDON_UPSTREAM_ALIAS_LEAK'):
                self.rewrite("/** @type {import('"+alias+"').Something} */ export const x=1;")

    def test_own_jsdoc_alias_is_rewritten(self):
        src="/** @type {import('@/src/features/gusek/browser-drafts').Draft} */ export const x=1;"
        out=self.rewrite(src)
        self.assertIn("import('@/tredven/addons/src/features/gusek/browser-drafts')",out)

    def test_exact_pinned_private_type_seam_is_kept(self):
        src="import type {TransportAttemptReceipt} from '@/src/tredven/gusek/attempt-receipt-r15';"
        self.assertEqual(self.rewrite(src),src)
        jsdoc="/** @type {import('@/src/tredven/gusek/attempt-receipt-r15').TransportAttemptReceipt} */"
        self.assertEqual(self.rewrite(jsdoc),jsdoc)

    def test_freeze_pack_rejects_alias_to_upstream_before_assembly(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            up, fork,base,head=fixtures.fixture(root)
            own=fork/'pilots/operations-research/gusek-exam-r13.mjs'
            own.write_text(own.read_text()+"\nimport {getChat} from '@/src/server';\n")
            fixtures.git(fork,'add','.')
            fixtures.git(fork,'commit','-qm','inject hidden upstream coupling')
            sha=fixtures.git(fork,'rev-parse','HEAD')
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',sha):
                with self.assertRaisesRegex(r16.Blocked,'NON_SELF_CONTAINED_ALIAS'):
                    r16.freeze_pack(fork,root/'portable-pack')
            self.assertFalse((root/'portable-pack').exists())

    def test_portable_assembly_of_valid_synthetic_fork_still_passes(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            up,fork,base,head,pack=fixtures.R163PortablePackTest().create_pack(root)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,root/'candidate','HEAD','workbench',False)
                r16.verify_assembly(root/'candidate')
            self.assertTrue((root/'candidate/assembled/tredven/addons/components/gusek-workbench.tsx').is_file())

if __name__=='__main__':unittest.main()
