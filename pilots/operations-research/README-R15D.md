# R15D — követhető, explicit GUSEK-gyakorlatsor (draft)

## Alap és minősítési állapot

- Változatlan, Fedora-kvalifikált **R15C** HEAD:
  \`b88e3939728dcd9611d8f25c64a75ea647f86850\`.
  Az 98/98 Node, TypeScript, Next build, 16/16 Chromium PASS.
  Naplók: \`~/Downloads/learnharness-r15c-qualified-b88e393\`.
- Az R15B és az R14Z korábbi célzott/teljes kvalifikációja
  változatlan. R15D a PR #3-on, a \`pilot/operations-research-r15\`
  stacken fejlődik; merge és új release nélkül.
- **R15D még NEM kvalifikált.** A jelen dokumentum nem egy
  sikeres Fedora-teszt bizonyítéka.

## Research → falszifikáció (2026-10-30)

1. **PrairieLearn** (open source):
   https://docs.prairielearn.com/assessment/configuration/
   Külön kezeli az assessment instance, a kérdésváltozat és az
   ismételt beadás fogalmát; a homework és az exam próbálkozási
   modellje eltér. Falszifikáció: a megoldás teljes kérdésmotorját,
   backendjét, részpontozását vagy „mastery” fogalmát átvenni
   ütközne az R13/R14Z meglévő 0/1/NULL determinisztikus
   szerverpontozójával. **Átvesszük a három eseményt külön
   kezelő koncepciót, de nincs importált runtime kód.**
2. **Open edX**:
   https://docs.openedx.org/en/latest/educators/references/data/staff_debug_info.html
   A problem state és az attempts külön mezők; adminisztrátorok
   ellenőrizhetik és törölhetik a learner state-et.
   Falszifikáció: a teljes Open edX per-user progress modell
   és DB-integráció sokkal nagyobb tenancy/privacy/migrációs
   kockázat, mint amit az R15D GUSEK UI indokol. **Csak
   explicit, nem tartós munkamenet-állapotot vezettünk be.**
3. **Meglévő LearnHarness R15A/B/C**: a \`r15SessionOutcome\`
   ellenőrzött szerveres 0/1/NULL beadás, az \`r15cPracticeItinerary\`
   három külön variáns, és a R15B validált, max 48-as
   előzményablak már rendelkezésre áll. **Ezeket újrahasznosítjuk**;
   nincs második grade/solver, rejtett optimum, AI-tanár,
   automatikus időzítés vagy adatbázis-módosítás.
4. Falszifikációval elvetve: a \`selected\` nem jelent
   \`loaded\` állapotot; a \`loaded\` nem jelent \`submitted\`
   eseményt; a 0/1 egy beadás eredménye, nem az állomás
   megértésének bizonyítéka. A 0 és NULL nem ugyanaz.
   A késleltetett/más feladatból érkező szerverválasz
   nem írhatja felül a választott állomást; a segítség
   önbevallása önbevallás marad.

## A teljes R15D fejlesztési chunk

- Új tiszta \`adaptive-run-r15d.mjs\` állapotgép:
  explicit \`create\` → \`select\` → \`loaded\` →
  \`server grade\` / \`retry\` → következő állomás.
  A második csak az első, a harmadik csak a második
  tényleges ellenőrzött beadása után választható.
- Választható/állapot szerint lezárható gyakorlatsor,
  progress panel, 3 konkrét állomás, független
  \`0/1\`, \`1/1\`, \`nem értékelhető\` számlálók.
- Visszatérő/ismételt próbálkozás ugyanazon feladaton
  külön beadásként számít, az ismételt receiptet nem
  kettőzi. Más feladat, lejárt feladat vagy rossz
  állomás nem változtat a progresszen.
- Az R15C tervet a felhasználó a konkrét gombbal
  aktiválja. **Kiválasztáskor nincs automatikus HTTP GET,
  beadás vagy grade.** A tanuló az \`Új feladat\`
  gombbal külön tölti le a problémát, a beadást pedig
  külön indítja el. Bármikor lezárható a követés.
- Az állapot a React komponens memóriájában él, tehát
  az oldal újratöltése lezárja; nincs új per-user
  persistent DB, export/import, cookie vagy AI-szolgáltató.
- Meglévő 98 gyors R15A/B/C unit-teszthez hozzáadott
  **42** R15D unit-regresszió = **140**.
- A korábbi, már R15C-ben PASS **16 Chromium**-ellenőrzést
  változatlanul futtatja az új gate, plusz egy külön
  **14**-es R15D browser gate, amely négy valódi
  HTTP szerveroldali beadás mellett ellenőrzi a
  három állomás manuális végigjárását.
- **Egyszeri fail-fast** \`qualify-r15d-targeted.sh\`:
  140 unit → TypeScript → egyetlen Next.js production build
  → 16 korábbi browser → 14 új browser teszt.
  Nem indítja újra a 469 R14Z offline, 2825 teljes
  npm és GLPK release-suite-ot.

## Biztonsági határok és célzott negatív tesztek

- \`selected\` ≠ \`loaded\` ≠ \`server-verified submitted\`
- A „követés indítása” és a variáns kiválasztása **0
  új HTTP-kérés** a GUSEK API-ra.
- Csak a megfelelő aktuális, betöltött taskhoz
  tartozó validált, explicit szerveres grade módosít
  progresszt; rossz ID és érvénytelen grade kimarad.
- Az R15D nem írhat pontot, nem állíthat mesterfokot,
  nem tárolhat nyers \`.mod\` vagy \`.dat\` tartalmat.
- A \`1/1\` csak tényszerű, ellenőrzött beadás,
  nem vizsgakészenlét vagy bizonyított független munka.
- Nincs automatikus következő feladat, automatikus
  beadás, backend persistence vagy időzítő.

## Kvalifikáció

Futtatás tiszta, pontos SHA-n a Fedora gépen:

\`bash pilots/operations-research/qualify-r15d-targeted.sh EXACT_R15D_SHA\`

Sorrend: 140 gyors unit → TypeScript → 1 Next build →
16 régi Chromium → 14 új Chromium. Az első hibánál stop.
A naplók \`/tmp/learnharness-r15d-targeted-*\` alá kerülnek,
a sikeres bizonyítékokat később SHA-256-tal tartósan
archiválni kell. A 0/1 szerveres értékelő érintetlen.
