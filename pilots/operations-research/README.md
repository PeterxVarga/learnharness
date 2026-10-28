# Operations Research — LearnHarness R1 qualification pilot

**Status:** synthetic oracles and non-executing GLPK contract tests prepared; AI tutoring, PDF grounding and GLPK runtime **not yet qualified**.

**Parent:** amosblomqvist/learnharness tag v0.3.8, commit `3dc88472eea41eed0d5e5f29c2f16f8d063c415b`.
**Pilot branch:** `pilot/operations-research-r1` in PeterxVarga/learnharness.

This is a bounded experiment, **not** a production feature or fork-wide redesign. The existing prober → plan → teach → practice flow remains unchanged.

## Scope and evidence boundaries

- **Public repository contains synthetic examples only.** Do not commit university lecture PDFs, Google Drive copies, exam solutions, personal responses, credentials or unlicensed source passages.
- These deterministic tests prove simple arithmetic/feasibility results, **not** teaching quality, PDF citations, agent correctness or a GLPK integration.
- The current LearnHarness file tools can read from the user's home directory. Do not mistake the app for an OS sandbox. For pilot execution, use an isolated OS account/container with expendable data or prove a narrower access boundary first.
- LLM-provider calls may transmit user-provided text to external providers. Start with synthetic documents only and explicitly cap provider spending.
- Never change `main`, enable unattended paid model runs or merge this work without gates.

## Run the standalone mathematical oracles

```sh
node --test pilots/operations-research/oracles.test.mjs
# The suite is also imported by tests/operations-research-pilot.test.ts,
# which is included in upstream `npm test`.
```

Four source-independent controls:

| ID | Competence | Expected result |
| --- | --- | --- |
| SYN-PROD | Two-product integer capacity model | Max profit 60 at (4, 4) |
| SYN-SHIP | Two-source/two-destination transport with route cap | Min cost 68; shipments (4, 3, 2, 3) |
| SYN-CONFLICT | Opposing proportional linear inequalities | `4x+4y <=12` plus `x+y>=4` is infeasible |
| SYN-COMPOSITION | Impossible goal detection | `a+b<=6`, `b>=a`, score `6a+4b`: max 30, threshold 31 impossible |

The production and transport cases use exhaustive integer enumeration; infeasibility uses an algebraic certificate or exhaustive bounded score search. These tests don't invoke GLPK.


## GLPK contract R1: prepared, but intentionally not executable

Run the new offline contract suite:

```sh
node --test pilots/operations-research/glpk-contract.test.mjs
```

`renderTrustedMathProg(problem)` only accepts a small, bounded JSON-like linear model with explicitly named variables, objective coefficients and constraints. It **does not** accept arbitrary learner `.mod` source. The generated MathProg uses fixed templates and numeric coefficients; no model-supplied commands or filenames.

`inspectGlpkResult(problem, glpText, solutionText)` is an independent verifier of the intended `--wglp` and `--write` outputs. It maps column indices by symbolic names rather than assuming their order, recomputes objective and constraint feasibility, enforces integrality, and distinguishes proven optimum, merely feasible, infeasible, and unknown. Fake solver outputs in tests are *parsing fixtures*, not real solver evidence. If a live solver stops due to errors or timeouts, its output must never be presented as a certified mathematical result.

A real GLPK execution adapter is **deliberately not wired up**. GNU MathProg supports file output statements, so process spawn with a temp directory is not a sufficient isolation boundary. Before enabling any live execution, require and test a genuinely confined sandbox (filesystem allowlist, network denial, process/time/memory caps), pin the `glpsol` version, and verify its native `--wglp`/`--write` outputs against this parser. Keep the teacher agent read-only until those gates pass.

## Qualification protocol (human in the loop)

1. **Baseline:** pin the version and run `npm ci`, `npm run typecheck`, `npm test` and `npm run lint`; retain exit codes and logs. CI is not evidence of Fedora runtime success.
2. **Fedora pilot:** run on loopback using an isolated test account. The upstream AppImage has reported Fedora/FUSE issues. No global package changes or security bypasses.
3. **Beginner tutoring:** assess starting understanding and reasons, not only answers. Verify the next explanation responds to a specific misconception.
4. **Source grounding:** use a non-sensitive synthetic, page-numbered PDF. Verify actual page and quotations; unsupported citations fail.
5. **Adversarial math:** run all four synthetic cases against the teacher. Claiming any optimum for an infeasible case is a hard failure.
6. **Retention:** test a new problem independently on a different day. Correct answers during teaching or graph-node count do not establish durable skill.
7. **Cost/privacy:** record provider/model, tokens, cost, document scope and access; require explicit budget and data approval.

**Hard-stop:** hallucinated optima for infeasible models; fabricated document citations; unapproved file/network access; unexpected exposure of source data.

**GO:** no hard stop, >=80/100 across source grounding (30), mathematics (25), adaptive teaching (20), delayed independent transfer (10), Fedora usability (10), and cost visibility (5).
**CONDITIONAL:** 65–79/100 without hard stop. **NO-GO:** hard stop or <65. These are pilot engineering gates, not research-validated educational scores.

## Bounded next implementation

After baseline, add a separate allowlisted GLPK/MathProg adapter that accepts explicit user-approved synthetic file paths only. Execute `glpsol` without a shell, with fixed time/memory/output limits, and capture statuses: optimal, infeasible, unbounded, error. Test failure modes before allowing an AI to use it. Never grant arbitrary shell access to the teacher.

Keep real student materials and private exam examples out of this public repo.

## Without GitHub Actions / Remote Desktop

Run only the dependency-free mathematical tests using Node.js:

```sh
node pilots/operations-research/verify-offline.mjs
```

This command runs 28 tests (4 reference, 6 GLPK contract, 6 PDF provenance, 12 course opt-in) and produces a machine-readable JSON receipt with source hashes. It can be run on an independent developer computer or offline runner; no GitHub Actions credits, remote desktop, provider API key or `npm install` needed. It does **not** certify the full Next.js app, GLPK runtime, PDF grounding or Fedora installation. The 16 earlier pilot tests were verified with Node 22.16.0; the 12 course tests were checked separately. A fresh full 28/28 offline receipt and upstream integration build are still required for this exact commit.

## PDF source-provenance R1 (source boundary, not factual accuracy)

The real `pdf-reader.ts` now records only structured page ids from the PDF parser, only *shown* search hits (max 40), and only pages actually rendered. It no longer infers evidence from requests such as `pdf_extract pages=all`. A truncated final extracted page cannot be cited unless re-read. The model's final brief must cite `(p. N)` references that match consulted pages; after one corrective retry a bad brief fails closed. The list `Pages consulted:` is rewritten from observed provenance, never trusted from the model. Existing teaching flow is preserved; course PDFs are not committed.

Six pure, offline citation tests can run without dependencies. Three additional fake-engine integration regression tests are included in `tests/pdf-reader.test.ts`, but **still require the complete upstream dependencies** and have not been executed in this environment. The offline verifier now checks **16 tests** and requires Node 22+ for built-in TypeScript stripping.

