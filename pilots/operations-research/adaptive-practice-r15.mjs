/**
 * R15 opt-in formative practice suggestions. Pure data-only module.
 * A suggestion is NOT assessment, mastery, a score or an FSRS schedule.
 * Only server-verified results may be handed to these functions by callers.
 * No raw .mod/.dat, solution vectors, oracle values, network or persistence.
 */
const KINDS=Object.freeze(['transport','froccs','tablet']);
const KINDS_SET=new Set(KINDS);
const ERROR=/^[a-z][a-z0-9_]{0,95}$/;
const MAX_HISTORY=48;
const UINT_MAX=4294967295;
const MAX_ERRORS=24;
const ACTIONS=Object.freeze({
 source_wrong_variables:['Döntési változók','Ellenőrizd a változóneveket és minden változó tartományát.'],
 source_wrong_variable_domain:['Változótartomány','Nézd át a nemnegativitást, egészértékűséget és a felső korlátokat.'],
 source_wrong_objective:['Célfüggvény','Ellenőrizd a minimum/maximum irányát és az együtthatókat.'],
 source_wrong_constraint:['Korlátrendszer','Vizsgáld meg a korlátok együtthatóit, előjeleit és jobb oldalait.'],
 source_wrong_constraint_count:['Korlátok száma','Ellenőrizd, hogy minden szükséges és csak a szükséges feltétel szerepel-e.'],
 source_missing_semicolon:['MathProg szintaxis','Nézd át a hiányzó pontosvesszőket.'],
 source_unsupported_statement:['Nem támogatott alak','A vizsgapontozó csak egy korlátozott MathProg-résznyelvet értékel. A GLPK fordítás nem bizonyítja a feladathelyességet.'],
 source_unsupported_expression:['Nem támogatott kifejezés','Próbáld a feladatot a dokumentált, támogatott alakban megadni. Ne tekintsd hibásnak csak a támogatás hiánya miatt.'],
 source_unsupported_nonlinear:['Nemlineáris kifejezés','Ellenőrizd, hogy a feladat lineáris-e; a jelenlegi ellenőrző nem általános nemlineáris pontozó.'],
 invalid_solution_values:['Változóértékek','Adj meg véges számot minden elvárt változóhoz.'],
 solution_variable_domain:['Változótartomány','Ellenőrizd a változóértékek korlátait és az egészértékűséget.'],
 solution_constraint_violation:['Megengedettség','Helyettesítsd vissza az értékeket minden korlátba.'],
 objective_mismatch:['Célfüggvény számítása','Számold újra a célfüggvény értékét a megadott változóértékekből.'],
 not_optimal:['Optimalitás','Ha minden korlát teljesül, keress jobb megengedett megoldást a célfüggvény irányában.'],
 independence_not_demonstrated:['Segítséghasználat','A segítséggel készült gyakorlás nem bizonyít önálló vizsgateljesítményt.'],
});
const DEFAULT_ACTION=Object.freeze(['Modell és megoldás','Előbb a változókat, célfüggvényt és korlátokat, utána az értékeket ellenőrizd.']);
const safeSeed=x=>Number.isSafeInteger(x)&&x>=0&&x<=UINT_MAX;
const safeKind=x=>KINDS_SET.has(x);
const gradeStatus=p=>p===null?'unassessable':p===1?'correct':'repair';
const validGrade=g=>{
 if(!g||typeof g!=='object'||Array.isArray(g)||
  g.maxPoints!==1||![0,1,null].includes(g.points)||
  g.correct!==(g.points===null?null:g.points===1)||
  !Array.isArray(g.errors)||g.errors.length>MAX_ERRORS||
  !g.errors.every(e=>typeof e==='string'&&ERROR.test(e)))return false;
 if(g.points===1&&g.errors.length!==0)return false;
 return true;
};
function toOutcome(g,{kind,seed,at,assistance,id=null}){
 if(!safeKind(kind)||!safeSeed(seed)||!validGrade(g)||
  g.taskId!=='gusek-'+kind+'-'+seed||
  !Number.isSafeInteger(at)||at<0||at>8640000000000000||
  !['assisted','self_reported_no_help','unknown'].includes(assistance)||
  (id!==null&&(typeof id!=='string'||!/^[0-9a-f-]{36}$/i.test(id))))return null;
 return Object.freeze({
  taskId:g.taskId,kind,seed,points:g.points,status:gradeStatus(g.points),
  assistance,errors:Object.freeze([...new Set(g.errors)].slice(0,MAX_ERRORS)),
  at,id
 });
}
/**
 * Converts a just-received grade from the authoritative server. The
 * assistance checkbox remains ONLY self-report, not a proctored fact.
 */
