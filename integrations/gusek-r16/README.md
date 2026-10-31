# R16.12 — Egészértékű termeléstervezés: egzakt modell-ekvivalencia

Az R16.11 hozzárendelési javítása után az R16.12 a másik saját feladattípus,
a **kétváltozós egészértékű termeléstervezés** matematikai hibadiagnosztikáját
pontosítja. A bizonyítottan redundáns erőforráskorlát elhagyása nem jelent
hibás megoldást; az eltérő teljes megengedett halmaz vagy célfüggvény viszont
bizonyítottan hibás. A nem végesen igazolható vagy túl nagy modell
**nem értékelhető**, sohasem automatikusan rossz.

Nincs új parser, GLPK-futtató, tanítómotor vagy upstream módosítás.
A saját `tredven/addons/domain/` rétegben marad minden, csak a `workbench`
profil érintett. A [részletes magyar szakmai és tesztdokumentáció](docs/R16.12-EGESZERTEKU-TERMELESTERVEZES-EKVIVALENCIA.md)
mutatja a tényleges bizonyítást, tanulóanyagot és az ellenőrzés korlátait.

**Ellenőrzés:** 103 Python PASS; 65 Node PASS + 3 Node SKIP (hiányzó R15
checkout); valós Next/Fedora/GLPK/browser **nem futott**. Release: NO_GO.

---

# R16.11 — Egzakt 3×3 hozzárendelési modell-ekvivalencia

A GUSEK szakmai add-on egyetlen, ténylegesen reprodukált matematikai
pontozási hibájának javítása: az R15 általános elemzője nem bizonyította
az egyetlen redundáns hozzárendelési egyenlet elhagyásának jogosságát, a
szigorú fallback pedig hibásan `wrong_constraint_count`-ot adhatott.

Az R16.11 a kilenc valóban bináris változó mind **512** értékét kipróbálva
bizonyítja a megengedett halmaz és a célfüggvény egyezését. Csak az
`assignment` feladattípust érinti; az upstream tanítót, a 0/1/null szerver
pontozási jogosultságot, a GLPK-t és a termeléstervezési orákulumot nem.

Új: `overlay-workbench/domain/or-assignment-equivalence-r1611.mjs` és
célzott Node-tesztek; a portábilis R16 builder és a végső HTTP-smoke
ugyanabban a workbench-profilban szállítja őket. A valódi R15 parser
GitHub-pinned önálló próbája lefutott, de a teljes R15 + R16.11 app-build
nem: **release NO_GO**.

Részletes matematikai bizonyítás, magyar önellenőrző feladat és
bizonyítékhatár: [R16.11 dokumentáció](docs/R16.11-EXAKT-HOZZARENDELESI-EKVIVALENCIA.md).

---

# LearnHarness R16.10 — Operációkutatás szakmai réteg

**Domain-first, upstream-first.** Az R16.9 változatlan adaptív és általános tanítási rétegére két új, paraméterezett, magyar GUSEK/MathProg feladattípus épül: **3×3 hozzárendelés** (bináris MILP) és **egészértékű termeléstervezés** (két erőforrás). Mindkettő egzakt, korlátos referencia-optimumot, forrásmodell-ellenőrzést az R15 meglévő statikus elemzőjével, valamint célzott domainhibákat kapott. Nem került bele új AI-tanár, parser, storage vagy GLPK-futtatás.

Új Workbench-only felület: `/pilot/gusek/szakmai`; API: `/api/pilot/gusek/szakmai`. Az eredeti `/pilot/gusek` oldalról külön link vezet ide. Mindkét feladat az eredeti upstreamtől elkülönülő `tredven/addons/` névtérben marad. A `core` profil és a régi R15 chat/score útvonala változatlan.

**Ellenőrzött ebben a környezetben:** 92/92 Python szintetikus Git- és negatívteszt; 37/37 lefutott Node szakmai és tanulási teszt PASS, további két, *valódi R15 parserhez kötött* Node teszt helyi forrás hiányában SKIP; Python-, Bash-, JS- és TSX/TS-szintaktika. A két egzakt orákulum 256–256 szintetikus feladatcsaládon független enumerációval is egyezik. **Nem igazolt:** valós R15 parser-integráció, Next.js teljes build, böngésző, valódi felhasználói minőség, GLPK. Release és merge: **NO_GO**.

