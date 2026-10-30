/** Bounded, deterministic native GNU GLPK feedback for the learner.
 * UI guidance only. Absolutely NO score / correctness authority.
 * Never infer a valid model from a successful solver run.
 */
const ALLOWED=new Set(['OPTIMAL','INFEASIBLE','UNBOUNDED','UNDEFINED','UNKNOWN','FEASIBLE_NOT_PROVEN_OPTIMAL']);
const MAX_LOG=8192;
const msg=(level,code,title,detail,nextAction)=>({
 level,code,title,detail,nextAction,scoreAuthority:false
});
function normalizeLog(value){
 return typeof value==='string'?value.slice(0,MAX_LOG).replace(/\0/g,''):''; 
}
export function classifyGlpkFeedback(result){
 if(!result||typeof result!=='object'||Array.isArray(result))
  return msg('info','NOT_RUN','Nincs futtatási eredmény',
   'Írd meg a MathProg-modellt, majd ellenőrizd vagy futtasd.','Indíts helyi GLPK-futtatást.');
 if(result.graded!==false||result.points!==null)
  return msg('error','INVALID_RESULT','Érvénytelen megoldóválasz',
   'A GLPK nem jogosult vizsgapont megállapítására.','Ne vedd át az eredményt; indíts új ellenőrzést.');
 if(result.status==='CANCELLED')
  return msg('info','CANCELLED','Megszakított futtatás',
   'A futtatási kérés megszakadt. Nem áll rendelkezésre friss megoldás.','A folytatáshoz futtasd újra a modellt.');
 if(result.status==='TIME_LIMIT')
  return msg('warning','TIME_LIMIT','Lejárt a futtatási idő',
   'A modell nem fejeződött be a biztonságos időkorláton belül.','Egyszerűsítsd a modellt, majd próbáld újra.');
 if(result.status==='BLOCKED')
  return msg('warning','BLOCKED','A helyi GLPK-futtatás nem elérhető',
   'A futtató hiányzik, foglalt vagy egy biztonsági korlát miatt letiltott.','Ellenőrizd a helyi GLPK-konfigurációt.');
 const log=normalizeLog(result.diagnostic);
 if(result.status==='GLPK_ERROR'){
  const syntax=/(?:syntax error|unexpected (?:symbol|token)|invalid (?:symbol|statement|data|expression)|data section not found|model section not found)/i.test(log);
  return syntax
   ?msg('error','SOURCE_ERROR','MathProg fordítási hiba',
     'A GNU MathProg nem tudta feldolgozni a modell vagy az adatfájl valamelyik részét.',
     'Nézd meg a konzolban jelzett fájlt és sorszámot, majd javítsd a forrást.')
   :msg('error','SOLVER_ERROR','GLPK-futtatási hiba',
     'A GLPK vagy a konténer hibával fejeződött be. A részleteket a konzol tartalmazza.',
     'Ellenőrizd a konzolkimenetet és az elkészített modellt.');
 }
 if(result.status!=='GLPK_COMPLETED')
  return msg('warning','UNKNOWN_STATUS','Ismeretlen futtatási állapot',
   'Nem érkezett ellenőrizhető GLPK-állapot.','Próbáld meg újra a futtatást.');
 if(result.mode==='check')
  return msg('info','TRANSLATED','A modell feldolgozása befejeződött',
   'Ez fordítási ellenőrzés volt, nem optimalizálás. A matematikai helyességet nem bizonyítja.',
   'A változóértékekhez futtasd a teljes GLPK-megoldást.');
 if(result.mode!=='solve'||!ALLOWED.has(result.solverStatus))
  return msg('warning','MISSING_SOLUTION','Hiányzó megoldási státusz',
   'Nem áll rendelkezésre értelmezhető GLPK megoldási állapot.','Ellenőrizd a konzolt, és próbáld meg ismét.');
 if(result.solverStatus==='INFEASIBLE')
  return msg('warning','INFEASIBLE','Nincs megengedett megoldás',
   'A megadott modell feltételei mellett a GLPK nem talált megengedett megoldást.',
   'Ellenőrizd a korlátok irányát, a készleteket és a változók tartományát.');
 if(result.solverStatus==='UNBOUNDED')
  return msg('warning','UNBOUNDED','Korlátlan célfüggvény',
   'A GLPK a megadott modellben nem talált véges optimális korlátot.',
   'Vizsgáld meg a hiányzó kapacitás- és egyéb korlátokat.');
 if(result.solverStatus==='FEASIBLE_NOT_PROVEN_OPTIMAL')
  return msg('warning','NONOPTIMAL','Van megoldás, de nincs bizonyított optimum',
   'A kapott eredmény még nem használható bizonyított optimális megoldásként.',
   'Várd meg a bizonyított optimumot, vagy módosítsd a modellt.');
 if(result.solverStatus==='UNDEFINED'||result.solverStatus==='UNKNOWN')
  return msg('warning','UNKNOWN_SOLUTION','A megoldás nem értékelhető',
   'A GLPK megoldási státusza nem igazolja az optimumot.',
   'Ellenőrizd a problémát és a konzolt.');
 if(result.columnStatus!=='OPTIMAL_COLUMNS'||!Array.isArray(result.columns)||!result.columns.length)
  return msg('warning','OPTIMAL_WITHOUT_COLUMNS','A solver optimumot jelzett, de a változólista hiányzik',
   'A gépi GLPK-fájlokból nem sikerült teljes változótáblát előállítani.',
   'Nézd meg a konzolt; a vizsgabeadáshoz ne használj hiányos adatot.');
 return msg('success','OPTIMAL','A GLPK optimális megoldást jelzett',
  'Megjelent a megoldó által számolt változólista. Ez önmagában nem igazolja, hogy a vizsgafeladatot helyesen modellezted.',
  'Vizsgamódban csak ellenőrzött átvétel után add be a megoldást a független pontozónak.');
}