**Limit:** Citation membership does NOT prove the mathematical claim is present on that page, that the text was interpreted correctly, or that the instructor's answer is valid. This will need an evidence-level verification phase plus GLPK validation.


## Hungarian course pilot R1 — strictly opt-in

The prober and teacher receive the course-specific context ONLY if the **first user message** of a new learning session begins exactly with:

```text
/course operations-research-hu-r1
```

Print a safe starter message with:

```sh
node --experimental-strip-types pilots/operations-research/start-course.mjs
```

Copy that message into a **new teaching session** in LearnHarness. The user still chooses a provider/key as normal; the course does not trigger any model calls or file access merely from code installation. It uses the upstream prober -> teacher flow, not a parallel tutor. Ordinary chats and standalone practice remain unchanged.

The eight-unit provisional map covers basic LP modelling, feasibility, graphical reasoning, transport, MathProg sets/parameters, simplex, and fresh timed tasks. It is not a verified complete syllabus and is not evidence of learner mastery. Private lesson PDFs are never included in the public repository; the user must separately permit any local source access and account for third-party model transmission. The teacher must not claim real GLPK execution.

Unit tests validate the dependency DAG, exact first-message activation and refusal of unrelated/quoted triggers. They are bundled into the **28-test offline verifier** and imported into upstream `npm test`.

**Not yet qualified:** The full LearnHarness install/build, live provider sessions, end-to-end Hungarian learning quality, PDF semantic entailment, isolated GLPK runtime, and Fedora app experience. Draft PR remains unmerged.

## R2-0: binary-only exam grading and PDF integrity (2026-10-26)

**Exam-scoring rule from learner:** every question is assessed as fully correct (1 point) or incorrect/incomplete (0 points); there is **no partial credit**. Diagnostic error tags are only for formative practice, not for points. A hint-assisted answer cannot independently prove exam readiness. Only independently completed tasks can certify competence.

`exam-binary.mjs` contains a synthetic, bounded 2x2 transport-only, structured-submission checker. It validates **all** required model components, four flows, conservation equations, route capacity, objective and an independently enumerated optimum. A correctly solved but suboptimal feasible dispatch gets **zero**, and tied optimal plans are accepted. This is a qualification fixture, **not a full free-form MathProg or exam grader**. Student-authored `.mod` is never executed or auto-certified.

PDF citations now parse page ranges/lists and Hungarian `(1. oldal)` / `(1. o.)` syntax with fail-closed unsupported forms. A rejected brief is never returned through the iteration-limit path. Eleven standalone PDF tests and one additional faux-engine integration regression are included. The faux-engine integration test still requires the full upstream dependencies and is **not qualified offline**.

Offline suite expectation at this commit: **45** tests (4 reference, 6 GLPK contract, 11 PDF citation, 12 opt-in course, 12 binary exam). Of these, the **new** 11 PDF + 12 binary tests passed on Node 22.16.0 prior to committing, with file byte identity checked using Git blob hashes. The **full exact-commit 45/45**, upstream typecheck/lint/build, live PDF reading, Fedora and real GLPK runtime are NOT yet qualified.

Binary scoring must never be confused with the broader educational goal: use helpful, specific feedback during teaching, but do not turn partial work into awarded exam points. Never promise this synthetic checker can grade original university models.

## R3: complete offline 3×3 synthetic transport practice

**Usable standalone flow, no Actions / Remote Desktop / AI token:**

```sh
# Show a Hungarian exam-like challenge. Do NOT print the answer.
node pilots/operations-research/transport-cli-r3.mjs new --seed 42

# JSON form of the same fixed challenge:
node pilots/operations-research/transport-cli-r3.mjs new --seed 42 --json

# Submit a locally created response file, full point or zero:
node pilots/operations-research/transport-cli-r3.mjs grade --seed 42 --answer ./answer.json
```

The response is a data-only JSON object with shape:
```json
{
  "model": {
    "sense": "min",
    "nonnegative": true,
    "supply": [0, 0, 0],
    "demand": [0, 0, 0],
    "costs": [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    "capacities": [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  },
  "allocation": [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  "reportedObjective": 0,
  "hintsUsed": false
}
```
Replace all zeros with your task's actual model data and independently derived solution; the placeholder is intentionally **not** a correct answer. Model and solution must both be exact. No partial marks. Error codes explain failure in practice but do not award points.

R3's oracle enumerates all feasible **integer** flows for the bounded 3×3 synthetic transport subdomain. In this network-flow domain, integer supplies/demands/capacities permit an integral LP optimum. It verifies route constraints, conservation, objective, alternative optima, and 0/1 grading. It does **not** parse student MathProg, prove general linear programs, or handle arbitrary precision/unbounded models. The model field is a restricted **normalized JSON contract**: mathematically equivalent but differently represented MathProg expressions are not evaluated. User self-declared solver status/points are ignored.

Validation: **17/17 new Node.js tests** including true CLI subprocess new → answer-file → grade; 30,000 generated seeds yielded feasible tasks; an independent SciPy/HiGHS LP check matched **200/200** seeded optima. This is mathematical/subsystem evidence, not a LearnHarness GUI/agent integration test. The full offline verifier now expects **62 tests** total, but its exact-commit combined run, upstream npm tests, model-provider tutoring, real PDF grounding, and native GLPK/MathProg remain unverified. R3 is standalone and opt-in; the main branch remains unchanged.

**Privacy:** synthetic public data only, no lecture PDFs or original university exam tasks. The CLI reads only the explicitly named local answer file (regular, <= 64 KiB). It never executes a learner `.mod` file or invokes an external provider. Use an isolated environment if processing files you do not trust.

## R4: opt-in in-app 3×3 practice page and deterministic Next.js HTTP grading

Navigate to **/pilot/transport** inside a running LearnHarness Next.js application. This is an **isolated experimental page in the existing app**, not a replacement tutor, new agent, or a verified chat/practice-session integration. The page shows seeded synthetic 3×3 tasks, provides an empty JSON model/solution form, and submits to the bounded server-side assessor. Links back to `/chat/new?mode=practice` for the existing AI teaching session. The two interfaces **do not share a persisted assessment record** yet.

The server endpoint:
- `GET /api/pilot/transport?seed=42` returns ONLY the task data, never the answer key/optimal objective.
- `POST /api/pilot/transport` receives JSON `{"seed":"42","answer":{...}}` and returns authoritative **0/1** task grading, diagnosis codes and `assessmentScope=self_reported_practice_not_proctored`.
- Caches are disabled; request bodies over 64 KiB, malformed JSON, invalid seed and unexpected fields are rejected. No provider calls, no persistence, no arbitrary `.mod` execution and no user-provided external file paths.
- The error codes are explanatory only, not part of the point total.

