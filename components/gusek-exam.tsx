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
 const [source,setSource]=useState(''),[values,setValues]=useState(''),[objective,setObjective]=useState(''),[hints,setHints]=useState(false);
 const [grade,setGrade]=useState<Grade|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [linkedChat,setLinkedChat]=useState<string|null>(null),[history,setHistory]=useState<Attempt[]>([]);
 const [binding,setBinding]=useState<'checking'|'ready'|'none'|'failed'>('checking');
 const pending=useRef<{fingerprint:string;id:string}|null>(null);
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
   setTask(t);setSource('# GUSEK / GNU MathProg modell (.mod)\n# var, s.t., minimize/maximize; a solve; és end; opcionális.\n\n');
   setValues(starter(t.variableNames));setObjective('');setHints(false);pending.current=null;
  }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
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
    <textarea id="gusek-source" className="h-72 w-full rounded border bg-transparent p-3 font-mono text-sm" value={source} spellCheck={false} onChange={e=>{setSource(e.target.value);setGrade(null);}}/>
    <p className="text-xs text-neutral-500">Támogatott: névvel ellátott skalár var, integer, ≥, ≤, =, s.t., minimize/maximize, lineáris összegek és zárójelek; opcionális solve/end. Az indexelt set/param/sum és a GUSEK teljes nyelve még nem támogatott – ezeket nem értékelhetőnek jelöljük.</p>
    <label htmlFor="gusek-values" className="block font-semibold">Megoldó által kiszámított változóértékek (JSON)</label>
    <textarea id="gusek-values" className="h-40 w-full rounded border bg-transparent p-3 font-mono text-sm" value={values} spellCheck={false} onChange={e=>{setValues(e.target.value);setGrade(null);}}/>
    <label htmlFor="gusek-objective" className="block font-semibold">{task.objectiveSense==='max'?'Maximális bevétel':'Minimális célfüggvényérték'}</label>
    <input id="gusek-objective" inputMode="decimal" className="w-full rounded border bg-transparent p-2" value={objective} onChange={e=>{setObjective(e.target.value);setGrade(null);}}/>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={hints} onChange={e=>{setHints(e.target.checked);setGrade(null);}}/> Használtam segítséget</label>
    <button disabled={busy||binding==='checking'||binding==='failed'} onClick={()=>void check()} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">Teljes megoldás ellenőrzése</button>
  </section>}
  {grade&&<section role="status" className="space-y-2 rounded-xl border p-4"><h2 className="text-xl font-semibold">{grade.points===null?'NEM ÉRTÉKELHETŐ':`${grade.points}/1`} – {grade.points===1?'TELJESEN HELYES':grade.points===0?'HIBÁS VAGY HIÁNYOS':'NEM TÁMOGATOTT FORMA'}</h2>
   {grade.errors.map(x=><p key={x} className="text-sm">{errorsHu[x]??`Ellenőrzési kód: ${x}`}</p>)}
   <p className="text-xs text-neutral-500">Az értékelés nem AI-jóslat, hanem korlátozott, reprodukálható szerveroldali ellenőrzés.</p>
   <div className="flex flex-wrap gap-4"><button className="text-sm underline" onClick={()=>setGrade(null)}>Javítom és újra beadom</button>
    {linkedChat&&embedded&&onRequestCoaching&&<button className="text-sm underline" onClick={onRequestCoaching}>Hibajavítás a tanítóval</button>}
    <button className="text-sm underline" onClick={()=>{setSeed(String((Number(seed)+1)>>>0));setTask(null);setGrade(null);}}>Új variáns kiválasztása</button>
   </div>
  </section>}
  {linkedChat&&<section className="rounded-xl border p-4"><h2 className="font-semibold">Korábbi ellenőrzött kísérletek ({history.length})</h2><ul className="mt-2 space-y-1 text-sm">{history.slice(-12).reverse().map(a=><li key={a.id}>{a.taskId}: {a.points===null?'nem értékelhető':`${a.points}/1`} · {new Date(a.submittedAt).toLocaleString('hu-HU')}</li>)}</ul></section>}
  {error&&<p role="alert" className="rounded border border-red-500 p-3 text-red-600">{error}</p>}
 </div>;
}
