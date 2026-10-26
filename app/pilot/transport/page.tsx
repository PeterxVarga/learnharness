"use client";
import { useState } from "react";
import Link from "next/link";

type Task = { id:string; supply:number[]; demand:number[]; costs:number[][]; capacities:number[][] };
type Grade = { taskId:string; points:0|1; maxPoints:1; correct:boolean; errors:string[] };
const emptyAnswer = JSON.stringify({model:{sense:"min",nonnegative:true,supply:[0,0,0],demand:[0,0,0],costs:[[0,0,0],[0,0,0],[0,0,0]],capacities:[[0,0,0],[0,0,0],[0,0,0]]},allocation:[[0,0,0],[0,0,0],[0,0,0]],reportedObjective:0,hintsUsed:false},null,2);
const errorsHu:Record<string,string> = {model_incorrect_or_incomplete:"A modell hiányos vagy hibás.",invalid_allocation:"A terv nem 3×3 nemnegatív egészértékű mátrix.",supply_balance_violation:"Hibás kínálati egyenleg.",demand_balance_violation:"Hibás keresleti egyenleg.",route_capacity_violation:"Sérül egy útvonal-korlát.",objective_mismatch:"Hibásan számított költség.",not_optimal:"Nem minimális a szállítás költsége.",independence_not_demonstrated:"Nem igazolt az önálló megoldás.",invalid_assistance_metadata:"Hibás segítséghasználati mező."};
export default function TransportPilotPage(){
  const [seed,setSeed]=useState("42"),[activeSeed,setActiveSeed]=useState<string|null>(null);
  const [task,setTask]=useState<Task|null>(null),[answer,setAnswer]=useState(emptyAnswer);
  const [grade,setGrade]=useState<Grade|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function newTask(){
    setBusy(true);setError("");setTask(null);setGrade(null);
    try{
      if(!/^(0|[1-9]\d*)$/.test(seed)||Number(seed)>4294967295)throw new Error("A feladatmag 0–4294967295 közötti egész legyen.");
      const res=await fetch(`/api/pilot/transport?seed=${seed}`,{cache:"no-store"}),data=await res.json();
      if(!res.ok)throw new Error(data.error||"A feladat nem elérhető.");
      setTask(data.task as Task);setActiveSeed(seed);setAnswer(emptyAnswer);
    }catch(e){setError(e instanceof Error?e.message:"Hiba történt.");}finally{setBusy(false);}
  }
  async function check(){
    if(!task||activeSeed===null)return;
    setBusy(true);setError("");setGrade(null);
    try{
      const submitted:unknown=JSON.parse(answer);
      const res=await fetch("/api/pilot/transport",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({seed:activeSeed,answer:submitted}),cache:"no-store"});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"A megoldás nem ellenőrizhető.");
      if(data.taskId!==task.id||![0,1].includes(data.points)||data.maxPoints!==1)throw new Error("Érvénytelen ellenőrzőválasz.");
      setGrade(data as Grade);
    }catch(e){setError(e instanceof Error?e.message:"Hiba történt.");}finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-4xl space-y-6 px-5 py-10">
    <header className="space-y-2"><p className="text-xs uppercase tracking-widest text-neutral-500">LearnHarness · R4 kísérleti gyakorló</p><h1 className="text-3xl font-semibold">Szállítási vizsgafeladat</h1><p className="text-sm text-neutral-500">Teljesen helyes megoldás: 1 pont. Bármi más: 0 pont. Szintetikus adatok; a javítást nem AI végzi.</p><Link className="text-sm underline" href="/chat/new?mode=practice">LearnHarness tanulási munkamenet</Link></header>
    <section className="flex flex-wrap items-end gap-3 rounded-xl border p-5"><label className="text-sm">Feladatvariáns<input aria-label="Feladatvariáns" className="mt-1 block rounded border bg-transparent px-3 py-2" value={seed} onChange={e=>setSeed(e.target.value)}/></label><button disabled={busy} onClick={newTask} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-black">Új feladat</button></section>
    {task&&<section className="space-y-4 rounded-xl border p-5" aria-label="Kiadott vizsgafeladat"><h2 className="text-lg font-semibold">{task.id}</h2><p className="text-sm">A telephelyek kínálatát szállítsd a célállomásokra a kereslet kielégítésével és a legkisebb összköltséggel. Add meg a teljes matematikai modellt is!</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Telephely</th><th>Cél 1</th><th>Cél 2</th><th>Cél 3</th><th>Kínálat</th></tr></thead><tbody>{task.costs.map((row,i)=><tr key={i} className="border-t"><th>{i+1}</th>{row.map((cost,j)=><td key={j} className="p-2 text-center">{cost}{(task.capacities[i]?.[j]??Infinity)<task.supply.reduce((a,b)=>a+b,0)&&<small className="block">max. {task.capacities[i]?.[j]}</small>}</td>)}<td className="text-center">{task.supply[i]}</td></tr>)}<tr className="border-t"><th>Kereslet</th>{task.demand.map((d,j)=><td key={j} className="text-center">{d}</td>)}<td/></tr></tbody></table></div><p className="text-xs text-neutral-500">Egységköltségek a táblázatban; az esetleges max. jelzés az adott útvonal kapacitása. A megoldás és az optimum nincs megjelenítve.</p></section>}
    {task&&<section className="space-y-3 rounded-xl border p-5"><label htmlFor="solution" className="block font-semibold">A teljes megoldásod (JSON)</label><textarea id="solution" spellCheck={false} className="h-80 w-full rounded border bg-transparent p-3 font-mono text-xs" value={answer} onChange={e=>{setAnswer(e.target.value);setGrade(null);}}/><p className="text-xs text-neutral-500">A sablon nulláit a feladat alapján írd át. A model mezőt is ki kell töltened; a sablon nem tartalmazza a helyes választ. A hintsUsed önbevallás, nem felügyelt vizsgabizonyíték.</p><button disabled={busy} onClick={check} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-black">Megoldás ellenőrzése</button></section>}
    {grade&&<section role="status" aria-live="polite" className="space-y-2 rounded-xl border p-5"><h2 className="text-xl font-semibold">{grade.points}/1 – {grade.correct?"TELJESEN HELYES":"NEM TELJESEN HELYES"}</h2>{grade.errors.length>0&&<><p>Tanulási hibajelzések (nem részpontok):</p><ul className="list-disc pl-5 text-sm">{grade.errors.map(code=><li key={code}>{errorsHu[code]||code}</li>)}</ul></>}</section>}
    {error&&<p role="alert" className="rounded border border-red-500 p-3 text-sm text-red-600">{error}</p>}
  </main>;
}