**R4 evidence:** 9/9 HTTP-handler tests passed with Node.js 22.16.0 against the exact route file; the 17 R3 flow tests also passed separately (**26/26 isolated tests** in this development round). Files committed are SHA-equivalent to these tested sources. The combined offline verifier now expects **71 tests** (62 existing + 9 new), but a complete exact-commit 71/71 run is NOT yet certified. Full Next.js build/typecheck, React UI smoke tests, native `glpsol`, free-form MathProg evaluation, PDF-to-lesson agent learning and Fedora remain **NOT QUALIFIED**.

**Scope:** Only the structured, synthetic JSON variant is scored. A model mathematically expressed differently in an arbitrary MathProg file will not be recognized; user-reported `hintsUsed:false` is **not secure proctoring proof**. University lecture PDFs and personal learning data do not belong in this public fork. Keep PR draft until integration and source-accuracy gates pass.

## R4-1: trusted MathProg bridge (generation only)

`transport-mathprog-r4.mjs` converts ONLY the seed-generated synthetic 3×3 task into a bounded GLPK structured LP: nine nonnegative continuous variables, explicit per-route upper capacities, three supply equalities, three demand equalities, and a minimized total cost. It delegates serialization to the already present `glpk-contract.mjs` (`validateLinearProblem`, `renderTrustedMathProg`). **There is no arbitrary MathProg parsing or GLPSOL execution.** No private course documents or uploaded `.mod` files are accepted. The local reference optimum is only an enumeration-derived witness, NOT proof of a real solver run.

Eight adapter tests passed with Node 22.16.0 against a local reconstruction of the current GitHub GLPK serializer's first 73 lines, with 100 seeds checked for constraint and objective consistency; the adapter and test files were SHA matched on upload. The original full GitHub GLPK module was NOT rerun in this local test. The combined offline verifier expects **79 tests** (prior 71 plus 8). Its full exact-commit combined run and full Next.js build have NOT been certified. Independent SciPy/HiGHS cross-checks (200/200) refer to the prior R3 reference set only.

**Next:** user-run full Fedora test and app build, then a genuine `glpsol` run on the generated safe model in an isolated filesystem. Until that result is observed, MathProg syntax/runtime compatibility is a hypothesis, not a fact. Keep the PR unmerged.

## R5: native GLPK qualification gate (safe synthetic generated model only)

R5 adds `qualify-glpsol-r5.mjs`, a **fail-closed executable qualification runner**, not a general MathProg interpreter and not a claim that GLPK has executed.

```sh
# Fedora: use a separately authorized/trusted installation of GNU GLPK first.
# This command runs ONLY a generated bounded 3×3 transportation model:
node pilots/operations-research/qualify-glpsol-r5.mjs --seed 42
```

The runner accepts a uint32 seed only; **never takes a learner .mod path, uploaded source, arbitrary binary path or shell argument**. It requires a regular, root-owned, non-world/group-writable `/usr/bin/glpsol`, records the binary SHA256, creates a 0700 temporary directory containing only its generated model, and invokes `glpsol` without a shell using `--math`, `--wglp`, `--write`, `--tmlim 5`, and `--memlim 64`. A 10-second outer process timeout also covers model translation. Output files are bounded to 128 KiB; machine-readable solution records must satisfy the existing LP constraints, claimed status must be optimal, and the objective must equal the independent bounded integer-oracle optimum. The run cleans up after itself. Binary provenance is rechecked before success.

**Missing, untrusted or failing glpsol = explicit `GLPSOL_NOT_QUALIFIED:...` and nonzero status.** A PASS is reserved for actual native execution plus verification; fake/mocked GLPK text is never counted as runtime qualification.

This is a narrow native qualification of **trusted synthetic model-generation**, not an OS security sandbox for arbitrary MathProg, real student models, or external data/files. Use an isolated OS account/container for untrusted input, which is still blocked. Do not enable on the main UI automatically.

**Validation:** 7/7 R5 preflight/fail-closed tests passed on Node 22.16.0; the tested source is byte-identical to its GitHub blob. Separately, the 34 R3/R4 tests passed on exact GitHub source files including the full GLPK contract parser. Local GLPK binary unavailable, so there is NO runtime PASS and no real MathProg syntax certification. Offline verifier now expects **86/86 tests**, but combined exact-commit suite, full Next.js build, and main practice-agent integration remain unverified.

The project remains a single **draft PR**; `main` is unchanged.

## R6: actual text-model submission for a bounded MathProg dialect

The opt-in existing Next.js page at **/pilot/transport** now has two answer modes: **MathProg-szöveg** (default) and the retained structured JSON mode. The MathProg editor accepts a small, clearly identified GNU MathProg *subset* as **text**, without executing any submitted `.mod` code. Exactly nine explicit scalar variables `x00` through `x22` with nonnegative lower bounds and numeric upper bounds are required; a `minimize name:` linear objective, six explicitly expanded `s.t.` balance equalities, `solve;`, and `end;` complete the model. Coefficients may be reordered; equivalent balance equalities can be reordered or multiplied by a nonzero scalar. The original data-only 3×3 transport plan and independently enumerated optimum remain mandatory.

**A full GNU MathProg parser/solver is NOT implemented.** In particular, the idiomatic indexed transportation formulation (`set`, `param`, `sum`, indexed variables) is not processed by R6. Unsupported constructs return `UNASSESSABLE` with `points:null`, **not** an incorrect-solution claim; they earn no points and cannot establish exam readiness. Supported but incomplete/incorrect models earn **0**, and a fully valid model + optimal allocation + correct objective + self-reported no-hint answer earns **1**. Diagnostic error codes are learning feedback only, **never partial credit**. The checking agent cannot override the score.

API: POST `/api/pilot/transport` JSON `{"seed":"42","answer":{"mathprog":"var x00 >= 0, <= ...; ... solve; end;","allocation":[[...],[...],[...]],"reportedObjective":0,"hintsUsed":false}}`. The source is capped at 16 KiB and request body at 64 KiB, limited to the supported grammar, never uses `eval`, never passes learner-authored text to GLPK, and never reads uploaded local files. The previous JSON mode and GET task issue contract remain supported.

**R6 evidence:** the exact source/UI/API/test blobs were SHA-matched to locally executed/parsed files. 23/23 parser/grade tests and 9/9 new HTTP integration tests passed, plus 9/9 prior HTTP regressions, together **41/41**. One important negative-test correction: unsupported yet potentially valid MathProg must be classified **unassessable** rather than false-zero. The combined offline verifier now expects **118** tests total, but its full exact-commit 118/118 run has not been completed. The UI passed a TypeScript TSX syntax/transpile check; the complete Next.js build, browser smoke, chat practice `problem`/`conclude` synchronization, actual GLPK runtime on Fedora, and semantic verification of source PDFs remain unqualified.

**No private exam or university materials included.** Keep the PR DRAFT. R7 should qualify the full test suite and real GLPK, then add a trust-bounded verifier for the indexed `set/param/sum` MathProg subset instead of claiming this R6 restricted parser covers it.

## R7: indexelt MathProg modellválasz – bounded subset, no execution

