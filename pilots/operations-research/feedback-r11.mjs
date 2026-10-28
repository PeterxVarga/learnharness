/**
 * R11 deterministic, privacy-preserving formative feedback.
 * This file intentionally has NO file/network/provider/solver imports.
 * Only the already server-verified outcome and controlled error codes drive advice.
 * It is NOT a second grader and never returns the optimal allocation.
 */
const ACTIONS = Object.freeze({
  // A correct submitted model is required before evaluating the allocation.
  source_missing_route_capacity: ['Útvonal-kapacitás','Minden x[i,j] változó kapjon cap[i,j] felső korlátot, vagy írj ennek megfelelő indexelt korlátot. Ellenőrizd, hogy egyetlen útvonal sem maradt ki.'],
  source_wrong_variable_bounds: ['Változókorlátok','Vizsgáld meg az összes változó nemnegativitását és kapacitását. A korlátokat az adott feladat táblázatából vezesd le.'],
  source_wrong_objective: ['Célfüggvény','Minden útvonalon az egységköltség és az útvonalon küldött mennyiség szorzata számít. Ellenőrizd az összegzés két indexét.'],
  source_incorrect_objective: ['Célfüggvény','Ellenőrizd, hogy a célfüggvény valóban a kilenc egységköltség és döntési változó szorzatainak összege.'],
  source_missing_objective: ['Hiányzó célfüggvény','A szállítási költséget minimalizálni kell. Írd fel a teljes célfüggvényt, mielőtt a számolást folytatod.'],
  source_missing_supply_balance: ['Kínálati korlátok','Minden kiindulási telephely összes elküldött mennyiségét a saját kínálatához kell viszonyítani.'],
  source_missing_demand_balance: ['Keresleti korlátok','Minden célállomásra összegezd a három telephelyről beérkező mennyiségeket.'],
  source_missing_balance_constraint: ['Mérlegegyenletek','Három kínálati és három keresleti korlát szükséges. Ellenőrizd az indexeket és a korlátok irányát.'],
  source_incorrect_or_duplicate_balance: ['Mérlegegyenletek','Ellenőrizd, hogy mind a hat különböző kínálati és keresleti egyenlet szerepel-e, duplikálás nélkül.'],
  source_non_equivalent_balances: ['Korlátirány','Vizsgáld meg, hogy a használt <=, >= vagy = irányok együtt valóban kikényszerítik-e az összes kínálati és keresleti mérleget.'],
  source_missing_var_x: ['Döntési változók','Deklaráld a szállított mennyiséget minden i, j útvonalra, és add meg a tartománykorlátokat.'],
  source_incomplete_model: ['Hiányos modell','Előbb számold össze a változókat, a célfüggvényt és a hat mérlegegyenletet. Csak ezután ellenőrizd a numerikus tervet.'],
  model_incorrect_or_incomplete: ['Matematikai modell','Ellenőrizd a minimalizálás irányát, a kilenc döntési változót, a kínálati és keresleti egyenleteket és a kapacitásokat.'],
  invalid_allocation: ['Szállítási mátrix','A megoldásnak három sorból és soronként három nemnegatív egész számból kell állnia.'],
  supply_balance_violation: ['Kínálati eltérés','Add össze a mátrix minden sorát. A sorösszegnek az adott telephely kínálatát kell kiadnia.'],
  demand_balance_violation: ['Keresleti eltérés','Add össze a mátrix minden oszlopát. Az oszlopösszegnek az adott célállomás keresletét kell kiadnia.'],
  route_capacity_violation: ['Kapacitáskorlát','Hasonlítsd össze az egyes szállított mennyiségeket az adott útvonal maximális kapacitásával.'],
  objective_mismatch: ['Költségszámítás','Számold újra az összköltséget: minden cellában mennyiség × egységköltség, majd ezek összege.'],
  not_optimal: ['Nem optimális terv','Ha a korlátok teljesülnek, próbáld két útvonal szállítását átcsoportosítani úgy, hogy minden mérleg megmaradjon, de a költség csökkenjen.'],
  independence_not_demonstrated: ['Segítséghasználat','A segítséggel készült megoldás gyakorlási eredmény lehet, de önálló vizsgateljesítménynek nem számít. Próbálj új, eltérő feladatot segítség nélkül.'],
  invalid_assistance_metadata: ['Segítséghasználat','A segítséghasználati jelző legyen egyértelmű. Ez önbevallás, nem felügyelt vizsgaigazolás.'],
});
const KNOWN_FIRST = [
 'source_wrong_variable_bounds','source_missing_route_capacity','source_missing_var_x',
 'source_missing_objective','source_wrong_objective','source_incorrect_objective',
 'source_missing_supply_balance','source_missing_demand_balance','source_missing_balance_constraint',
 'source_incorrect_or_duplicate_balance','source_non_equivalent_balances','source_incomplete_model',
 'model_incorrect_or_incomplete','invalid_allocation','supply_balance_violation',
 'demand_balance_violation','route_capacity_violation','objective_mismatch','not_optimal',
 'independence_not_demonstrated','invalid_assistance_metadata',
];
/** A feedback card does not expose a solution, hidden key, or partial credit. */
export function coachingFeedback(grade) {
 if (!grade || typeof grade!=='object' || grade.maxPoints!==1 || ![0,1,null].includes(grade.points) ||
     !Array.isArray(grade.errors) || grade.correct !== (grade.points===null?null:grade.points===1))
  return {kind:'invalid',title:'Az értékelés nem igazolható',step:'Próbáld újra az ellenőrzést a szerverrel.',canRetest:false};
 if (grade.points===null) return {kind:'unassessable',title:'Nem értékelhető modell',
   step:'Ez a MathProg-alak kívül esik a jelenlegi statikus ellenőrző képességein. Nem következtethetünk sem hibás, sem helyes megoldásra. Használd a támogatott kifejtett vagy indexelt alakot, illetve várd meg a natív GLPK-minősítést.',canRetest:true};
 if(grade.points===1 && grade.correct===true && Array.isArray(grade.errors)&&grade.errors.length===0)
  return {kind:'correct',title:'Teljes pont',step:'A teljes modell és a szállítási terv megfelelt a determinisztikus ellenőrzésnek. Következő lépésként próbálj új, eltérő adatokkal generált feladatot.',canRetest:true};
 if(grade.points!==0 || grade.correct!==false || !Array.isArray(grade.errors))
  return {kind:'invalid',title:'Az értékelés nem igazolható',step:'Kérj új szerveroldali ellenőrzést.',canRetest:false};
 const errors = grade.errors.filter(x=>typeof x==='string');
 const prioritized=KNOWN_FIRST.find(x=>errors.includes(x));
 if(prioritized){const [title,step]=ACTIONS[prioritized];return {kind:'repair',title,step,canRetest:true};}
 return {kind:'repair',title:'A megoldás még nem teljes',
  step:'Először a változókat, a célfüggvényt és a korlátokat ellenőrizd, utána a tervet és az összköltséget. Az ellenőrző nem ad részpontot.',canRetest:true};
}
