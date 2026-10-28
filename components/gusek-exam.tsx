'use client';
import {useEffect,useRef,useState} from 'react';
import type {ChangeEvent,KeyboardEvent} from 'react';
import Link from 'next/link';
import {GmplEditor} from './gusek-gmpl-editor';
import {glpkDiagnosticLine,validateWorkbenchFile} from '../src/features/gusek/workspace-files.mjs';
import {preparePracticeTransfer} from '../pilots/operations-research/gusek-practice-transfer-r14.mjs';
import {readGusekPracticeDraft,saveGusekPracticeDraft} from '../src/features/gusek/browser-drafts';

type Kind='transport'|'froccs'|'tablet';
type Task={id:string;kind:Kind;taskType:string;variableNames:string[];objectiveSense:'min'|'max';
 supply?:number[];demand?:number[];costs?:number[][];capacities?:number[][];
 labels?:string[];wine?:number[];soda?:number[];prices?:number[];availableWine?:number;availableSoda?:number;
 target?:number;maxTablets?:number;knowledge?:number[]};
type Grade={id?:string;taskId:string;points:0|1|null;maxPoints:1;correct:boolean|null;errors:string[]};
type Attempt=Grade&{id:string;submittedAt:string};
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
export function GusekExam({chatId,embedded=false,onRequestCoaching}:{chatId?:string;embedded?:boolean;onRequestCoaching?:()=>void}){
 const [kind,setKind]=useState<Kind>('transport'),[seed,setSeed]=useState('42'),[task,setTask]=useState<Task|null>(null);
 const [transportDialect,setTransportDialect]=useState<'scalar'|'indexed'>('scalar');
 const [source,setSource]=useState(''),[values,setValues]=useState(''),[objective,setObjective]=useState(''),[hints,setHints]=useState(false);
 const [dataFile,setDataFile]=useState(''),[nativeToken,setNativeToken]=useState('');
 const [nativeAvailable,setNativeAvailable]=useState(false),[nativeBusy,setNativeBusy]=useState(false);
 const [nativeResult,setNativeResult]=useState<GlpkResult|null>(null),[nativeError,setNativeError]=useState('');
 const [nativeSnapshot,setNativeSnapshot]=useState<{taskId:string;model:string;data:string}|null>(null);
 const [grade,setGrade]=useState<Grade|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [linkedChat,setLinkedChat]=useState<string|null>(null),[history,setHistory]=useState<Attempt[]>([]);
 const [binding,setBinding]=useState<'checking'|'ready'|'none'|'failed'>('checking');
 const pending=useRef<{fingerprint:string;id:string}|null>(null);
 const taskRequestEpoch=useRef(0),formEpoch=useRef(0);
 const [draftState,setDraftState]=useState<'loading'|'restored'|'saved'|'unavailable'|'idle'>('idle');
 function invalidateForm(){
  formEpoch.current++;
  nativeAbort.current?.abort();
  setGrade(null);setNativeResult(null);setNativeSnapshot(null);
 }
 const uploadModel=useRef<HTMLInputElement|null>(null);
 const nativeAbort=useRef<AbortController|null>(null);
 const [nativeCancelling,setNativeCancelling]=useState(false);
 const nativeDiagnostic=glpkDiagnosticLine(nativeResult?.diagnostic??'');
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
   if(indexed&&(!preset?.starter||!preset.dataTemplate))throw Error('Indexelt feladatminta nem érhető el.');
   const defaultModel=indexed?preset!.starter!:'# GUSEK / GNU MathProg modell (.mod)\n# var, s.t., minimize/maximize; a solve; és end; opcionális.\n\n';
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
   setSource(restored?.model??defaultModel);
   setValues(restored?.values??initialValues);
   setObjective(restored?.objective??'');setHints(restored?.hintsUsed??false);
   setDataFile(indexed?preset!.dataTemplate!:'');setNativeResult(null);setNativeSnapshot(null);setNativeError('');pending.current=null;
   setDraftState(storageFailed?'unavailable':restored?'restored':'idle');
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
  if(!file.name.toLowerCase().endsWith('.mod')||file.size>65536){
   setError('Csak legfeljebb 64 KiB méretű .mod fájl tölthető be.');return;
  }
  try{
   const text=await file.text();
   if(!validateWorkbenchFile('model.mod',text).ok)throw Error('Érvénytelen vagy túl nagy MathProg-fájl.');
   invalidateForm();setSource(text);setError('');
  }catch(e){setError(e instanceof Error?e.message:'Nem sikerült megnyitni a .mod fájlt.');}
 }
 async function runNative(mode:'solve'|'check'){
  // Diagnostic-only execution: NEVER writes to the authoritative score ledger.
  if(!nativeAvailable||nativeBusy||!task)return;
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
  finally{if(nativeAbort.current===controller)nativeAbort.current=null;setNativeBusy(false);setNativeCancelling(false);}
 }
 function editorShortcut(e:KeyboardEvent<HTMLTextAreaElement>){
  if(!(e.ctrlKey||e.metaKey)||e.key!=='Enter')return;
  e.preventDefault();
  if(e.shiftKey)void check();else void runNative('solve');
 }
 async function check(){
  if(!task||busy||binding==='failed'||binding==='checking')return;
  const startedAt=formEpoch.current;
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
   if(linkedChat)setHistory(old=>[...old.filter(a=>a.id!==out.id),out as Attempt]);
   if(startedAt===formEpoch.current)setGrade(out);
  }catch(e){if(startedAt===formEpoch.current)setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 return <div data-testid="gusek-exam-r13" className="mx-auto max-w-5xl space-y-5 px-5 py-6">
  <header className="space-y-2"><p className="text-xs uppercase tracking-widest text-neutral-500">LearnHarness · R13 · GUSEK / GNU MathProg</p>
   <h1 className="text-3xl font-semibold">Vizsgagyakorló – GUSEK szintaxis</h1>
   <p className="text-sm text-neutral-500">A beadott .mod szöveget a rendszer <strong>nem futtatja</strong>, hanem korlátozott, biztonságos nyelvtani és matematikai ellenőrzéssel értékeli. Helyes teljes modell és optimum: 1 pont. Más: 0 pont vagy nem értékelhető. Nincs részpont.</p>
   {!embedded&&<Link className="text-sm underline" href={linkedChat?`/chat/${linkedChat}`:'/chat/new?mode=practice'}>Vissza a Practice beszélgetéshez</Link>}
  </header>
  <section className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
    <label className="text-sm">Feladattípus<select aria-label="Feladattípus" className="mt-1 block rounded border bg-background p-2" value={kind} onChange={e=>{taskRequestEpoch.current++;invalidateForm();setBusy(false);setKind(e.target.value as Kind);setTask(null);}}>
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
    <label className="text-sm">Feladatvariáns<input aria-label="Feladatvariáns" className="mt-1 block w-36 rounded border bg-background p-2" value={seed} onChange={e=>{taskRequestEpoch.current++;invalidateForm();setBusy(false);setSeed(e.target.value);setTask(null);}}/></label>
    <button disabled={busy} onClick={()=>void newTask()} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">Új feladat</button>
  </section>
  {task&&<section aria-label="Vizsgafeladat" className="space-y-3 rounded-xl border p-5">
    <h2 className="text-xl font-semibold">{task.taskType} · {task.id}</h2>
    {task.kind==='transport'?<><p>Optimalizáld a három raktárból három boltba történő szállítást. Minden változó nemnegatív egész. Az első raktár harmadik útvonala korlátozott.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Raktár</th><th>Bolt 1</th><th>Bolt 2</th><th>Bolt 3</th><th>Kínálat</th></tr></thead><tbody>{task.costs?.map((row,i)=><tr key={i} className="border-t"><th>{i+1}</th>{row.map((cost,j)=><td key={j} className="p-2 text-center">{cost}{i===0&&j===2&&<small className="block">max. {task.capacities?.[0]?.[2]}</small>}</td>)}<td className="text-center">{task.supply?.[i]}</td></tr>)}<tr className="border-t"><th>Kereslet</th>{task.demand?.map((d,j)=><td key={j} className="text-center">{d}</td>)}</tr></tbody></table></div></>
    :task.kind==='froccs'?<><p>Maximalizáld a bevételt, ha legfeljebb {task.availableWine} egység bor és {task.availableSoda} egység szóda áll rendelkezésre. A termékek darabszáma egész.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Termék</th><th>Változó</th><th>Bor</th><th>Szóda</th><th>Bevétel</th></tr></thead><tbody>{task.variableNames.map((n,i)=><tr className="border-t" key={n}><td>{task.labels?.[i]}</td><td>{n}</td><td>{task.wine?.[i]}</td><td>{task.soda?.[i]}</td><td>{task.prices?.[i]}</td></tr>)}</tbody></table></div></>
    :<p>Minimális vásárlási költség: {task.variableNames[0]} ({task.prices?.[0]} Ft, +{task.knowledge?.[0]} tudásegység), {task.variableNames[1]} ({task.prices?.[1]} Ft, +{task.knowledge?.[1]} tudásegység). Legalább {task.target} tudásegység szükséges; összesen legfeljebb {task.maxTablets} tabletta, és legalább annyi epres, mint spenótos. Folytonos változókat használj.</p>}
    <p className="text-xs text-neutral-500">Szükséges változónevek: {task.variableNames.join(', ')}. Az optimális megoldást nem fedjük fel.</p>
  </section>}
  {task&&<section className="space-y-3 rounded-xl border p-5">
    <label htmlFor="gusek-source" className="block font-semibold">GUSEK / MathProg modell (.mod)</label>
    <div className="flex flex-wrap gap-2">
     <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>uploadModel.current?.click()}>.mod importálása</button>
     <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>exportPracticeFile('model.mod',source)}>.mod letöltése</button>
     {dataFile&&<button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>exportPracticeFile('data.dat',dataFile)}>.dat letöltése</button>}
     <input type="file" ref={uploadModel} accept=".mod" className="hidden" aria-label="MathProg modell megnyitása" onChange={e=>void importPracticeModel(e)}/>
    </div>
    <GmplEditor id="gusek-source" testId="gusek-exam-source-r14"
     label="GUSEK / MathProg modell (.mod)" value={source}
     onKeyDown={editorShortcut}
     diagnosticLine={nativeDiagnostic?.file==='model.mod'?nativeDiagnostic.line:null}
     onChange={next=>{invalidateForm();setSource(next);}} />
    <p className="text-xs text-neutral-500">Ctrl+Enter: GLPK-futtatás · Ctrl+Shift+Enter: teljes megoldás ellenőrzése.</p>
    <p className="text-xs text-neutral-500">A pontozó a három szintetikus skalár vizsgatípust és a <strong>3×3 indexelt szállítási modell egy ellenőrzött MathProg-résznyelvét</strong> támogatja. Az általános indexelt GNU MathProg továbbra is nem értékelhető lehet. A natív GLPK diagnosztika külön működik, a konzolkimenet nem bizonyít helyes feladatmodellezést és nem ad automatikus pontot.</p>
    {task.kind==='transport'&&transportDialect==='indexed'&&<p data-testid="gusek-indexed-guidance-r14" className="text-xs text-neutral-500">Az indexelt mintában a célfüggvényt és a két egyensúlyi feltételt neked kell megírnod. A .dat a feladat ellenőrzött adatait tartalmazza; a pontozás mindig a szerveroldali feladatot használja, nem a kézzel módosított .dat tartalmát. A változóértékeket x[1,1]…x[3,3] kulcsokkal add meg.</p>}
    <section data-testid="gusek-native-r14" className="space-y-3 rounded-lg border p-3" aria-label="Natív GNU GLPK futtatás">
     <h3 className="font-semibold">GNU GLPK – eredeti MathProg-futtatás (R14)</h3>
     <label htmlFor="gusek-data" className="block text-sm">Feladatadatok (.dat) – vizsgamódban csak olvasható</label>
     <GmplEditor id="gusek-data" testId="gusek-exam-data-r14"
      label="Feladatadatok (.dat)" value={dataFile} readOnly
      diagnosticLine={nativeDiagnostic?.file==='data.dat'?nativeDiagnostic.line:null}
      onChange={()=>{}} rows={5} placeholder="A feladat nem igényel külön .dat fájlt." />
     <p className="text-xs text-neutral-500">A feladat szerveroldali adatai nem módosíthatók. Saját adatokhoz válts a Szabad munkaterületre.</p>
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
        if(!transfer.ok){setNativeError('A GLPK-eredmény nem vehető át: '+transfer.code);return;}
        formEpoch.current++;setValues(JSON.stringify(transfer.values,null,2));setObjective(String(transfer.objective));setGrade(null);
       }} className="rounded border px-3 py-2 text-sm disabled:opacity-50">
       Optimális GLPK-megoldás átvétele a beadáshoz
      </button>}
      {nativeResult.solutionListing&&<>
       <h4 className="text-sm font-semibold">GLPK-megoldás: célfüggvény, korlátok és változók</h4>
       <pre data-testid="gusek-native-solution-r14" className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 font-mono text-xs text-neutral-900">{nativeResult.solutionListing}</pre>
      </>}
     </div>}
    </section>
    <label htmlFor="gusek-values" className="block font-semibold">Megoldó által kiszámított változóértékek (JSON)</label>
    <textarea id="gusek-values" className="h-40 w-full rounded border bg-transparent p-3 font-mono text-sm" value={values} spellCheck={false} onChange={e=>{formEpoch.current++;setValues(e.target.value);setGrade(null);}}/>
    <label htmlFor="gusek-objective" className="block font-semibold">{task.objectiveSense==='max'?'Maximális bevétel':'Minimális célfüggvényérték'}</label>
    <input id="gusek-objective" inputMode="decimal" className="w-full rounded border bg-transparent p-2" value={objective} onChange={e=>{formEpoch.current++;setObjective(e.target.value);setGrade(null);}}/>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={hints} onChange={e=>{formEpoch.current++;setHints(e.target.checked);setGrade(null);}}/> Használtam segítséget</label>
    <button disabled={busy||binding==='checking'||binding==='failed'} onClick={()=>void check()} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">Teljes megoldás ellenőrzése</button>
  </section>}
  {task&&<p data-testid="gusek-practice-draft-status-r14z" className="text-xs text-neutral-500">Piszkozat: {draftState==='restored'?'helyi mentés visszaállítva':draftState==='saved'?'helyben mentve':draftState==='unavailable'?'a helyi mentés nem elérhető':'mentés folyamatban'}</p>}
  {grade&&<section role="status" className="space-y-2 rounded-xl border p-4"><h2 className="text-xl font-semibold">{grade.points===null?'NEM ÉRTÉKELHETŐ':`${grade.points}/1`} – {grade.points===1?'TELJESEN HELYES':grade.points===0?'HIBÁS VAGY HIÁNYOS':'NEM TÁMOGATOTT FORMA'}</h2>
   {grade.errors.map(x=><p key={x} className="text-sm">{errorsHu[x]??`Ellenőrzési kód: ${x}`}</p>)}
   <p className="text-xs text-neutral-500">A pontszám kizárólag a független szerveroldali vizsgapontozóból származik. A natív GLPK futtatás diagnosztikája nem módosítja.</p>
   <div className="flex flex-wrap gap-4"><button className="text-sm underline" onClick={()=>setGrade(null)}>Javítom és újra beadom</button>
    {linkedChat&&embedded&&onRequestCoaching&&<button className="text-sm underline" onClick={onRequestCoaching}>Hibajavítás a tanítóval</button>}
    <button className="text-sm underline" onClick={()=>{taskRequestEpoch.current++;invalidateForm();setBusy(false);setSeed(String((Number(seed)+1)>>>0));setTask(null);}}>Új variáns kiválasztása</button>
   </div>
  </section>}
  {linkedChat&&<section className="rounded-xl border p-4"><h2 className="font-semibold">Korábbi ellenőrzött kísérletek ({history.length})</h2><ul className="mt-2 space-y-1 text-sm">{history.slice(-12).reverse().map(a=><li key={a.id}>{a.taskId}: {a.points===null?'nem értékelhető':`${a.points}/1`} · {new Date(a.submittedAt).toLocaleString('hu-HU')}</li>)}</ul></section>}
  {error&&<p role="alert" className="rounded border border-red-500 p-3 text-red-600">{error}</p>}
 </div>;
}