The existing **/pilot/transport** exam-practice UI now supports a third mode: **Indexelt MathProg (R7)**. This allows a student to submit actual text using `set I; set J; param supply{i in I}; param demand{j in J}; param cost{i in I,j in J}; param cap{i in I,j in J}; var x{i in I,j in J} >= 0, <= cap[i,j]; minimize ... sum{i in I,j in J} cost[i,j] * x[i,j]; s.t. ...` rather than only the R6 expanded-scalar form or JSON. Source is checked **statically**, never passed to a process, `eval`, a model provider, or a file read. The task data are fixed by a server-generated seed, not submitted by the student; an external-data fixture for later GLPK qualification can be rendered deterministically with `trustedIndexedData(seed)`.

Supported equivalences include ordering of declarations/objective multiplication and, for **balanced** transportation, the usual `sum_j x[i,j] <= supply[i]` together with `sum_i x[i,j] >= demand[j]` inequalities, which force equality. Route capacities may be declared as variable upper bounds or a matching indexed constraint. Full credit still requires the **entire correct model AND the optimal 3×3 allocation and objective and a self-reported no-hints solution**. No partial marks. Unknown/inexpressible GNU MathProg expressions and all in-band student-supplied `data;`, `include`, file I/O or solver commands get `UNASSESSABLE` (points=null), **never a false wrong answer**. Recognized missing/incorrect model components receive 0. The checker does **not** support arbitrary alternative names, parameter transformations, real .mod files, or GNU MathProg evaluation. Its output is formative practice, NOT independently proctored evidence.

**Evidence:** The R7 18 structural/negative tests and 11 actual Next.js route tests passed. In a **single** local Node.js 22.16.0 execution, 102/102 selected R3–R7 tests passed, using byte-verified R6 test sources. TSX + TS route syntax transpilation passed without errors. The exact uploaded R7 source and test Git blob SHA matched the locally validated files. **Neither the full exact-commit 147-test offline verifier nor the full upstream Next.js typecheck, lint, build, browser exercise, trusted GLPK binary execution, or chat practice result persistence have been qualified.** `/usr/bin/glpsol` is not installed in the model environment.

The repository's offline checker now expects **147 tests** (R6 118 + 18 + 11). `main` remains unchanged; PR #1 stays DRAFT. Do not include any private original university exam files in this fork.

**Remaining R7 acceptance gates:** run full 147 offline verifier on the pinned GitHub tree, run native GLPK on a trusted generated model and separate trusted data, and qualify Next.js build/Fedora browser + post-score teaching handoff. Only then can the application be described as end-to-end exam-ready.

## R8: exact-commit qualification gate (still BLOCKED until Fedora native proof)

**R8 adds a reproducible gate, not a fake release PASS.** `qualify-r8.mjs` only returns PASS when all mandatory checks run successfully on a clean checkout at exact R7 SHA `24dcfccf412544ecd3b65d4cba0fb8116a699186`: (1) pinned git HEAD and worktree, (2) full existing 147-case offline verifier with 14 suites and source SHA-256 hashes, (3) real npm ci, npm test, npm run typecheck, npm run build, and (4) **actual trusted native /usr/bin/glpsol**, with its machine-readable result matching the independent R3 transport oracle. Skipped gates always remain BLOCKED; failures are explicit. The gate writes private 0600 per-step logs and an auditable JSON receipt outside the repo, with bounded subprocess execution and **no forwarded model-provider API tokens**.

Run a one-shot pinned clone on authorized Fedora, from the downloadable `qualify-r8-fedora.sh`:
```sh
bash qualify-r8-fedora.sh
```
The default clones into a fresh `~/Downloads/learnharness-r8-*` directory (does not touch existing branch/worktree), then performs all tests/build/native GLPK. `--offline-only` performs only the 147-case offline suite and **cannot** return a full R8 PASS. No sudo, user-supplied MathProg, GitHub Actions, provider calls, force push or merge. There is no automatic package installation of glpsol; missing or untrusted glpsol remains BLOCKED.

The existing selected 102/102 R3–R7 tests were rerun successfully on Node.js 22.16.0, and 200 synthetic indexed tasks independently agreed with SciPy/HiGHS 200/200. The new R8 release-gate unit suite passed **10/10** plus a real negative test on an intentionally wrong local Git commit. The complete 147-case verifier, npm install/tests/typecheck/build, Fedora browser smoke, and native glpsol execution **have NOT been run successfully in the model environment**: the Fedora remote device is offline and local container has no network Git clone or glpsol. The pilot remains **DRAFT and unmerged**.

R8 gate source is purely qualification tooling; no application or scoring logic changes. Adaptive tutor/practice `problem`/`conclude` result persistence remains open. This gate is not an OS sandbox for untrusted MathProg: only the earlier R5-generated synthetic model may reach the native solver.

## R9: single-session transport exam feedback loop (opt-in)

Open an existing **practice chat**, then use the **Szállítási vizsgagyakorló** link in its header. The transport page will open at `/pilot/transport?chatId=<id>` and load the recorded exam attempts from that chat. The other two modes remain available. Without a linked chat, the older stateless demo remains available.

A linked submission POSTs to `/api/pilot/transport/attempts` with exact fields `{chatId,attemptId,seed,answer}`. Its server-only deterministic scorer creates a bounded receipt (0/1 or UNASSESSABLE) and **appends both that receipt and a sanitized, model-visible R9 marker to the existing chat JSON record in one store write**. No raw learner MathProg is persisted; only a SHA-256 of the answer, task seed, outcome and error codes. A repeated attemptId and identical answer returns the original receipt without another event; a changed answer under the same attemptId gets HTTP 409. A chat must exist and be a practice session, with no currently running turn or pending problem. The existing problem/conclude gate remains unchanged; the AI cannot override the recorded score.

The UI can return to the linked chat with a prefilled, user-sendable Hungarian request for targeted error explanation, or generate a different task seed to retry. It displays up to 10 recent attempts from the same chat. The user's hint declaration remains self-reported and unproctored.

**Evidence:** 15/15 NEW deterministic transition/negative tests passed locally on Node 22.16.0 against the exact R9 service Git blob, including duplicates, wrong chat, false scores, modified answer reuse, growth cap, and stripping raw model source. The source was checked byte-for-byte by Git blob SHA. Existing R3–R7 selected 102 tests previously passed; those earlier results are not an R9 app acceptance run.

**Not yet proved:** full 162-test offline verifier, Next.js build/typecheck/browser session, turn-protocol roundtrip under real model provider, native `glpsol`. The existing R8 runner still pins the earlier R7 commit, so it is NOT valid as a proof of an R9 build unless an explicit commit-aware qualification is used. **Keep the PR draft and do not merge.**

R9 practice system prompt now explicitly treats server exam markers as immutable formative records: no AI regrading, no false attribution of learner independence, no override of normal problem/conclude pause/gating, feedback in Hungarian only on request.

## R10 – Exact SHA-driven whole-app qualification gate and practice sidebar isolation

