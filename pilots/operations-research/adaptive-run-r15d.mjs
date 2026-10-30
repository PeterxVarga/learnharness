/**
 * R15D in-memory, opt-in three-station practice workflow.
 * Selection, loading, and authoritative submitted outcomes are DIFFERENT events.
 * Zero credit, unsupported and full credit are different states; none is mastery.
 * This module never loads a problem, persists data or awards points.
 */
/**
 * @typedef {{
 *  position:number,kind:string,seed:number,taskId:string,
 *  label:string,title:string,phase:string,status:string,
 *  attempts:number,fullCount:number,zeroCount:number,
 *  unassessableCount:number,assistance:string,lastReceiptKey:string|null
 * }} R15DStep
 * @typedef {{
 *  schema:string,active:number|null,ready:boolean,
 *  steps:ReadonlyArray<R15DStep>,scoreAuthority:boolean,
 *  autoStart:boolean,caveat:string
 * }} R15DRun
 */
import {r15ObservedOutcomes} from './adaptive-practice-r15.mjs';
const KINDS=new Set(['transport','froccs','tablet']);
const UINT32=4294967295;
const STATUSES=new Set(['pending','selected','loaded','zero','unassessable','full']);
const RUN_SCHEMA='learnharness.r15d.practice-run.v1';
const validItem=s=>s&&typeof s==='object'&&!Array.isArray(s)&&
 Number.isInteger(s.position)&&s.position>=1&&s.position<=3&&
 KINDS.has(s.kind)&&Number.isSafeInteger(s.seed)&&s.seed>=0&&s.seed<=UINT32&&
 s.taskId==='gusek-'+s.kind+'-'+s.seed &&
 typeof s.title==='string'&&s.title.length>0&&s.title.length<=90 &&
 typeof s.label==='string'&&s.label.length>0&&s.label.length<=40 &&
 ['focus','interleave','return'].includes(s.phase)&&s.requiresManualStart===true;
/** @param {ReturnType<import('./adaptive-sequence-r15c.mjs').r15cPracticeItinerary>} itinerary
 *  @returns {R15DRun|null}
 */
export function r15dCreateRun(itinerary){
 if(!itinerary||itinerary.schema!=='learnharness.r15c.practice-itinerary.v1'||
  !Array.isArray(itinerary.steps)||itinerary.steps.length!==3||
  itinerary.autoStart!==false||itinerary.scoreAuthority!==false||
  !itinerary.steps.every((x,i)=>validItem(x)&&x.position===i+1)||
  itinerary.steps[0].kind!==itinerary.steps[2].kind||
  itinerary.steps[0].kind===itinerary.steps[1].kind||
  new Set(itinerary.steps.map(x=>x.taskId)).size!==3)return null;
 return Object.freeze({
  schema:RUN_SCHEMA,
  active:null,
  ready:false,
  steps:Object.freeze(itinerary.steps.map(s=>Object.freeze({
   position:s.position,kind:s.kind,seed:s.seed,taskId:s.taskId,
   label:s.label,title:s.title,phase:s.phase,
   status:'pending',attempts:0,fullCount:0,zeroCount:0,
   unassessableCount:0,assistance:'unknown',lastReceiptKey:null
  }))),
  scoreAuthority:false,autoStart:false,
  caveat:'Csak az aktuális oldal memóriájában követett formatív gyakorlás. Az 1/1 ellenőrzött beadás, nem bizonyított vizsgakészenlét. Az oldal újratöltése lezárja a követést.'
 });
}
const validRun=run=>run&&run.schema===RUN_SCHEMA&&Array.isArray(run.steps)&&run.steps.length===3&&
 (run.active===null||(Number.isInteger(run.active)&&run.active>=1&&run.active<=3))&&
 typeof run.ready==='boolean'&&
 run.steps.every((s,i)=>validItem({...s,requiresManualStart:true})&&s.position===i+1&&STATUSES.has(s.status)&&
 Number.isSafeInteger(s.attempts)&&s.attempts>=0&&Number.isSafeInteger(s.fullCount)&&s.fullCount>=0&&
 Number.isSafeInteger(s.zeroCount)&&s.zeroCount>=0&&
 Number.isSafeInteger(s.unassessableCount)&&s.unassessableCount>=0&&
 s.fullCount+s.zeroCount+s.unassessableCount===s.attempts);
