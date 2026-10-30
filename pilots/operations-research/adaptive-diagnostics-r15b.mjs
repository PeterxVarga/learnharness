/**
 * R15B human-auditable repair steps derived only from normalized 0/1/null
 * server results. Reuses R15A's bounded, de-duplicated evidence collector.
 * No .mod/.dat, optimal values, LLM, GLPK, external state or retention model.
 */
import {r15ObservedOutcomes} from './adaptive-practice-r15.mjs';
const MAX_STEPS=3;
const MAX_ERRORS=24;
const PLAN=Object.freeze({
 // R11 server-side indexed transport taxonomy: retain concepts, not leaked allocations.
 source_missing_supply_balance:['Kínálati mérleg',[
  'Ellenőrizd, hogy minden raktárból induló mennyiséget összeadtál-e.',
  'Hasonlítsd az egyes raktárak sorösszegét a saját kínálatukkal.',
  'Vizsgáld meg a korlát irányát és az indexek tartományát.']],
 source_missing_demand_balance:['Keresleti mérleg',[
  'Ellenőrizd, hogy minden boltba érkező mennyiséget összeadtál-e.',
  'Hasonlítsd az oszlopösszegeket a megfelelő kereslethez.',
  'Nézd meg, hogy minden célállomás kapott-e korlátot.']],
 source_missing_balance_constraint:['Mérlegegyenletek',[
  'Ellenőrizd a kínálati és keresleti korlátok darabszámát.',
  'Nézd át az egyes feltételekben szereplő útvonalakat.',
  'Hasonlítsd a sor- és oszlopindexeket az eredeti táblázathoz.']],
 source_incorrect_or_duplicate_balance:['Duplikált vagy hibás mérlegek',[
  'Keress két azonos egyenletet vagy kimaradó raktárat/boltot.',
  'Ellenőrizd az egyes mérlegek jobb oldalát.',
  'Vizsgáld meg, hogy mindegyik útvonal helyes mérleghez tartozik-e.']],
 source_non_equivalent_balances:['Korlátirány',[
  'Ellenőrizd az =, <= és >= irányok jelentését a feladatban.',
  'Vizsgáld meg, hogy a teljes kereslet és kínálat összhangban van-e.',
  'Ne hagyatkozz pusztán arra, hogy a megoldó talált megengedett pontot.']],
 source_missing_route_capacity:['Útvonal-kapacitás',[
  'Keresd meg a korlátozott útvonalat az eredeti táblázatban.',
  'Ellenőrizd, hogy a megfelelő döntési változóhoz került-e a felső korlát.',
  'Nézd át, hogy a változó nemnegativitása külön is teljesül-e.']],
 source_wrong_variable_bounds:['Változókorlátok',[
  'Ellenőrizd a nemnegativitást és az egészértékűséget.',
  'Vizsgáld meg a megadott útvonal-kapacitást.',
  'Hasonlítsd a deklarált tartományokat a feladat feltételeihez.']],
 source_wrong_variable_domain:['Változó típusa',[
  'Nézd át az összes változó deklarációját.',
  'Ellenőrizd az egészértékűséget és a nemnegativitást.',
  'Hasonlítsd a deklarációkat a feladat szövegéhez.']],
 source_wrong_variables:['Döntési változók',[
  'Számold meg a feladat döntési változóit.',
  'Ellenőrizd az előírt neveket és indexeket.',
  'Vizsgáld meg, hogy egyik változó sem maradt ki.']],
 source_missing_var_x:['Hiányzó döntési változó',[
  'Keresd meg a hiányzó útvonalmennyiség-változót.',
  'Nézd át az összes raktár és bolt kombinációját.',
  'Ellenőrizd az elvárt tartományokat.']],
 source_wrong_objective:['Célfüggvény',[
  'Állapítsd meg, minimalizálni vagy maximalizálni kell-e.',
  'Ellenőrizd a költség-/bevételi együtthatók és változók párosítását.',
  'Vizsgáld meg, hogy egyetlen tag sem maradt ki.']],
 source_incorrect_objective:['Célfüggvény tagjai',[
  'Számold össze a célfüggvény összes elvárt tagját.',
  'Nézd át az együtthatókat a feladattáblázatban.',
  'Ellenőrizd az indexelést és az optimalizálási irányt.']],
 source_missing_objective:['Hiányzó célfüggvény',[
  'Írd le, mit optimalizálunk.',
  'Válaszd ki a minimum vagy maximum irányt.',
  'Add hozzá a feladatban előírt együtthatókat és változókat.']],
 source_wrong_constraint:['Feltételek',[
  'Írd fel külön az ellenőrizni kívánt korlát jelentését.',
  'Ellenőrizd a bal oldali együtthatókat és a jobb oldali határt.',
  'Vizsgáld meg, hogy az egyenlőtlenség jó irányba áll-e.']],
 source_wrong_constraint_count:['Korlátok száma',[
  'Számold meg a feladatból következő korlátokat.',
  'Keress kihagyott vagy indokolatlan feltételeket.',
  'Ellenőrizd a modelled korlátneveit és indexeit.']],
 source_incomplete_model:['Hiányos modell',[
  'Tekintsd át a változók és a célfüggvény meglétét.',
  'Sorold fel a feladat összes matematikai korlátját.',
  'Csak a teljes modell után térj át a numerikus megoldásra.']],
 model_incorrect_or_incomplete:['Nem igazolt modell',[
  'Ellenőrizd a változókat és a célfüggvényt.',
  'Hasonlítsd össze a korlátokat a szöveges feladattal.',
  'A megengedettnek tűnő eredmény nem igazolja a teljes modellezést.']],
 source_missing_semicolon:['MathProg szintaxis',[
  'Nézd át a MathProg utasítások végét.',
  'Ellenőrizd a pontosvesszők helyét.',
  'Futtass külön natív fordítási ellenőrzést, ha helyben engedélyezted.']],
 invalid_allocation:['Változóértékek',[
  'Ellenőrizd a változóértékek számát és elvárt alakját.',
  'Vizsgáld meg az előírt nemnegativitást és egészértékűséget.',
  'Ne hagyj ki egyetlen elvárt változót sem.']],
 invalid_solution_values:['Változóértékek',[
  'Adj meg minden elvárt változóhoz véges számot.',
  'Vizsgáld meg, hogy nincs-e hiányzó vagy további változónév.',
  'Hasonlítsd össze az értékeket a korlátokkal.']],
 solution_variable_domain:['Változótartomány',[
  'Ellenőrizd az alsó és felső korlátokat.',
  'Vizsgáld meg, hogy az egész változók értékei valóban egész számok-e.',
  'Hasonlítsd össze az összes értéket a modell deklarációival.']],
 solution_constraint_violation:['Megengedettség',[
  'Helyettesítsd vissza a változóértékeket az egyes feltételekbe.',
  'Ellenőrizd a jobb oldalakat és az egyenlőtlenség irányát.',
  'Javítsd a megsértett korlátot, majd ellenőrizd újra a teljes megoldást.']],
 supply_balance_violation:['Kínálati eltérés',[
  'Add össze minden raktár elküldött mennyiségeit.',
  'Hasonlítsd a sorösszegeket a kínálattal.',
  'Ellenőrizd, hogy nem maradt-e ki egy útvonal.']],
 demand_balance_violation:['Keresleti eltérés',[
  'Add össze az egyes boltokba érkező mennyiségeket.',
  'Hasonlítsd az oszlopösszegeket a kereslettel.',
  'Ellenőrizd, hogy az összes boltot figyelembe vetted-e.']],
 route_capacity_violation:['Kapacitáskorlát',[
  'Keresd meg a korlátozott útvonalat.',
  'Hasonlítsd az ott szállított mennyiséget a felső határral.',
  'Vizsgáld meg, hogy az értékek máshol is megengedettek-e.']],
 objective_mismatch:['Célfüggvény számítása',[
  'Helyettesítsd be a megadott változóértékeket a célfüggvénybe.',
  'Számold újra az összeg vagy szorzatok eredményét.',
  'Hasonlítsd az eredményt a beadott célfüggvényértékkel.']],
 not_optimal:['Optimalitás',[
  'Előbb ellenőrizd az összes korlát teljesülését.',
  'Keress jobb megengedett megoldást a cél irányában.',
  'Csak bizonyított optimumot tekints teljes megoldásnak.']],
});
const FALLBACK=Object.freeze(['Teljes modell újraellenőrzése',Object.freeze([
 'Ellenőrizd a döntési változókat és a célfüggvény irányát.',
 'Tekintsd át a korlátokat és az előírt változótartományokat.',
 'Csak ezután ellenőrizd a változóértékeket és a célfüggvény számítását.'
])]);
const UNASSESSABLE=Object.freeze([
 'A beadott modell formáját a független ellenőrző nem tudta igazolni.',
 'Ez nem állítás a MathProg-modell matematikai helyességéről.',
 'Vizsgáld meg a támogatott résznyelvet; a natív GLPK diagnosztikája továbbra sem ad vizsgapontot.'
]);
const SUCCESS=Object.freeze([
 'Próbálj egy új, eltérő adatú feladatot.',
 'Ellenőrizd, hogy önállóan is le tudod-e vezetni a modellt.',
 'Később új számokkal ismételd át ezt a feladattípust.'
]);
const PRIORITY=Object.freeze(Object.keys(PLAN));
const safeTopic=(kind,code)=>{
 const entry=Object.hasOwn(PLAN,code)?PLAN[code]:null;
 if(!entry)return null;
 // Never use transport-specific concepts to diagnose froccs/tablet models.
 if(kind!=='transport' && (
  code.startsWith('source_missing_')&&code!=='source_missing_objective'&&code!=='source_missing_semicolon'||
  code.includes('balance')||code.includes('route')||code==='invalid_allocation'||
  code==='supply_balance_violation'||code==='demand_balance_violation'
 ))return null;
 return entry;
};
/**
 * @param {{
 *  history?: import('../../src/core/contracts/chat.ts').TransportAttemptReceipt[],
 *  session?: Array<NonNullable<ReturnType<typeof import('./adaptive-practice-r15.mjs').r15SessionOutcome>>>
 * }} [input]
 */
