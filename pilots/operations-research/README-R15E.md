# R15E — manuális javítás, böngészőlapon belüli tervkönyvjelző és szüneteltetés

## Korábbi kvalifikált pont

- R15D HEAD: `6884288d057a9dca4fe9e5a6463cdd327e513a4d`;
  140/140 unit, TS PASS, Next.js production build PASS, 30/30 böngészős kontroll PASS.
- Naplók: `~/Downloads/learnharness-r15d-qualified-6884288`;
  SHA-256 öt helyett hat fájlra ellenőrizve (6/6 OK).
- Az R14Z teljes, az R15B/R15C/R15D célzott kvalifikációk érintetlenek.
  A `pilot/operations-research-r15` ág és a draft PR #3 továbbra sem release.

## Research, open-source tanulságok és falszifikáció

1. **PrairieLearn** – https://docs.prairielearn.com/assessment/configuration/
   A feladatsor példánya, a konkrét variáns és a próbálkozás elkülönül.
   Stabil feladatpéldányt tart meg, az exam változatot nem regenerálja
   észrevétlenül. **Átvett elv:** mentett *terv* ≠ végrehajtott *beadás*.
   Nem integrálunk teljes assessment backendet vagy új pontszabályt.
2. **OWASP HTML5 Security Cheat Sheet** –
   https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html
   A local/sessionStorage a böngésző felől módosítható, XSS-ből olvasható.
   Böngészőoldali adattárolás nem ad hiteles eredmény-/azonossági
   bizonyítékot. **Átvett elv:** kizárólag 3 `{kind,seed}` rekord;
   nincs ID/token/chat/model, eredmény, javítás vagy más személyes adat.
3. **OWASP Session Management Cheat Sheet** –
   https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
   Session ID és auth token nem kerülhet Web Storage-ba. A beépített
   React-állapot és a böngészőlapon belüli `sessionStorage` külön
   trust boundary. Nem építünk saját tokenrendszert.
4. **Meglévő saját R14Z vázlatmentés és R15D állapotgép**: az R14Z
   már képes azonosított feladat/kind/seed/dialektus mellett a
   szerkesztő piszkozatát böngészőben visszatölteni. A GUSEK
   pontozást változatlanul szerver adja; az R15D állapotgép
   számolja az explicit beadásokat. Így R15E-hez nem kell új
   adatbázis, scorer, GLPK futás vagy 3rd-party runtime library.

**Falszifikált / elvetett:** a teljes progressz bizalmi alapon
visszatöltése, korábbi 1/1 pont állítása mentett JSON-ből,
egyszerű `localStorage`-os örökös követés, automatikus
részteljesítés, kitalált ismétlési időpont.

## R15E funkciók

- Kézi **Terv mentése** gomb a követett R15D feladatsorban.
  A `sessionStorage` csak a kiválasztott három feladat
  szűk `kind + seed` párját tárolja, semmi mást.
- **Újratöltés után** csak manuális „Mentett terv
  visszaállítása” érhető el. **Minden állomás visszaáll
  pending állapotra, nulla beadással.** Ezzel a feladatsor
  sorrendje megőrizhető, az eredmények hitelessége nem sérül.
- A sérült, túl hosszú, rossz sémájú, többletmezőket
  tartalmazó, hamisított, duplikált vagy idegen feladattípusú
  bookmark visszautasításra kerül.
- **Követés szüneteltetése** gomb: az oldal nyitva marad;
  a korábbi szerveresen ellenőrzött számlálók memóriában
  változatlanok. Kézi állomásválasztással, majd külön
  `Új feladat` kattintással folytatható.
- **Javítom és újra beadom**: 0/1 vagy nem értékelhető
  betöltött feladatnál ugyanazt a feladatot megőrizve
  visszatér a szerkesztőhöz; a korábbi beadásszám
  nem változik. Új eredmény kizárólag új, explicit
  valódi szerveres POST után számít.
- **40 új tiszta unit-regresszió**, a korábbi 140 mellé.
  **12 új Chromium** a korábbi 16 R15C és 14 R15D mellett.
  180 célzott unit, 42 browser összesen.
- Egyetlen fail-fast indító: `qualify-r15e-targeted.sh`;
  unit → TypeScript → egy Next.js production build →
  16 korábbi Chromium → 14 korábbi Chromium → 12 új Chromium.
  Nem futtatja a teljes R14Z 469 offline és 2825 npm
  baseline suite-ot.

## Állítások korlátai

A R15E nem tartós, többeszközös beadáshistória.
A `sessionStorage` egy böngészőlap élettartamára
szól és a tárolása böngészőbeállítástól függ.
A feladat szerkesztővázlatának külön R14Z autosave
mechanizmusa van, de ennek állítása nem egyenértékű
az értékelt beadások újbóli hitelesítésével.

A `0` és `null` két külön szerveres eredmény.
A teljes pont `1/1`, nem „mastery” vagy
vizsgakészenlét-bizonyíték. Nincs automatikus GET
és POST a könyvjelző vagy javítási művelettől.

## Futtatás / minősítés

**Jelen R15E: fejlesztési állapot; NEM Fedora-kvalifikált.**

```bash
bash pilots/operations-research/qualify-r15e-targeted.sh EXACT_R15E_HEAD
```

Hibánál fail-fast, logok:
`/tmp/learnharness-r15e-targeted-XXXXXXXX`.
A tartós SHA-256 archiválás csak valódi PASS után.
