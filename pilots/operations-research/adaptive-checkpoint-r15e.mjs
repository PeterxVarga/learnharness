/**
 * R15E: explicit browser-tab bookmark with ZERO grade/provenance persistence.
 * Storage is untrusted: restore creates a NEW zero-attempt R15D run.
 * Do not persist model/source, answers, receipts, help history, chat ID, grade.
 */
import {r15dCreateRun,r15dRunSummary} from './adaptive-run-r15d.mjs';
const KINDS=new Set(['transport','froccs','tablet']);
const LABEL=Object.freeze({transport:'Szállítás',froccs:'Fröccs',tablet:'Tabletta'});
const PHASES=['focus','interleave','return'];
const TITLES=['Újrapróba vagy új feladat','Feladattípus-váltás','Visszatérés'];
export const R15E_BOOKMARK_KEY='learnharness:r15e:practice-plan:v1';
const schema='learnharness.r15e.plan-bookmark.v1';
const safeStep=s=>s&&typeof s==='object'&&!Array.isArray(s)&&
 Object.keys(s).length===2&&Object.hasOwn(s,'kind')&&Object.hasOwn(s,'seed')&&
 KINDS.has(s.kind)&&Number.isSafeInteger(s.seed)&&s.seed>=0&&s.seed<=4294967295;
/**
 * Pure serialization: only task family and seed, NEVER outcome or receipt.
 * @param {ReturnType<import('./adaptive-run-r15d.mjs').r15dCreateRun>} run
 */
export function r15eCreateBookmark(run){
 if(!run||!r15dRunSummary(run))return null;
 const steps=run.steps.map(s=>({kind:s.kind,seed:s.seed}));
 if(steps.length!==3||steps.some(s=>!safeStep(s)))return null;
 return Object.freeze({schema,steps:Object.freeze(steps.map(s=>Object.freeze(s)))});
}
/**
 * Deserializes a previously user-saved plan as an untrusted new run.
 * Always resets attempts, unlocks, active task and grade provenance.
 * @param {unknown} raw
 * @returns {ReturnType<import('./adaptive-run-r15d.mjs').r15dCreateRun>}
 */
export function r15eRestoreBookmark(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||
  Object.keys(raw).length!==2||raw.schema!==schema||
  !Array.isArray(raw.steps)||raw.steps.length!==3||
  !raw.steps.every(safeStep)||
  raw.steps[0].kind!==raw.steps[2].kind||
  raw.steps[0].kind===raw.steps[1].kind)return null;
 const steps=raw.steps.map((s,i)=>({
  position:i+1,kind:s.kind,seed:s.seed,
  taskId:'gusek-'+s.kind+'-'+s.seed,
  label:LABEL[s.kind],title:TITLES[i],phase:PHASES[i],
  requiresManualStart:true
 }));
 if(new Set(steps.map(s=>s.taskId)).size!==3)return null;
 return r15dCreateRun({
  schema:'learnharness.r15c.practice-itinerary.v1',
  steps,autoStart:false,scoreAuthority:false
 });
}
/**
 * Existing server-verified 0 / null is a feedback event, not an auto retry.
 * A learner may explicitly enter correction mode on the SAME loaded task.
 * Counters remain unchanged until a later real server grade.
 * @param {ReturnType<import('./adaptive-run-r15d.mjs').r15dCreateRun>} run
 * @param {string} taskId
 */
export function r15ePrepareCorrection(run,taskId){
 if(!run||!r15dRunSummary(run)||run.active===null||!run.ready)return run;
 const row=run.steps[run.active-1];
 if(!row||row.taskId!==taskId||
  !['zero','unassessable'].includes(row.status)||row.attempts===0)return run;
 return Object.freeze({...run,steps:Object.freeze(run.steps.map(step=>
  step.position===row.position?Object.freeze({...step,status:'loaded'}):step
 ))});
}
