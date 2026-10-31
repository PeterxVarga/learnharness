'use client';
import {useRef,useState} from 'react';
import Link from 'next/link';
import {explainOrError} from '../domain/or-diagnostics-r1610.mjs';

type Kind='assignment'|'production';
type Task={id:string;kind:Kind;seed:number;title:string;statement:string;variableNames:string[];
 objectiveSense:'min'|'max';costs?:number[][];labels?:{rows:string[];columns:string[]};
 material?:number[];hours?:number[];profit?:number[];materialLimit?:number;hoursLimit?:number};
type Grade={taskId:string;points:0|1|null;errors:string[];status:string};
const endpoint='/api/pilot/gusek/szakmai';
/** No grading authority on client. No automatic solve, no exam ledger. */
export function TredvenOrDomain(){
 const [kind,setKind]=useState<Kind>('assignment');const [seed,setSeed]=useState('42');
 const [task,setTask]=useState<Task|null>(null);const [model,setModel]=useState('');
 const [values,setValues]=useState('');const [objective,setObjective]=useState('');
 const [hints,setHints]=useState(false);const [grade,setGrade]=useState<Grade|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const epoch=useRef(0);const active=useRef(false);
 const invalidate=()=>{epoch.current++;setGrade(null);setBusy(false);};
 const reset=()=>{invalidate();setTask(null);setModel('');setValues('');setObjective('');setError('');};
 async function load(){
  const ticket=++epoch.current;setBusy(true);setTask(null);setGrade(null);setError('');
  try{
   if(!/^(0|[1-9][0-9]{0,9})$/.test(seed)||Number(seed)>4294967295)throw Error('A variáns 0 és 4294967295 között lehet.');
   const r=await fetch(`${endpoint}?kind=${kind}&seed=${seed}`,{cache:'no-store'});
   const data=await r.json();if(!r.ok)throw Error(data.error??'A feladat nem érhető el.');
   if(ticket!==epoch.current)return;
   if(data.task?.id!==`or-${kind}-${seed}`||typeof data.starter!=='string')throw Error('Hibás feladatválasz.');
   setTask(data.task);setModel(data.starter);
   setValues(JSON.stringify(Object.fromEntries(data.task.variableNames.map((name:string)=>[name,0])),null,2));
   setObjective('');setHints(false);
  }catch(e){if(ticket===epoch.current)setError(e instanceof Error?e.message:String(e));}
  finally{if(ticket===epoch.current)setBusy(false);}
 }
 async function check(){
  if(!task||active.current)return;
  const ticket=epoch.current;active.current=true;setBusy(true);setError('');setGrade(null);
  try{
   if(objective.trim()===''||!Number.isFinite(Number(objective)))throw Error('Adj meg véges célfüggvényértéket.');
   const body={kind:task.kind,seed:String(task.seed),answer:{mathprog:model,values:JSON.parse(values),
    reportedObjective:Number(objective),hintsUsed:hints}};
   const r=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
   const data=await r.json();if(!r.ok)throw Error(data.error??'Sikertelen ellenőrzés.');
   if(data.taskId!==task.id||data.maxPoints!==1||![0,1,null].includes(data.points))throw Error('Érvénytelen szerverértékelés.');
   if(ticket===epoch.current)setGrade(data);
  }catch(e){if(ticket===epoch.current)setError(e instanceof Error?e.message:String(e));}
  finally{active.current=false;if(ticket===epoch.current)setBusy(false);}
 }
 return <main className="mx-auto max-w-5xl space-y-5 p-5">
  <Link className="text-sm underline" href="/pilot/gusek">← Vissza a GUSEK Workbenchhez</Link>
  <header className="space-y-2"><h1 className="text-3xl font-semibold">Operációkutatás – GUSEK szakmai gyakorló</h1>
   <p className="text-sm text-neutral-500">Két további, szintetikus, paraméterezett feladattípus. A feladatod: MathProg-modell, döntési változók és célfüggvényérték. Az ellenőrző nem futtatja a beadott kódot, és nincs részpont.</p></header>
  <section className="flex flex-wrap items-end gap-3 rounded border p-4">
   <label>Feladattípus<select className="ml-2 rounded border bg-background p-2" value={kind} onChange={e=>{setKind(e.target.value as Kind);reset();}}>
    <option value="assignment">3×3 hozzárendelés (bináris)</option><option value="production">Termeléstervezés (egész)</option></select></label>
   <label>Variáns<input className="ml-2 w-32 rounded border bg-background p-2" inputMode="numeric" value={seed} onChange={e=>{setSeed(e.target.value);reset();}}/></label>
   <button type="button" disabled={busy} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50" onClick={()=>void load()}>Feladat betöltése</button>
  </section>
  {task&&<><section className="space-y-3 rounded border p-4"><h2 className="text-xl font-semibold">{task.title}</h2><p>{task.statement}</p>
   {task.kind==='assignment'&&<><p>A táblázat az egyes munkatársak feladatonkénti szükséges munkaidejét mutatja.</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th scope="col">Munkatárs</th>{task.labels?.columns.map(x=><th scope="col" key={x}>{x}</th>)}</tr></thead>
     <tbody>{task.costs?.map((row,i)=><tr key={i}><th scope="row">{task.labels?.rows[i]}</th>{row.map((cost,j)=><td className="p-2 text-center" key={j}>{cost}</td>)}</tr>)}</tbody></table></div>
    <p className="text-sm">Minden munkatárs és minden feladat pontosan egyszer szerepeljen. Változók: {task.variableNames.join(', ')}.</p></>}
   {task.kind==='production'&&<><p>A korlátok és fajlagos nyereségek termékenként:</p>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Termék</th><th>Alapanyag/egység</th><th>Munkaóra/egység</th><th>Nyereség/egység</th></tr></thead>
     <tbody>{task.variableNames.map((name,i)=><tr key={name}><th>{name}</th><td className="text-center">{task.material?.[i]}</td><td className="text-center">{task.hours?.[i]}</td><td className="text-center">{task.profit?.[i]}</td></tr>)}</tbody></table></div>
    <p className="text-sm">Összes alapanyag: legfeljebb {task.materialLimit}; összes munkaóra: legfeljebb {task.hoursLimit}. A darabszámok nemnegatív egészek.</p></>}
   <section className="rounded border p-3 text-sm" aria-label="Önellenőrző modellezési kérdések">
    <p className="font-semibold">Önellenőrzés a beadás előtt</p>
    {task.kind==='assignment'?<ul className="list-disc space-y-1 pl-5">
      <li>Minden párosítási döntés pontosan 0 vagy 1 lehet?</li>
      <li>Minden munkatárs és minden feladat pontosan egyszer szerepel?</li>
      <li>A célfüggvény minden időadatot a megfelelő változóhoz párosít?</li>
    </ul>:<ul className="list-disc space-y-1 pl-5">
      <li>Mindkét erőforrásnak külön, megfelelő egységű korlátot írtál fel?</li>
      <li>A darabszámok nemnegatív egészek, és minden terv megengedett?</li>
      <li>A fajlagos nyereséget a megfelelő termékmennyiséggel szoroztad?</li>
    </ul>}
   </section>
   <p className="text-xs text-neutral-500">Töltsd ki magad a TODO részeket. A kezdőmodell nem tartalmazza a célfüggvény együtthatóit és a teljes kész modellt.</p></section>
   <section className="space-y-3 rounded border p-4"><label className="block font-semibold" htmlFor="or-model">MathProg-modell (.mod)</label>
    <textarea id="or-model" data-testid="or-model" spellCheck={false} className="min-h-72 w-full rounded border bg-transparent p-3 font-mono text-sm" value={model} onChange={e=>{invalidate();setModel(e.target.value);}}/>
    <label className="block font-semibold" htmlFor="or-values">Változóértékek (JSON)</label>
    <textarea id="or-values" data-testid="or-values" spellCheck={false} className="min-h-32 w-full rounded border bg-transparent p-3 font-mono text-sm" value={values} onChange={e=>{invalidate();setValues(e.target.value);}}/>
    <label className="block font-semibold" htmlFor="or-obj">Számított {task.objectiveSense==='min'?'minimum':'maximum'}</label>
    <input id="or-obj" className="w-full rounded border bg-transparent p-2" inputMode="decimal" value={objective} onChange={e=>{invalidate();setObjective(e.target.value);}}/>
    <label className="flex items-center gap-2"><input type="checkbox" checked={hints} onChange={e=>{invalidate();setHints(e.target.checked);}}/> Használtam segítséget</label>
    <button type="button" disabled={busy} onClick={()=>void check()} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">Matematikai modell és optimum ellenőrzése</button>
   </section>
   {grade&&<section role="status" data-testid="or-grade" className="space-y-2 rounded border p-4"><h2 className="text-xl font-semibold">{grade.points===null?'NEM ÉRTÉKELHETŐ':`${grade.points}/1`}</h2>
    {grade.errors.map(code=><p key={code}>{explainOrError(code)}</p>)}
    <p className="text-xs text-neutral-500">GUSEK/MILP diagnosztika; a pontszámot kizárólag a szerver adja. Nem felügyelt gyakorlás.</p>
    <button type="button" className="rounded border px-3 py-2" onClick={()=>setGrade(null)}>Javítom és újra beadom</button></section>}</>}
  {error&&<p role="alert" className="rounded border border-red-500 p-3 text-red-600">{error}</p>}
 </main>;
}