export function r15bDiagnosticBrief({history=[],session=[]}={}){
 const observed=r15ObservedOutcomes({history,session});
 if(observed.length===0)return null;
 const last=observed.at(-1);
 if(!last)return null;
 const kindResults=observed.filter(r=>r.kind===last.kind);
 const wrong=kindResults.filter(r=>r.points===0);
 const result={
  schema:'learnharness.r15b.diagnostic-brief.v1',kind:last.kind,
  state:last.points===null?'unsupported':last.points===1?'complete':'repair',
  topic:'',steps:[],repeatCount:0,
  observed:observed.length,kindAttempts:kindResults.length,
  wrongAttempts:wrong.length,unassessable:kindResults.filter(r=>r.points===null).length,
  selfReportedUnaidedFull:kindResults.filter(r=>r.points===1&&r.assistance==='self_reported_no_help').length,
  helpProvenance:last.assistance==='unknown'?'unknown':'self_reported',
  scoreAuthority:false,autoStart:false,
  caveat:'Formatív, nem felügyelt gyakorlás. A tanács nem módosít pontot, és nem bizonyít tudásszintet.'
 };
 if(last.points===1){
  return {...result,topic:'Új, önálló ellenőrzés',steps:[...SUCCESS]};
 }
 if(last.points===null){
  return {...result,topic:'Az ellenőrző nem támogatja ezt az alakot',steps:[...UNASSESSABLE]};
 }
 const candidates=last.errors.filter(e=>safeTopic(last.kind,e)!==null);
 const ranked=[...new Set(candidates)].sort((a,b)=>{
  const count=x=>wrong.filter(r=>r.errors.includes(x)).length;
  return count(b)-count(a)||PRIORITY.indexOf(a)-PRIORITY.indexOf(b);
 });
 const focus=ranked[0];
 const entry=focus?safeTopic(last.kind,focus):null;
 const repeats=focus?wrong.filter(r=>r.errors.includes(focus)).length:0;
 return {
  ...result,topic:entry?.[0]??FALLBACK[0],
  steps:[...(entry?.[1]??FALLBACK[1])].slice(0,MAX_STEPS),
  repeatCount:repeats
 };
}
