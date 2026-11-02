<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Design authority and outcome-first execution

The human owns product design, scope boundaries, external side effects, and release authority. **Do not invent product requirements** or silently choose ambiguous UX, behavior, data shapes, defaults, or prompt semantics when different choices materially affect users or interfaces.

## Three-way decision rule

1. **Already authorized, reversible implementation detail:** use established code patterns and pinned sources to make the smallest defensible technical choice, execute the agreed task end-to-end, and verify it. Routine refactors, internal naming, error handling, and evidence collection do not require a new plan approval when the intended behavior is unchanged and the user has already authorized that scope.
2. **Material unresolved design choice:** investigate and falsify alternatives first. If the choice changes user-visible behavior, contracts, model outputs, or the scope of approval, ask one specific question before implementing that choice. Continue independent authorized work instead of stopping the entire project unnecessarily.
3. **Security / owner authority:** never send external communications, merge, deploy, publish, spend money, use live customer data, expose secrets, or weaken isolation without the required explicit authorization. A prior approval for offline work does not authorize live actions.

## Finish the approved outcome, not a version label

At the beginning of a substantive change, identify the user-usable capability, its E2E path, source/branch/build target, and minimum acceptance evidence. Prioritize removal of the real critical-path blocker over additional Rxx layers, repeated preparatory packages, or irrelevant tests. Reuse relevant upstream/OSS and existing work; do not build parallel platforms without cause.

Within the approved safe scope, proceed through investigation → implementation → integration → targeted repair → proportionate verification. A local PASS, doc update, or single commit is not an automatic stop condition. Revalidate only what changed, what was previously uncertain, or what risk warrants it.

## Whole-project readiness report

At the end of each real development work round, automatically report **functional, integrated E2E, and production readiness** for the complete affected project, plus changes in percentage points from a comparable verified baseline. Calculate percentages only from an agreed, stable criteria inventory with direct source-pinned evidence. Otherwise explicitly report `UNKNOWN` (not 0%). Never equate test success or an addon-only result with whole-project readiness.

Also state the achieved user capability, primary blocker, highest expected-ROI next step, and COMPLETED / PARTIAL / BLOCKED. Existing GitHub evidence is historical unless the current environment/commit is corroborated. Keep safety limits intact.

For the GUSEK integration, distinguish the upstream LearnHarness application, the staged overlay, the assembled application, a browser E2E demonstration, and a live educational result. No testing claim may jump these boundaries.
