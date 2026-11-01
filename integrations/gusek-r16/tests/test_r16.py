#!/usr/bin/env python3
"""Offline, destructive-action-safe synthetic Git integration + rejection tests."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('r16', ROOT/'r16.py')
r16 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r16)

def git(repo, *args):
    p = subprocess.run(['git','-C',str(repo),*args],stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
    return p.stdout.decode().strip()

def write(repo, path, content):
    dest=repo/path
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(content)

def fixture(root: Path, collision=False, symlink=False):
    upstream=root/'upstream'; upstream.mkdir()
    git(upstream,'init','-q')
    git(upstream,'config','user.email','test@example.invalid')
    git(upstream,'config','user.name','R16 Fixture')
    write(upstream,'README.md','original-upstream-data\n')
    if collision:
        write(upstream,'app/pilot/gusek/page.tsx','UPSTREAM_OWNED_PATH')
    git(upstream,'add','.')
    git(upstream,'commit','-qm','base')
    base=git(upstream,'rev-parse','HEAD')
    fork=root/'fork'
    subprocess.run(['git','clone','-q',str(upstream),str(fork)],check=True)
    git(fork,'config','user.email','test@example.invalid')
    git(fork,'config','user.name','R16 Fixture')
    route='app/api/pilot/gusek/route.ts'
    write(fork,route,"import {a} from '../../../../pilots/operations-research/gusek-exam-r13.mjs';\nexport function GET(){return a;}\n")
    write(fork,'pilots/operations-research/gusek-exam-r13.mjs',"import {b} from './dependent.mjs'; export const a=b;\n")
    write(fork,'pilots/operations-research/dependent.mjs','export const b=1;\n')
    for f in r16.ROOTS:
        if f==route or f.endswith('gusek-exam-r13.mjs'): continue
        write(fork,f,'export const okay=1;\n')
    write(fork,'README.md','fork-only modification (M; quarantine)\n')
    if symlink:
        os.symlink('README.md',fork/'pilots/operations-research/bad-link')
    git(fork,'add','.')
    git(fork,'commit','-qm','own modules plus one core modification')
    return upstream,fork,base,git(fork,'rev-parse','HEAD')

class R16Test(unittest.TestCase):
    def test_path_guards(self):
        for value in ('../escape','/absolute','a/../b','a\\windows','./a','data/secrets','.git/config'):
            with self.subTest(value=value),self.assertRaises(r16.Blocked):r16.posix_path(value)
        self.assertEqual(r16.posix_path('pilots/operations-research/abc.mjs'),'pilots/operations-research/abc.mjs')

    def test_transitive_import_resolution(self):
        self.assertEqual(r16.relative_dependencies('app/api/pilot/gusek/route.ts',
            b"import {x} from '../../../../pilots/operations-research/a.mjs'"),['pilots/operations-research/a.mjs'])
        self.assertEqual(r16.relative_dependencies('pilots/x.mjs',b"/** import('./src/not-runtime.ts') */\nexport const x=1;"),[])

    def test_end_to_end_migration_no_input_changes(self):
        with tempfile.TemporaryDirectory() as d:
            tmp=Path(d)
            upstream,fork,base,sha=fixture(tmp)
            before=git(upstream,'status','--porcelain'),git(fork,'status','--porcelain')
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',sha):
                r16.migrate(upstream,fork,tmp/'result','HEAD')
                out=tmp/'result'
                r16.verify_export(out/'addons-source')
                evidence=json.loads((out/'evidence/assembly.json').read_text())
                self.assertEqual(evidence['core_files_overwritten'],0)
                self.assertEqual(evidence['upstream_sha'],base)
                self.assertEqual(evidence['status'],'ASSEMBLED_UNQUALIFIED')
                self.assertEqual((out/'assembled/README.md').read_text(),'original-upstream-data\n')
                self.assertTrue((out/'assembled/app/pilot/gusek/page.tsx').exists())
                self.assertTrue((out/'assembled/pilots/operations-research/dependent.mjs').exists())
                self.assertEqual((out/'addons-source/source/pilots/operations-research/dependent.mjs').read_text(),'export const b=1;\n')
                m=json.loads((out/'addons-source/manifest.json').read_text())
                self.assertIn('README.md',m['modified_quarantined'])
                self.assertIn('README.md',(out/'addons-source/quarantine/upstream-modifications.patch').read_text())
                self.assertEqual((git(upstream,'status','--porcelain'),git(fork,'status','--porcelain')),before)
                with self.assertRaises(r16.Blocked):r16.migrate(upstream,fork,tmp/'result','HEAD')

    def test_upstream_route_collision_blocks_without_output(self):
        with tempfile.TemporaryDirectory() as d:
            tmp=Path(d)
            upstream,fork,base,sha=fixture(tmp,collision=True)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',sha):
                with self.assertRaisesRegex(r16.Blocked,'UPSTREAM_PATH_COLLISION'):
                    r16.migrate(upstream,fork,tmp/'result','HEAD')
            self.assertFalse((tmp/'result').exists())
            self.assertEqual((upstream/'app/pilot/gusek/page.tsx').read_text(),'UPSTREAM_OWNED_PATH')

    def test_addon_symlinks_block(self):
        with tempfile.TemporaryDirectory() as d:
            tmp=Path(d)
            upstream,fork,base,sha=fixture(tmp,symlink=True)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',sha):
                with self.assertRaisesRegex(r16.Blocked,'NON_REGULAR_SOURCE_FILE'):
                    r16.migrate(upstream,fork,tmp/'result','HEAD')
            self.assertFalse((tmp/'result').exists())

    def test_untrusted_missing_import_blocks(self):
        with tempfile.TemporaryDirectory() as d:
            tmp=Path(d)
            upstream,fork,base,sha=fixture(tmp)
            path=tmp/'addons-source'; path.mkdir()
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',sha):
                m=r16.export_addons(fork,path)
                bad=path/'source/pilots/operations-research/dependent.mjs'
                bad.write_text("import {s} from '../../src/core/native-messages.ts';\n")
                for entry in m['added']:
                    if entry['path']=='pilots/operations-research/dependent.mjs':
                        entry['sha256']=r16.sha256(bad.read_bytes())
                with self.assertRaisesRegex(r16.Blocked,'NON_SELF_CONTAINED_IMPORT'):
                    r16.closure(path,m)

if __name__=='__main__':unittest.main(verbosity=2)

# Added coverage below is purposely executable without any npm, provider or
# operator checkout. Synthetic repos are locally created and never pushed.
class R162WorkbenchTest(unittest.TestCase):
    def _fixture(self, d, *, drift=False, native=False, collision=None):
        root=Path(d)
        upstream=root/'upstream';upstream.mkdir()
        git(upstream,'init','-q');git(upstream,'config','user.email','test@example.invalid');git(upstream,'config','user.name','Test')
        write(upstream,'README.md','UPSTREAM_ONLY\n')
        if collision:
            write(upstream,collision,'UPSTREAM_OWNS_THIS_FILE\n')
        git(upstream,'add','.');git(upstream,'commit','-qm','base')
        base=git(upstream,'rev-parse','HEAD')
        fork=root/'fork'
        subprocess.run(['git','clone','-q',str(upstream),str(fork)],check=True)
        git(fork,'config','user.email','test@example.invalid');git(fork,'config','user.name','Test')
        for path in r16.ROOTS + r16.WORKBENCH_ROOTS + (r16.NATIVE_ROOTS if native else ()):
            if path==r16.TYPE_BOUNDARY:
                a = "import type {TransportAttemptReceipt} from '../src/core/contracts/chat';\n"
                b = "const id=chatId??new URLSearchParams(window.location.search).get('chatId');\n"
                write(fork,path,a+("// changed seam\n" if drift else b)+"export function GusekExam(){return null;}\n")
            else:
                write(fork,path,'export const testSource = 1;\n')
        write(fork,'README.md','FORK_CORE_MODIFICATION_QUARANTINE\n')
        git(fork,'add','.');git(fork,'commit','-qm','addon')
        return upstream,fork,base,git(fork,'rev-parse','HEAD')

    def test_full_workbench_is_disposable_and_excludes_core(self):
        with tempfile.TemporaryDirectory() as d:
            upstream,fork,base,head=self._fixture(d)
            before=(git(upstream,'status','--porcelain'),git(fork,'status','--porcelain'))
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.migrate(upstream,fork,Path(d)/'result','HEAD','workbench')
            output=Path(d)/'result'
            original=(output/'addons-source/source/components/gusek-exam.tsx').read_text()
            staged=(output/'assembled/components/gusek-exam.tsx').read_text()
            ev=json.loads((output/'evidence/assembly.json').read_text())
            r16.verify_assembly(output)
            self.assertIn(r16.ORIGINAL_TYPE, original)
            self.assertIn(r16.PRIVATE_TYPE, staged)
            self.assertNotIn(r16.ORIGINAL_CHAT_BINDING, staged)
            self.assertEqual(len(ev['transforms']),1)
            self.assertEqual(ev['profile'],'workbench')
            self.assertEqual(ev['core_files_overwritten'],0)
            self.assertEqual((output/'assembled/README.md').read_text(),'UPSTREAM_ONLY\n')
            self.assertIn('FORK_CORE_MODIFICATION_QUARANTINE',
                          (output/'addons-source/quarantine/upstream-modifications.patch').read_text())
            self.assertFalse((output/'assembled/app/api/pilot/gusek/native/route.ts').exists())
            self.assertTrue((output/'assembled/src/tredven/gusek/attempt-receipt-r15.ts').is_file())
            self.assertEqual((git(upstream,'status','--porcelain'),git(fork,'status','--porcelain')),before)

    def test_workbench_drift_blocks_entire_output(self):
        with tempfile.TemporaryDirectory() as d:
            upstream,fork,base,head=self._fixture(d,drift=True)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                with self.assertRaisesRegex(r16.Blocked,'SEAM_DRIFT_REFUSED'):
                    r16.migrate(upstream,fork,Path(d)/'output','HEAD','workbench')
            self.assertFalse((Path(d)/'output').exists())

    def test_native_is_separate_source_only_opt_in(self):
        with tempfile.TemporaryDirectory() as d:
            upstream,fork,base,head=self._fixture(d,native=True)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.migrate(upstream,fork,Path(d)/'output','HEAD','workbench',True)
            ev=json.loads((Path(d)/'output/evidence/assembly.json').read_text())
            self.assertTrue(ev['native_route_installed'])
            self.assertFalse(ev['native_route_enabled_by_r16'])
            self.assertFalse(ev['native_glpk_enabled_by_r16'])
            self.assertTrue((Path(d)/'output/assembled/app/api/pilot/gusek/native/route.ts').exists())

    def test_native_core_profile_rejected(self):
        with self.assertRaisesRegex(r16.Blocked,'NATIVE_REQUIRES_WORKBENCH'):
            r16.migrate(Path('.'),Path('.'),Path('/tmp/never-used'),'HEAD','core',True)

    def test_collision_on_workbench_component_refuses(self):
        with tempfile.TemporaryDirectory() as d:
            collision='components/gusek-workbench.tsx'
            upstream,fork,base,head=self._fixture(d,collision=collision)
            # A collision under the common base doesn't count as A in the R15 delta;
            # the root must be added only on the fork. Make the upstream path a
            # post-fork commit and rebase this synthetic branch independently.
            # This test simply exercises the insertion guard directly.
            with tempfile.TemporaryDirectory() as q:
                staging=Path(q)/'staging';staging.mkdir()
                src=Path(q)/'source';src.mkdir()
                write(src,collision,'OWN_ADDON')
                with self.assertRaisesRegex(r16.Blocked,'UPSTREAM_PATH_COLLISION'):
                    r16.apply_addons(src,staging,[collision],{collision},'workbench')

    def test_private_transform_requires_both_seams(self):
        for payload in [r16.ORIGINAL_TYPE, r16.ORIGINAL_CHAT_BINDING, '']:
            with self.subTest(payload=payload[:20]), self.assertRaisesRegex(r16.Blocked,'SEAM_DRIFT_REFUSED'):
                r16.transform_workbench_type(r16.TYPE_BOUNDARY,payload.encode())

    def test_workbench_alias_validation_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            f='components/tredven-bad.tsx'
            write(root,f,"import { a } from '@/src/features/gusek/NOT_HERE'; export const x=a;\n")
            with self.assertRaisesRegex(r16.Blocked,'UNRESOLVED_ASSEMBLED_ALIAS'):
                r16.verify_overlay(root,set(),{f:r16.sha256((root/f).read_bytes())})

class R162AssemblyIntegrityTest(unittest.TestCase):
    def _make(self, root: Path):
        up,fork,base,sha=fixture(root)
        with patch.object(r16,'BASE',base),patch.object(r16,'R15',sha):
            r16.migrate(up,fork,root/'assembly','HEAD','core')
        return root/'assembly'

    def test_integrity_full_source_passes(self):
        with tempfile.TemporaryDirectory() as d:
            out=self._make(Path(d))
            r16.verify_assembly(out)

    def test_upstream_source_change_is_detected(self):
        with tempfile.TemporaryDirectory() as d:
            out=self._make(Path(d))
            (out/'assembled/README.md').write_text('MALICIOUS_POST_ASSEMBLY_CHANGE')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(out)

    def test_addon_source_change_is_detected(self):
        with tempfile.TemporaryDirectory() as d:
            out=self._make(Path(d))
            (out/'assembled/pilots/operations-research/dependent.mjs').write_text('MODIFIED')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(out)

    def test_unknown_extra_file_is_detected(self):
        with tempfile.TemporaryDirectory() as d:
            out=self._make(Path(d))
            write(out/'assembled','scripts/extra-file.js','export const x=1')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_PATH_SET_MISMATCH'):
                r16.verify_assembly(out)

    def test_symlink_in_assembly_is_detected(self):
        with tempfile.TemporaryDirectory() as d:
            out=self._make(Path(d))
            os.symlink('README.md',out/'assembled/aliased')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_NON_REGULAR_FILE'):
                r16.verify_assembly(out)

    def test_inventory_receipt_change_is_detected(self):
        with tempfile.TemporaryDirectory() as d:
            out=self._make(Path(d))
            p=out/'evidence/upstream-files.json'
            p.write_text(p.read_text()+'\n')
            with self.assertRaisesRegex(r16.Blocked,'UPSTREAM_INVENTORY_HASH_MISMATCH'):
                r16.verify_assembly(out)

class R163PortablePackTest(unittest.TestCase):
    def _verify_test_pack(self,pack):
        lock=json.loads((pack/'pack-lock.json').read_text())
        with patch.object(r16,'BASE',lock['base']),patch.object(r16,'R15',lock['r15_sha']):
            return r16.verify_pack(pack)
    def create_pack(self, root):
        helper=R162WorkbenchTest()
        upstream,fork,base,head=helper._fixture(str(root),native=True)
        pack=root/'portable-addon-pack'
        with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
            r16.freeze_pack(fork,pack)
        return upstream,fork,base,head,pack

    def test_freeze_once_and_reuse_without_fork_checkout(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            up,fork,base,head,pack=self.create_pack(root)
            fork.rename(root/'archived-source-not-needed')
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,root/'portable-built','HEAD','workbench',True)
                r16.verify_assembly(root/'portable-built')
                self._verify_test_pack(pack)
            receipt=json.loads((root/'portable-built/evidence/assembly.json').read_text())
            self.assertIn('addon_pack_lock_sha256',receipt)
            self.assertEqual(receipt['new_paths'][r16.namespaced_path('components/gusek-exam.tsx')],
                r16.sha256((root/'portable-built/assembled'/r16.namespaced_path('components/gusek-exam.tsx')).read_bytes()))
            self.assertNotIn(r16.ORIGINAL_CHAT_BINDING,(root/'portable-built/assembled'/r16.namespaced_path('components/gusek-exam.tsx')).read_text())
            self.assertTrue((root/'portable-built/assembled/app/api/pilot/gusek/native/route.ts').exists())
            self.assertFalse(receipt['native_glpk_enabled_by_r16'])

    def test_replay_same_pack_is_byte_stable(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,root/'one','HEAD','workbench')
                r16.assemble_portable(up,pack,root/'two','HEAD','workbench')
            one=json.loads((root/'one/evidence/assembly.json').read_text())
            two=json.loads((root/'two/evidence/assembly.json').read_text())
            self.assertEqual(one['new_paths'],two['new_paths'])
            self.assertEqual(one['addon_pack_lock_sha256'],two['addon_pack_lock_sha256'])
            self.assertEqual(one['upstream_inventory_sha256'],two['upstream_inventory_sha256'])
            self.assertNotEqual(one['created_utc'],None)

    def test_plan_upstream_update_separates_changed_core_from_addon(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,root/'baseline','HEAD','workbench')
                write(root/'baseline/assembled','.next/server/app.js','generated production asset')
                write(root/'baseline/assembled','node_modules/some-dep/index.js','installed library')
                write(up,'src/server/chat-handler.ts','export const changed = true;\n')
                write(up,'docs/guide.md','new docs\n')
                write(up,'README.md','updated upstream README\n')
                git(up,'add','.');git(up,'commit','-qm','upstream vNext')
                r16.assemble_portable(up,pack,root/'candidate','HEAD','workbench',False,root/'baseline')
            report=json.loads((root/'candidate/evidence/update-plan.json').read_text())
            self.assertEqual(report['upstream_added'],['docs/guide.md','src/server/chat-handler.ts'])
            self.assertEqual(report['upstream_modified'],['README.md'])
            self.assertEqual(report['changed_paths_count'],3)
            self.assertEqual(report['risk_counts'],{'high':1,'medium':0,'low':2})
            self.assertEqual(report['decision'],'NO_GO_UNTIL_EXPLICIT_OPERATOR_REVIEW')
            self.assertEqual((root/'baseline/assembled/README.md').read_text(),'UPSTREAM_ONLY\n')
            self.assertEqual((root/'candidate/assembled/README.md').read_text(),'updated upstream README\n')
            self.assertEqual(json.loads((root/'baseline/evidence/assembly.json').read_text())['new_paths'],
                             json.loads((root/'candidate/evidence/assembly.json').read_text())['new_paths'])

    def test_new_upstream_addon_collision_hard_blocks_without_candidate(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            write(up,r16.namespaced_path('components/gusek-workbench.tsx'),'UPSTREAM_NEW\n')
            git(up,'add','.');git(up,'commit','-qm','upstream owns former addon path')
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                with self.assertRaisesRegex(r16.Blocked,'UPSTREAM_PATH_COLLISION'):
                    r16.assemble_portable(up,pack,root/'bad','HEAD','workbench')
            self.assertFalse((root/'bad').exists())
            self.assertEqual((up/r16.namespaced_path('components/gusek-workbench.tsx')).read_text(),'UPSTREAM_NEW\n')

    def test_pack_modified_file_is_blocked_before_assembly(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            (pack/'source/components/gusek-workbench.tsx').write_text('TAMPER')
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                with self.assertRaisesRegex(r16.Blocked,'PACK_INTEGRITY_MISMATCH'):
                    r16.assemble_portable(up,pack,root/'bad','HEAD','workbench')
            self.assertFalse((root/'bad').exists())

    def test_pack_extra_file_is_blocked(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            write(pack,'overlays/workbench/app/pilot/gusek/unapproved.tsx','export default null')
            with self.assertRaisesRegex(r16.Blocked,'PACK_INTEGRITY_MISMATCH'):
                self._verify_test_pack(pack)

    def test_pack_symlink_and_hardlink_are_blocked(self):
        for mode in ('symlink','hardlink'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as t:
                root=Path(t);up,fork,base,head,pack=self.create_pack(root)
                target=pack/'source/components/gusek-exam.tsx'
                extra=pack/'source/components/alias.tsx'
                if mode=='symlink':os.symlink(target.name,extra)
                else:os.link(target,extra)
                with self.assertRaisesRegex(r16.Blocked,'PACK_UNSAFE_FILE'):
                    self._verify_test_pack(pack)

    def test_pack_overlay_tamper_is_blocked(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            f=pack/'overlays/workbench/app/pilot/gusek/page.tsx'
            f.write_text('malicious overlay replacement')
            with self.assertRaisesRegex(r16.Blocked,'PACK_INTEGRITY_MISMATCH'):
                self._verify_test_pack(pack)

    def test_update_must_keep_profile_and_pack_identity(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,root/'baseline','HEAD','core')
                r16.assemble_portable(up,pack,root/'candidate','HEAD','workbench')
                with self.assertRaisesRegex(r16.Blocked,'UPDATE_PROFILE_DRIFT'):
                    r16.compare_assemblies(root/'baseline',root/'candidate')
                with self.assertRaisesRegex(r16.Blocked,'UPDATE_PROFILE_DRIFT'):
                    r16.assemble_portable(up,pack,root/'not-created','HEAD','workbench',False,root/'baseline')
            self.assertFalse((root/'not-created').exists())

    def test_portable_assembly_pack_copy_integrity_detects_changes(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,root/'candidate','HEAD','core')
                (root/'candidate/addons-source/source/pilots/operations-research/dependent.mjs').write_text('MODIFIED')
                with self.assertRaisesRegex(r16.Blocked,'PACK_INTEGRITY_MISMATCH'):
                    r16.verify_assembly(root/'candidate')

    def test_portable_source_no_write_to_upstream_checkout(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.create_pack(root)
            before=git(up,'status','--porcelain'),git(fork,'status','--porcelain')
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,root/'candidate','HEAD','workbench')
            self.assertEqual((git(up,'status','--porcelain'),git(fork,'status','--porcelain')),before)

class R163PostBuildIntegrityTest(unittest.TestCase):
    def make_assembly(self, root):
        up,fork,base,sha=fixture(root)
        with patch.object(r16,'BASE',base),patch.object(r16,'R15',sha):
            r16.migrate(up,fork,root/'assembly','HEAD')
        return root/'assembly'

    def test_post_build_only_ignores_known_generated_paths(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);out=self.make_assembly(root)
            write(out/'assembled','node_modules/.bin/next','generated package')
            write(out/'assembled','.next/server/app.js','generated output')
            write(out/'assembled','tsconfig.tsbuildinfo','incremental cache')
            write(out/'assembled','next-env.d.ts','generated next types')
            with self.assertRaises(r16.Blocked):
                r16.verify_assembly(out)
            r16.verify_assembly(out,allow_build_artifacts=True)

    def test_post_build_still_rejects_addon_rewrites(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);out=self.make_assembly(root)
            write(out/'assembled','.next/server/app.js','generated output')
            f=out/'assembled/pilots/operations-research/dependent.mjs'
            f.write_text('CHANGED AFTER BUILD')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                r16.verify_assembly(out,allow_build_artifacts=True)

    def test_post_build_rejects_extra_app_source(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);out=self.make_assembly(root)
            write(out/'assembled','app/api/unauthorized/route.ts','export function GET(){}')
            with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_PATH_SET_MISMATCH'):
                r16.verify_assembly(out,allow_build_artifacts=True)

class R164NamespacedOverlayTest(unittest.TestCase):
    def make_pack(self,root):
        return R163PortablePackTest().create_pack(root)

    def test_namespaced_workbench_owns_only_private_modules_and_routing_bridges(self):
        with tempfile.TemporaryDirectory() as t:
            r=Path(t);up,fork,base,head,pack=self.make_pack(r)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,r/'candidate','HEAD','workbench',True)
                r16.verify_assembly(r/'candidate')
            app=r/'candidate/assembled'
            ev=json.loads((r/'candidate/evidence/assembly.json').read_text())
            self.assertEqual(ev['addon_namespace'],'tredven/addons/')
            for path in ('components/gusek-workbench.tsx','components/gusek-exam.tsx',
                         'pilots/operations-research/adaptive-practice-r15.mjs',
                         'src/features/gusek/workspace-files.mjs'):
                self.assertTrue((app/r16.namespaced_path(path)).is_file(),path)
                self.assertFalse((app/path).exists(),path)
            self.assertEqual(set(p for p in ev['new_paths'] if not p.startswith('src/tredven/') and not p.startswith(r16.ADDON_NAMESPACE)),
                {'app/pilot/gusek/page.tsx','app/api/pilot/gusek/route.ts',
                 'app/api/pilot/gusek/native/route.ts',
                 'app/pilot/gusek/szakmai/page.tsx',
                 'app/api/pilot/gusek/szakmai/route.ts'})
            for path in ('app/api/pilot/gusek/route.ts','app/api/pilot/gusek/native/route.ts'):
                bridge=(app/path).read_text()
                self.assertIn('export const runtime',bridge)
                self.assertIn("export {GET, POST} from '@/tredven/addons/",bridge)
                self.assertNotIn('createRequire(',bridge)
            self.assertIn('@/tredven/addons/components/gusek-workbench',
                (app/'app/pilot/gusek/page.tsx').read_text())
            transformed=ev['transforms']
            self.assertEqual(transformed[0]['path'],r16.namespaced_path(r16.TYPE_BOUNDARY))
            self.assertIn("from '@/src/tredven/gusek/attempt-receipt-r15'", 
                (app/r16.namespaced_path(r16.TYPE_BOUNDARY)).read_text())

    def test_legacy_root_name_taken_by_upstream_no_longer_collides(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.make_pack(root)
            write(up,'components/gusek-workbench.tsx','UPSTREAM_OWNED\n')
            git(up,'add','.');git(up,'commit','-qm','upstream begins using root name')
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,root/'candidate','HEAD','workbench')
            app=root/'candidate/assembled'
            self.assertEqual((app/'components/gusek-workbench.tsx').read_text(),'UPSTREAM_OWNED\n')
            self.assertTrue((app/r16.namespaced_path('components/gusek-workbench.tsx')).is_file())

    def test_router_entry_collision_still_fails_closed(self):
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);up,fork,base,head,pack=self.make_pack(root)
            write(up,'app/api/pilot/gusek/route.ts','UPSTREAM_NEW_API\n')
            git(up,'add','.');git(up,'commit','-qm','upstream takes api route')
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                with self.assertRaisesRegex(r16.Blocked,'UPSTREAM_PATH_COLLISION'):
                    r16.assemble_portable(up,pack,root/'bad','HEAD','workbench')
            self.assertFalse((root/'bad').exists())

    def test_static_alias_rewrites_only_addon_owned_imports(self):
        data=("import {a} from '@/src/features/gusek/browser-drafts';\n"
              "import {b} from 'react';\n"
              "import {c} from '../pilots/operations-research/x.mjs';\n").encode()
        result=r16.rewrite_namespaced_source('components/gusek-exam.tsx',data,
                 {'src/features/gusek/browser-drafts.ts'})
        s=result.decode()
        self.assertIn("from '@/tredven/addons/src/features/gusek/browser-drafts'",s)
        self.assertIn("from 'react'",s)
        self.assertIn("from '../pilots/operations-research/x.mjs'",s)
        self.assertEqual(result,r16.rewrite_namespaced_source('components/gusek-exam.tsx',data,
                 {'src/features/gusek/browser-drafts.ts'}))

    def test_standalone_core_overlay_uses_private_component_path(self):
        with tempfile.TemporaryDirectory() as t:
            r=Path(t);up,fork,base,head,pack=self.make_pack(r)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,r/'candidate','HEAD','core')
            app=r/'candidate/assembled'
            self.assertTrue((app/'tredven/addons/components/tredven-gusek-standalone.tsx').is_file())
            self.assertFalse((app/'components/tredven-gusek-standalone.tsx').exists())
            source=(app/'tredven/addons/components/tredven-gusek-standalone.tsx').read_text()
            self.assertIn('from "../pilots/operations-research/adaptive-practice-r15.mjs"',source)
            self.assertIn('from "../pilots/operations-research/adaptive-sequence-r15c.mjs"',source)
            self.assertIn('tredven/addons/components/tredven-gusek-standalone',
                         (app/'app/pilot/gusek/page.tsx').read_text())

    def test_namespace_tamper_not_masked_by_upstream_original(self):
        with tempfile.TemporaryDirectory() as t:
            r=Path(t);up,fork,base,head,pack=self.make_pack(r)
            with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
                r16.assemble_portable(up,pack,r/'candidate','HEAD','workbench')
                target=r/'candidate/assembled'/r16.namespaced_path('components/gusek-workbench.tsx')
                target.write_text('TAMPER')
                with self.assertRaisesRegex(r16.Blocked,'ASSEMBLED_FILE_TAMPER'):
                    r16.verify_assembly(r/'candidate')

class R164IndependentContractReview(unittest.TestCase):
    def make_assembly(self,root):
        up,fork,base,head,pack=R163PortablePackTest().create_pack(root)
        with patch.object(r16,'BASE',base),patch.object(r16,'R15',head):
            r16.assemble_portable(up,pack,root/'candidate','HEAD','workbench')
        return root/'candidate'

    def test_forged_manifest_extra_addon_rejected_by_package_contract(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);candidate=self.make_assembly(root)
            rel=r16.namespaced_path('unexpected.ts')
            write(candidate/'assembled',rel,'export const unauthorized = 1;')
            receipt_path=candidate/'evidence/assembly.json'
            evidence=json.loads(receipt_path.read_text())
            evidence['new_paths'][rel]=r16.sha256((candidate/'assembled'/rel).read_bytes())
            evidence['new_path_count']+=1
            receipt_path.write_text(json.dumps(evidence))
            lock=json.loads((candidate/'addons-source/pack-lock.json').read_text())
            with patch.object(r16,'BASE',lock['base']),patch.object(r16,'R15',lock['r15_sha']):
                with self.assertRaisesRegex(r16.Blocked,'NAMESPACE_PATH_SET_DRIFT'):
                    r16.verify_assembly(candidate)

    def test_forged_bridge_with_forged_digest_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);candidate=self.make_assembly(root)
            rel='app/api/pilot/gusek/route.ts'
            f=candidate/'assembled'/rel
            f.write_text("export const runtime = 'edge';\nexport function GET(){}")
            receipt=candidate/'evidence/assembly.json'
            evidence=json.loads(receipt.read_text())
            evidence['new_paths'][rel]=r16.sha256(f.read_bytes())
            receipt.write_text(json.dumps(evidence))
            lock=json.loads((candidate/'addons-source/pack-lock.json').read_text())
            with patch.object(r16,'BASE',lock['base']),patch.object(r16,'R15',lock['r15_sha']):
                with self.assertRaisesRegex(r16.Blocked,'NAMESPACE_ROUTING_BRIDGE_DRIFT'):
                    r16.verify_assembly(candidate)

    def test_forged_namespaced_source_with_forged_digest_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);candidate=self.make_assembly(root)
            rel=r16.namespaced_path('pilots/operations-research/adaptive-practice-r15.mjs')
            f=candidate/'assembled'/rel
            f.write_text('export const malicious = true')
            receipt=candidate/'evidence/assembly.json'
            evidence=json.loads(receipt.read_text())
            evidence['new_paths'][rel]=r16.sha256(f.read_bytes())
            receipt.write_text(json.dumps(evidence))
            lock=json.loads((candidate/'addons-source/pack-lock.json').read_text())
            with patch.object(r16,'BASE',lock['base']),patch.object(r16,'R15',lock['r15_sha']):
                with self.assertRaisesRegex(r16.Blocked,'NAMESPACE_SOURCE_DRIFT'):
                    r16.verify_assembly(candidate)