- [R16.10 szakmai implementáció és tesztkapuk](docs/R16.10-SZAKMAI-RELEASE-TERV.md)
- [Magyar operációkutatási tanulókártyák](docs/R16.10-MAGYAR-OPERACIOKUTATAS-TANULOKARTYAK.md)
- [Korábbi R16.9 kiadás és integráció](docs/R16.9-TASK-AWARE-TEACHING-CYCLE.md)

**Egyetlen végső futás az owner Fedora környezetében:**

```bash
python3 r16.py freeze-pack --r15 /valid/fork-at-r15 --out /new/r1610-pack
python3 r16.py assemble-pack --upstream /clean/upstream \
  --addon-pack /new/r1610-pack --upstream-ref e69e85269c064c6c9c49a8b06ae78c06e79c4a63 \
  --profile workbench --out /new/r1610-candidate
python3 r16.py verify-assembly --path /new/r1610-candidate
bash qualify-r16.sh /new/r1610-candidate
```

The above commands are **not executed** here. Preserve both Git repositories and user learning data. The local script never merges or releases on its own.

---

# LearnHarness R16.9 — Task-aware GUSEK → tutor → correction loop

**84 Python synthetic Git/negative checks and 22 Node pure-learning checks PASS (106 total). Real Next.js runtime and Fedora E2E are NOT RUN. Release/Merge NO_GO.**

R16.9 builds on R16.8; the teacher handoff now includes validated learner-visible details of the current GUSEK task, so the standard upstream teacher can ask precise questions about a transport matrix, fröccs resource constraints or the tablets composition rule. No submitted model, values, optimum, GLPK credentials or chat IDs travel in the text. A normal `/chat/new?mode=teach` link and the existing R15E correction flow complete the **user-controlled** learning loop, without a new grader, chat mutation or backend service. The user must explicitly copy/paste to send any exercise facts.

Read [R16.9 design, tests and one-shot gate](docs/R16.9-TASK-AWARE-TEACHING-CYCLE.md). Older R16 release notes below are historical; the current builder remains namespaced under `tredven/addons/`.

---

# LearnHarness R16.8 — GUSEK teaching handoff (product-facing chunk)

**78/78 Python integration/negative checks and 10/10 Node handoff checks PASS (total 88).** The real 0.4.1 + R15 Next.js runtime has **not** been built or tested. Release/Merge **NO_GO**.

The existing R15 Workbench now gets an optional copy-only tutoring brief based on **verified assessment and existing R15B corrective advice**. The learner manually pastes it into a normal LearnHarness teaching chat; no provider API call, new parallel teacher, grade change, solver, automatic chat write, or upstream source patch. The R16.7 portable, namespaced add-on and one-shot qualification pipeline is preserved. `--profile workbench` enables the feature; `--profile core` stays unchanged.

See [R16.8 feature documentation](docs/R16.8-TEACHING-HANDOFF.md) for exact behavior, limitations, evidence and one-shot commands. R16.7 and older docs below are historical.

---

# LearnHarness R16.7 — Upstream alias isolation for GUSEK add-ons

**Current: 70/70 synthetic/targeted tests PASS. Real LearnHarness 0.4.1 + R15
Next.js build NOT RUN; release and merge NO_GO.**

R16.7 closes a concrete R16.6 defect: alias imports from a GUSEK add-on could
silently bind to unrelated upstream internals, despite an otherwise portable
added-only source pack. Now `freeze-pack` and `assemble-pack` both refuse such
links, while keeping R15-owned aliases and the one private receipt shim working.

Read [R16.7 closed alias boundary](docs/R16.7-CLOSED-ADDON-ALIAS-BOUNDARY.md)
for the precise change, test evidence and limitations. This release is still
source tools/overlays, **not** a compiled LearnHarness app. Preserve R15 PR #3
and the upstream source unmodified.

---

# LearnHarness R16.6 — Upstream ESLint import-law repair

