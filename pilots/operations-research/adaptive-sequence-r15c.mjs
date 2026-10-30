/**
 * R15C three-stop advisory practice itinerary and an evidence-only progress board.
 * No timers/retention/mastery, persistence, model calls, solver, grades, or raw source.
 * Inputs are only the same authoritative, bounded outcomes as R15A/R15B.
 */
import {r15ObservedOutcomes} from './adaptive-practice-r15.mjs';
const KINDS=Object.freeze(['transport','froccs','tablet']);
const UINT32_MAX=4294967295;
const MAX_HISTORY=48;
const DISPLAY=Object.freeze({transport:'Szállítás',froccs:'Fröccs',tablet:'Tabletta'});
const distinct=xs=>new Set(xs).size;
/**
 * @param {{
 *  history?: import('../../src/core/contracts/chat.ts').TransportAttemptReceipt[],
 *  session?: Array<NonNullable<ReturnType<typeof import('./adaptive-practice-r15.mjs').r15SessionOutcome>>>,
 *  currentKind?: string,
 *  currentSeed?: number
 * }} [options]
 */
export function r15cPracticeItinerary({history=[],session=[],currentKind='transport',currentSeed=42}={}){
 if(!KINDS.includes(currentKind)||
   typeof currentSeed!=='number'||!Number.isSafeInteger(currentSeed)||
   currentSeed<0||currentSeed>UINT32_MAX)return null;
 const records=r15ObservedOutcomes({history,session});
 const summary=KINDS.map(kind=>{
  const ofKind=records.filter(r=>r.kind===kind);
  return Object.freeze({
   kind,label:DISPLAY[kind],
   attempts:ofKind.length,
   variants:distinct(ofKind.map(r=>r.seed)),
   full:ofKind.filter(r=>r.points===1).length,
   zero:ofKind.filter(r=>r.points===0).length,
   unassessable:ofKind.filter(r=>r.points===null).length,
   unknownHelp:ofKind.filter(r=>r.assistance==='unknown').length,
   selfReportedUnaidedFull:ofKind.filter(r=>r.points===1&&r.assistance==='self_reported_no_help').length
  });
 });
 const totals={
  observed:records.length,
  full:summary.reduce((n,r)=>n+r.full,0),
  zero:summary.reduce((n,r)=>n+r.zero,0),
  unassessable:summary.reduce((n,r)=>n+r.unassessable,0),
  unknownHelp:summary.reduce((n,r)=>n+r.unknownHelp,0)
 };
 const last=records.at(-1);
 const lastNeedsFollowup=!!last&&(last.points!==1||last.assistance!=='self_reported_no_help');
 const rank=(a,b)=>a.attempts-b.attempts||
  a.selfReportedUnaidedFull-b.selfReportedUnaidedFull||
  KINDS.indexOf(a.kind)-KINDS.indexOf(b.kind);
 const byKind=new Map(summary.map(r=>[r.kind,r]));
 const focus=lastNeedsFollowup?last.kind:
  [...summary].sort(rank).find(r=>r.kind!==last?.kind)?.kind??currentKind;
 const alternate=[...summary].filter(r=>r.kind!==focus).sort(rank)[0]?.kind??focus;
 // Revisit the initial category after a different kind; this does not
 // prescribe any timing or imply a real spaced-repetition review schedule.
 const choices=[
  {kind:focus,phase:'focus',title:lastNeedsFollowup?'Célzott újrapróba':'Új feladat',reason:
   last?.points===null&&lastNeedsFollowup?
    'A korábbi modellt az ellenőrző nem tudta értékelni; ez nem bizonyít hibás megoldást.':
   last?.points===0&&lastNeedsFollowup?
    'A legutóbbi hibás teljes megoldás feladattípusának önálló újrapróbája.':
   last?.assistance!=='self_reported_no_help'&&lastNeedsFollowup?
    'A korábbi teljes pont segítségmentessége nem bizonyított; önálló újrapróba.':
    'Indíts egy új, eltérő adatokkal generált feladatot.'},
  {kind:alternate,phase:'interleave',title:'Feladattípus-váltás',
   reason:'Válts másik feladattípusra; ez gyakorlási sorrend, nem tudásszintbecslés.'},
  {kind:focus,phase:'return',title:'Visszatérés a témához',
   reason:'Egy eltérő feladat után térj vissza a kiinduló típushoz új adatokkal, saját döntés alapján.'}
 ];
 const used=new Map(KINDS.map(kind=>[kind,
  new Set(records.filter(r=>r.kind===kind).map(r=>r.seed))]));
 const nextSeed=kind=>{
  const seen=used.get(kind);
  let cursor=currentSeed;
  for(let n=0;n<=MAX_HISTORY+3;n++){
   cursor=cursor===UINT32_MAX?0:cursor+1;
   if(!seen.has(cursor)){seen.add(cursor);return cursor;}
  }
  // 48 recent records + three choices cannot cover a uint32 space.
  return null;
 };
 const steps=[];
 for(const row of choices){
  const seed=nextSeed(row.kind);
  if(seed===null)return null;
  steps.push(Object.freeze({
   position:steps.length+1,
   kind:row.kind,seed,taskId:'gusek-'+row.kind+'-'+seed,
   label:DISPLAY[row.kind],phase:row.phase,title:row.title,reason:row.reason,
   requiresManualStart:true
  }));
 }
 return Object.freeze({
  schema:'learnharness.r15c.practice-itinerary.v1',
  summary:Object.freeze(summary),totals:Object.freeze(totals),
  steps:Object.freeze(steps),
  observationScope:'most_recent_48_verified_outcomes',
  evidenceOnly:true,scoreAuthority:false,autoStart:false,
  caveat:'A kimutatás ellenőrzött, nem felügyelt gyakorlási kísérleteket számol. Nem bizonyít vizsgakészenlétet, tartós tudást vagy önállóságot; az ismeretlen segítséghasználat ismeretlen marad.'
 });
}
