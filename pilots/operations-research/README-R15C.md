# LearnHarness R15C — háromállomásos GUSEK-gyakorlatsor

**R15B stabil kiindulás**: \`846366a2acf775cf14f01272fa1bef989df8eef8\`,
62/62 unit, TypeScript, egyszeri production build és 9/9 Chromium PASS
(ellenőrzött build reuse); tartós Fedora evidence:
\`~/Downloads/learnharness-r15b-qualified-846366a\`.
R14Z korábban teljes release-kvalifikált, változatlan.

## Research és falszifikáció

1. **PrairieLearn**, https://docs.prairielearn.com/question/overview/
   (open-source platform): randomizált kérdésvariánsok, külön
   konfigurálható \`partialCredit:false\`. A tanulság a feladatvariánsok
   és az all-or-nothing pontozás *külön kezelése*. A teljes kérdés-
   motor és backend beemelése duplikálná a saját R13/R14Z feladatorákulumot,
   ezért nincs upstream kódimport és semmilyen új pontszabály.
2. **2025 mathematics meta-analysis**, Murray et al., 2025,
   https://eric.ed.gov/?id=EJ1478558 : a térközös gyakorlás
   kismértékű-közepes pozitív átlaghatása; nem igazolja, hogy a
   konkrét tanulónak pontos „retention” szintje vagy ismétlési napja
   meghatározható a szintetikus 0/1 eredményből.
3. **Classroom meta-analysis**, Educational Psychology Review, 2026,
   https://link.springer.com/article/10.1007/s10648-026-10225-5:
   a visszahívás, elosztott és kevert gyakorlás hatása kontextus-
   és visszajelzésfüggő; nem cél automatikus kártyaidőzítés,
   BKT, FSRS, vagy vizsgakészenlét-becslés.
4. **OATutor**, https://github.com/CAHLR/OATutor :
   tudáskomponensek és segítség több szinten, de az R15B lokális
   kísérletei nem megbízhatóan címkézett skill-adatok;
   **nem** vesszük át a BKT/modell-stackjét.
5. **Saját R11/R15A/R15B**: immutable szerveres 0/1/NULL,
   hibakódra épített háromlépéses tanácsok, egységes
   \`r15ObservedOutcomes\` normalizálás, maximum 48 kísérlet,
   duplikátum-feloldás, ismeretlen régi segítség bizonytalansága.
   Ezeket használjuk újra; nem kell új adatbázis vagy
   új model-/solver-hozzáférés.

## Megvalósított nagy chunk

- **Tiszta policy**: \`adaptive-sequence-r15c.mjs\`: a legutóbbi
  ellenőrzött hibás/nem értékelhető/segített kísérletből
  kontrollált fókusz, másik (kevésbé gyakorolt) feladattípus,
  majd visszatérés a kiinduló típushoz.
- **Variáns-fence**: pontosan 3 tervállomás, egyiken sem
  használt friss \`uint32\` seed; a feladattípusra külön
  számolja a használt seedeket; maximálisan 48 korábbi
  eredmény és 3 ajánlás; wraparound támogatás.
- **Előrehaladási tábla**: kizárólag megfigyelt kísérletek:
  feladattípusonként kísérlet, külön variáns, 1/1, 0/1,
  „nem értékelhető”, valamint ismeretlen segítség.
  Túl sok 1/1 nem válik képesség-/mesterfok-százalékká.
- **UI**: a GUSEK eredménykártyában csak *valódi
  szerveres eredmény* után jelennek meg a javaslatok.
  Minden állomás külön választható, és **külön kattintás
  szükséges az \`Új feladat\` gombra**.
  Kiválasztáskor a régi eredménykártya törlődik, nem
  keletkezik HTTP GET/POST.
- **36 új célzott policy unit-teszt**, meglévő 62 R15A/B
  unit-teszttel együtt összesen **98**.
- **16 valódi böngészős kontroll** a meglévő 9 helyett,
  új valós szerveres beadással, kézi típusváltással
  és HTTP-request monitorozással.
- **Egyetlen R15C fail-fast tesztindító**: 98 unit →
  TypeScript → egy production build → 16 Chromium-eset.
  Nem futtatja újra a teljes korábbi 469 offline és
  2825 npm release-csomagot, sem GLPK-sandboxot.

## Falszifikációs negatív esetek

A 0 és NULL pont nem vonható össze; a korábbi chat-történet
nem bizonyít segítségmentességet; a 48-as cap nem jelent
tartós tárolást; más feladattípusok seedjei nem keverhetők;
a 3 állomás nem indíthat automatikus GET-et/POST-ot; a
képesség és „dueness” nem számolható ki. A rendszer a
dokumentált teljes megoldások 0/1 szerveres pontozóját
soha nem írja felül. Nem használja az optimális megoldás
adatait vagy a nyers \`.mod\`/ \`.dat\` forrást.

## Kvalifikáció

**A jelen HEAD addig NEM PASS**, amíg a Fedora
\`qualify-r15c-targeted.sh EXACT_HEAD\` sikeresen le nem futott.
Egyetlen futtatás, a legelső hibánál stop; a logok
\`/tmp/learnharness-r15c-targeted-*\` mappába kerülnek.

A jelenlegi pilot formatív; nem bizonyít teljes értékű,
felügyelt, éles vizsgarendszer-alkalmasságot. Az R14Z és
R15B korábbi receiptek változatlanok.