R10 adds `qualify-release-r10.mjs`, `qualify-release-r10.test.mjs` and an explicit SHA-driven Fedora helper. The previous R8 runner pinned to R7 SHA cannot certify R9/R10: **do not use it for current release qualification**. R10 requires `--expected-head` to specify the precise 40-hex Git commit under test. It rejects dirty/unpinned source and fake or incomplete offline receipts. It checks the **fifteen named suites totaling 162 tests**, validates source hashes, runs its **12 own gate self-tests**, and conditionally runs `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and the R5 native GLPK qualifier against trusted generated inputs only. Missing evidence is `BLOCKED` or `FAIL`, **never PASS**. It never executes learner-authored MathProg.

Fedora execution (after obtaining an exact reviewed R10 commit SHA, not a floating branch):
```bash
bash scripts/qualify-release-r10-fedora.sh <EXACT_40_HEX_COMMIT>
# Or only the 162 dependency-free offline tests + self-tests:
bash scripts/qualify-release-r10-fedora.sh <EXACT_40_HEX_COMMIT> --offline-only
```
The helper clones into a new private Downloads directory and checks out the specified immutable commit, without changing any existing local worktree. Full mode requires a trusted local glpsol installation but never installs anything automatically, opens outbound sending lanes or calls AI providers.

The practice chat list projection no longer copies the entire `transportAttempts` history into list results; the authoritative receipts still persist in their correct chat record and remain retrievable via the dedicated practice-attempt endpoint. The R6 editor's misleading comment about indexed MathProg is updated to point to the R7 mode.

**Evidence:** R3–R9's selected 117 cases plus the new R10 release-gate 12 cases passed in one local Node 22.16 run: **129/129 PASS**. The test and qualifier Git blobs were byte-checked against locally executed files. The combined legacy 162 offline tests have NOT been run from an exact, full source checkout; Next.js build, Fedora browser, live AI remediation and native glpsol remain **NOT QUALIFIED**. The new explicit-pin runner has only been tested for rejecting false evidence, not yet run to a complete PASS on Fedora. No private exam material is committed. This remains a DRAFT PR; `main` is unchanged.


## R11 – Offline Hungarian remediation after verified grades

The transport practice page now offers an **immediate, deterministic Hungarian next-step card** for the first actionable error, even when no model/provider is configured. Its reusable source is `feedback-r11.mjs`. It receives only a verified server grade/error-code array, never raw student MathProg; it does not recalculate a score or reveal the optimal flow. Model/source, balance, capacity and arithmetic hints are prioritized, and the learner can edit/re-submit the same task or move to a new variant. Incorrect solutions still get 0/1; unsupported models remain UNASSESSABLE, not false-zero. The linked practice chat continues to retain server-grade receipts as in R9.

R11 regression: 17/17 local new end-to-end pure-node tests PASS; combined selected R3–R11 tests **156/156 PASS** on byte-verified R3–R10 preexisting source modules plus the local R11 module. The uploaded R11 source blob is identical to its locally tested file; the accompanying GitHub R11 test is a condensed, equivalent 17-case suite that still requires the new exact-commit verifier run. The full offline verifier target has been upgraded to **179** across 16 suites and the R10 release qualifier's expected receipt/count is updated accordingly. Full 179/179 exact-commit verifier, `npm ci`, `npm test`, `npm run typecheck`, Next.js build, browser smoke, live AI coaching, and real native glpsol remain NOT QUALIFIED because Fedora device and network are offline. This is NOT a certified exam or a merge approval.


## R12 – Native opt-in transport exam in existing Practice chat (DRAFT)

This milestone refactors the working R7–R11 transportation page into a single reusable React client component, `components/transport-exam.tsx`. The legacy deep link `/pilot/transport` stays functional as a wrapper. The ordinary LearnHarness Practice chat gains an opt-in button for an **in-place** exam workspace, with the same `chatId`, same R9 server-side append-only attempt receipts, same deterministic 0/1/unassessable scorer, and same R11 Hungarian repair hints. No duplicate grader or persistent database was introduced. No other session kind opens the workspace.

The Practice header offers an **explicit first-user** Hungarian operations research practice starter. Its course-specific prompt applies only when the first user message begins with the existing exact course activation string. The original non-practice prober/teacher course context and generic Practice system doctrine are preserved. An existing active `problem` or running turn disables opening; the `POST /api/pilot/transport/attempts` server-side gate remains authoritative. The user chooses whether to request further coaching; before that chat turn, the client requests the server's receipt-bearing record again.

**Offline regression expectation:** 196 tests across 17 suites (prior 179 + 5 Practice-course tests + 12 native source-contract checks). The 12 R12 checks are source-bound integration contracts, **not** a substitute for a compiled TSX or real browser. Their 16 supporting GitHub blob-level checks were performed before commit. The full 196-test suite, `npm test`, `npm run typecheck`, `npm run build`, actual browser walkthrough, native `glpsol`, and live AI-provider explanation are all **NOT YET VERIFIED**. Fedora remains offline; don't promote this draft PR or claim a certified MVP until those gates are observed.

For Fedora: use `bash scripts/qualify-release-r10-fedora.sh <R12_EXACT_SHA>` and inspect the generated receipts. Do not use GitHub Actions; do not run arbitrary learner-authored MathProg with GLPK. A trusted `/usr/bin/glpsol` is required for native solver qualification. Existing chat transcripts, raw learner source privacy, and all-or-nothing scoring must remain unchanged.

## R14A — Scalar MathProg equivalence + open-source GLPK bridge (DRAFT)

R14A builds on the R13 accepted Fedora MVP without replacing its constrained parser
or grading contract. The `gusek-equivalence-r14.mjs` module gives a *positive*
equivalence proof only for scalar LP/MILP models with identical named variables,
objective, integrality, and canonical linear half-spaces. It accepts scaled or
reordered rows, split equality constraints, a cap moved from `s.t.` into a
variable's declared upper bound, an explicit nonnegativity constraint replacing
a declaration bound, and redundant weaker constraints with the same normal.
For anything it cannot prove, the old verifier remains the grading fallback.
This is NOT an arbitrary mathematical-equivalence oracle and can reject
different but correct formulations. Arbitrary new variable names, indexed
set/param/sum generalization, nonlinear statements, file IO, and general
GUSEK grammar are **not qualified**.

The accompanying `toGlpkJsProblem(model,glpk)` is a **pure, non-executing**
adapter from the already parsed scalar AST to the JSON LP schema used by
[jvail/glpk.js](https://github.com/jvail/glpk.js) (GPL-3.0). It supplies
variable bounds, integer/binary domains, objective direction, and constraints,
returning a separate constant objective offset. No new dependency is installed,
no WASM is loaded, and no learner `.mod` source is sent to a solver.

Open-source candidates and rationale:
- [GNU GLPK](https://www.gnu.org/software/glpk/): authoritative MathProg
  translator and LP/MIP solver; GPL-3. Fedora CLI is in `glpk-utils`.
- [glpk.js](https://github.com/jvail/glpk.js): JSON-level GLPK WebAssembly,
  GPL-3. It does **not** parse arbitrary MathProg; the R14A bridge uses the
  published JSON contract only. An isolated resource-capped worker and
  result/oracle verification are prerequisites to actual solving.
- [HiGHS](https://highs.dev/): MIT-licensed LP/MIP alternative for independent
  numerical cross-checks; does not replace GLPK's MathProg grammar.
The LearnHarness repository is AGPL-3.0-only; GNU's GPL FAQ explicitly permits
linking AGPLv3 and GPLv3 modules. Review downstream distribution obligations
before shipping third-party solver binaries.

New suite `gusek-equivalence-r14.test.mjs`: 16 deterministic regressions,
also run by `npm test`. The offline verifier contract grows to **244 tests /
20 suites**. R13 was already qualified at SHA
`5130777b87e7eb29fb1221a9f3786de6d31043a6` (228/228 offline,
2584/2584 npm, Next build, localhost HTTP, Practice browser acceptance).
R14A source changes need their **own** exact-SHA Fedora and browser qualification.

Do not enable execution of arbitrary learner MathProg under the existing
`qualify-glpsol-r5.mjs`: it intentionally runs **trusted synthetic** fixtures
only. Full GUSEK execution needs a distinct sandbox qualification, not just
`sudo dnf install glpk-utils`.

## R14N — Native GNU MathProg in rootless Podman

The first R14N implementation adds **real GNU GLPK/GLPSOL processing** for
standalone GNU MathProg `.mod` files and optional separate `.dat` data files.
It does **not** award grades and is not connected to a public API. R13/R14A
Practice scoring remains independent and is not inferred from solver log text.

**Open source donor:** Fedora `glpk-utils` provides unmodified `glpsol`
from GNU GLPK (GPL-3.0-or-later). An optional local container is described
by `Containerfile.glpk-r14`; building it is a deliberate operator action.
`glpk.js` remains an optional JSON-level adapter, **not** a replacement for
GNU MathProg translation.

Native execution is fail-closed: `runNativeGmpl()` requires a local
`sha256:<64 hex>` image ID; refuses rootful or unavailable Podman;
uses `--pull=never --network=none --http-proxy=false --userns=keep-id`,
read-only rootfs and input bind mount, no capabilities, no-new-privileges,
256 MiB memory, 1 CPU, 32 PIDs, 12s container and 20s parent timeout.
Only temporary staged inputs are exposed; no repo, home, credentials or
provider configuration are mounted. GLPK writes only to its internal
restricted tmpfs. Output is capped. Failed starts and timeouts are not
interpreted as grades. Unknown GLPK syntax is a diagnostic, not automatic
0 points. Execution of potentially unsafe `include`, `printf`, `table`
and similar MathProg features remains confined to the sandbox, not
treated as a reason to bypass it.

**To build locally, explicitly:** in the operations research folder
`podman build -f Containerfile.glpk-r14 -t localhost/learnharness-glpk:r14 .`.
This pulls Fedora packages, costs disk space and is NOT done by tests.
Inspect `podman image inspect --format '{{.Id}}' localhost/learnharness-glpk:r14`
and set that exact digest as `LH_GLPK_IMAGE_ID`. The CLI invocation is
`node pilots/operations-research/run-glpk-r14.mjs --model /path/example.mod [--data /path/example.dat] [--check]`.
The CLI is for a local owner-controlled test only; output provides
diagnostics and `graded:false`, not a certified optimum/grade.

The **R14N qualification gate** is 13 new no-external-call safety tests.
R14 total expected offline suite count is **257 tests / 21 suites**,
full `npm test` expected **2613 tests**. The actual rootless Podman
execution, cross-checking GLPK's optimum with an independent solver, and
browser integration are **not qualified** merely by these tests.
Do not merge or expose the solver route until the real Fedora qualification,
a malicious MathProg isolation probe, and user-facing acceptance have passed.

## R14 browser integration — opt-in diagnostic-only native GLPK

The Practice GUSEK editor now has an optional `.dat` editor, a GLPK
translation check and a GLPK solve button, with a bounded diagnostic
console. This is separate from authoritative 1/0/null Practice grades:
the GLPK console is untrusted diagnostics and is **never** persisted as
a grade, counted as mastery, or passed to the teacher as proof of
model correctness. GUSEK models with indexed `set`/`param`/`sum`
can be run in the native diagnostic mode, but the synthetic exam grader
still supports a restricted scalar syntax; no automatic point is awarded
for general indexed models.

A new Next.js endpoint `/api/pilot/gusek/native` exposes only
diagnostic execution, and **defaults to off**. It requires all of:

- Explicit process-level `LH_GLPK_ENABLE_LOCAL=1`.
- `LH_GLPK_IMAGE_ID=sha256:<64 hex>` for a locally built, inspected image.
- A fresh `LH_GLPK_RUN_TOKEN` of exactly 64 hexadecimal characters
  (for example: `openssl rand -hex 32`). The secret is entered into
  the UI password control, lives only in client memory, is never
  recorded in the chat or source tree, and is sent as a header.
- An exact `http://localhost:<port>` or `http://127.0.0.1:<port>`
  same-origin request with no forwarded-host headers. A custom header
  and constant-time token verification block casual CSRF and unauthenticated
  remote requests. **Host checks alone are not a security boundary.**
