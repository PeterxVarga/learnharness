"""R16.5 targeted fork-core decoupling tests, no network or owner checkout."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import json

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_for_r165', ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r16)

class R165TypeBoundaryTest(unittest.TestCase):
    def test_rewrites_all_three_known_r15_type_only_dependencies(self):
        for name,count in r16.JSDOC_COMPAT_COUNTS.items():
            with self.subTest(name=name):
                text=("/** @param {"+r16.LEGACY_JSDOC_TYPE+".TransportAttemptReceipt[]} records */\n")*count
                text+="export const untouched=1;\n"
                output=r16.rewrite_namespaced_source(name,text.encode(),{name}).decode()
                self.assertEqual(output.count(r16.PRIVATE_JSDOC_TYPE),count)
                self.assertNotIn(r16.LEGACY_JSDOC_TYPE,output)
                self.assertIn('export const untouched=1;',output)

    def test_unexpected_module_cannot_introduce_legacy_core_typeref(self):
        with self.assertRaisesRegex(r16.Blocked,'UNEXPECTED_FORK_CORE_JSDOC_REFERENCE'):
            r16.rewrite_namespaced_source('pilots/operations-research/unknown.mjs',
                ('/** @type {'+r16.LEGACY_JSDOC_TYPE+'.TransportAttemptReceipt} */').encode(),set())

    def test_quoting_variant_is_not_silently_shimmed(self):
        with self.assertRaisesRegex(r16.Blocked,'UNMAPPED_FORK_CORE_TYPE_REFERENCE'):
            r16.rewrite_namespaced_source('pilots/operations-research/adaptive-practice-r15.mjs',
                b'/** @type {import("../../src/core/contracts/chat.ts").TransportAttemptReceipt} */',set())

    def test_exact_source_shape_guard_rejects_missing_or_extra_typerefs(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            for name,count in r16.JSDOC_COMPAT_COUNTS.items():
                target=root/name;target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text(r16.LEGACY_JSDOC_TYPE*count)
            r16.verify_pinned_type_contract(root,{'r15':r16.PINNED_R15})
            target=root/'pilots/operations-research/adaptive-practice-r15.mjs'
            target.write_text(r16.LEGACY_JSDOC_TYPE)
            with self.assertRaisesRegex(r16.Blocked,'R15_JSDOC_TYPE_SEAM_DRIFT'):
                r16.verify_pinned_type_contract(root,{'r15':r16.PINNED_R15})

    def test_core_and_workbench_private_type_are_the_same_source(self):
        core=(ROOT/'overlay/src/tredven/gusek/attempt-receipt-r15.ts').read_bytes()
        work=(ROOT/'overlay-workbench/src/tredven/gusek/attempt-receipt-r15.ts').read_bytes()
        self.assertEqual(core,work)
        self.assertIn(b'export interface TransportAttemptReceipt',core)
        self.assertIn('src/tredven/gusek/attempt-receipt-r15.ts',r16.ALLOWED_OVERLAY)

    def test_static_alias_rewrite_and_jsdoc_link_coexist(self):
        src=("/** @type {"+r16.LEGACY_JSDOC_TYPE+".TransportAttemptReceipt} */\n"
             "import {fn} from '@/src/features/gusek/browser-drafts';\n"
             "export const result=fn;")
        out=r16.rewrite_namespaced_source('pilots/operations-research/adaptive-sequence-r15c.mjs',
            src.encode(),{'src/features/gusek/browser-drafts.ts'}).decode()
        self.assertIn(r16.PRIVATE_JSDOC_TYPE,out)
        self.assertIn("from '@/tredven/addons/src/features/gusek/browser-drafts'",out)
        self.assertNotIn("from '@/src/features/gusek/browser-drafts'",out)

if __name__=='__main__':unittest.main(verbosity=2)

class R165HiddenImportsTest(unittest.TestCase):
    def test_internal_jsdoc_import_must_be_in_addon_closure(self):
        target='pilots/operations-research/adaptive-sequence-r15c.mjs'
        source=b"/** @type {import('./not-in-pack.mjs').Missing} */ export const x=1"
        with self.assertRaisesRegex(r16.Blocked,'UNRESOLVED_TYPE_OR_DYNAMIC_IMPORT'):
            r16.rewrite_namespaced_source(target,source,{target})

    def test_valid_local_jsdoc_type_import_remains_relative(self):
        target='pilots/operations-research/adaptive-sequence-r15c.mjs'
        dep='pilots/operations-research/adaptive-practice-r15.mjs'
        source=b"/** @type {import('./adaptive-practice-r15.mjs').r15SessionOutcome} */ export const x=1"
        self.assertEqual(source,r16.rewrite_namespaced_source(target,source,{target,dep}))

    def test_unapproved_absolute_core_type_reference_refused(self):
        target='pilots/operations-research/adaptive-sequence-r15c.mjs'
        with self.assertRaisesRegex(r16.Blocked,'ADDON_UPSTREAM_ALIAS_LEAK'):
            r16.rewrite_namespaced_source(target,
                b"/** @type {import('@/src/core/contracts/chat').TransportAttemptReceipt} */",
                {target})

class R165QualificationReceiptTest(unittest.TestCase):
    def _case(self, directory: Path):
        evdir=directory/'evidence';evdir.mkdir()
        (directory/'assembled').mkdir()
        (directory/'assembled/package-lock.json').write_text('{"lockfileVersion":3}\n')
        assembly={'upstream_sha':'a'*40, 'r15_sha':r16.PINNED_R15,
                  'addon_pack_lock_sha256':'b'*64}
        record=evdir/'assembly.json';record.write_text(json.dumps(assembly)+'\n')
        lock=directory/'assembled/package-lock.json'
        receipt={
          'schema':'tredven.learnharness.r16.qualification.v1',
          'result':'TECHNICAL_PASS_NOT_RELEASE_APPROVAL',
          'procedure':'qualify-r16.sh-r16.7',
          'assemblyReceiptSha256':r16.sha256(record.read_bytes()),
          'upstreamSha':assembly['upstream_sha'], 'r15Sha':assembly['r15_sha'],
          'addonPackLockSha256':assembly['addon_pack_lock_sha256'],
          'packageLockSha256':r16.sha256(lock.read_bytes()),
          'gates':['pre-source-integrity','npm-ci','lint','typecheck','npm-test',
                   'build','r15-focused-node-tests','loopback-next-http-smoke','post-source-integrity'],
          'releaseApproved':False,'mergeApproved':False,'signedAttestation':False
        }
        (evdir/'qualification.json').write_text(json.dumps(receipt)+'\n')
        return receipt

    def _check(self, d: Path):
        with patch.object(r16,'verify_assembly',return_value=None):
            return r16.verify_qualification(d)

    def test_well_formed_local_receipt_passes_structural_check(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root);self._case(p);self._check(p)

    def test_changed_or_missing_gate_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root);r=self._case(p)
            r['gates'].remove('lint')
            (p/'evidence/qualification.json').write_text(json.dumps(r))
            with self.assertRaisesRegex(r16.Blocked,'QUALIFICATION_GATE_LIST_DRIFT'):
                self._check(p)

    def test_source_receipt_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root);self._case(p)
            (p/'evidence/assembly.json').write_text('{"changed":true}')
            with self.assertRaisesRegex(r16.Blocked,'QUALIFICATION_RECEIPT_INVALID_OR_SOURCE_DRIFT'):
                self._check(p)

    def test_false_release_and_signature_must_remain_false(self):
        for flag in ['releaseApproved','mergeApproved','signedAttestation']:
            with self.subTest(flag=flag), tempfile.TemporaryDirectory() as root:
                p=Path(root);r=self._case(p)
                r[flag]=True
                (p/'evidence/qualification.json').write_text(json.dumps(r))
                with self.assertRaisesRegex(r16.Blocked,'QUALIFICATION_RECEIPT_INVALID_OR_SOURCE_DRIFT'):
                    self._check(p)

    def test_lockfile_tamper_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            p=Path(root);self._case(p)
            (p/'assembled/package-lock.json').write_text('{}')
            with self.assertRaisesRegex(r16.Blocked,'QUALIFICATION_LOCK_HASH_DRIFT'):
                self._check(p)