**Current:** 62/62 synthetic/targeted tests PASS. Real upstream 0.4.1 integration **NOT RUN**. Release/merge **NO_GO**.

**Start with [R16.6 import-law repair](docs/R16.6-UPSTREAM-IMPORT-LAW-REPAIR.md).** This release fixes a source-level incompatibility with the real upstream 0.4.1 ESLint import restrictions: add-ons now live in **top-level `tredven/addons/`**, and the Next.js App Router bridges import from that root namespace instead of forbidden `src/tredven/addons/`.

Older R16.4/R16.5 documentation below records its historical behavior, **not the current supported namespace**. R16.6 qualifies only its new namespace; the upstream source and existing R15 remain unchanged.

---

# LearnHarness R16.5 — Fork-core boundary and one-shot qualification evidence

**Status: 56/56 synthetic/targeted tests PASS; real upstream 0.4.1 + R15 Next.js build NOT RUN; release and merge NO_GO.**

R16.5 follows R16.4 without expanding the general plugin infrastructure. A read-only inspection of the exact R15 source detected a hidden JSDoc type-only dependency on the fork-modified core. R16.5 maps that dependency to a private receipt type in **both** profiles, rejects unexpected type/dynamic imports at assembly, disables the legacy non-namespaced `migrate` CLI path, and adds a self-verifying *technical, not release* receipt to the existing single qualification script.

Start with [docs/R16.5-FORK-CORE-BOUNDARY-AND-ONE-SHOT-GATE.md](docs/R16.5-FORK-CORE-BOUNDARY-AND-ONE-SHOT-GATE.md) for evidence, exact commands and limitations. Previously frozen R16.4 portable packs need recreation to include the new core-profile compatibility type. The existing original R15 branch, upstream repo and user data remain untouched.

---

# LearnHarness R16.4 — Namespaced Upstream-First Add-ons

**Status: 42/42 synthetic Git tests PASS; actual LearnHarness 0.4.1 Next.js integration NOT RUN; release NO_GO.**

R16.4 addresses a concrete weakness in the preceding R16.3 pack: although the add-on sources were portable, the assembled code still claimed `components/`, `src/features/` and `pilots/` paths also likely to be used by future upstream development. The new assembler relocates the selected R15 source under `src/tredven/addons/`, keeps only the required Next app routes as thin bridges, and proves each generated source file against the frozen portable pack.

**Start here:** [docs/R16.4-NAMESPACED-ADDON-REALITY-GATE.md](docs/R16.4-NAMESPACED-ADDON-REALITY-GATE.md). The original R16.3 and R16.2 documentation follows for context; its pre-R16.4 layout descriptions are historical, not the default new assembly output.

Run locally after the immutable R15 and clean upstream commits are available:

```bash
python3 r16.py freeze-pack --r15 /existing/local/fork --out /new/addon-pack
python3 r16.py assemble-pack --upstream /existing/local/upstream --addon-pack /new/addon-pack \
  --upstream-ref e69e85269c064c6c9c49a8b06ae78c06e79c4a63 --profile workbench --out /new/r164-assembled
python3 r16.py verify-assembly --path /new/r164-assembled
# Once, with owner approval and npm access:
bash qualify-r16.sh /new/r164-assembled
```

The old R15 PR/branch and the upstream are untouched. R16.4 contains only tools and compatibility overlays; it is not a pre-compiled application and does not grant release authorization.

---

# LearnHarness R16.3 — Portable upstream-first add-on package

**Current status: `R16_3_PORTABLE_TOOLING_PASS_SYNTHETIC_33`, `REAL_UPSTREAM_0.4.1_BUILD_NOT_RUN`, `RELEASE_NO_GO`.**

This release extends the unchanged R16.2 workbench/GLPK overlay with one-time R15 export (`freeze-pack`), content-locked add-on source (`pack-lock.json`), reusable upstream assembly (`assemble-pack`), and an independent upgrade plan (`plan-update`) that holds the add-ons constant. It also verifies the source hashes after build/test, while ignoring only known generated files. **No GitHub writes or operator shell execution occurred.**