- Rootless local Podman and the exact immutable image ID; if missing,
  execution refuses rather than falling back to host `glpsol`.

**Do not use this setting on a public or reverse-proxied instance.**
Disable the token and local-run flag when not in use. The next release
gate must validate the network threat model, including attempts to
reach the service from another host and token-redaction evidence.
The native adapter uses synchronous process execution with time limits;
it is intended for a single local user, not a multi-tenant service.

The browser's manual `.mod`/`.dat` execution route neither uploads a
learner file to a provider nor silently uses an AI model. The source
code and data are transient to the request and Podman staging files.
No filesystem path from the browser is accepted. Limits are capped
on the entire HTTP payload and on both individual input strings.

New HTTP security suite: `gusek-native-api-r14.test.mjs` (16 cases).
The rootless process suite now has 16 cases including proof that BYOK
credentials and remote-Podman environment variables are not inherited.
The combined offline release contract is **276 cases / 22 suites**.
The expected full npm count is **2632**. No current Fedora evidence for
this head is claimed: only the earlier R13 accepted build is qualified.
Do not merge or mark release PASS before the final comprehensive check.

### R14 GLPK solution listing (untrusted diagnostic)

For `solve` runs, the original `glpsol --output /output/solution.txt`
writes its printable row/column solution listing to a separate ephemeral
host staging directory mounted writable only inside the rootless
container. The runner reads at most **24 KiB** from a regular file using
`O_NOFOLLOW`, shows the listing in the GUSEK editor, and deletes the
staging directory after the run. `check` mode never asks for a solution
listing. No solution file, student `.mod`, or `.dat` is saved to chat
history. The listing is **untrusted diagnostic text**, because MathProg
I/O statements may influence it; it never becomes an automatic
`FULL_CREDIT` verdict. A GLPK process exit code of zero also does
**not** imply feasibility or optimality: inspect its solution status.
Two new mock runtime tests cover bounded listing capture and protection
against a symlink pointing outside the staging directory.

