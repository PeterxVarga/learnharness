'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';

type Kind='transport'|'froccs'|'tablet';
type Task={id:string;kind:Kind;taskType:string;variableNames:string[];objectiveSense:'min'|'max';
 supply?:number[];demand?:number[];costs?:number[][];capacities?:number[][];
 labels?:string[];wine?:number[];soda?:number[];prices?:number[];availableWine?:number;availableSoda?:number;
 target?:number;maxTablets?:number;knowledge?:number[]};
type Grade={id?:string;taskId:string;points:0|1|null;maxPoints:1;correct:boolean|null;errors:string[]};
type Attempt=Grade&{id:string;submittedAt:string};
type GlpkResult={status:string;code:string;graded:false;points:null;diagnostic?:string;solutionListing?:string|null;solverStatus?:string;objective?:number|null;statusCode?:string;mode?:'solve'|'check';error?:string};
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
 const [grade,setGrade]=useState<Grade|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [linkedChat,setLinkedChat]=useState<string|null>(null),[history,setHistory]=useState<Attempt[]>([]);
 const [binding,setBinding]=useState<'checking'|'ready'|'none'|'failed'>('checking');
 const pending=useRef<{fingerprint:string;id:string}|null>(null);
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
 async function newTask(){
  setBusy(true);setTask(null);setGrade(null);setError('');
  try{
   if(!/^(0|[1-9]\d{0,9})$/.test(seed)||Number(seed)>4294967295)throw Error('Hibás feladatvariáns.');
   const r=await fetch(`/api/pilot/gusek?kind=${kind}&seed=${seed}`,{cache:'no-store'}),x=await r.json();
   if(!r.ok)throw Error(x.error??'Feladat nem érhető el.');
   const t=x.task as Task;
   const indexed=kind==='transport'&&transportDialect==='indexed';
   const preset=x.indexed as {starter?:string;dataTemplate?:string}|undefined;
   if(indexed&&(!preset?.starter||!preset.dataTemplate))throw Error('Indexelt feladatminta nem érhető el.');
   setTask(t);
   setSource(indexed?preset!.starter!:'# GUSEK / GNU MathProg modell (.mod)\n# var, s.t., minimize/maximize; a solve; és end; opcionális.\n\n');
   setValues(indexed?JSON.stringify(Object.fromEntries(
    Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>[`x[${i+1},${j+1}]`,0])).flat()
   ),null,2):starter(t.variableNames));
   setObjective('');setHints(false);setDataFile(indexed?preset!.dataTemplate!:'');setNativeResult(null);setNativeError('');pending.current=null;
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 async function runNative(mode:'solve'|'check'){
  // Diagnostic-only execution: NEVER writes to the authoritative score ledger.
  if(!nativeAvailable||nativeBusy||!task)return;
  setNativeBusy(true);setNativeResult(null);setNativeError('');
  try{
   if(!/^[a-f0-9]{64}$/.test(nativeToken))throw Error('Adj meg egy 64 karakteres, helyi GLPK tokent.');
   if(!source.trim()||source.length>65536||dataFile.length>65536)throw Error('A modell vagy az adatfájl hiányzik, illetve túl nagy.');
   const r=await fetch('/api/pilot/gusek/native',{method:'POST',cache:'no-store',
    headers:{'Content-Type':'application/json','X-LH-GLPK-Token':nativeToken},
    body:JSON.stringify({model:source,data:dataFile,mode})});
   const result=await r.json() as GlpkResult;
   if(!r.ok&&result.status!=='BLOCKED')throw Error(result.error??'GLPK-kérés sikertelen.');
   if(result.graded!==false||result.points!==null)throw Error('Érvénytelen GLPK-diagnosztikai válasz.');
   setNativeResult(result);
  }catch(e){setNativeError(e instanceof Error?e.message:String(e));}
  finally{setNativeBusy(false);}
 }
 async function check(){
  if(!task||binding==='failed'||binding==='checking')return;
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
   setGrade(out);if(linkedChat)setHistory(old=>[...old.filter(a=>a.id!==out.id),out as Attempt]);
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 }
 return <div data-testid="gusek-exam-r13" className="mx-auto max-w-5xl space-y-5 px-5 py-6">
  <header className="space-y-2"><p className="text-xs uppercase tracking-widest text-neutral-500">LearnHarness · R13 · GUSEK / GNU MathProg</p>
   <h1 className="text-3xl font-semibold">Vizsgagyakorló – GUSEK szintaxis</h1>
   <p className="text-sm text-neutral-500">A beadott .mod szöveget a rendszer <strong>nem futtatja</strong>, hanem korlátozott, biztonságos nyelvtani és matematikai ellenőrzéssel értékeli. Helyes teljes modell és optimum: 1 pont. Más: 0 pont vagy nem értékelhető. Nincs részpont.</p>
   {!embedded&&<Link className="text-sm underline" href={linkedChat?`/chat/${linkedChat}`:'/chat/new?mode=practice'}>Vissza a Practice beszélgetéshez</Link>}
  </header>
  <section className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
    <label className="text-sm">Feladattípus<select aria-label="Feladattípus" className="mt-1 block rounded border bg-background p-2" value={kind} onChange={e=>{setKind(e.target.value as Kind);setTask(null);setGrade(null);}}>
      <option value="transport">Szállítási minimum</option><option value="froccs">Fröccs – maximum (egész)</option><option value="tablet">Tabletták – minimum (folytonos)</option>
    </select></label>
    {kind==='transport'&&<label className="text-sm">MathProg felírás
     <select data-testid="gusek-transport-dialect-r14" aria-label="MathProg felírás" value={transportDialect}
      onChange={e=>{setTransportDialect(e.target.value as 'scalar'|'indexed');setTask(null);setGrade(null);setNativeResult(null);}}
      className="mt-1 block rounded border bg-background p-2">
      <option value="scalar">Skalár változók (R13)</option>
      <option value="indexed">Indexelt x[i,j] + .dat (R14)</option>
     </select>
    </label>}
    <label className="text-sm">Feladatvariáns<input aria-label="Feladatvariáns" className="mt-1 block w-36 rounded border bg-background p-2" value={seed} onChange={e=>{setSeed(e.target.value);setTask(null);setGrade(null);}}/></label>
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
    <textarea id="gusek-source" className="h-72 w-full rounded border bg-transparent p-3 font-mono text-sm" value={source} spellCheck={false} onChange={e=>{setSource(e.target.value);setGrade(null);setNativeResult(null);}}/>
    <p className="text-xs text-neutral-500">A pontozó a három szintetikus skalár vizsgatípust és a <strong>3×3 indexelt szállítási modell egy ellenőrzött MathProg-résznyelvét</strong> támogatja. Az általános indexelt GNU MathProg továbbra is nem értékelhető lehet. A natív GLPK diagnosztika külön működik, a konzolkimenet nem bizonyít helyes feladatmodellezést és nem ad automatikus pontot.</p>
    {task.kind==='transport'&&transportDialect==='indexed'&&<p data-testid="gusek-indexed-guidance-r14" className="text-xs text-neutral-500">Az indexelt mintában a célfüggvényt és a két egyensúlyi feltételt neked kell megírnod. A .dat a feladat ellenőrzött adatait tartalmazza; a pontozás mindig a szerveroldali feladatot használja, nem a kézzel módosított .dat tartalmát. A változóértékeket x[1,1]…x[3,3] kulcsokkal add meg.</p>}
    <section data-testid="gusek-native-r14" className="space-y-3 rounded-lg border p-3" aria-label="Natív GNU GLPK futtatás">
     <h3 className="font-semibold">GNU GLPK – eredeti MathProg-futtatás (R14)</h3>
     <label htmlFor="gusek-data" className="block text-sm">Opcionális adatfájl (.dat)</label>
     <textarea id="gusek-data" className="h-32 w-full rounded border bg-transparent p-3 font-mono text-sm" spellCheck={false} value={dataFile} onChange={e=>{setDataFile(e.target.value);setNativeResult(null);}} placeholder="data; ... end;" />
     {nativeAvailable?<>
      <label htmlFor="gusek-native-token" className="block text-sm">Helyi futtatási token (nem mentjük az előzményekbe)</label>
      <input id="gusek-native-token" type="password" autoComplete="off" spellCheck={false} value={nativeToken} onChange={e=>setNativeToken(e.target.value)} className="w-full rounded border bg-transparent p-2 font-mono text-sm" placeholder="64 karakteres hex token"/>
      <div className="flex flex-wrap gap-2">
       <button type="button" data-testid="gusek-native-check-r14" disabled={nativeBusy||busy||nativeToken.length!==64} onClick={()=>void runNative('check')} className="rounded border px-3 py-2 text-sm disabled:opacity-50">MathProg ellenőrzése</button>
       <button type="button" data-testid="gusek-native-solve-r14" disabled={nativeBusy||busy||nativeToken.length!==64} onClick={()=>void runNative('solve')} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Megoldás futtatása GLPK-val</button>
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
      {nativeResult.solutionListing&&<>
       <h4 className="text-sm font-semibold">GLPK-megoldás: célfüggvény, korlátok és változók</h4>
       <pre data-testid="gusek-native-solution-r14" className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-3 font-mono text-xs text-neutral-900">{nativeResult.solutionListing}</pre>
      </>}
     </div>}
    </section>
    <label htmlFor="gusek-values" className="block font-semibold">Megoldó által kiszámított változóértékek (JSON)</label>
    <textarea id="gusek-values" className="h-40 w-full rounded border bg-transparent p-3 font-mono text-sm" value={values} spellCheck={false} onChange={e=>{setValues(e.target.value);setGrade(null);}}/>
    <label htmlFor="gusek-objective" className="block font-semibold">{task.objectiveSense==='max'?'Maximális bevétel':'Minimális célfüggvényérték'}</label>
    <input id="gusek-objective" inputMode="decimal" className="w-full rounded border bg-transparent p-2" value={objective} onChange={e=>{setObjective(e.target.value);setGrade(null);}}/>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={hints} onChange={e=>{setHints(e.target.checked);setGrade(null);}}/> Használtam segítséget</label>
    <button disabled={busy||binding==='checking'||binding==='failed'} onClick={()=>void check()} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">Teljes megoldás ellenőrzése</button>
  </section>}
  {grade&&<section role="status" className="space-y-2 rounded-xl border p-4"><h2 className="text-xl font-semibold">{grade.points===null?'NEM ÉRTÉKELHETŐ':`${grade.points}/1`} – {grade.points===1?'TELJESEN HELYES':grade.points===0?'HIBÁS VAGY HIÁNYOS':'NEM TÁMOGATOTT FORMA'}</h2>
   {grade.errors.map(x=><p key={x} className="text-sm">{errorsHu[x]??`Ellenőrzési kód: ${x}`}</p>)}
   <p className="text-xs text-neutral-500">A pontszám kizárólag a független szerveroldali vizsgapontozóból származik. A natív GLPK futtatás diagnosztikája nem módosítja.</p>
   <div className="flex flex-wrap gap-4"><button className="text-sm underline" onClick={()=>setGrade(null)}>Javítom és újra beadom</button>
    {linkedChat&&embedded&&onRequestCoaching&&<button className="text-sm underline" onClick={onRequestCoaching}>Hibajavítás a tanítóval</button>}
    <button className="text-sm underline" onClick={()=>{setSeed(String((Number(seed)+1)>>>0));setTask(null);setGrade(null);}}>Új variáns kiválasztása</button>
   </div>
  </section>}
  {linkedChat&&<section className="rounded-xl border p-4"><h2 className="font-semibold">Korábbi ellenőrzött kísérletek ({history.length})</h2><ul className="mt-2 space-y-1 text-sm">{history.slice(-12).reverse().map(a=><li key={a.id}>{a.taskId}: {a.points===null?'nem értékelhető':`${a.points}/1`} · {new Date(a.submittedAt).toLocaleString('hu-HU')}</li>)}</ul></section>}
  {error&&<p role="alert" className="rounded border border-red-500 p-3 text-red-600">{error}</p>}
 </div>;
}