/** @param {ReturnType<typeof r15dCreateRun>} run
 *  @param {number} position
 */
export function r15dCanSelect(run,position){
 if(!run||!validRun(run)||!Number.isInteger(position)||position<1||position>3)return false;
 return position===1||(run.steps[position-2]?.attempts??0)>0;
}
/** @param {R15DRun} run
 *  @param {number} position
 *  @param {Partial<R15DStep>} update
 *  @param {number|null} active
 *  @param {boolean} ready
 *  @returns {R15DRun}
 */
const transform=(run,position,update,active,ready)=>Object.freeze({
 ...run,active,ready,
 steps:Object.freeze(run.steps.map(s=>s.position===position?Object.freeze({...s,...update}):s))
});
/** @param {ReturnType<typeof r15dCreateRun>} run */
export function r15dPauseRun(run){
 if(!run||!validRun(run))return run;
 return Object.freeze({...run,active:null,ready:false});
}
/** @param {ReturnType<typeof r15dCreateRun>} run
 *  @param {number} position
 */
export function r15dSelectRunStep(run,position){
 if(!r15dCanSelect(run,position))return run;
 const s=run.steps[position-1];
 if(!s)return run;
 return transform(run,position,{status:s.attempts>0?s.status:'selected'},position,false);
}
/** @param {ReturnType<typeof r15dCreateRun>} run
 *  @param {string} taskId
 */
export function r15dLoadedRunStep(run,taskId){
 if(!run||!validRun(run)||run.active===null)return run;
 const s=run.steps[run.active-1];
 if(!s||s.taskId!==taskId)return r15dPauseRun(run);
 return transform(run,s.position,{status:s.attempts>0?s.status:'loaded'},s.position,true);
}
/**
 * Receives only the validated r15SessionOutcome generated after an explicit
 * successful server grade. Revalidates the bounded evidence contract.
 * @param {ReturnType<typeof r15dCreateRun>} run
 * @param {NonNullable<ReturnType<import('./adaptive-practice-r15.mjs').r15SessionOutcome>>|null} outcome
 */
export function r15dRecordRunGrade(run,outcome){
 if(!run||!validRun(run)||run.active===null||run.ready!==true||!outcome)return run;
 const evidence=r15ObservedOutcomes({session:[outcome]});
 if(evidence.length!==1)return run;
 const e=evidence[0],s=run.steps[run.active-1];
 if(!e||!s)return run;
 if(e.taskId!==s.taskId||e.kind!==s.kind||e.seed!==s.seed||
  !['assisted','self_reported_no_help'].includes(e.assistance))return run;
 const key=e.id??(e.taskId+':'+e.at);
 if(s.lastReceiptKey===key)return run;
 const status=e.points===1?'full':e.points===0?'zero':'unassessable';
 return transform(run,s.position,{
  status,attempts:s.attempts+1,
  fullCount:s.fullCount+(e.points===1?1:0),
  zeroCount:s.zeroCount+(e.points===0?1:0),
  unassessableCount:s.unassessableCount+(e.points===null?1:0),
  assistance:e.assistance,lastReceiptKey:key
 },s.position,true);
}
/** @param {ReturnType<typeof r15dCreateRun>} run */
export function r15dRunSummary(run){
 if(!run||!validRun(run))return null;
 const attempted=run.steps.filter(s=>s.attempts>0).length;
 const gradedFull=run.steps.filter(s=>s.fullCount>0).length;
 return Object.freeze({
  schema:'learnharness.r15d.run-summary.v1',
  attemptedStations:attempted,
  totalStations:3,
  fullCreditStations:gradedFull,
  attempts:run.steps.reduce((n,s)=>n+s.attempts,0),
  zero:run.steps.reduce((n,s)=>n+s.zeroCount,0),
  unassessable:run.steps.reduce((n,s)=>n+s.unassessableCount,0),
  active:run.active,ready:run.ready,
  scoreAuthority:false,autoStart:false
 });
}
