import {publicTaskContext} from './public-task-context-r169.mjs';
/** R16.8: explicit, student-mediated handoff from R15 server grade to LearnHarness teaching.
 * Zero provider calls, no writing to chat/graph, no grade or solver execution.
 * Input excludes mathprog model, data, variable values, objective and token.
 */
const LABEL=Object.freeze({
  transport:'Szállítási minimum (3×3)',
  froccs:'Fröccs bevételmaximalizálás',
  tablet:'Tabletta költségminimalizálás'
});
const allowed=Object.freeze(new Set(['transport','froccs','tablet']));
const MAX_STEP=175;
const MAX_TOPIC=90;
const MAX_REASON=180;
const status=x=>x===1?'1/1 — teljesen helyes':x===0?'0/1 — javítandó':'nem értékelhető';
const flat=(value,max)=>{
  if(typeof value!=='string'||value.length>max)return null;
  const s=value.replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim();
  // Handoff text is passed into a model as user-supplied content: reject
  // suspicious instruction/markup payloads rather than pasting them into chat.
  if(!s||/[<>\x00-\x1f]/.test(s))return null;
  return s;
};
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
/**
 * @param {{grade:unknown,taskKind:unknown,task?:unknown,diagnostic?:unknown,suggestion?:unknown,hintsUsed?:unknown}} input
 * @returns {{text:string,mode:'repair'|'unsupported'|'transfer',taskKind:string,topic:string}|null}
 */
export function makeTeachingHandoff(input){
 if(!isObj(input)||!allowed.has(input.taskKind)||!isObj(input.grade))return null;
 const g=input.grade;
 if(typeof g.taskId!=='string'||!new RegExp('^gusek-'+input.taskKind+'-(0|[1-9][0-9]{0,9})$').test(g.taskId)||
    g.maxPoints!==1||![0,1,null].includes(g.points)||
    g.correct!==(g.points===null?null:g.points===1)||
    !Array.isArray(g.errors)||g.errors.length>24||
    !g.errors.every(e=>typeof e==='string'&&/^[a-z][a-z0-9_]{0,95}$/.test(e))||
    (g.points===1&&g.errors.length!==0)||
    typeof input.hintsUsed!=='boolean')return null;
 const d=input.diagnostic;
 const mode=g.points===1?'transfer':g.points===null?'unsupported':'repair';
 const genericTopic=mode==='repair'?'A modell és megoldás önálló kijavítása':
    mode==='unsupported'?'A támogatott MathProg-résznyelv megértése':
    'A módszer átadása új feladathelyzetre';
 // R15B diagnostic is already a server-evidence-derived teaching cue, not
 // a new grader. Never reflect unexpected raw codes, sources or user text.
 const topic=isObj(d)&&flat(d.topic,MAX_TOPIC) ? flat(d.topic,MAX_TOPIC) : genericTopic;
 const steps=isObj(d)&&Array.isArray(d.steps)&&d.steps.length===3
    ?d.steps.map(s=>flat(s,MAX_STEP)):[];
 const validSteps=steps.length===3&&steps.every(Boolean);
 const stepsForTeacher=validSteps?steps:[
   'Fogalmazd meg a döntési változókat és a célfüggvény irányát.',
   'Vizsgáld meg a korlátokat és a változótartományokat.',
   'A saját javítás után ellenőrizd újra az eredeti pontozóval.'
 ];
 const help=input.hintsUsed?'A tanuló segítséghasználatot jelzett.':'A tanuló segítségmentességet jelzett; ez nem felügyelt bizonyíték.';
 const coachMode=mode==='repair'?
   'Először azonosítsuk a félreértést, majd kérjünk saját javítási tervet.':
   mode==='unsupported'?
   'A nem értékelhető válasz NEM bizonyít matematikai hibát; tisztázzuk az ellenőrző támogatott nyelvtanát.':
   'Kérjünk önálló magyarázatot, majd új adatokkal történő alkalmazást.';
 const next=isObj(input.suggestion)&&allowed.has(input.suggestion.kind)&&
   Number.isSafeInteger(input.suggestion.seed)&&input.suggestion.seed>=0&&input.suggestion.seed<=4294967295&&
   flat(input.suggestion.reason,MAX_REASON)
   ?`Ajánlott későbbi gyakorlási irány: ${LABEL[input.suggestion.kind]} (új variáns).` :
    'Következő feladatot csak a tanuló külön választása után indítsunk.';
 const facts=publicTaskContext(input.task,input.taskKind,g.taskId);
 const text=[
  'GUSEK / GNU MathProg — tanári átadási brief',
  `Feladattípus: ${LABEL[input.taskKind]}.`,
  `Független szerveroldali értékelés: ${status(g.points)}.`,
  `Tanulási fókusz: ${topic}.`,
  help,
  ...(facts?['',facts]:['', 'A feladat részletes adatai nincsenek megadva; kérd be a tanulótól a feladat szövegét.']),
  coachMode,
  '',
  'A már elkészült R15B diagnosztika önellenőrző lépései:',
  ...stepsForTeacher.map((s,i)=>`${i+1}. ${s}`),
  '',
  'Tanítói feladat (lépésenként, a tanuló válaszait megvárva):',
  '1. Kérdezd meg, hogyan gondolkodott a tanuló; az első körben egyetlen rövid kérdést tegyél fel.',
  '2. Azonosítsd az előfeltételi fogalmat; rövid magyarázat után kérj saját szavas indoklást.',
  '3. Kérj egy javítási vagy átviteli tervet, de ne add meg a feladat kész modelljét és optimumát.',
  '4. A matematikai helyességet kizárólag az eredeti, független szerveroldali pontozó ellenőrizheti.',
  '',next,
  'Adatvédelem: csak a látható feladatadatok és a diagnosztika kerülnek át, nem a beadott modell, megoldás, GLPK-token vagy chat-azonosító.',
  'Ez formatív, nem felügyelt segítség; nem jelent új pontot vagy igazolt tudásszintet.'
 ].join('\n');
 return Object.freeze({text,mode,taskKind:input.taskKind,topic});
}
