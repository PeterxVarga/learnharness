# R15F — LearnHarness R15 release-hardening / forrás-határ és replay-falszifikáció

## Határozott állapot (2026-10-30)

**Ez a branch egy R15F fejlesztési / release-candidate előkészítési állapot,
NEM a teljes R15 release engedélyezése.** Az R14Z teljesen kvalifikált
baseline és a külön R15B–R15E bizonyítékok maradnak érintetlenek.
GitHub PR #3 draft, nem merge-elt.

Kvalifikált, immutábilis kiindulási forrás:
- R14Z teljes baseline: `9c017fe7636a2c0ae7f68e9f52bdb2174d3dbd22`
- R15E célzott PASS: `0ff8d12e8f1858c753eb8bea877719911f3c101b`
- R15E archívum: `~/Downloads/learnharness-r15e-qualified-0ff8d12`
  (180 unit + TypeScript + egy production build + 42 browser + 7/7 SHA-256 OK).

## Research és falszifikáció

1. **OWASP ASVS 5.0**: https://owasp.org/www-project-application-security-verification-standard/
   Megköveteli az üzleti döntéseket érintő bemenetek pozitív
   validációját és az ellenőrzés megbízható szolgáltatásrétegbe
   helyezését. Itt ez a már meglévő szerveres 0/1/NULL
   GUSEK pontozó — az adaptív UI nem adhat pontot.
   Az R15F-scope audit minden nem engedélyezett pontozó/API-módosítást
   blokkol, de ez **nem teljes ASVS audit**.
2. **OWASP HTML5 Security Cheat Sheet**:
   https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
   `sessionStorage` módosítható a böngészőből. Ezért az R15E könyvjelző
   továbbra is kizárólag három `{kind,seed}` értéket tárol;
   visszaállítása az eredményszámlálókat nullázza.
   Nincs authentikáció, receipt vagy pont a könyvjelzőben.
3. **SLSA provenance**: https://slsa.dev/spec/v1.0/provenance
   A forráscommit, build és bizonyítékok összekötése
   fontos, de a saját Fedora munkamenetből származó SHA-256
   napló **nem** aláírt SLSA/CI attesztáció. A R15F
   a `sourceSha` és R14Z baseline SHA-t strukturált JSON-ban,
   `releaseApproved:false` mezővel rögzíti. Nem színleli,
   hogy egy lokális forrásfence biztosítja a teljes
   supply-chain provenance-t.
4. **Első fél LearnHarness R15A–E**: a validált
   `r15ObservedOutcomes`, a háromállomásos állapotgép,
   és a manuális GUSEK GET/POST már létezik;
   új LMS, AI-modell, adatbázis vagy pontozó telepítése
   nem indokolt.

### Konkrét falszifikált hiba: A→B→A grade replay

Az R15D `lastReceiptKey` csak a közvetlen ismétlést
blokkolta. Egy már megszámolt A receipt a B beadás
után nem esett azonosnak a legutóbbival, így
megismételt feldolgozásakor a szimulált előrehaladás
felfújható volt. R15F-ben:
- állomásonként `receiptKeys` nyilvántartás;
- teljes idempotencia az aktuális max 128
  megfigyelt beadásra, így A→B→A sem növelhet számlálót;
- számlálók és ledger-hossz konzisztenciaellenőrzés;
- 128-nál további esemény **fail closed** (nem felejtünk
  régi receiptet azért, hogy újabb duplikáció átmenjen);
- továbbra sincs szerverpontozás vagy megoldás-szöveg
  a frontend progress-nyilvántartásban.

A 128-as korlát tudatos trade-off, nem természetes
tanulási korlát; a későbbi perzisztens ledgerhez
új, valóban szerveres trust boundary kellene.

## R15F forrás-határ / release-fence

`release-fence-r15f.mjs` a pontos R14Z baseline
és a jelölt R15F SHA közötti teljes Git fájl-deltát
ellenőrzi. Pontosan **36 fájlt** enged: az R15A–F
pilotfájlokat, teszt-wrapperjeiket és
`components/gusek-exam.tsx`-t. Minden más
hozzáadás/módosítás/törlés — beleértve az
API-route-okat, `src/core` pontozót,
`package.json`, lockfile, CI és DB fájlokat —
**NO_GO**. A státusz (A/M), duplikált path, pontos
HEAD, tiszta munkafa és R14Z commit-ős ellenőrzött.

A forrásfence **a scope-ot igazolja, nem a
módosított UI matematikai helyességét**.
Nincs signed attestation, nincs teljes SLSA
és nincs automatikus merge-engedély.
A normál feladatellenőrzés és 0/1/NULL szerveres
pontozóérvényesítés változatlan.

## Egyszeri célzott R15F gate

`bash pilots/operations-research/qualify-r15f-targeted.sh EXACT_SHA`

Sorrend: **forrásfence 36 → 224 gyors unit →
TypeScript → egy Next.js production build →
R15C 16 Chromium + R15D 14 Chromium +
R15E 12 Chromium → forrásfence recheck**.
A forrásfence/teszt bármely eltérése az első
hibánál leáll; nincs több száz offline/ több ezer
teljes npm-release-teszt ismétlése.

A kimeneti JSON (`release-fence.json`) helyi,
nem titkosított, nem aláírt bizonyíték.
A build és tesztnaplók `/tmp/learnharness-r15f-targeted-*`
alá kerülnek; csak valódi PASS után archiválandók.

## Végső release feltételei — most NO_GO

1. R15F célzott gate PASS, log és JSON SHA-256 archív.
2. Független pontozó/API-diff és privilege/authorization
   scope adjudikáció (most a tiltott path-ok kizárása).
3. **Egyszer**, a végső release-jelölt pontos SHA-ján,
   a teljes R14Z-baseline regresszió és szükséges
   valós GLPK/production integrációs utak tesztjei.
4. Eltérések javítása ugyanazon R15 feature-ágból,
   majd új végső forrás-fence és explicit review.
5. Csak utána release GO/merge döntés.
