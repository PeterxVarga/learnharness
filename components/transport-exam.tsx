"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { coachingFeedback } from "../pilots/operations-research/feedback-r11.mjs";

type Task = { id: string; supply: number[]; demand: number[]; costs: number[][]; capacities: number[][] };
type Grade = { taskId: string; points: 0 | 1 | null; maxPoints: 1; correct: boolean | null; errors: string[]; status?: string; id?: string };
type Attempt = Grade & {id:string;seed:number;submittedAt:string;answerSha256:string};
type Mode = "mathprog" | "indexed" | "json";
const blankMatrix = "[[0,0,0],[0,0,0],[0,0,0]]";
const emptyJson = JSON.stringify({
  model: {sense: "min", nonnegative: true, supply: [0,0,0], demand: [0,0,0],
    costs: [[0,0,0],[0,0,0],[0,0,0]], capacities: [[0,0,0],[0,0,0],[0,0,0]]},
  allocation: [[0,0,0],[0,0,0],[0,0,0]], reportedObjective: 0, hintsUsed: false,
}, null, 2);
const indexedTemplate = [
  "# R7 – indexelt MathProg modell. A paraméterek adatait a feladat alapján az ellenőrző biztosítja.",
  "# Deklaráld az I, J halmazokat, supply, demand, cost és cap paramétereket,",
  "# x{i in I,j in J} nemnegatív változókat útvonal-felső korláttal,",
  "# az összegzett célfüggvényt és a két indexelt mérlegegyenletet.",
  "# A teljes modell végére solve; end; kerül. NINCS előre kitöltött megoldás.",
  "",
].join("\n");
const template = [
  "# Csak a 3×3-as, teljesen kifejtett MathProg-résznyelv támogatott.",
  "# Írd meg: var x00 ... var x22 (alsó és felső korláttal),",
  "# minimize total: ..., hat supply/demand s.t. egyenlőség,",
  "# végül solve; és end; (minden utasítás végén pontosvessző).",
  "# Az indexelt set / param / sum / x[i,j] felíráshoz az R7 módot válaszd.",
  "",
].join("\n");
const errorsHu: Record<string,string> = {
  model_incorrect_or_incomplete: "Hiányos vagy hibás a matematikai modell.",
  invalid_allocation: "A szállítási terv nem 3×3 nemnegatív egészértékű mátrix.",
  supply_balance_violation: "Nem teljesül valamelyik kínálati egyenleg.",
  demand_balance_violation: "Nem teljesül valamelyik keresleti egyenleg.",
  route_capacity_violation: "Sérül egy útvonal-kapacitáskorlát.",
  objective_mismatch: "A kiszámított összköltség és a beadott érték eltér.",
  not_optimal: "A szállítási terv nem bizonyítottan minimális költségű.",
  independence_not_demonstrated: "Nem igazolt a segítség nélküli megoldás.",
  invalid_assistance_metadata: "Hibás a segítséghasználati adat.",
  source_incomplete_model: "Hiányzó változó, célfüggvény, korlát vagy záró utasítás.",
  source_wrong_objective: "A MathProg célfüggvény nem megfelelő.",
  source_incorrect_or_duplicate_balance: "Egy hiányzó, hibás vagy duplikált egyenlet van a modellben.",
  source_wrong_variable_bounds: "Hibás a változó alsó vagy felső korlátja.",
  source_unsupported_mathprog_statement: "Nem támogatott MathProg-utasítás. Csak a teljesen kifejtett 3×3 résznyelv értékelhető.",
  source_invalid_model_source: "A MathProg szöveg hiányzik vagy túl hosszú.",
};