export function r15SessionOutcome(grade,{kind,seed,hintsUsed,at=Date.now()}){
 if(typeof hintsUsed!=='boolean')return null;
 return toOutcome(grade,{kind,seed:Number(seed),at,
  assistance:hintsUsed?'assisted':'self_reported_no_help',
  id:typeof grade?.id==='string'?grade.id:null});
}
/** Chat records already came from /attempts, but never infer help metadata. */
export function r15HistoryOutcome(attempt){
 if(!attempt||typeof attempt!=='object'||Array.isArray(attempt)||
  typeof attempt.taskId!=='string'||attempt.taskId.length>64||
  typeof attempt.submittedAt!=='string')return null;
 const match=/^gusek-(transport|froccs|tablet)-(0|[1-9][0-9]{0,9})$/.exec(attempt.taskId);
 if(!match||!safeSeed(Number(match[2]))||
  attempt.seed!==Number(match[2])||!Number.isFinite(Date.parse(attempt.submittedAt)))return null;
 if(!['FULL_CREDIT','ZERO_CREDIT','UNASSESSABLE'].includes(attempt.status)||
  attempt.status!==(attempt.points===1?'FULL_CREDIT':attempt.points===0?'ZERO_CREDIT':'UNASSESSABLE'))return null;
 return toOutcome(attempt,{kind:match[1],seed:Number(match[2]),
  at:Date.parse(attempt.submittedAt),assistance:'unknown',id:attempt.id});
}
export function r15RepairAdvice(outcome){
 if(!outcome||!safeKind(outcome.kind))return null;
 if(outcome.points===1)return {topic:'Új változat',step:'Próbálj új feladatot, más adatokkal, önállóan.'};
 if(outcome.points===null)return {topic:'Nem értékelhető',
  step:'A pontozó ezt a MathProg-alakot nem tudta igazolni; ez nem bizonyít matematikai hibát. Nézd át a támogatott alakokat.'};
 const first=outcome.errors.find(e=>Object.hasOwn(ACTIONS,e));
 const [topic,step]=first?ACTIONS[first]:DEFAULT_ACTION;
 return {topic,step};
}
function nextUnusedSeed(initial,seen){
 let n=initial;
 for(let i=0;i<=MAX_HISTORY;i++){
  n=n===UINT_MAX?0:n+1;
  if(!seen.has(n))return n;
 }
 return n;
}
/**
 * R15B: one authoritative normalization path for recommendations and explanations.
 * Session values must be the validated result of r15SessionOutcome, not arbitrary
 * browser storage or untrusted model output. Older chat receipts never assert help.
 * @param {{
 *  history?: import('../../src/core/contracts/chat.ts').TransportAttemptReceipt[],
 *  session?: Array<NonNullable<ReturnType<typeof r15SessionOutcome>>>
 * }} [options]
 */
