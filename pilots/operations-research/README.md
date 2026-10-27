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
