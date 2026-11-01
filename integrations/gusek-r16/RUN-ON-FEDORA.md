# Egyszeri Fedora kvalifikáció

Ez a ZIP tartalmazza az R16.12 teljes fejlesztői csomagját és az `run-fedora-once.sh` indítót. A futtatás új, véletlenszerű `~/Downloads/learnharness-r1612-real-...` könyvtárba klónozza az upstream és a fork pontos forrásait, lefagyasztja az add-onokat, összeállítja az alkalmazást, és elindítja az egyetlen összefogott kvalifikációt. A meglévő repókat nem módosítja, GitHub push/merge és release nincs. Az npm függőségeket letölti (internet és lemezterület szükséges). A GLPK natív futtatást nem engedélyezi, és az app tanulási adatai külön tesztkönyvtárba kerülnek.

Az indító `qualification.log` fájlt hagy a létrejött munkakönyvtárban. Hiba esetén is ott marad az összes forrás és részleges bizonyíték. A sikeres technikai PASS még nem jelenti a release jóváhagyását.