export function r15ObservedOutcomes({history=[],session=[]}={}){
 const fromHistory=Array.isArray(history)?history.slice(-MAX_HISTORY).map(r15HistoryOutcome).filter(Boolean):[];
 const fromSession=Array.isArray(session)?session.slice(-MAX_HISTORY).filter(x=>
  x&&safeKind(x.kind)&&safeSeed(x.seed)&&['assisted','self_reported_no_help'].includes(x.assistance) &&
  x.taskId==='gusek-'+x.kind+'-'+x.seed && validGrade({
   points:x.points,maxPoints:1,correct:x.points===null?null:x.points===1,errors:x.errors
  }) && Number.isSafeInteger(x.at)&&x.at>=0&&x.at<=8640000000000000):[];
 // Prefer the immediate session copy if a chat receipt was also loaded.
 const combined=new Map();
 for(const r of fromHistory)combined.set(r.id??r.taskId+':'+r.at,r);
 for(const r of fromSession)combined.set(r.id??r.taskId+':'+r.at,r);
 const records=[...combined.values()].sort((a,b)=>a.at-b.at).slice(-MAX_HISTORY);
 return records;
}

/**
 * No automatic new task, no partial credit, no mastery/retention claim.
 * Prioritize a weak task family after zero credit, rotate after success,
 * and require a fresh seed for every suggestion.
 */
/**
 * Type the JS/TS seam without coercions: these arrays must not infer as never[].
 * `history` is server-persisted, `session` is an unpersisted formative view.
 * @param {{
 *  history?: import('../../src/core/contracts/chat.ts').TransportAttemptReceipt[],
 *  session?: Array<NonNullable<ReturnType<typeof r15SessionOutcome>>>,
 *  currentKind?: string,
 *  currentSeed?: number
 * }} [options]
 */
export function r15RecommendPractice({history=[],session=[],currentKind='transport',currentSeed=42}={}){
 if(!safeKind(currentKind)||!safeSeed(Number(currentSeed)))return null;
 const records=r15ObservedOutcomes({history,session});
 const last=records.at(-1)??null;
 const evidence=Object.fromEntries(KINDS.map(k=>[k,{
  attempts:records.filter(r=>r.kind===k).length,
  selfReportedUnassistedFull:records.filter(r=>r.kind===k&&r.points===1&&r.assistance==='self_reported_no_help').length
 }]));
 let nextKind=currentKind,why='Kezdj egy új, önálló gyakorlófeladattal.';
 let mode='start';
 if(last&&(last.points===0||last.points===null||
    (last.points===1&&last.assistance!=='self_reported_no_help'))){
  nextKind=last.kind;mode=last.points===null?'unsupported':last.points===0?'repair':'repeat_independently';
  why=mode==='repair'?'A legutóbbi teljes megoldás nem kapott pontot: gyakorold új adatokkal ugyanazt a feladattípust.':
   mode==='unsupported'?'A legutóbbi MathProg-alak nem volt értékelhető; ez nem hibás megoldás bizonyítéka.':
   'A korábbi teljes pont nem bizonyít önálló megoldást. Próbáld meg új adatokkal segítség nélkül.';
 }else if(last){
  mode='interleave';
  const others=KINDS.filter(k=>k!==last.kind);
  others.sort((a,b)=>evidence[a].selfReportedUnassistedFull-evidence[b].selfReportedUnassistedFull||
   evidence[a].attempts-evidence[b].attempts||KINDS.indexOf(a)-KINDS.indexOf(b));
  nextKind=others[0];
  why='Az utolsó teljes megoldás után másik feladattípus következik. Ez gyakorlási ajánlás, nem igazolt tudásszint.';
 }
 const seedBase=Number(currentSeed);
 const seen=new Set(records.filter(r=>r.kind===nextKind).map(r=>r.seed));
 const recommendedSeed=nextUnusedSeed(seedBase,seen);
 return {
  schema:'learnharness.r15.practice-recommendation.v1',
  kind:nextKind,seed:recommendedSeed,mode,reason:why,
  correction:last?r15RepairAdvice(last):null,
  evidence,observed:records.length,scoreAuthority:false,autoStart:false,
  caveat:'Kizárólag formatív, nem felügyelt gyakorlás. A segítségmentesség önbevallás, az előzményekből nem következtetünk automatikusan rá.'
 };
}
