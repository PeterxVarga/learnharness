# Operations Research — LearnHarness R1 qualification pilot

**Status:** synthetic oracle tests prepared; AI tutoring, PDF grounding and GLPK runtime **not yet qualified**.

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