**Full new commands, examples, status and risks:** [docs/R16.3-PORTABLE-PACK-AND-UPSTREAM-UPDATE.md](docs/R16.3-PORTABLE-PACK-AND-UPSTREAM-UPDATE.md).

### Quick reference

```bash
python3 r16.py freeze-pack --r15 /existing/local/fork --out /new/addon-pack
python3 r16.py verify-pack --path /new/addon-pack
python3 r16.py assemble-pack --upstream /existing/local/upstream --addon-pack /new/addon-pack \
  --upstream-ref e69e85269c064c6c9c49a8b06ae78c06e79c4a63 --profile workbench --out /new/assembled
python3 r16.py plan-update --current /new/assembled --upstream /existing/local/upstream \
  --addon-pack /new/addon-pack --upstream-ref NEW_UPSTREAM_COMMIT --profile workbench --out /new/candidate
```

The source add-on pack itself is generated from locally available immutable R15 git data; this small ZIP contains tooling/overlays, not that checkout. The current fork's R15 draft PR and human-owned data are untouched. A GitHub source comparison alone cannot prove runtime compatibility.

---

## Previous R16.2 description (retained for compatibility)

# LearnHarness R16.2 — Upstream-First Workbench Add-on

**Status: `R16_2_SOURCE_TOOLING_PASS_SYNTHETIC`, `REAL_UPSTREAM_NEXT_BUILD_UNQUALIFIED`, `RELEASE_NO_GO`.**

This bundle advances R16.1 from a standalone GUSEK grading/practice MVP to a reproducible extraction of the **complete original R15 GUSEK Workbench UI**, including its own editor, independent browser drafts/projects, adaptive itinerary, and optional local-only GLPK diagnostics. It does not install or enable GLPK. The original fork, R15 draft PR, original upstream and existing user data remain untouched.

The ZIP ships tooling and integration overlays, **not full copies** of the LearnHarness upstream or R15 Git trees. It reads the exact Git blobs from locally available repositories during a future operator-approved assembly. No `npm ci`, GitHub merge/push, deployment, cloud provider invocation, or Podman execution is done by this bundle itself.

## Fixed source references

| Source | SHA |
| --- | --- |
| Common ancestor / fork main | `3dc88472eea41eed0d5e5f29c2f16f8d063c415b` |
| Previously Fedora-qualified R15 | `9b7f374f4003276e67a96feb070124c244447aec` |
| Example upstream 0.4.1 (Oct 31, 2026) | `e69e85269c064c6c9c49a8b06ae78c06e79c4a63` |

The connector verified on 2026-10-31 that the upstream example SHA does not own the add-on entrypoints inspected (`/pilot/gusek`, its API routes, GUSEK components, feature store, pilot engine). This is **not** an exhaustive future collision guarantee: the assembler validates all paths in the exact selected upstream source snapshot each time.

## Profiles

- `workbench` (**default**) — embeds exact R15-added GUSEK Workbench component and transitive added-only GUSEK/MathProg, editor, browser draft/project, R15 adaptive modules. The standalone GUSEK chatId/receipt connection is deliberately disabled; upstream chat, agent, core and persistent transcript files are **never** changed.
- `core` — smaller R16.1 standalone practice page and deterministic grading/advice, still supported for fallback.
- `workbench --native-route` — includes the exact R15 native GLPK route and async sandbox dependencies. This is **source installation only**; runtime stays disabled unless a human separately sets the R15's local-only image+token+enable configuration. The native endpoint never awards points.

## Source boundaries

The exporter snapshots all new R15 (`A`) paths from immutable Git and creates a SHA-256 inventory. R15 `M`/`D` modifications are exported **only** as a quarantined patch, never auto-merged into upstream. The upstream is expanded into a *separate* output directory, then the selected dependency closure and overlay added *only where no upstream file exists*. Both exact-case and case-insensitive collisions block assembly. No upstream file is changed.

