'use client';
import {useEffect,useRef,useState} from 'react';
import type {ChangeEvent,KeyboardEvent} from 'react';
import Link from 'next/link';
import type {TransportAttemptReceipt} from '../src/core/contracts/chat';
import {GmplEditor} from './gusek-gmpl-editor';
import {GusekValuesGrid} from './gusek-values-grid';
import {glpkDiagnosticLine,validateWorkbenchFile} from '../src/features/gusek/workspace-files.mjs';
import {preparePracticeTransfer} from '../pilots/operations-research/gusek-practice-transfer-r14.mjs';
import {classifyGlpkFeedback} from '../pilots/operations-research/glpk-feedback-r14z.mjs';
import {readGusekPracticeDraft,saveGusekPracticeDraft} from '../src/features/gusek/browser-drafts';
import {r15SessionOutcome,r15RecommendPractice} from '../pilots/operations-research/adaptive-practice-r15.mjs';
import {r15bDiagnosticBrief} from '../pilots/operations-research/adaptive-diagnostics-r15b.mjs';
import {r15cPracticeItinerary} from '../pilots/operations-research/adaptive-sequence-r15c.mjs';
import {r15dCreateRun,r15dCanSelect,r15dSelectRunStep,r15dLoadedRunStep,r15dRecordRunGrade,r15dPauseRun,r15dRunSummary} from '../pilots/operations-research/adaptive-run-r15d.mjs';
import {R15E_BOOKMARK_KEY,r15eCreateBookmark,r15eRestoreBookmark,r15ePrepareCorrection} from '../pilots/operations-research/adaptive-checkpoint-r15e.mjs';

type Kind='transport'|'froccs'|'tablet';
type Task={id:string;kind:Kind;taskType:string;variableNames:string[];objectiveSense:'min'|'max';
 supply?:number[];demand?:number[];costs?:number[][];capacities?:number[][];
 labels?:string[];wine?:number[];soda?:number[];prices?:number[];availableWine?:number;availableSoda?:number;
 target?:number;maxTablets?:number;knowledge?:number[]};
