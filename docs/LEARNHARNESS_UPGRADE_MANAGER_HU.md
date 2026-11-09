# LearnHarness GUSEK — tartós, biztonságos helyi verziókezelő (v1.0)

**Cél:** a következő LearnHarness + GUSEK frissítéskor ne kelljen újra felkutatni vagy kézzel átmásolni a beszélgetéseket, forrásokat és beállításokat. A jelenleg működő R10 `37419`-es példányhoz az eszköz **nem nyúl**. A `37420`-as külön példányt csak sikeres ellenőrzés után hozza létre.

## Egyszeri bekötés

Másold a `learnharness_update_manager.py` fájlt a Fedora `~/Downloads/` mappájába, majd:

```bash
python3 ~/Downloads/learnharness_update_manager.py bootstrap
```

A parancs az R10 helyreállított `preview/data` állapotát olvassa be (a jelenlegi, nem az eredeti R10 mentéskor készült változatot), ellenőrzött byte-szintű másolatot készít, majd az eredeti kvalifikált R8 standalone kódot **külön, tartós release-könyvtárba** klónozza. A GUSEK tanulási adatai és a program ezután külön verziózott helyeken vannak. Nem importál régebbi, nem azonosított beszélgetéseket. Nem vesz át korábbi modellkulcsokat.

Sikeres API-ellenőrzés után elindul az új, állandóan használandó helyi cím:

`http://127.0.0.1:37420`

**A bootstrap után az új munkáidat már a `37420`-as példányba írd!** A `37419`-es R10 és a `37420`-as kezelt példány írásai nem szinkronizálódnak. Ne használjuk párhuzamosan aktív tanulásra a kettőt.

A program és az adatok helye: `~/.local/state/learnharness-managed/` (felhasználói joggal védett). A kezelő állandó elérési útja: `~/.local/bin/learnharness-update`.

## Későbbi használat

Állapot ellenőrzése:

```bash
~/.local/bin/learnharness-update status
```

Újraindítás (például gépújraindítás után; ez a v1 még nem telepít automatikusan induló háttérszolgáltatást):

```bash
~/.local/bin/learnharness-update start
```

Jövőbeli upgrade **már elkészült, külön kvalifikált** verzióval:

```bash
~/.local/bin/learnharness-update upgrade \
  --app /abszolut/utvonal/az/uj/assembled \
  --tag vNEXT \
  --receipt /abszolut/utvonal/qualified.txt
```

A kvalifikációs nyugtának mind a négy sort tartalmaznia kell, és ezeknek **valódi, az új kódra vonatkozó ellenőrzésekből** kell származniuk: `NATIVE_QUALIFICATION=PASS`, `STANDALONE_HTTP=PASS`, `BROWSER_E2E=PASS`, `GUSEK_SOURCE_INTEGRITY=PASS`. A kezelő nem állítja elő és nem hamisítja meg ezt a nyugtát. A fájl létét és állításait ellenőrzi, kriptográfiai aláírásukat még nem.

Az upgrade egyetlen parancsban: új release archiválása (reflink ha támogatott) → az aktuális teljes adatgeneráció másolása → adatfájl-ujjlenyomatok és beszélgetés-/üzenetszám felmérése → elkülönített HTTP + 6 GUSEK API-próba kulcsok nélkül a `37421`-es porton → változatlanság újraellenőrzése → korábbi *kezelt* kiszolgáló leállítása → új verzió elindítása ugyanazon a `37420`-as címen → újbóli API-ellenőrzés. Sikertelen próba nem cseréli le a futó változatot; sikertelen váltásnál a korábbi generációból újraindítja azt.

Kézi rollback (az új verzió alatt keletkezett írások **az archivált generációban maradnak, és nem jelennek meg automatikusan a visszaállított korábbi verzióban**):

```bash
~/.local/bin/learnharness-update rollback --accept-data-rollback
```

## Védelmi korlátok

- Az eredeti `37419`-es R10-es példány, annak teljes adatkönyvtára és az eredeti R4 build nem módosul.
- Nincs automatikus merge, production release, külső adatküldés, modellhívás vagy önkényes tananyag-import.
- Minden új adatgeneráció helyi teljes másolat; a frissítés nem használ egymással összekapcsolt, írható hardlinkeket.
- Az API-kulcsoknak tartós, jogosultsággal védett hely van előkészítve: `.../runtime/secrets/auth.json`, külön az adatoktól. A jövőben itt a felhasználó által beállított kulcsok megmaradnak; az R10-ből semmilyen régi kulcs nem kerül át.
- A projekt eddig talált további régebbi, 77/44/22 beszélgetéses könyvtárait külön meg kell vizsgálni; ezeket nem egyesíti találgatással.
- A sikeres REST és mock-kör még **nem bizonyítja a valódi modellalapú adaptív tanulási E2E-t**, sem a hosszú távú éles rendelkezésre állást.
- A mentések ugyanazon a fizikai gépen vannak, ezért **nem helyettesítik az off-device biztonsági mentést**.
- Ez a v1 még nem használ aláírt release-csomagot, nem automatizálja a forrásból történő új verzió buildjét, és nem telepít automatikusan induló systemd-szolgáltatást.

## Bizonyíték

A szerzői környezetben (Node 22.16, szintetikus HTTP szerver, 3 mock chat, összesen 9 üzenet) a következők PASS: bootstrap, 6 GUSEK API, chats/graph megőrzés, hibás új verzió elutasítása a régi szerver megtartásával, upgrade, rollback és manuális restart. **Ez nem Fedora-native PASS**. Az éles felhasználói állományra történő átállást csak a Fedora egyszeri `bootstrap` kimenete tudja bizonyítani.
