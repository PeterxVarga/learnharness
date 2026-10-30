# R15B: Evidence-grounded MathProg repair plans

Branch: `pilot/operations-research-r15`. Parent baseline: R15A targeted Fedora
PASS `f745e80a52833ce3249e7c969c9bd03339788dd3`.
R14Z full release remains archived and unchanged at
`9c017fe7636a2c0ae7f68e9f52bdb2174d3dbd22`.

## Research and falsification (2026-10-30)

- **OATutor / Open Adaptive Tutor (CAHLR/OATutor; CHI 2023).** Its
  per-skill hints, scaffolding, and knowledge-tracing separation are
  useful architectural precedents, but importing React/Firebase/BKT
  would require unproved skill mappings, calibration and learner
  histories. The GUSEK attempts are formative, unproctored and
  binary-or-unassessable, with historical help status unknown.
  **Decision: borrow high-level scaffolding concepts, not runtime code,
  trained skill estimates, or external user data.** Upstream:
  https://github.com/CAHLR/OATutor
- **ts-fsrs v6 / FSRS-7.** Current quick-start requires Node 24+;
  the qualified Fedora Node is 22. It also requires genuine review
  grades and retention events, not synthetic inferred correctness
  from a solver. **Reject R15B dependency and pseudo-retention.**
  Upstream: https://open-spaced-repetition.github.io/ts-fsrs/guide/quick-start
- **CodeMirror/Lezer.** A generated parser cannot be installed as a
  substitute for the trusted 0/1 grader or MathProg oracle. Parser
  grammar, diagnostic provenance, caret, input sizes and GUSEK
  dialects require a separate real-typing compatibility benchmark.
  **Defer adoption.**
  https://lezer.codemirror.net/docs/guide/
- **Existing in-house R11/R15A** source and verified tests: the
  deterministic error taxonomy provides a reusable vocabulary;
  R15A already has strict server grade normalization, history
  de-duplication and consent-based task selection.
  **Chosen: extend in-house pure modules, no new dependency.**
- Retrieval practice and interleaving have empirical support, but
  not every mix or cadence is best for every learner; see
  Dunlosky et al. (2013), Psychological Science in the Public
  Interest: https://doi.org/10.1177/1529100612453266 .
  **No fabricated mastery, performance prediction or fixed repetition
  clock.**

## Implemented R15B development chunk

1. Extracted `r15ObservedOutcomes` as a shared, bounded normalization
   function (48 outcomes; validated grades; session-first deduping).
   R15A recommendation still consumes precisely this same evidence,
   and cannot diverge from the new guide's source.
2. `adaptive-diagnostics-r15b.mjs` provides a 3-step, data-free,
   Hungarian diagnosis. 27 controlled MathProg/transport error codes;
   repeated codes are prioritized only if present in the *latest*
   incorrect submission and within the *same task kind*.
   Unknown codes are never echoed; no model text or hidden optimum is
   stored. Unassessable results never count as incorrect.
3. The GUSEK UI shows the diagnostic in the existing graded-result
   panel, with three steps, proven attempt counts, repeated-code
   counts and an explicit disclaimer. No button sends new tasks
   automatically; the R15A explicit selection flow is preserved.
4. New 31-case pure regression suite, including forged/bad grade,
   unsupported model, repeated focus, history-vs-session dedupe,
   other-task isolation and no secret in UI data.
   The original R15A 31 unit tests remain unchanged.
5. The real R15 browser script extends its original 7 checks to
   9, verifying the 3-step plan is rendered only **after a real
   server grade** and is removed by manual task selection.
6. New `qualify-r15b-targeted.sh` performs **one** fail-fast gate:
   62 pure Node tests → TypeScript → one Next build → 9 browser checks.
   Does **NOT** run 469 R14Z offline, 2825 npm, or native GLPK again.

## Explicit non-goals and boundaries

This is NOT a qualified R15B release until actual Fedora runs.
No new score authority, no LLM calls, no auto-start or notification,
no private .mod/.dat exposure, no solver-run assumption, no BKT/FSRS
stability, no performance forecast and no implicit help-free grading.
The prior R15A targeted PASS and R14Z full PASS cannot qualify the
new HEAD. The PR remains draft.

### Qualification

Run from a clean R15 branch at exact HEAD, after setting
`LH_R14_CHROMIUM` to the verified local executable:

`bash pilots/operations-research/qualify-r15b-targeted.sh EXACT_R15B_HEAD`

The script saves private logs under `/tmp/learnharness-r15b-targeted-*`
and reports `R15B_FAIL_STEP` if a stage fails. The evidence folder
must be archived to durable storage before cleanup. No full release
assertion is issued by this gate.