**One bounded compatibility transformation** occurs in the disposable assembled copy of `components/gusek-exam.tsx`, and only for the Workbench profile: original import of `TransportAttemptReceipt` from fork-modified `src/core/contracts/chat` is replaced by a private R15-compatible type (`src/tredven/gusek/attempt-receipt-r15.ts`), and the standalone `chatId` binding is disabled to avoid writing/reading upstream session receipts. The two exact source snippets must each match once or assembly **blocks**. Source originals are preserved and hashed in `addons-source/source`; transformed output hash and rationale are recorded in `evidence/assembly.json`.

No new general-purpose plugin manager, upstream release hook, agent, model, schema migration or parallel grade authority was introduced. All 0/1/NULL grades still originate in the R15 server-owned oracle route; GLPK remains a diagnostic solver, not the evaluator.

## When the operator has local terminal access (one final verification)

Keep the old R15 checkout and new upstream ref available locally. Commands only read the Git sources; they create a **new** output location and do not alter a source worktree.

```bash
BUNDLE="$HOME/Downloads/learnharness-r16-upstream-first-r162"
REPO="$HOME/path/to/existing/learnharness"
OUT="$HOME/Downloads/learnharness-r162-assembled"

# Explicit owner-initiated, read-only remote fetch into local Git database:
git -C "$REPO" fetch https://github.com/amosblomqvist/learnharness.git \
  main:refs/remotes/upstream/main

# No GitHub writes, no checkout changes, no executables run from extracted R15:
python3 "$BUNDLE/r16.py" migrate \
  --upstream "$REPO" --r15 "$REPO" --upstream-ref upstream/main \
  --profile workbench --native-route --out "$OUT"

# Pure source-integrity checks (read-only):
python3 "$BUNDLE/r16.py" verify-assembly --path "$OUT"
python3 "$BUNDLE/r16.py" verify-export --path "$OUT/addons-source" --profile workbench

# Once, when ready for npm download and local app/test execution:
bash "$BUNDLE/qualify-r16.sh" "$OUT"
```

`--native-route` can be omitted to keep the native endpoint absent. `qualify-r16.sh` always disables GLPK runtime execution and clears its local secrets for the test, even if an operator has opt-in variables set. It checks the entire assembled source inventory before `npm ci`, then full npm tests, TypeScript, build, R15 focused Workbench/adaptive tests, and real Next loopback HTTP smoke of task generation, correct/assisted/wrong grading, bad seed, optional native disabled/absent, and page rendering.

**Native Podman/GLPK E2E and visual Chromium behavior are not qualified by this bundle.** These require a separate owner-authorized final qualification in the target Fedora environment and must never be implied by the synthetic result.

## Produced output

```
<new output>/
  addons-source/
    source/                 # original immutable R15-added files with SHA-256 manifest
    quarantine/             # R15 upstream modifications, never automatically applied
    manifest.json
  assembled/                # clean upstream snapshot + add-on paths only, not a Git repo
  evidence/
    assembly.json           # source pins, selected profile, imported hashes, two seam transforms
    upstream-files.json     # SHA-256 for every upstream tracked source file
    README.txt
```

`verify-assembly` blocks tampering with any tracked upstream or added source file, extra/missing paths, or introduced symlinks. The hash manifest is **not a signature**, SLSA attestation, or malicious-operator defense; it protects against accidental drift between assembly and test.

## Evidence recorded in this chat environment

- `python -m unittest discover -s tests -v` — **19/19 PASS** in isolated synthetic Git repositories (including full Workbench source extraction, seam guard, native opt-in selection, alias resolution rejection, all-source SHA inventory integrity, tamper and symlink rejection).
- `python -m py_compile r16.py` — PASS.
- `bash -n qualify-r16.sh` — PASS.
- `node --check r16-http-smoke.mjs` — PASS.
- TypeScript TSX/TS syntax parser for shipped overlay — PASS (without `tsc` type-checking).
- Actual R15 + latest upstream repository checkout, npm install, TypeScript full project, production build, local HTTP and visual browser — **NOT RUN HERE** (unavailable repository checkout/network/node_modules).

No changes to GitHub repositories or owner devices. Preserve the R15 Fedora qualification evidence/PR exactly as-is until a separately approved release.

For detailed design and falsification see `docs/R16.2-DESIGN.md` and the inherited `docs/DECISIONS.md`.
