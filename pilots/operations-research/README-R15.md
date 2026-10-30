# R15 – Bizonyítékhoz kötött GUSEK-gyakorlás

Kiindulás: Fedora-kvalifikált R14Z `9c017fe7636a2c0ae7f68e9f52bdb2174d3dbd22`.
Külön ág: `pilot/operations-research-r15`. Az R14Z és a PR #2 nem változik.

## Research + falszifikáció (2026-10-30)

- **ts-fsrs / FSRS-7**: a jelenlegi v6 Node 24-et igényel, a minősített
  Fedora Node 22-es. Emellett az önbevalláson alapuló 0/1-es
  eredményekből nem szabad stabil memóriamegtartást feltételezni.
  **Nem integrálva**.
- **mathprog-editor / CodeMirror 6**: kis elterjedtségű MIT-licences
  nyelvi csomag; a jelenlegi szerkesztő gyors gépelése, mentése,
  hibasorra ugrása és 64 KiB-korlátja már kvalifikált.
  Csak külön kompatibilitási benchmark után vehető át.
- **Saját R11/R14Z**: a bizonyított determinisztikus hibakódok,
  szerveres 0/1 pontozás és ellenőrzött előzmények
  *újrahasznosíthatók*, solver-/providerfüggőség hozzáadása nélkül.

## Megvalósítás

A `adaptive-practice-r15.mjs` tisztán determinisztikus,
legfeljebb 48 ellenőrzött eredményt dolgoz fel. Szigorú
taskId/seed/error/points validáció, előzmény-deduplikálás.
0 pont: azonos feladattípus új seeddel és konkrét hibajavítási
tanács. Nem értékelhető: *nem* jelenti, hogy hibás.
Segítséggel vagy ismeretlen segítségstátusszal elért teljes pont:
új önálló próba. Önállónak önbevallott teljes pont után:
másik, kevésbé gyakorolt feladattípus. Nincs részpont,
mesterfok-, retention- vagy vizsgakészenléti becslés.

A `gusek-exam.tsx` csak *valódi szerveres válasz után*
jeleníti meg a javaslatot. A gomb csak kiválasztja a
feladattípust és seedet; külön `Új feladat` szükséges.
Nincs automatikus HTTP feladatindítás, pontozás, megoldáskiadás,
adatküldés a tanítómodellhez vagy GLPK jogosultságmódosítás.
A session eredmények csak memóriában, forrásszöveg nélkül vannak.

## Ellenőrzési kapuk

31 izolált `node:test` eset és egy npm-test wrapper.
Első kör: `node --test pilots/operations-research/adaptive-practice-r15.test.mjs`,
majd típusellenőrzés és *egyszeri* Next.js build.
Később célzott böngészős regresszió: nincs tanári/solver
pontozás, a javaslat nem indít új feladatot, az R14Z
eredmények változatlanok. **R15 PASS még nem bizonyított.**
