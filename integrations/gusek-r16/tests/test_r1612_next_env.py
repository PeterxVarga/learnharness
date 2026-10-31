"""Exact-source proof for Next's sole tracked generated-file post-build change."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_postbuild',ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec);spec.loader.exec_module(r16)

class NextEnvProof(unittest.TestCase):
    def candidate(self, root: Path, *, original=None):
        pre = r16.PINNED_NEXT_ENV_DEV if original is None else original
        (root/'assembled').mkdir()
        (root/'evidence').mkdir()
        (root/'assembled/next-env.d.ts').write_bytes(pre)
        inv = {'schema':'tredven.learnharness.r16.upstream-inventory.v1',
               'upstream_sha':'pinned-fixture', 'files':{'next-env.d.ts':r16.sha256(pre)}}
        raw = (json.dumps(inv,sort_keys=True,separators=(',',':'))+'\n').encode()
        (root/'evidence/upstream-files.json').write_bytes(raw)
        receipt = {'status':'ASSEMBLED_UNQUALIFIED','core_files_overwritten':0,
                   'upstream_inventory_sha256':r16.sha256(raw),
                   'upstream_sha':'pinned-fixture','upstream_tracked_file_count':1,
                   'new_path_count':0,'new_paths':{},'profile':'core',
                   'native_route_installed':False,'native_glpk_enabled_by_r16':False}
        (root/'evidence/assembly.json').write_text(json.dumps(receipt))
        return root/'assembled/next-env.d.ts'

    def test_pinned_upstream_preimage_is_exact(self):
        before=r16.PINNED_NEXT_ENV_DEV
        after=r16.PINNED_NEXT_ENV_BUILD
        self.assertEqual(before.count(b'./.next/dev/types/'),2)
        self.assertEqual(after.count(b'./.next/types/'),2)
        self.assertNotIn(b'./.next/dev/types/',after)
        self.assertEqual(before.replace(b'"./.next/dev/types/',b'"./.next/types/'),after)
        self.assertTrue(r16.approved_next_env_postbuild(r16.sha256(before),after))

    def test_regular_prebuild_hash_is_required(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            file=self.candidate(root)
            r16.verify_assembly(root)
            file.write_bytes(r16.PINNED_NEXT_ENV_BUILD)
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(root)
            r16.verify_assembly(root,allow_build_artifacts=True)

    def test_next_build_rewrite_rejects_any_other_modification(self):
        pre=r16.PINNED_NEXT_ENV_DEV
        good=r16.PINNED_NEXT_ENV_BUILD
        variants=(good+b'// injected\n',
                  good.replace(b'root-params.d.ts',b'extra.d.ts'),
                  good.replace(b'import ',b'export '),
                  good.replace(b'.next/types/routes.d.ts',b'../../local-file.ts'),
                  good[:-1],pre+b'// injected\n')
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            file=self.candidate(root)
            for content in variants:
                with self.subTest(variant=content[-40:]):
                    file.write_bytes(content)
                    with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                        r16.verify_assembly(root,allow_build_artifacts=True)

    def test_different_original_source_cannot_use_exception(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            file=self.candidate(root,original=r16.PINNED_NEXT_ENV_DEV+b'// other\n')
            file.write_bytes(r16.PINNED_NEXT_ENV_BUILD)
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(root,allow_build_artifacts=True)

    def test_other_source_drift_still_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            file=self.candidate(root)
            file.write_bytes(r16.PINNED_NEXT_ENV_BUILD)
            other=root/'assembled/unexpected.ts'
            other.write_text('export const compromised=true;\n')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_PATH_SET_MISMATCH'):
                r16.verify_assembly(root,allow_build_artifacts=True)

if __name__=='__main__': unittest.main()
