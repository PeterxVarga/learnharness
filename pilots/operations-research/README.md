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