export function TransportExam({ chatId, embedded = false, onRequestCoaching }: { chatId?: string; embedded?: boolean; onRequestCoaching?: () => void }){
  const [seed,setSeed]=useState("42"), [activeSeed,setActiveSeed]=useState<string|null>(null);
  const [task,setTask]=useState<Task|null>(null);
  const [mode,setMode]=useState<Mode>("mathprog"), [answer,setAnswer]=useState(emptyJson);
  const [mathprog,setMathprog]=useState(template), [allocation,setAllocation]=useState(blankMatrix);
  const [objective,setObjective]=useState(""),[hintsUsed,setHintsUsed]=useState(false);
  const [grade,setGrade]=useState<Grade|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [linkedChat,setLinkedChat]=useState<string|null>(null),[history,setHistory]=useState<Attempt[]>([]);
  const [linkError,setLinkError]=useState("");
  const [bindingState,setBindingState]=useState<"checking"|"ready"|"failed"|"none">("checking");
  const pending=useRef<{fingerprint:string;attemptId:string}|null>(null);
  useEffect(()=>{
    const requestedChatId=chatId ?? new URLSearchParams(window.location.search).get("chatId");
    if(!requestedChatId){setBindingState("none");return;}
    if(!/^chat_[a-z0-9]+_[0-9a-f]{8}$/.test(requestedChatId)){setLinkError("Hibás chat-azonosító.");setBindingState("failed");return;}
    let disposed=false;
    fetch(`/api/pilot/transport/attempts?chatId=${encodeURIComponent(requestedChatId)}`,{cache:"no-store"})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error("Nem található ehhez érvényes gyakorlási munkamenet.");return data;})
      .then(data=>{if(!disposed){setLinkedChat(requestedChatId);setHistory(data.attempts??[]);setBindingState("ready");}})
      .catch(e=>{if(!disposed){setLinkError(e instanceof Error?e.message:"Nem elérhető a munkamenet.");setBindingState("failed");}});
    return ()=>{disposed=true;};
  },[chatId]);

  async function newTask(nextSeed: string = seed){
    setBusy(true);setError("");setTask(null);setGrade(null);
    try{
      if(!/^(0|[1-9]\d*)$/.test(nextSeed)||Number(nextSeed)>4294967295)throw new Error("A feladatmag 0–4294967295 közötti egész legyen.");
      const res=await fetch(`/api/pilot/transport?seed=${nextSeed}`,{cache:"no-store"});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"A feladat nem elérhető.");
      setTask(data.task as Task);setActiveSeed(nextSeed);setSeed(nextSeed);setAnswer(emptyJson);pending.current=null;
      setMathprog(mode==="indexed"?indexedTemplate:template);setAllocation(blankMatrix);setObjective("");setHintsUsed(false);
    }catch(e){setError(e instanceof Error?e.message:"Hiba történt.");}
    finally{setBusy(false);}
  }
  async function check(){
    if(!task||activeSeed===null)return;
    if(bindingState!=="none" && bindingState!=="ready"){setError("A munkamenet kapcsolata nem igazolt; a beadás nem indulhat.");return;}
    setBusy(true);setError("");setGrade(null);
    try{
      const submitted:unknown=mode==="json"?JSON.parse(answer):{
        mathprog,mathprogDialect:mode==="indexed"?"indexed":"expanded",
        allocation:JSON.parse(allocation),reportedObjective:Number(objective),hintsUsed,
      };
      if(mode!=="json" && (!objective.trim()||!Number.isFinite(Number(objective))))throw new Error("Adj meg egy véges, kiszámított minimumköltséget.");
      const fingerprint=JSON.stringify({seed:activeSeed,answer:submitted});
      if(linkedChat && (pending.current===null || pending.current.fingerprint!==fingerprint))
        pending.current={fingerprint,attemptId:crypto.randomUUID()};
      const res=await fetch(linkedChat?"/api/pilot/transport/attempts":"/api/pilot/transport",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(linkedChat?{seed:activeSeed,answer:submitted,chatId:linkedChat,attemptId:pending.current!.attemptId}:{seed:activeSeed,answer:submitted}),cache:"no-store",
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||"A megoldás nem ellenőrizhető.");
      const actual=linkedChat?data.receipt:data;
      if(actual.taskId!==task.id||![0,1,null].includes(actual.points)||actual.maxPoints!==1)throw new Error("Érvénytelen ellenőrzőválasz.");
      setGrade(actual as Grade);
      if(linkedChat)setHistory(old=>[...old.filter(a=>a.id!==actual.id),actual as Attempt]);
    }catch(e){setError(e instanceof Error?e.message:"Hiba történt.");}
    finally{setBusy(false);}
  }
  return <div data-testid="transport-exam-r12" className={embedded ? "mx-auto max-w-4xl space-y-6 px-5 py-5" : "mx-auto max-w-4xl space-y-6 px-5 py-10"}>
    <header className="space-y-2"><p className="text-xs uppercase tracking-widest text-neutral-500">LearnHarness · R9 munkamenethez kötött vizsgagyakorló</p><h1 className="text-3xl font-semibold">Szállítási vizsgafeladat</h1>
      <p className="text-sm text-neutral-500">Teljes megoldás: 1 pont. Bizonyítottan hibás: 0 pont. Nem támogatott MathProg-alak: nem értékelhető. A javítást nem AI végzi.</p>
      {!embedded && (linkedChat?<Link className="text-sm underline" href={`/chat/${encodeURIComponent(linkedChat)}`}>Vissza a tanulási munkamenethez</Link>:<Link className="text-sm underline" href="/chat/new?mode=practice">Új adaptív gyakorlási munkamenet</Link>)}
      {linkedChat&&<p className="text-xs text-neutral-500">Az ellenőrzött pontszám és a feladathibák a munkamenethez mentődnek. A MathProg-forrás nem kerül a naplóba.</p>}
      {linkError&&<p role="alert" className="text-sm text-red-600">{linkError}</p>}
    </header>
    <section className="flex flex-wrap items-end gap-3 rounded-xl border p-5">
      <label className="text-sm">Feladatvariáns<input aria-label="Feladatvariáns" className="mt-1 block rounded border bg-transparent px-3 py-2" value={seed} onChange={e=>setSeed(e.target.value)}/></label>
      <button disabled={busy} onClick={()=>void newTask()} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-black">Új feladat</button>
    </section>
    {task&&<section className="space-y-4 rounded-xl border p-5" aria-label="Kiadott vizsgafeladat"><h2 className="text-lg font-semibold">{task.id}</h2>
      <p className="text-sm">A telephelyek kínálatát szállítsd a célállomásokra a kereslet kielégítésével és a legkisebb összköltséggel. Add meg a teljes matematikai modellt és az optimális tervet!</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th>Telephely</th><th>Cél 1</th><th>Cél 2</th><th>Cél 3</th><th>Kínálat</th></tr></thead>
        <tbody>{task.costs.map((row,i)=><tr key={i} className="border-t"><th>{i+1}</th>{row.map((cost,j)=><td key={j} className="p-2 text-center">{cost}{(task.capacities[i]?.[j]??Infinity)<task.supply.reduce((a,b)=>a+b,0)&&<small className="block">max. {task.capacities[i]?.[j]}</small>}</td>)}<td className="text-center">{task.supply[i]}</td></tr>)}
        <tr className="border-t"><th>Kereslet</th>{task.demand.map((d,j)=><td key={j} className="text-center">{d}</td>)}<td/></tr></tbody></table></div>
      <p className="text-xs text-neutral-500">Egységköltségek; a max. jelzés egy útvonal kapacitása. Az optimális megoldás nincs megjelenítve.</p>
    </section>}
    {task&&<section className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Beadási formátum">
        <button className={`rounded border px-3 py-2 text-sm ${mode==='mathprog'?'font-semibold underline':''}`} onClick={()=>{setMode('mathprog');setMathprog(template);setGrade(null);}}>MathProg-szöveg</button>
        <button className={`rounded border px-3 py-2 text-sm ${mode==='indexed'?'font-semibold underline':''}`} onClick={()=>{setMode('indexed');setMathprog(indexedTemplate);setGrade(null);}}>Indexelt MathProg (R7)</button>
        <button className={`rounded border px-3 py-2 text-sm ${mode==='json'?'font-semibold underline':''}`} onClick={()=>{setMode('json');setGrade(null);}}>Strukturált JSON</button>
      </div>
      {mode!=='json'?<>
        <label htmlFor="mathprog-source" className="block font-semibold">MathProg-modell</label>
        <textarea id="mathprog-source" spellCheck={false} className="h-80 w-full rounded border bg-transparent p-3 font-mono text-xs" value={mathprog} onChange={e=>{setMathprog(e.target.value);setGrade(null);}} />
        <p className="text-xs text-neutral-500">A feladatot az ellenőrző nem futtatja. A kifejtett R6 mód x00–x22 változókat kér; az R7 mód kizárólag az I/J és supply/demand/cost/cap paraméterekkel felírt indexelt résznyelvet ismeri fel. Más, akár helyes MathProg-modell nem értékelhető.</p>
        <label htmlFor="transport-flow" className="block font-semibold">Szállítási terv – 3×3-as JSON-tömb</label>
        <textarea id="transport-flow" spellCheck={false} className="h-28 w-full rounded border bg-transparent p-3 font-mono text-xs" value={allocation} onChange={e=>{setAllocation(e.target.value);setGrade(null);}} />
        <label htmlFor="objective" className="block font-semibold">Kiszámított minimumköltség</label>
        <input id="objective" inputMode="decimal" className="w-full rounded border bg-transparent px-3 py-2" value={objective} onChange={e=>{setObjective(e.target.value);setGrade(null);}} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hintsUsed} onChange={e=>{setHintsUsed(e.target.checked);setGrade(null);}} /> Használtam segítséget</label>
      </>:<>
        <label htmlFor="solution" className="block font-semibold">A teljes megoldásod (JSON)</label>
        <textarea id="solution" spellCheck={false} className="h-80 w-full rounded border bg-transparent p-3 font-mono text-xs" value={answer} onChange={e=>{setAnswer(e.target.value);setGrade(null);}} />
      </>}
      <p className="text-xs text-neutral-500">{linkedChat?"A szerver ellenőrzött értékelést és megoldáshasht tárol; a teljes MathProg-szöveget nem.":"Önálló módban nincs tartós napló; practice chatből nyisd meg a gyakorlót a kapcsoláshoz."} A hintsUsed önbevallás, nem felügyelt vizsgabizonyíték.</p>
      <button disabled={busy || (bindingState!=="none" && bindingState!=="ready")} onClick={check} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-black">Teljes megoldás ellenőrzése</button>
    </section>}
    {grade&&<section role="status" aria-live="polite" className="space-y-2 rounded-xl border p-5"><h2 className="text-xl font-semibold">{grade.points===null?'NEM ÉRTÉKELHETŐ':`${grade.points}/1`} – {grade.correct===null?'A résznyelven kívüli modellt nem pontozzuk':grade.correct?'TELJESEN HELYES':'NEM TELJESEN HELYES'}</h2>
      {grade.errors.length>0&&<><p>Tanulási hibajelzések (nem részpontok):</p><ul className="list-disc pl-5 text-sm">{grade.errors.map(code=><li key={code}>{errorsHu[code]??(code.startsWith('source_')?'A MathProg-modell nem felel meg a támogatott szerződésnek.':code)}</li>)}</ul></>}
    </section>}
    {grade&&<section data-testid="transport-feedback-r11" aria-label="Következő javítási lépés" className="space-y-2 rounded-xl border p-4">
      <h2 className="font-semibold">Következő lépés: {coachingFeedback(grade).title}</h2>
      <p className="text-sm">{coachingFeedback(grade).step}</p>
      {coachingFeedback(grade).kind==="repair"&&<button className="rounded border px-3 py-2 text-sm" type="button" onClick={()=>setGrade(null)}>Javítom és újra beadom ugyanazt a feladatot</button>}
      <p className="text-xs text-neutral-500">A tanulási tanács nem módosítja a szerveroldali 0/1 pontszámot, és nem mutatja meg a megoldókulcsot.</p>
    </section>}
    {grade&&<section className="flex flex-wrap gap-3 rounded-xl border p-4">
      {linkedChat && (embedded && onRequestCoaching
        ? <button type="button" className="text-sm underline" onClick={onRequestCoaching}>Hibajavítás a tanítóval</button>
        : <Link className="text-sm underline" href={`/chat/${encodeURIComponent(linkedChat)}?prompt=${encodeURIComponent("Kérem az előző, szerver által ellenőrzött szállítási vizsgakísérletem hibáinak célzott magyar magyarázatát. A pontszámot ne módosítsd, és következő feladatot csak külön kérésemre adj.")}`}>Hibajavítás a tanítóval</Link>)}
      <button className="rounded border px-3 py-2 text-sm" onClick={()=>void newTask(String((Number(activeSeed??seed)+1)>>>0))}>Új, eltérő feladat</button>
    </section>}
    {linkedChat&&<section className="rounded-xl border p-4 space-y-2">
      <h2 className="font-semibold">Korábbi ellenőrzött kísérletek ({history.length})</h2>
      <ul className="space-y-1 text-sm">{history.slice(-10).reverse().map(a=><li key={a.id}>{a.taskId}: {a.points===null?"nem értékelhető":`${a.points}/1`} · {new Date(a.submittedAt).toLocaleString("hu-HU")}</li>)}</ul>
    </section>}
    {error&&<p role="alert" className="rounded border border-red-500 p-3 text-sm text-red-600">{error}</p>}
  </div>;
}
