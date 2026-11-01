/** R16.10: public Hungarian domain feedback, no oracle/source/answer access. */
const DIAGNOSTICS=Object.freeze({
 unsupported_source:'A modell nem a támogatott skalár MathProg-résznyelvben szerepel. Ettől még nem bizonyítottan hibás.',
 wrong_variables:'A változók halmaza nem egyezik az elvárt döntési változókkal.',
 assignment_model_binary_domain:'A kilenc hozzárendelési változó mindegyikének binárisnak (0 vagy 1) kell lennie.',
 assignment_model_total_cost:'A hozzárendelési feladatban a kilenc költség és a megfelelő változó szorzatának összegét kell minimalizálni.',
 assignment_model_rule_count:'A hozzárendelés pontosan-egy feltételeit biztosítani kell. A hat alapegyenlet közül egy matematikailag redundáns lehet; az értékelő nem csupán a sorok számát vizsgálja.',
 assignment_model_one_to_one:'A hozzárendelés sor- vagy oszlopfeltétele eltér a pontosan egy követelménytől. Ellenőrizd mind a hat egyenletet.',
 production_model_material:'Az alapanyagkorlát a teljes egészértékű megengedett tartományban eltér: olyan gyártási tervet enged meg, amely túllépi a rendelkezésre álló alapanyagot.',
 production_model_labor:'A munkaidőkorlát a teljes egészértékű megengedett tartományban eltér: olyan tervet enged meg, amely túllépi a rendelkezésre álló munkaidőt.',
 production_model_feasible_set:'A modell az egészértékű gyártási tervek közül nem pontosan a feladatban megengedetteket fogadja el. Lehet túl szigorú vagy hiányos a korlátrendszer.',
 production_lattice_proof_not_available:'Az egészértékű modell-egyezőség nem bizonyítható a támogatott biztonságos résznyelven. Ez nem bizonyítja a beadott modell hibáját.',
 production_unbounded_proof_not_available:'A beadott modellből az egyik termékmennyiség véges felső határa nem bizonyítható. Ezért a rendszer nem állít hibás modellt bizonyíték nélkül.',
 production_proof_budget_exceeded:'Az egészértékű modellek összehasonlításához túl nagy keresési tartomány szükséges. Az eredmény nem értékelhető, nem automatikusan hibás.',
 production_numeric_proof_not_available:'A jelenlegi egzakt ellenőrzés csak korlátos egész együtthatókat támogat. Ez nem jelenti azt, hogy a matematika hibás.',
 production_model_integer_domain:'Az alap és premium darabszámának nemnegatív egészértékű változónak kell lennie.',
 production_model_profit:'A két termék fajlagos nyereségét a saját darabszámával szorozva, maximalizáló célfüggvényben add össze.',
 production_model_rule_count:'A két erőforrás összes matematikai feltételének teljesülnie kell. Redundáns korlát elhagyása lehetséges, ha a megengedett egész tervek halmaza nem változik.',
 production_model_resources:'Ellenőrizd mindkét erőforrás-korlát jobb oldalát, az együtthatókat és a ≤ irányt.',
 assignment_binary_proof_not_available:'A matematikai ekvivalencia nem bizonyítható a jelenlegi véges ellenőrzéssel. Használj kifejezett 0–1 egész (bináris) tartományt minden hozzárendelési változónál. Ez nem bizonyítja, hogy a beadott modell hibás.',
 wrong_variable_domain:'Ellenőrizd a bináris/egészértékűséget, a nemnegativitást és a változókorlátokat.',
 wrong_objective:'A célfüggvény iránya vagy együtthatói hibásak; olvasd újra a költségeket/nyereségeket.',
 wrong_constraint_count:'Ellenőrizd a modell megengedett halmazát. Hozzárendelésnél a hat szokásos egyenlet egyike redundáns lehet; csak a számolás alapján nem biztos, hogy hibás a modell.',
 wrong_constraint:'A korlátok együtthatói, jobb oldalai vagy irányai nem a feladatot írják le.',
 solution_values_invalid:'Minden döntési változó értékét egyszer, véges számként kell megadni.',
 solution_requires_nonnegative_integers:'A darabszámoknak nemnegatív egész értékűeknek kell lenniük.',
 assignment_requires_binary:'Egy munkatárs és egy munka párosítása csak 0 vagy 1 lehet.',
 assignment_worker_1_not_once:'Az első munkatárshoz nem pontosan egy feladat tartozik.',
 assignment_worker_2_not_once:'A második munkatárshoz nem pontosan egy feladat tartozik.',
 assignment_worker_3_not_once:'A harmadik munkatárshoz nem pontosan egy feladat tartozik.',
 assignment_job_1_not_once:'Az első feladat nincs pontosan egy munkatárshoz rendelve.',
 assignment_job_2_not_once:'A második feladat nincs pontosan egy munkatárshoz rendelve.',
 assignment_job_3_not_once:'A harmadik feladat nincs pontosan egy munkatárshoz rendelve.',
 production_material_capacity:'A termékmennyiségek túllépik az alapanyag-kapacitást.',
 production_labor_capacity:'A termékmennyiségek túllépik a munkaidő-kapacitást.',
 objective_mismatch:'A beírt célfüggvényérték nem egyezik a megadott változók alapján számolttal.',
 not_optimal:'A terv megengedett, de nem optimális. Próbálj más megengedett kombinációt.',
 independence_not_demonstrated:'Segítséghasználat mellett a beadás nem igazolja az önálló feladatmegoldást.'
});
export function explainOrError(code){return Object.hasOwn(DIAGNOSTICS,code)?DIAGNOSTICS[code]:
  'Az ellenőrző nem tudta részletesen azonosítani ezt a hibát; nézd át a modell teljes alakját.';}


export const knownOrError=code=>Object.hasOwn(DIAGNOSTICS,code);