The earlier R14 one-run Fedora script was pinned before this code batch
and must **not** be used for the final release check. The operator asked
for just one final Fedora qualification after the larger integration
is complete, so no interim user-run test is requested here.

## R14 integrated indexed MathProg + verified solver-status UX

This batch moves R14 from isolated preparations toward an end-to-end
student workflow. In the GUSEK editor, transport exercises now allow a
**scalar** or **indexed** MathProg authoring mode. The server returns only
a declaration-only starter and the trusted, seeded `.dat` fixture
(no optimizer answer). The student writes the objective and balance
constraints and enters nine values as `x[1,1]` through `x[3,3]`.

The authoritative Practice grader routes the indexed transport subset
to the existing bounded R7 structural verifier plus independent R3
integer transportation enumeration. It requires `integer` on the
indexed variable and the appropriate capacity constraint; correct
syntax/model and optimum receive exactly 1/1. Known model/solution
errors score 0; unsupported general GMPL syntax remains UNASSESSABLE.
The score is still independent of any GLPK runtime output. Indexed
receipts use `gusek_indexed_r14` and retain no original MathProg source.
The same attempts API and replay/idempotency ledger are used.

This is **not a general GNU MathProg correctness prover**. In particular
the R7 index checker accepts one explicitly defined set/param/sum
grammar, not arbitrary nested indices, alternate semantically
equivalent algebraic formulations, or student-provided `.dat`
overrides. The indexed `.dat` editor is for **native GLPK diagnostics**;
the grader always uses the server's trusted seed data. The README
keeps this distinction prominent.

Native GLPK solving now also requests both `glpsol --output` (bounded
human-readable listing) and `glpsol --write` (documented plain machine
status). A bounded, source-only parser classifies LP/MIP solution status
as OPTIMAL, INFEASIBLE, FEASIBLE_NOT_PROVEN_OPTIMAL, UNBOUNDED,
UNDEFINED or UNKNOWN. An exit code of zero or an unrecognized log
does not mean optimal. No solver status is itself awarded exam points.

New regression coverage in this batch: **20** indexed model/oracle
cases, **8** indexed HTTP/Practice receipts cases, **12** GLPK
machine-status cases, and **2** additional sandbox status-file
checks. Direct isolated JavaScript validation has passed 20/20,
12/12 and 18/18 sandbox tests, but these do NOT prove the browser or
real Fedora runtime. The source gate is now **318 expected tests /
25 suites**, and the full npm count is **expected 2674**.

**One final qualification remains**: after the code reaches release
candidate quality, run the exact new HEAD on Fedora (offline tests,
full npm/TS/build, live API, actual GLPK image, sandbox adversarial
cases, and browser Practice). Earlier R14 scripts pinned to older
commits are obsolete. The user explicitly requested no more
incremental Fedora test rounds. Keep the stacked PR draft.

## R14W: dual-mode Workbench code batch (2026-10-28)

