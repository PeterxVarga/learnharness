# R16.12 GUSEK add-on source (draft, not a release)

This directory is a **source-only snapshot** of the R16.12 portable add-on toolchain,
not a prebuilt LearnHarness application and not an upstream patch. It was copied from
the independently integrity-checked R16.12 one-shot qualification bundle.

- **Pinned official LearnHarness upstream:** `e69e85269c064c6c9c49a8b06ae78c06e79c4a63` (0.4.1)
- **Pinned original R15 source:** `9b7f374f4003276e67a96feb070124c244447aec`
- **Location inside fork:** `integrations/gusek-r16/` (the published fork `main` remains at 0.3.8)
- **Original R15 draft PR:** #3, left unchanged.
- **Profiles:** `core`, `workbench` (including the assignment and production planning modules), optional native GLPK *source* route; native GLPK execution is not enabled.

The `run-fedora-once.sh` launcher is designed to be invoked **from this directory** on
a Fedora machine with Git, Python 3.10+, Node 20.9+ (22+ preferred), npm, unzip
and internet access:

```bash
bash integrations/gusek-r16/run-fedora-once.sh
```

This creates isolated temporary clones and test state under `$HOME/Downloads`.
It does **not** push, merge, deploy, alter existing repositories, or enable GLPK.
The script verifies exact Git commits and recorded SHA256 sums, then freezes,
assembles, builds and qualifies a disposable candidate against upstream 0.4.1.
Do not interpret tests in the source bundle as proof of a real application build.

The existing `SHA256SUMS` covers the original R16.12 bundle, not this extra
GitHub-only documentation. Source changes require refreshing the manifest in
a dedicated reviewed commit; do not silently weaken integrity checks.

**Status at upload:** synthetic/isolated tests documented in `README.md`, real
upstream + R15 Next.js/Fedora test **not yet run**, release **NO_GO**, PR **DRAFT**.
