"""Pinned R15 eslint directive compatibility with upstream LearnHarness 0.4.1."""
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('r16_lintfix',ROOT/'r16.py')
r16=importlib.util.module_from_spec(spec)
spec.loader.exec_module(r16)

class R1612LintCompatibility(unittest.TestCase):
    def test_only_two_owned_components_remove_unsupported_eslint_rule(self):
        code=('export const stillValid=1;\n'
              ' // eslint-disable-next-line react-hooks/exhaustive-deps\n')
        for path in sorted(r16.R15_UNREGISTERED_ESLINT_FILES):
            with self.subTest(path=path):
                out=r16.rewrite_namespaced_source(path,code.encode(),{path}).decode()
                self.assertIn('export const stillValid=1;',out)
                self.assertNotIn('eslint-disable-next-line react-hooks/exhaustive-deps',out)
                self.assertIn(r16.R16_LINT_COMPAT_NOTE,out)

    def test_no_unexpected_rewrite_of_unrelated_modules(self):
        other='pilots/operations-research/adaptive-run-r15d.mjs'
        code=(r16.R15_UNREGISTERED_ESLINT_DIRECTIVE+'\nexport const untouched=1;').encode()
        self.assertEqual(r16.rewrite_namespaced_source(other,code,{other}),code)

    def test_pinned_source_requires_exactly_one_directive_per_file(self):
        with TemporaryDirectory() as d:
            folder=Path(d)
            for path in r16.R15_UNREGISTERED_ESLINT_FILES:
                dest=folder/path;dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_text(r16.R15_UNREGISTERED_ESLINT_DIRECTIVE+'\n')
            r16.verify_pinned_lint_contract(folder,{'r15':r16.PINNED_R15})
            changed=folder/next(iter(r16.R15_UNREGISTERED_ESLINT_FILES))
            changed.write_text('export const changed=1;\n')
            with self.assertRaisesRegex(r16.Blocked,'R15_LINT_DIRECTIVE_SEAM_DRIFT'):
                r16.verify_pinned_lint_contract(folder,{'r15':r16.PINNED_R15})

    def test_pinned_source_rejects_duplicate_directive(self):
        with TemporaryDirectory() as d:
            folder=Path(d)
            for path in r16.R15_UNREGISTERED_ESLINT_FILES:
                dest=folder/path;dest.parent.mkdir(parents=True,exist_ok=True)
                dest.write_text(r16.R15_UNREGISTERED_ESLINT_DIRECTIVE+'\n')
            changed=folder/next(iter(r16.R15_UNREGISTERED_ESLINT_FILES))
            changed.write_text((r16.R15_UNREGISTERED_ESLINT_DIRECTIVE+'\n')*2)
            with self.assertRaisesRegex(r16.Blocked,'R15_LINT_DIRECTIVE_SEAM_DRIFT'):
                r16.verify_pinned_lint_contract(folder,{'r15':r16.PINNED_R15})

    def test_unpinned_synthetic_fixture_does_not_claim_pinned_contract(self):
        with TemporaryDirectory() as d:
            r16.verify_pinned_lint_contract(Path(d),{'r15':'0'*40})

if __name__=='__main__': unittest.main()