The GUSEK Workbench now has a **single entry component**:
\`components/gusek-workbench.tsx\`, reached from both \`/pilot/gusek\`
and the existing Practice chat integration. It contains two modes:
- **Vizsgagyakorlás** mounts the existing R13/R14 indexed task editor, authoritative 1/0/null grader, chat history and teacher-coaching behavior unchanged.
- **Szabad munkaterület** offers model.mod/data.dat tabs, bounded file import and file download, an example scalar GNU MathProg model, GLPK check/solve using the existing explicitly-enabled local token-protected endpoint, solver-status/console/solution listing panels, and an error-line jump from glpsol diagnostics. No grading, chat source persistence, or provider calls.

The two panes stay mounted when toggling so an unfinished practice answer is not lost by switching modes. The free workspace uses browser-native IndexedDB to save only the bounded .mod and .dat strings, not solution values, tokens, history or model-provider credentials. An isolated local draft can survive page reload; failure to access IndexedDB leaves the editor usable but reports local-save unavailability. No cross-device sync is implied. Input/output file size is bounded at 64 KiB each and no arbitrary filesystem paths are accepted.

Free-workspace native results are tagged to the exact in-memory input snapshot. If either source file changes, the UI warns that the displayed GLPK result is stale. GLPK model/data error diagnostics can jump to a local editor line for known staged filenames only; arbitrary file paths are ignored.

**Qualification scope and gaps**: the new pure \`workspace-files.mjs\` test suite has 14 cases (14/14 passed through an isolated JS execution of GitHub source and tests, not the Fedora runtime). The aggregate source gate is now **332 expected offline tests in 26 suites**, with **2688 expected npm cases** (not executed on this SHA). The final Next.js/TypeScript, real IndexedDB reload, browser split layout, Podman/GLPK and adversarial isolation tests are **pending**, by prior user decision for one comprehensive final Fedora qualification. All prior scripts pinned to old R14 SHAs are superseded.

**Explicitly not yet implemented:** CodeMirror 6 and GMPL syntax highlighting/advanced editor affordances, line-accurate diagnostic markers in CodeMirror, structured machine-variable table and safe transfer of optimal values into Practice, a non-blocking bounded local solver queue, and browser end-to-end acceptance of the Workbench. CodeMirror is not introduced as a floating dependency without a reproducible package-lock update; that belongs to the next cohesive code batch.

Do not merge until final acceptance. The original R13 qualified draft and main branch remain untouched.

## R14X: named solver variables, explicit Practice transfer and async Podman

This cohesive code batch now provides the missing path from a GNU MathProg
solve to a structured, student-inspectable result and optionally populated
exam answer (without claiming the answer is correct):

1. **glpk-columns-r14.mjs** joins GLPSOL --write and --wglp machine output,
   bounded by index, name, dimensions and finite values. Neither the console
   nor printable --output log is used as numerical proof. Malformed,
   duplicated, oversized or non-optimal output is NOT transferable.
2. **gusek-practice-transfer-r14.mjs** populates Practice JSON values and
   objective only on explicit user action, for an OPTIMAL solver status,
   complete matching named columns, identical source/data and identical
   seeded task identity. Copying never automatically submits/grades the answer.
   The existing independent 1/0/null Practice grade remains authoritative.
3. **glpk-native-async-r14.mjs** replaces synchronous subprocess calls
   in the authenticated local HTTP route with asynchronous Node execFile,
   without a shell. The endpoint rejects concurrent native requests (429)
   in a single Next.js process. Immutable local image, rootless Podman,
   disabled network/proxy, bounded CPU/RAM/PIDs/time and no credential
   inheritance remain mandatory. The old synchronous CLI runner remains
   available for explicit owner-directed diagnostics. The per-process
   concurrency gate is not a cluster-wide queue; client disconnect is not
   an explicit cancellation API, but process/container timeouts are bounded.
4. The standalone Workbench and embedded exam now show actual structured
   solver variable tables, and a guarded transfer button is available in
   exam mode. The exam's .dat fixture is read-only; custom data belong
   in the free Workbench.

New regression coverage: 12 machine-column cases, 13 Practice-transfer
cases (including cross-task mixups) and 9 async runner cases. Isolated
source execution has shown 12/12, 13/13 and 9/9 PASS respectively,
not a Fedora/Next.js/Podman acceptance claim. Expected final offline
contract: **366 cases in 29 suites**; expected full npm count **2722**.

**Remaining before a qualified R14 release:** CodeMirror 6 with correct
GMPL syntax highlighting/decorations, fully demonstrated browser draft
reload and solver-to-grade acceptance, adversarial rootless GLPK
containment, real Fedora npm ci/typecheck/build, and a fresh exact-commit
qualification. The current code environment cannot reach the npm
registry, so the CodeMirror package and package-lock are not changed
without reproducible dependency resolution; no runtime CDN injection.
The user explicitly requested ONE FINAL Fedora verification only.
The stacked PR stays DRAFT / NO MERGE.

## R14Y — Shared GMPL editor and final-only browser acceptance

This code batch addresses the main usability gap in the Workbench
without installing unresolved dependencies.

- **Shared GMPL editor**: `components/gusek-gmpl-editor.tsx` is used by
  both Practice and free Workbench for `.mod` and `.dat`. Supports
  line-number gutter, Ctrl+F literal case-insensitive find and replace,
  Tab/Shift+Tab indentation, Ctrl+/ comment toggle, Enter indent,
  bounded keyword suggestions, line-offset navigation, and an
  optional color-highlighted syntax preview.
- **Pure source editing functions**: `src/features/gusek/gmpl-editor-core.mjs`
  isolates tokenization, offsets, search, completion and
  keyboard-edit transformations with deterministic byte- and
  source-length limits. Neither the lexer nor its suggestions
  certify valid GNU MathProg or mathematical correctness.
- **Final browser acceptance artifact**:
  `pilots/operations-research/gusek-workbench-browser-r14.mjs` covers
  entry, file tabs, actual browser editing, search, IndexedDB reload,
  free-mode score isolation, Practice reopening and mode-switch
  persistence. It is intended to run exactly once as part of the
  final Fedora release candidate check, against a running local
  Next server and an explicitly supplied Chromium binary.
- **Unit test coverage**: the 16-case `gmpl-editor-r14.test.mjs`
  has passed 16/16 via isolated JS execution. It is now imported
  into the full npm test suite. The offline release gate contract
  becomes **382 expected cases / 30 suites**, npm full expected **2738**.
  The exact final Fedora/Next/browser PASS remains **unverified**.

This is **not CodeMirror 6 yet**: the editable control uses an accessible
native textarea with a separate syntax-highlighted preview, not an
inline CodeMirror parser/editor. CodeMirror's official core is modular
and its language features require reproducible npm dependencies.
Package resolution is unavailable in the current execution container,
so no dependency or lockfile was fabricated. Adopt the direct
CodeMirror packages once npm registry access allows a real lock update;
retain these tested GMPL transformations as the integration layer.

No intermediate user-run Fedora test is needed. The older R14
qualification scripts are pinned to obsolete SHAs and must not be used
as final evidence. The R14 PR remains DRAFT / NO MERGE, with the
single comprehensive Fedora qualification still outstanding.

### R14Y original GUSEK .mod/.dat interoperability

The Practice editor now supports importing a bounded local `.mod` file
and exporting the current `.mod` and trusted task `.dat` as ordinary
files, so students can continue with the original GUSEK/GLPK tools.
Import validates the local file extension, size and contents, resets
the old solver result and never imports arbitrary `.dat` overrides
into the examination. The trusted seeded Practice data stay read-only.

Both free and Practice editors accept at most 64 KiB of UTF-8 source
per file. The optional GMPL preview is informational and is **not**
a validated GNU MathProg syntax tree; actual GLPK diagnostics are
separate and can navigate by staged file and line. No raw student
source is added to authoritative Practice receipts.

No user-side Fedora tests are requested before the full, single final
release-candidate acceptance.

## R14Z – End-to-end Workbench coding batch (2026-10-28)

R14Z is a larger, cohesive user-workflow batch, not a sequence of
independent mock tests:

- **In-editor highlighting**: the shared GMPL editor uses an editable
  textarea and a synchronized, accessible, non-interactive syntax-color
  layer directly behind its text. The layer is bounded and automatically
  falls back to plain text for overly large files. Line numbers,
  Ctrl+F search, replace, keyword suggestions, Tab/Shift+Tab indentation,
  and error navigation remain available. No CodeMirror 6 runtime or
  unverified npm dependency was introduced.
- **One workflow across both modes**: both Workbench and Practice have
  Ctrl+Enter GLPK solve, while the Workbench has Ctrl+Shift+Enter
  translation check and Practice has Ctrl+Shift+Enter independent
  full-credit grade. Native check/solve can be cancelled from the UI
  with AbortController. Cancellation propagates as a request signal
  to async Node execFile and never awards points. The original
  container's bounded timeout remains; a client abort is a best-effort
  termination of the CLI, not an unverified guarantee of immediate
  process/container destruction on every platform.
- **Draft reliability**: IndexedDB writes for the free workspace are
  serialized; a slower older save is not allowed to commit after a
  newer one. UI save state is revision-bound.
- **Synthetic browser-to-real-grade acceptance**:
  gusek-practice-browser-r14.mjs is an extra Chromium script which
  intercepts ONLY the local native GLPK endpoint, injects an explicit
  synthetic OPTIMAL result, and performs an actual server-side indexed
  Practice grade. It proves the model/data transfer and the separation
  of solver output from grade. It is not a substitute for running
  GLPK in a real rootless Podman sandbox.
- **Single final Fedora gate**:
  qualify-r14z-final.sh accepts an exact Git commit SHA, requires a
  clean R14 branch, a preinstalled pinned rootless GLPK image and local
  Chromium, sufficient free space, and then executes npm ci, the
  source-pinned offline suite, full npm tests, TypeScript, Next build,
  real scalar/indexed/infeasible native GLPK cases, and both browser
  scripts. It does NOT automatically build/pull an image or install
  Fedora host packages. It retains private evidence logs and
  fails closed. This script is provided as source but has not been
  executed on the user's Fedora system.

**Inner checks run during coding:** mocked async GLPK process tests
have **12/12 PASS** including cancellation and temp cleanup.
GMPL editor core has **16/16 PASS**. Earlier isolated tests
for GLPK machine names and guarded grade transfer were **12/12**
and **13/13 PASS**, respectively. These results do not establish
that TypeScript, Next, the real solver, or Chromium passes.

**Expected R14Z release contract**: 385 offline tests in 30 suites,
full npm expected 2741 tests (not yet qualified). Re-check exact
test counts as part of final acceptance; do not report them as PASS
until actual Fedora receipts are obtained.

**Known remaining gap**: CodeMirror 6 itself is not bundled (npm registry
unreachable in the coding container). Current accessible, inline-
highlighted textarea is a working dependency-free alternative,
not a feature-identical replacement. Keep the PR DRAFT / NO MERGE
until the one requested final qualification has completed.