type Grade={id?:string;taskId:string;points:0|1|null;maxPoints:1;correct:boolean|null;errors:string[]};
type Attempt=TransportAttemptReceipt;
type GlpkResult={status:string;code:string;graded:false;points:null;diagnostic?:string;solutionListing?:string|null;solverStatus?:string;objective?:number|null;statusCode?:string;mode?:'solve'|'check';columnStatus?:string;columns?:{name:string;value:number}[];error?:string};
const starter=(names:string[])=>JSON.stringify(Object.fromEntries(names.map(x=>[x,0])),null,2);
const errorsHu:Record<string,string>={
 source_wrong_variables:'A változónevek vagy a változók száma nem felel meg a feladatnak.',
 source_wrong_variable_domain:'Hibás a változótípus vagy a nemnegativitási feltétel.',
 source_wrong_objective:'Nem megfelelő a célfüggvény vagy a minimum/maximum iránya.',
 source_wrong_constraint:'Hibás egy feltétel, az egyenlőtlenség iránya vagy egy együttható.',
 source_wrong_constraint_count:'Hiányzik egy feltétel vagy fölösleges feltétel szerepel.',
 source_unsupported_statement:'A beadott utasítást ez a biztonságos MathProg-résznyelv nem támogatja.',
 source_unsupported_expression:'Nem támogatott matematikai kifejezés. GUSEK-ben ettől még lehet érvényes.',
 source_unsupported_nonlinear:'A gyakorló csak lineáris modelleket értékel.',
 source_missing_semicolon:'Hiányzik egy pontosvessző.',
 solution_constraint_violation:'A beadott változóértékek valamelyik korlátot megsértik.',
 solution_variable_domain:'Negatív, nem egész vagy korláton kívüli változóérték.',
 invalid_solution_values:'Minden névhez adj meg számot a JSON értéktáblában.',
 objective_mismatch:'A megadott célfüggvényérték nem egyezik a változóértékekből számolttal.',
 not_optimal:'A beadott megoldás nem optimális.',
 independence_not_demonstrated:'A segítséghasználat önbevallása alapján nem jár önálló vizsgapont.',
};
export function GusekExam({chatId,embedded=false,onRequestCoaching,onCopyToWorkspace}:{chatId?:string;embedded?:boolean;onRequestCoaching?:()=>void;onCopyToWorkspace?:(model:string,data:string)=>void}){
 const [kind,setKind]=useState<Kind>('transport'),[seed,setSeed]=useState('42'),[task,setTask]=useState<Task|null>(null);
 const [transportDialect,setTransportDialect]=useState<'scalar'|'indexed'>('scalar');
 const [source,setSource]=useState(''),[values,setValues]=useState(''),[objective,setObjective]=useState(''),[hints,setHints]=useState(false);
 const [dataFile,setDataFile]=useState(''),[nativeToken,setNativeToken]=useState('');
 const [fileTab,setFileTab]=useState<'model.mod'|'data.dat'>('model.mod');
 const [nativeAvailable,setNativeAvailable]=useState(false),[nativeBusy,setNativeBusy]=useState(false);
 const [nativeResult,setNativeResult]=useState<GlpkResult|null>(null),[nativeError,setNativeError]=useState('');
 const [nativeSnapshot,setNativeSnapshot]=useState<{taskId:string;model:string;data:string}|null>(null);
 const [grade,setGrade]=useState<Grade|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [linkedChat,setLinkedChat]=useState<string|null>(null),[history,setHistory]=useState<Attempt[]>([]);
 const [r15Outcomes,setR15Outcomes]=useState<Array<NonNullable<ReturnType<typeof r15SessionOutcome>>>>([]);
 const [r15dRun,setR15dRun]=useState<ReturnType<typeof r15dCreateRun>>(null);
 const [r15eHasBookmark,setR15eHasBookmark]=useState(false);
 const [r15eNotice,setR15eNotice]=useState('');
 const [binding,setBinding]=useState<'checking'|'ready'|'none'|'failed'>('checking');
 const pending=useRef<{fingerprint:string;id:string}|null>(null);
 const taskRequestEpoch=useRef(0),formEpoch=useRef(0);
 const gradeRequestEpoch=useRef<number|null>(null);
 const [draftState,setDraftState]=useState<'loading'|'restored'|'saved'|'unavailable'|'idle'>('idle');
 function invalidateAnswer(){
  // An answer revision supersedes any in-flight grade, without discarding
  // the already computed GLPK evidence that the learner might re-transfer.
  formEpoch.current++;
  gradeRequestEpoch.current=null;
  setBusy(false);setDraftState('idle');setGrade(null);
 }
 function invalidateForm(){
  formEpoch.current++;
  gradeRequestEpoch.current=null;
  setDraftState('idle');
  nativeAbort.current?.abort();
  nativeAbort.current=null;
  setNativeBusy(false);setNativeCancelling(false);setBusy(false);
  setGrade(null);setNativeResult(null);setNativeSnapshot(null);
 }
 const uploadModel=useRef<HTMLInputElement|null>(null);
 const nativeAbort=useRef<AbortController|null>(null);
 const [nativeCancelling,setNativeCancelling]=useState(false);
 const nativeDiagnostic=glpkDiagnosticLine(nativeResult?.diagnostic??'');
 const nativeFeedback=nativeResult?classifyGlpkFeedback(nativeResult):null;
 const r15Suggestion=r15RecommendPractice({history,session:r15Outcomes,currentKind:kind,currentSeed:Number(seed)});
 const r15bBrief=grade?r15bDiagnosticBrief({history,session:r15Outcomes}):null;
 const r15cPlan=grade?r15cPracticeItinerary({history,session:r15Outcomes,currentKind:kind,currentSeed:Number(seed)}):null;
 const r15dProgress=r15dRun?r15dRunSummary(r15dRun):null;
 useEffect(()=>{
  try{
   const raw=window.sessionStorage.getItem(R15E_BOOKMARK_KEY);
   if(!raw||raw.length>2048)return;
   setR15eHasBookmark(r15eRestoreBookmark(JSON.parse(raw))!==null);
  }catch{/* Client storage may be unavailable. */}
 },[]);
 function r15eSavePlan(){
  const bookmark=r15eCreateBookmark(r15dRun);
  if(!bookmark){setR15eNotice('Nincs menthető gyakorlatsor.');return;}
  try{
   window.sessionStorage.setItem(R15E_BOOKMARK_KEY,JSON.stringify(bookmark));
   setR15eHasBookmark(true);
   setR15eNotice('A terv elmentve ehhez a böngészőlaphoz, pontok és megoldások nélkül.');
  }catch{setR15eNotice('A böngésző nem engedte a terv mentését.');}
 }
 function r15eLoadPlan(){
  try{
   const raw=window.sessionStorage.getItem(R15E_BOOKMARK_KEY);
   const restored=raw&&raw.length<=2048?r15eRestoreBookmark(JSON.parse(raw)):null;
   if(!restored)throw Error('invalid_bookmark');
   taskRequestEpoch.current++;invalidateForm();setTask(null);
   setR15dRun(restored);
   setR15eNotice('Terv visszaállítva, ellenőrzött pontok nélkül. Válaszd ki az első állomást.');
  }catch{
   setR15eHasBookmark(false);
   setR15eNotice('A mentett terv nem állítható vissza, vagy a böngészőtárhely nem elérhető.');
  }
 }
 useEffect(()=>{
  const file=nativeDiagnostic?.file;
  if(file==='model.mod'||file==='data.dat')setFileTab(file);
 },[nativeResult]);
 useEffect(()=>{let live=true;fetch('/api/pilot/gusek/native',{cache:'no-store'})
  .then(r=>r.ok?r.json():null).then(x=>{if(live)setNativeAvailable(x?.available===true);})
  .catch(()=>{if(live)setNativeAvailable(false);});return()=>{live=false;};},[]);
 useEffect(()=>{
  const id=chatId??new URLSearchParams(window.location.search).get('chatId');
  if(!id){setBinding('none');return;}
  if(!/^chat_[a-z0-9]+_[0-9a-f]{8}$/.test(id)){setBinding('failed');setError('Érvénytelen chat-azonosító.');return;}
  let live=true;fetch(`/api/pilot/transport/attempts?chatId=${encodeURIComponent(id)}`,{cache:'no-store'})
  .then(async r=>{if(!r.ok)throw Error('Practice chat nem található.');return r.json();})
  .then(x=>{if(live){setLinkedChat(id);setHistory(x.attempts??[]);setBinding('ready');}})
  .catch(e=>{if(live){setBinding('failed');setError(String(e));}});
  return()=>{live=false;};
 },[chatId]);
 // Local-only autosave, scoped to exact seeded task, dialect and chat.
 useEffect(()=>{
  if(!task||task.kind!==kind||task.id!=='gusek-'+kind+'-'+seed||
   draftState==='loading'||draftState==='unavailable')return;
  const dialect=kind==='transport'?transportDialect:'scalar';
  let active=true;
  const timer=window.setTimeout(()=>{
   void saveGusekPracticeDraft(chatId??linkedChat??null,{
    taskId:task.id,kind,seed,dialect,model:source,values,objective,hintsUsed:hints
   }).then(()=>{if(active)setDraftState('saved');})
    .catch(()=>{if(active)setDraftState('unavailable');});
  },700);
  return()=>{active=false;window.clearTimeout(timer);};
 },[task,chatId,linkedChat,kind,seed,transportDialect,source,values,objective,hints]);
 async function newTask(){
  const epoch=++taskRequestEpoch.current;
  invalidateForm();
  setBusy(true);setTask(null);setDraftState('loading');setError('');
  try{
   if(!/^(0|[1-9]\d{0,9})$/.test(seed)||Number(seed)>4294967295)throw Error('Hibás feladatvariáns.');
   const r=await fetch(`/api/pilot/gusek?kind=${kind}&seed=${seed}`,{cache:'no-store'}),x=await r.json();
   if(!r.ok)throw Error(x.error??'Feladat nem érhető el.');
   if(epoch!==taskRequestEpoch.current)return;
   const t=x.task as Task;
   const indexed=kind==='transport'&&transportDialect==='indexed';
   const preset=x.indexed as {starter?:string;dataTemplate?:string}|undefined;
   const scalar=x.scalar as {starter?:string}|undefined;
   if(!scalar?.starter)throw Error('A MathProg kezdőmodell nem érhető el.');
   if(indexed&&(!preset?.starter||!preset.dataTemplate))throw Error('Indexelt feladatminta nem érhető el.');
   const defaultModel=indexed?preset!.starter!:scalar.starter;
   const initialValues=indexed?JSON.stringify(Object.fromEntries(
    Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>[`x[${i+1},${j+1}]`,0])).flat()
   ),null,2):starter(t.variableNames);
   let restored:null|{model:string;values:string;objective:string;hintsUsed:boolean}=null;
   let storageFailed=false;
   try{
    restored=await readGusekPracticeDraft(chatId??linkedChat??null,kind,seed,indexed?'indexed':'scalar');
   }catch{storageFailed=true;}
   if(epoch!==taskRequestEpoch.current)return;
   setTask(t);
   setFileTab('model.mod');
   setSource(restored?.model??defaultModel);
   setValues(restored?.values??initialValues);
   setObjective(restored?.objective??'');setHints(restored?.hintsUsed??false);
   setDataFile(indexed?preset!.dataTemplate!:'');setNativeResult(null);setNativeSnapshot(null);setNativeError('');pending.current=null;
   setDraftState(storageFailed?'unavailable':restored?'restored':'idle');
   setR15dRun(old=>r15dLoadedRunStep(old,t.id));
  }catch(e){if(epoch===taskRequestEpoch.current)setError(e instanceof Error?e.message:String(e));}
  finally{if(epoch===taskRequestEpoch.current)setBusy(false);}
 }
 function exportPracticeFile(name:'model.mod'|'data.dat',contents:string){
  const url=URL.createObjectURL(new Blob([contents],{type:'text/plain;charset=utf-8'}));
  try{
   const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
 }
 async function importPracticeModel(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';
  if(!file)return;
  const taskEpochAtImport=taskRequestEpoch.current;
  const formEpochAtImport=formEpoch.current;
  if(!file.name.toLowerCase().endsWith('.mod')||file.size>65536){
   setError('Csak legfeljebb 64 KiB méretű .mod fájl tölthető be.');return;
  }
  try{
   const text=await file.text();
   if(taskEpochAtImport!==taskRequestEpoch.current||formEpochAtImport!==formEpoch.current)return;
   if(!validateWorkbenchFile('model.mod',text).ok)throw Error('Érvénytelen vagy túl nagy MathProg-fájl.');
   invalidateForm();setFileTab('model.mod');setSource(text);setError('');
  }catch(e){
   if(taskEpochAtImport===taskRequestEpoch.current&&formEpochAtImport===formEpoch.current)
    setError(e instanceof Error?e.message:'Nem sikerült megnyitni a .mod fájlt.');
  }
 }
 async function runNative(mode:'solve'|'check'){
  // Diagnostic-only execution: NEVER writes to the authoritative score ledger.
  // Ref is updated synchronously: a double activation cannot bypass state batching.
  if(!nativeAvailable||nativeBusy||nativeAbort.current||!task)return;
  const controller=new AbortController();nativeAbort.current=controller;
  const startedAt=formEpoch.current;
  setNativeBusy(true);setNativeCancelling(false);setNativeResult(null);setNativeError('');
  try{
   if(!/^[a-f0-9]{64}$/.test(nativeToken))throw Error('Adj meg egy 64 karakteres, helyi GLPK tokent.');
   if(!source.trim()||source.length>65536||dataFile.length>65536)throw Error('A modell vagy az adatfájl hiányzik, illetve túl nagy.');
   const snapshot={taskId:task.id,model:source,data:dataFile};setNativeSnapshot(snapshot);
   const r=await fetch('/api/pilot/gusek/native',{method:'POST',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json','X-LH-GLPK-Token':nativeToken},
    body:JSON.stringify({model:snapshot.model,data:snapshot.data,mode})});
   const result=await r.json() as GlpkResult;
   if(controller.signal.aborted)throw Error('A futtatás megszakadt.');
   if(!r.ok&&result.status!=='BLOCKED')throw Error(result.error??'GLPK-kérés sikertelen.');
   if(result.graded!==false||result.points!==null)throw Error('Érvénytelen GLPK-diagnosztikai válasz.');
   if(startedAt===formEpoch.current)setNativeResult(result);
  }catch(e){if(startedAt===formEpoch.current)setNativeError(controller.signal.aborted?'GLPK-futtatás megszakítva.':e instanceof Error?e.message:String(e));}
  finally{
   if(nativeAbort.current===controller){
    nativeAbort.current=null;setNativeBusy(false);setNativeCancelling(false);
   }
  }
 }
 function editorShortcut(e:KeyboardEvent<HTMLTextAreaElement>){
  if(!(e.ctrlKey||e.metaKey)||e.key!=='Enter')return;
  e.preventDefault();
  if(e.shiftKey)void check();else void runNative('solve');
 }
 async function check(){
  if(!task||busy||gradeRequestEpoch.current!==null||binding==='failed'||binding==='checking')return;
  const startedAt=formEpoch.current;
  gradeRequestEpoch.current=startedAt;
  setBusy(true);setGrade(null);setError('');
  try{
   if(!objective.trim()||!Number.isFinite(Number(objective)))throw Error('Add meg a kiszámított célfüggvényértéket.');
   const answer={taskKind:task.kind,mathprog:source,values:JSON.parse(values),reportedObjective:Number(objective),hintsUsed:hints};
   const fingerprint=JSON.stringify({seed,answer});
   if(linkedChat&&pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,id:crypto.randomUUID()};
   const r=await fetch(linkedChat?'/api/pilot/transport/attempts':'/api/pilot/gusek',{
    method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
    body:JSON.stringify(linkedChat?{chatId:linkedChat,attemptId:pending.current!.id,seed,answer}:{kind:kind,seed,answer})
   });const x=await r.json();if(!r.ok)throw Error(x.error??'Ellenőrzés sikertelen.');
   const out=(linkedChat?x.receipt:x) as Grade;
   if(out.taskId!==task.id||out.maxPoints!==1||![0,1,null].includes(out.points))throw Error('Érvénytelen értékelőválasz.');
   if(startedAt===formEpoch.current){
    // The server may have recorded a real old attempt, but that delayed
    // response must not rewrite the new task's visible attempt history.
    if(linkedChat)setHistory(old=>[...old.filter(a=>a.id!==out.id),out as Attempt]);
    const evidence=r15SessionOutcome(out,{kind:task.kind,seed:Number(seed),hintsUsed:hints});
    if(evidence){
     setR15Outcomes(old=>[...old,evidence].slice(-48));
     setR15dRun(old=>r15dRecordRunGrade(old,evidence));
    }
    setGrade(out);
   }
  }catch(e){if(startedAt===formEpoch.current)setError(e instanceof Error?e.message:String(e));}
  finally{
   if(gradeRequestEpoch.current===startedAt){
    gradeRequestEpoch.current=null;
    setBusy(false);
   }
  }
 }
 return <div data-testid="gusek-exam-r13" className="mx-auto grid max-w-[1520px] gap-4 px-4 py-5 sm:px-6 xl:grid-cols-[minmax(280px,0.92fr)_minmax(0,2fr)]">
  <header className="space-y-2 xl:col-span-2"><p className="text-xs uppercase tracking-widest text-neutral-500">LearnHarness · GUSEK / GNU MathProg Workbench</p>
   <h1 className="text-3xl font-semibold">Vizsgagyakorló – GUSEK szintaxis</h1>
   <p className="text-sm text-neutral-500">A beadott .mod szöveget a rendszer <strong>nem futtatja</strong>, hanem korlátozott, biztonságos nyelvtani és matematikai ellenőrzéssel értékeli. Helyes teljes modell és optimum: 1 pont. Más: 0 pont vagy nem értékelhető. Nincs részpont.</p>
   {!embedded&&<Link className="text-sm underline" href={linkedChat?`/chat/${linkedChat}`:'/chat/new?mode=practice'}>Vissza a Practice beszélgetéshez</Link>}
  </header>
  <section data-testid="gusek-task-controls-r14z" data-rendered-kind={kind}
   data-rendered-dialect={transportDialect}
   className="flex flex-wrap items-end gap-3 rounded-xl border p-4 xl:col-span-2">
    <label className="text-sm">Feladattípus<select aria-label="Feladattípus" className="mt-1 block rounded border bg-background p-2" value={kind} onChange={e=>{taskRequestEpoch.current++;invalidateForm();setBusy(false);setR15dRun(old=>r15dPauseRun(old));setKind(e.target.value as Kind);setTask(null);}}>
      <option value="transport">Szállítási minimum</option><option value="froccs">Fröccs – maximum (egész)</option><option value="tablet">Tabletták – minimum (folytonos)</option>
    </select></label>
    {kind==='transport'&&<label className="text-sm">MathProg felírás
     <select data-testid="gusek-transport-dialect-r14" aria-label="MathProg felírás" value={transportDialect}
      onChange={e=>{taskRequestEpoch.current++;invalidateForm();setBusy(false);setTransportDialect(e.target.value as 'scalar'|'indexed');setTask(null);}}
      className="mt-1 block rounded border bg-background p-2">
      <option value="scalar">Skalár változók (R13)</option>
      <option value="indexed">Indexelt x[i,j] + .dat (R14)</option>
     </select>
    </label>}
    <label className="text-sm">Feladatvariáns<input aria-label="Feladatvariáns" className="mt-1 block w-36 rounded border bg-background p-2" value={seed} onChange={e=>{taskRequestEpoch.current++;invalidateForm();setBusy(false);setR15dRun(old=>r15dPauseRun(old));setSeed(e.target.value);setTask(null);}}/></label>
    <button disabled={busy} onClick={()=>void newTask()} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">Új feladat</button>
  </section>
  {task&&<section aria-label="Vizsgafeladat" className="min-w-0 space-y-3 rounded-xl border p-4 xl:sticky xl:top-4 xl:self-start">
    <h2 className="text-xl font-semibold">{task.taskType} · {task.id}</h2>
    {task.kind==='transport'?<><p>Optimalizáld a három raktárból három boltba történő szállítást. Minden változó nemnegatív egész. Az első raktár harmadik útvonala korlátozott.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Raktár</th><th>Bolt 1</th><th>Bolt 2</th><th>Bolt 3</th><th>Kínálat</th></tr></thead><tbody>{task.costs?.map((row,i)=><tr key={i} className="border-t"><th>{i+1}</th>{row.map((cost,j)=><td key={j} className="p-2 text-center">{cost}{i===0&&j===2&&<small className="block">max. {task.capacities?.[0]?.[2]}</small>}</td>)}<td className="text-center">{task.supply?.[i]}</td></tr>)}<tr className="border-t"><th>Kereslet</th>{task.demand?.map((d,j)=><td key={j} className="text-center">{d}</td>)}</tr></tbody></table></div></>
    :task.kind==='froccs'?<><p>Maximalizáld a bevételt, ha legfeljebb {task.availableWine} egység bor és {task.availableSoda} egység szóda áll rendelkezésre. A termékek darabszáma egész.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Termék</th><th>Változó</th><th>Bor</th><th>Szóda</th><th>Bevétel</th></tr></thead><tbody>{task.variableNames.map((n,i)=><tr className="border-t" key={n}><td>{task.labels?.[i]}</td><td>{n}</td><td>{task.wine?.[i]}</td><td>{task.soda?.[i]}</td><td>{task.prices?.[i]}</td></tr>)}</tbody></table></div></>
    :<p>Minimális vásárlási költség: {task.variableNames[0]} ({task.prices?.[0]} Ft, +{task.knowledge?.[0]} tudásegység), {task.variableNames[1]} ({task.prices?.[1]} Ft, +{task.knowledge?.[1]} tudásegység). Legalább {task.target} tudásegység szükséges; összesen legfeljebb {task.maxTablets} tabletta, és legalább annyi epres, mint spenótos. Folytonos változókat használj.</p>}
    <p className="text-xs text-neutral-500">Szükséges változónevek: {task.variableNames.join(', ')}. Az optimális megoldást nem fedjük fel.</p>
  </section>}
  {task&&<section data-testid="gusek-exam-source-state-r14z" data-source-length={source.length}
   className="min-w-0 space-y-3 rounded-xl border p-4">
    <label htmlFor="gusek-source" className="block font-semibold">GUSEK / MathProg modell (.mod)</label>
    <div className="flex flex-wrap gap-2">
     <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>uploadModel.current?.click()}>.mod importálása</button>
     <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>exportPracticeFile('model.mod',source)}>.mod letöltése</button>
     {dataFile&&<button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>exportPracticeFile('data.dat',dataFile)}>.dat letöltése</button>}
     {onCopyToWorkspace&&<button type="button" data-testid="gusek-copy-free-r14z" className="rounded border px-3 py-1.5 text-sm" onClick={()=>onCopyToWorkspace(source,dataFile)}>Másolat a szabad munkaterületre</button>}
     <input type="file" ref={uploadModel} accept=".mod" className="hidden" aria-label="MathProg modell megnyitása" onChange={e=>void importPracticeModel(e)}/>
    </div>
    <nav aria-label="MathProg fájlfülek" data-testid="gusek-practice-file-tabs-r14z" className="flex gap-2 border-b pb-2">
     <button type="button" data-testid="gusek-practice-tab-model-r14z" aria-pressed={fileTab==='model.mod'}
      className={'rounded px-3 py-2 font-mono text-xs '+(fileTab==='model.mod'?'bg-neutral-200 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-white':'')}
      onClick={()=>setFileTab('model.mod')}>model.mod</button>
     <button type="button" data-testid="gusek-practice-tab-data-r14z" aria-pressed={fileTab==='data.dat'}
      className={'rounded px-3 py-2 font-mono text-xs '+(fileTab==='data.dat'?'bg-neutral-200 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-white':'')}
      onClick={()=>setFileTab('data.dat')}>data.dat · csak olvasható</button>
    </nav>
    <GmplEditor id="gusek-source" testId="gusek-exam-source-r14"
     label="GUSEK / MathProg modell (.mod)" value={source} hidden={fileTab!=='model.mod'}
     onKeyDown={editorShortcut}
     diagnosticLine={nativeDiagnostic?.file==='model.mod'?nativeDiagnostic.line:null}
     onChange={next=>{invalidateForm();setSource(next);}} />
    <GmplEditor id="gusek-data" testId="gusek-exam-data-r14"
     label="Feladatadatok (.dat)" value={dataFile} readOnly hidden={fileTab!=='data.dat'}
     diagnosticLine={nativeDiagnostic?.file==='data.dat'?nativeDiagnostic.line:null}
     onChange={()=>{}} rows={5} placeholder="A feladat nem igényel külön .dat fájlt." />
    <p className="text-xs text-neutral-500">Ctrl+Enter: GLPK-futtatás · Ctrl+Shift+Enter: teljes megoldás ellenőrzése.</p>
    <p className="text-xs text-neutral-500">A pontozó a három szintetikus skalár vizsgatípust és a <strong>3×3 indexelt szállítási modell egy ellenőrzött MathProg-résznyelvét</strong> támogatja. Az általános indexelt GNU MathProg továbbra is nem értékelhető lehet. A natív GLPK diagnosztika külön működik, a konzolkimenet nem bizonyít helyes feladatmodellezést és nem ad automatikus pontot.</p>
    {task.kind==='transport'&&transportDialect==='indexed'&&<p data-testid="gusek-indexed-guidance-r14" className="text-xs text-neutral-500">Az indexelt mintában a célfüggvényt és a két egyensúlyi feltételt neked kell megírnod. A .dat a feladat ellenőrzött adatait tartalmazza; a pontozás mindig a szerveroldali feladatot használja, nem a kézzel módosított .dat tartalmát. A változóértékeket x[1,1]…x[3,3] kulcsokkal add meg.</p>}
    <section data-testid="gusek-native-r14" className="space-y-3 rounded-lg border p-3" aria-label="Natív GNU GLPK futtatás">
     <h3 className="font-semibold">GNU GLPK – eredeti MathProg-futtatás (R14)</h3>
     <p className="text-xs text-neutral-500">A .dat fül a feladat szerveroldali adatait mutatja, és a vizsgamódban csak olvasható.</p>
     {nativeAvailable?<>
      <label htmlFor="gusek-native-token" className="block text-sm">Helyi futtatási token (nem mentjük az előzményekbe)</label>
      <input id="gusek-native-token" type="password" autoComplete="off" spellCheck={false} value={nativeToken} onChange={e=>setNativeToken(e.target.value)} className="w-full rounded border bg-transparent p-2 font-mono text-sm" placeholder="64 karakteres hex token"/>
      <div className="flex flex-wrap gap-2">
       <button type="button" data-testid="gusek-native-check-r14" disabled={nativeBusy||busy||nativeToken.length!==64} onClick={()=>void runNative('check')} className="rounded border px-3 py-2 text-sm disabled:opacity-50">MathProg ellenőrzése</button>
       <button type="button" data-testid="gusek-native-solve-r14" disabled={nativeBusy||busy||nativeToken.length!==64} onClick={()=>void runNative('solve')} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Megoldás futtatása GLPK-val</button>
       {nativeBusy&&<button type="button" data-testid="gusek-native-cancel-r14" disabled={nativeCancelling} onClick={()=>{setNativeCancelling(true);nativeAbort.current?.abort();}} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Futtatás megszakítása</button>}
      </div>
     </>:<p className="text-sm text-neutral-500" data-testid="gusek-native-disabled-r14">A natív GLPK jelenleg nincs helyileg engedélyezve. A korábbi, független vizsgapontozó továbbra is használható.</p>}
     {nativeBusy&&<p role="status" className="text-sm">A GLPK izolált futtatása folyamatban…</p>}
     {nativeError&&<p role="alert" className="text-sm text-red-600">{nativeError}</p>}
     {nativeResult&&<div data-testid="gusek-native-result-r14" className="space-y-2" role="status">
      <p className="text-sm font-medium">GLPK futtatás: {nativeResult.status} ({nativeResult.code})</p>
      {nativeFeedback&&<div data-testid="gusek-native-feedback-r14z" className="space-y-1 border-l-2 border-neutral-400 pl-3">
       <p className="text-sm font-semibold">{nativeFeedback.title}</p>
       <p className="text-xs">{nativeFeedback.detail}</p>
       <p className="text-xs text-neutral-600 dark:text-neutral-300">{nativeFeedback.nextAction}</p>
      </div>}
      {nativeResult.mode==='solve'&&<p data-testid="gusek-native-status-r14" className="text-sm">Megoldás állapota: <strong>{nativeResult.solverStatus??'UNKNOWN'}</strong>{nativeResult.solverStatus==='OPTIMAL'&&Number.isFinite(nativeResult.objective)?` · GLPK célfüggvény: ${nativeResult.objective}`:''}</p>}
      {nativeResult.solverStatus==='FEASIBLE_NOT_PROVEN_OPTIMAL'&&<p className="text-xs text-amber-700">A GLPK talált lehetséges megoldást, de az optimumot nem bizonyította.</p>}
      {nativeResult.solverStatus==='INFEASIBLE'&&<p className="text-xs text-amber-700">A megadott modellhez nincs lehetséges megoldás. Ez nem jelenti, hogy a feladat helyes modelljét írtad fel.</p>}
      <p className="text-xs text-neutral-500">Diagnosztika, nem vizsgapont. A kimenet tanulói modellből is származhat.</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 font-mono text-xs text-neutral-900">{nativeResult.diagnostic??'Nincs diagnosztikai kimenet.'}</pre>
      {nativeResult.columns&&nativeResult.columns.length>0&&<div className="overflow-x-auto rounded border p-2">
       <h4 className="mb-1 text-sm font-semibold">GLPK változóértékek</h4>
       <table className="w-full text-xs"><thead><tr><th className="text-left">Változó</th><th className="text-right">Érték</th></tr></thead>
        <tbody>{nativeResult.columns.slice(0,30).map(c=><tr key={c.name} className="border-t"><td className="font-mono">{c.name}</td><td className="text-right font-mono">{c.value}</td></tr>)}</tbody>
       </table>
      </div>}
      {nativeResult.mode==='solve'&&task&&<button type="button" data-testid="gusek-transfer-solution-r14"
       disabled={!preparePracticeTransfer({result:nativeResult,task,dialect:transportDialect,model:source,data:dataFile,snapshot:nativeSnapshot}).ok}
       onClick={()=>{
        const transfer=preparePracticeTransfer({result:nativeResult,task,dialect:transportDialect,model:source,data:dataFile,snapshot:nativeSnapshot});
        // Keep the existing independent transfer guard authoritative.
        // Require a complete, finite success shape before changing inputs.
        if(!transfer.ok||!('values' in transfer)||!('objective' in transfer)||
           !transfer.values||typeof transfer.objective!=='number'||
           !Number.isFinite(transfer.objective)){
         setNativeError('A GLPK-eredmény nem vehető át: '+(transfer.code??'invalid_transfer'));return;
        }
        invalidateAnswer();setValues(JSON.stringify(transfer.values,null,2));setObjective(String(transfer.objective));
       }} className="rounded border px-3 py-2 text-sm disabled:opacity-50">
       Optimális GLPK-megoldás átvétele a beadáshoz
      </button>}
      {nativeResult.solutionListing&&<>
       <h4 className="text-sm font-semibold">GLPK-megoldás: célfüggvény, korlátok és változók</h4>
       <pre data-testid="gusek-native-solution-r14" className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 font-mono text-xs text-neutral-900">{nativeResult.solutionListing}</pre>
      </>}
     </div>}
    </section>
    <GusekValuesGrid kind={kind} dialect={kind==='transport'?transportDialect:'scalar'}
     variableNames={task.variableNames} value={values} disabled={busy}
     onChange={next=>{invalidateAnswer();setValues(next);}}/>
    <label htmlFor="gusek-objective" className="block font-semibold">{task.objectiveSense==='max'?'Maximális bevétel':'Minimális célfüggvényérték'}</label>
    <input id="gusek-objective" inputMode="decimal" className="w-full rounded border bg-transparent p-2" value={objective} onChange={e=>{invalidateAnswer();setObjective(e.target.value);}}/>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={hints} onChange={e=>{invalidateAnswer();setHints(e.target.checked);}}/> Használtam segítséget</label>
    <button disabled={busy||binding==='checking'||binding==='failed'} onClick={()=>void check()} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">Teljes megoldás ellenőrzése</button>
  </section>}
  {task&&<p data-testid="gusek-practice-draft-status-r14z" className="text-xs text-neutral-500 xl:col-span-2">Piszkozat: {draftState==='restored'?'helyi mentés visszaállítva':draftState==='saved'?'helyben mentve':draftState==='unavailable'?'a helyi mentés nem elérhető':'mentés folyamatban'}</p>}
  {grade&&<section role="status" data-testid="gusek-grade-r14z" data-task-id={grade.taskId} data-grade-points={grade.points===null?"unassessable":String(grade.points)} className="space-y-2 rounded-xl border p-4 xl:col-start-2"><h2 className="text-xl font-semibold">{grade.points===null?'NEM ÉRTÉKELHETŐ':`${grade.points}/1`} – {grade.points===1?'TELJESEN HELYES':grade.points===0?'HIBÁS VAGY HIÁNYOS':'NEM TÁMOGATOTT FORMA'}</h2>
   {grade.errors.map(x=><p key={x} className="text-sm">{errorsHu[x]??`Ellenőrzési kód: ${x}`}</p>)}
   <p className="text-xs text-neutral-500">A pontszám kizárólag a független szerveroldali vizsgapontozóból származik. A natív GLPK futtatás diagnosztikája nem módosítja.</p>
   {r15Suggestion&&<aside data-testid="gusek-r15-recommendation" className="space-y-2 rounded-lg border p-3" aria-label="Következő gyakorlási javaslat">
    <p className="text-sm font-semibold">Következő gyakorlási javaslat (R15)</p>
    <p className="text-sm">{r15Suggestion.reason}</p>
    {r15Suggestion.correction&&<p className="text-sm"><strong>{r15Suggestion.correction.topic}:</strong> {r15Suggestion.correction.step}</p>}
    <p className="text-sm" data-testid="gusek-r15-next-task">{r15Suggestion.kind==='transport'?'Szállítás':r15Suggestion.kind==='froccs'?'Fröccs':'Tabletta'} · {r15Suggestion.seed}. variáns</p>
    <p className="text-xs text-neutral-500">{r15Suggestion.caveat}</p>
    <button type="button" data-testid="gusek-r15-choose" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={()=>{
     taskRequestEpoch.current++;invalidateForm();setBusy(false);
     setR15dRun(old=>r15dPauseRun(old));
     setKind(r15Suggestion.kind as Kind);setSeed(String(r15Suggestion.seed));setTask(null);
    }}>Javasolt variáns kiválasztása (nem indítja el)</button>
   </aside>}
   {r15bBrief&&<aside data-testid="gusek-r15b-diagnostic" data-repair-state={r15bBrief.state} className="space-y-2 rounded-lg border p-3" aria-label="Hibajavítási ellenőrzőlista">
    <p className="text-sm font-semibold">Háromlépéses ellenőrzés: {r15bBrief.topic}</p>
    <ol className="list-decimal space-y-1 pl-5 text-sm" data-testid="gusek-r15b-steps">
     {r15bBrief.steps.map((step,index)=><li key={index}>{step}</li>)}
    </ol>
    {r15bBrief.state==='repair'&&r15bBrief.repeatCount>=2&&
     <p className="text-sm" data-testid="gusek-r15b-repeat">Ez a hibatípus {r15bBrief.repeatCount} hibás kísérletben szerepel a rendelkezésre álló előzményekben, a jelenlegit is beleszámítva.</p>}
    <p className="text-xs text-neutral-500" data-testid="gusek-r15b-provenance">
     Ellenőrzött kísérletek: {r15bBrief.kindAttempts} · segítséghasználat: {r15bBrief.helpProvenance==='unknown'?'korábbi eredményből nem megállapítható':'önbevallás'}
    </p>
    <p className="text-xs text-neutral-500">{r15bBrief.caveat}</p>
   </aside>}
   {r15cPlan&&<section data-testid="gusek-r15c-plan" className="space-y-3 rounded-lg border p-3" aria-label="Háromállomásos gyakorlási terv">
    <h3 className="font-semibold">Következő három gyakorlási állomás</h3>
    <p className="text-xs text-neutral-500">Az ajánlások nem automatikus feladatok, és nem jelentenek vizsgakészenlétet. A tervezett feladatokat csak külön kiválasztás és az Új feladat gomb indítja el.</p>
    <ol className="space-y-2" data-testid="gusek-r15c-steps">
     {r15cPlan.steps.map(item=><li key={item.position} data-testid={'gusek-r15c-step-'+item.position} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
      <div className="space-y-1">
       <p className="text-sm font-semibold">{item.position}. {item.title}: {item.label} · {item.seed}. variáns</p>
       <p className="text-xs text-neutral-500">{item.reason}</p>
      </div>
      <button type="button" data-testid={'gusek-r15c-select-'+item.position} disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={()=>{
       taskRequestEpoch.current++;invalidateForm();setBusy(false);
       setR15dRun(old=>r15dPauseRun(old));
       setKind(item.kind as Kind);setSeed(String(item.seed));setTask(null);
      }}>Variáns kiválasztása</button>
     </li>)}
    </ol>
    <h4 className="text-sm font-semibold">Ellenőrzött gyakorlási előzmények – feladattípusonként</h4>
    <div className="overflow-x-auto" data-testid="gusek-r15c-board"><table className="w-full text-xs">
     <thead><tr><th className="p-2 text-left">Típus</th><th className="p-2">Kísérlet</th><th className="p-2">1/1</th><th className="p-2">0/1</th><th className="p-2">Nem értékelhető</th><th className="p-2">Ismeretlen segítség</th></tr></thead>
     <tbody>{r15cPlan.summary.map(row=><tr key={row.kind} data-testid={'gusek-r15c-progress-'+row.kind} className="border-t">
      <th scope="row" className="p-2 text-left">{row.label}</th>
      <td className="p-2 text-center">{row.attempts}</td><td className="p-2 text-center">{row.full}</td>
      <td className="p-2 text-center">{row.zero}</td><td className="p-2 text-center">{row.unassessable}</td>
      <td className="p-2 text-center">{row.unknownHelp}</td>
     </tr>)}</tbody></table></div>
    <p className="text-xs text-neutral-500" data-testid="gusek-r15c-count">Eddig {r15cPlan.totals.observed} ellenőrzött kísérlet alapján.</p>
    <p className="text-xs text-neutral-500">{r15cPlan.caveat}</p>
    <button type="button" data-testid="gusek-r15d-activate" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={()=>{
     const candidate=r15dCreateRun(r15cPlan);
     if(candidate)setR15dRun(candidate);
    }}>{r15dRun?'Új gyakorlatsor indítása (az eddigi követés felülíródik)':'Gyakorlatsor követésének indítása'}</button>
   </section>}
   <div className="flex flex-wrap gap-4"><button className="text-sm underline" data-testid="gusek-r15e-correct" onClick={()=>{
     setR15dRun(old=>r15ePrepareCorrection(old,grade.taskId));
     setGrade(null);
    }}>Javítom és újra beadom</button>
    {linkedChat&&embedded&&onRequestCoaching&&<button className="text-sm underline" onClick={onRequestCoaching}>Hibajavítás a tanítóval</button>}
    <button className="text-sm underline" onClick={()=>{taskRequestEpoch.current++;invalidateForm();setBusy(false);setR15dRun(old=>r15dPauseRun(old));setSeed(String((Number(seed)+1)>>>0));setTask(null);}}>Új variáns kiválasztása</button>
   </div>
  </section>}
  <section className="space-y-2 rounded-xl border p-3 xl:col-span-2" data-testid="gusek-r15e-bookmark" aria-label="Gyakorlatsor mentése és visszaállítása">
   <p className="text-sm font-semibold">Feladatterv könyvjelzője (R15E)</p>
   <p className="text-xs text-neutral-500">Csak a három feladattípus és variáns kerül a böngészőlap ideiglenes tárhelyére. Beadások, pontok és megoldások nem. Visszaállítás után az előrehaladás nulláról indul. Már beadott eredmények mellett először kézzel zárd le a jelenlegi követést.</p>
   {r15eHasBookmark&&<button type="button" data-testid="gusek-r15e-restore" disabled={busy||(r15dProgress?.attempts??0)>0} className="rounded border px-3 py-2 text-sm" onClick={r15eLoadPlan}>Mentett terv visszaállítása (pontok nélkül)</button>}
   {r15eNotice&&<p role="status" className="text-xs text-neutral-600" data-testid="gusek-r15e-notice">{r15eNotice}</p>}
  </section>
  {r15dRun&&r15dProgress&&<section className="space-y-3 rounded-xl border p-4 xl:col-span-2" data-testid="gusek-r15d-run" data-active={r15dRun.active??'none'} data-ready={String(r15dRun.ready)} aria-label="Aktív követett gyakorlatsor">
   <h2 className="font-semibold">Aktív háromállomásos gyakorlatsor</h2>
   <p className="text-sm" data-testid="gusek-r15d-progress">Beadással érintett állomások: {r15dProgress.attemptedStations}/3 · 1/1 eredményű állomások: {r15dProgress.fullCreditStations}/3 · ellenőrzött beadások: {r15dProgress.attempts}</p>
   <ol className="space-y-2" data-testid="gusek-r15d-stations">
    {r15dRun.steps.map(item=><li key={item.position} data-testid={'gusek-r15d-step-'+item.position} data-status={item.status} data-attempts={item.attempts} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
     <div className="space-y-1">
      <p className="text-sm font-semibold">{item.position}. {item.title} – {item.label} · {item.seed}. variáns</p>
      <p className="text-xs text-neutral-500">Állapot: {item.status==='pending'?'még nem választottad ki':item.status==='selected'?'kiválasztva, nincs betöltve':item.status==='loaded'?'feladat betöltve':item.status==='zero'?'0/1, javítható':item.status==='unassessable'?'nem értékelhető':'1/1 ellenőrzött eredmény'} · beadások: {item.attempts}</p>
     </div>
     <button type="button" data-testid={'gusek-r15d-select-'+item.position} disabled={busy||!r15dCanSelect(r15dRun,item.position)} className="rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={()=>{
      if(!r15dCanSelect(r15dRun,item.position))return;
      taskRequestEpoch.current++;invalidateForm();setBusy(false);
      setR15dRun(old=>r15dSelectRunStep(old,item.position));
      setKind(item.kind as Kind);setSeed(String(item.seed));setTask(null);
     }}>{item.attempts>0?'Állomás újrapróbálása':'Állomás kiválasztása'}</button>
    </li>)}
   </ol>
   <p className="text-xs text-neutral-500">{r15dRun.caveat}</p>
   <p className="text-xs text-neutral-500" data-testid="gusek-r15e-paused">{r15dRun.active===null?'Szünetel: válassz egy feloldott állomást, majd külön indítsd a feladatot.':'Követés aktív, külön szüneteltethető.'}</p>
   <div className="flex flex-wrap gap-2">
    <button type="button" data-testid="gusek-r15e-save" className="rounded border px-3 py-2 text-sm" onClick={r15eSavePlan}>Terv mentése a böngészőlapra</button>
    <button type="button" data-testid="gusek-r15e-pause" disabled={r15dRun.active===null} className="rounded border px-3 py-2 text-sm disabled:opacity-50" onClick={()=>{taskRequestEpoch.current++;invalidateForm();setTask(null);setR15dRun(old=>r15dPauseRun(old));}}>Követés szüneteltetése</button>
   </div>
   <button type="button" data-testid="gusek-r15d-stop" className="rounded border px-3 py-2 text-sm" onClick={()=>setR15dRun(null)}>Követés lezárása (kézzel)</button>
  </section>}
  {linkedChat&&<section className="rounded-xl border p-4 xl:col-span-2"><h2 className="font-semibold">Korábbi ellenőrzött kísérletek ({history.length})</h2><ul className="mt-2 space-y-1 text-sm">{history.slice(-12).reverse().map(a=><li key={a.id}>{a.taskId}: {a.points===null?'nem értékelhető':`${a.points}/1`} · {new Date(a.submittedAt).toLocaleString('hu-HU')}</li>)}</ul></section>}
  {error&&<p role="alert" className="rounded border border-red-500 p-3 text-red-600">{error}</p>}
 </div>;
}
