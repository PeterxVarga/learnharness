# R16 design record — choosing a narrow build-time overlay over a new plugin engine

## Outcome-first decision

Goal: independent Tredven add-ons that survive future `amosblomqvist/learnharness` source updates without re-merging 100+ files. Primary blocker: R15 current implementation modifies upstream chat, teacher, persistence, PDF and core contracts. A blind three-way merge would duplicate conflict maintenance and could silently regress core security boundaries.

## Observations that shaped this chunk

1. Latest upstream architecture is a Next.js + Electron app with explicit `src/core`, `src/server`, `src/agent`, UI import laws. A stable, currently implemented general-purpose external addon loader has **not been established**; the documentation has a future-facing extensibility vision, not an accepted stable plugin ABI.
2. R15 fork delta from its 0.3.8 ancestor contains 183 touched paths, overwhelmingly additions. Eight paths overlap the upstream's 167-commit delta on Oct 31, including `components/chat.tsx`, `package.json`, PDF subagents and core ports. This count alone does **not** establish safe mergeability.
3. R15 task generation and strict scoring are in independently added `pilots/operations-research/*.mjs` modules and `app/api/pilot/gusek/route.ts`; adaptive recommendation/itinerary code is independently added as pure modules. R15 chat/transport receipts and native runtime require additional integration authority and should not be auto-applied.
4. The existing R15 technical qualification at SHA `9b7f374` was operator-reported PASS, but is not permission to release or evidence that an upstream 0.4.1 rebase passes.

## Alternatives falsified / not selected

- **Blind upstream merge:** 8 directly overlapping file paths; fragile and core edits not isolated. Rejected for automation.
- **Forked full plugin runtime:** long-lived parallel infrastructure with invented extension APIs; reject pending actual upstream hook standardization.
- **Automatically paste all 183 R15 diff paths:** would overwrite upstream modules, potentially including changed security code; rejected. Modified/deleted paths are quarantined.
- **Rewrite the R15 exam engine:** destroys qualified authority/evidence and wastes implementation; reuse exact legacy blobs instead.
- **Unconditionally enabling Podman GLPK in new upstream:** native trust boundary, local token and sandbox require separate runtime qualification; deferred.

## Boundaries

| Area | Owner | Rule |
| --- | --- | --- |
| Upstream tracked sources | Original project | never patched by R16 |
| R15 added code archive | Tredven addon source | export pinned Git blobs with hashes |
| Modified/deleted upstream changes | Review quarantine | never applied automatically |
| `app/pilot/gusek`, `app/api/pilot/gusek` | R16 adapter | insert only if absent upstream |
| Grade | R15 server route | client cannot award 0/1/null |
| Session advisory | R15 pure functions | no persistence or mastery/retention claims |
| GLPK/native/electron/chat | Future compatibility work | zero side effects from R16 |

## Next single high-value chunk

After one real source assembly and final integrated qualification: evaluate extracting the proven R14 GUSEK Workbench/native sandbox into its own sidecar, and a stable read-only chat context adapter *only if upstream publicly supports one*. Avoid modifying `components/chat.tsx` until explicit hook exists. Use one new adapter version for future upstream revisions, not a divergent patch stack. Consider proposing an upstream minimal hook through a PR only after the compatibility boundary is documented and tested; do not silently introduce it into the fork.

## R16.2 extension (2026-10-31)

Decision: promote independently added R15 Workbench sources as a separate build-time profile rather than rewrite the editor/GLPK/runtime. One exact-anchored, recorded transient UI type seam is permitted; all R15 upstream M/D changes stay quarantined. The `--native-route` option inserts but does not enable the original local-only R15 native endpoint. Every assembled upstream file receives its own SHA-256 integrity receipt; the pre-test gate fails closed on drift. See `R16.2-DESIGN.md` for negative tests and known limits.
