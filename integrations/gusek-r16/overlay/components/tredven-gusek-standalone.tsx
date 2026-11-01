"use client";

import { useRef, useState } from "react";
import { r15SessionOutcome, r15RecommendPractice } from "../pilots/operations-research/adaptive-practice-r15.mjs";
import { r15cPracticeItinerary } from "../pilots/operations-research/adaptive-sequence-r15c.mjs";

type Kind = "transport" | "froccs" | "tablet";
type Task = { id: string; kind: Kind; taskType: string; variableNames: string[]; [key: string]: unknown };
type Active = { task: Task; kind: Kind; seed: number };
type Grade = { schema: string; taskId: string; points: 0 | 1 | null; maxPoints: 1; correct: boolean | null; errors: string[] };
type Result = { schema: string; task: Task; scalar: { starter: string } };
type Outcome = NonNullable<ReturnType<typeof r15SessionOutcome>>;

const choices: { value: Kind; title: string }[] = [
  { value: "transport", title: "Szállítási modell (3×3)" },
  { value: "froccs", title: "Fröccs – optimalizálás" },
  { value: "tablet", title: "Tabletta – költségminimum" },
];

function taskResponse(value: unknown): value is Result {
  if (!value || typeof value !== "object") return false;
  const obj = value as Partial<Result>;
  const t = obj.task;
  return obj.schema === "learnharness.gusek-task.r13" && !!t && typeof t.id === "string" &&
    choices.some(k => k.value === t.kind) && typeof t.taskType === "string" &&
    Array.isArray(t.variableNames) && t.variableNames.every(x => typeof x === "string") &&
    !!obj.scalar && typeof obj.scalar.starter === "string";
}
function gradeResponse(value: unknown, taskId: string): value is Grade {
  if (!value || typeof value !== "object") return false;
  const g = value as Partial<Grade>;
  return g.schema === "learnharness.gusek-grade.r13" && g.taskId === taskId &&
    (g.points === 0 || g.points === 1 || g.points === null) && g.maxPoints === 1 &&
    g.correct === (g.points === null ? null : g.points === 1) &&
    Array.isArray(g.errors) && g.errors.every(x => typeof x === "string");
}
const kindLabel = (kind: Kind) => choices.find(x => x.value === kind)?.title ?? kind;
const button = "rounded-lg border border-slate-400/40 px-4 py-2 font-semibold hover:bg-slate-500/10 disabled:opacity-40";
const field = "w-full rounded-lg border border-slate-400/50 bg-transparent p-3 font-mono text-sm";

/** R16 independent UI. No upstream imports, no persisted LearnHarness chat/graph mutations.
 * A grade is displayed only after a successful current-task server response.
 */
export function TredvenGusekStandalone() {
  const [kind, setKind] = useState<Kind>("transport");
  const [seed, setSeed] = useState("42");
  const [active, setActive] = useState<Active | null>(null);
  const [source, setSource] = useState("");
  const [values, setValues] = useState("{}");
  const [objective, setObjective] = useState("");
  const [hintsUsed, setHintsUsed] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  const seen = useRef(new Set<string>());
  const request = useRef<AbortController | null>(null);

  function clearTask() {
    epoch.current++;
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setGrade(null);
    setActive(null);
    setError("");
  }
  function changeKind(next: Kind) { clearTask(); setKind(next); }
  function changeSeed(next: string) { clearTask(); setSeed(next); }
  function invalidatePendingAnswer() {
    epoch.current++;
    request.current?.abort();
    request.current = null;
    setBusy(false);
    setGrade(null);
  }
  function editSource(next: string) { invalidatePendingAnswer(); setSource(next); }
  function editValues(next: string) { invalidatePendingAnswer(); setValues(next); }
  function editObjective(next: string) { invalidatePendingAnswer(); setObjective(next); }

  async function newTask() {
    clearTask();
    if (!/^(0|[1-9]\d{0,9})$/.test(seed) || Number(seed) > 4294967295) {
      setError("A seed 0 és 4294967295 közötti egész szám lehet."); return;
    }
    const runId = ++epoch.current;
    const abort = new AbortController(); request.current = abort; setBusy(true);
    try {
      const response = await fetch(`/api/pilot/gusek?kind=${encodeURIComponent(kind)}&seed=${encodeURIComponent(seed)}`,
        { cache: "no-store", signal: abort.signal });
      const json: unknown = await response.json();
      if (!response.ok || !taskResponse(json) || json.task.kind !== kind || json.task.id !== `gusek-${kind}-${seed}`) {
        throw new Error("Nem megfelelő feladatválasz a szervertől.");
      }
      if (runId !== epoch.current) return;
      setActive({ kind, seed: Number(seed), task: json.task });
      setSource(json.scalar.starter);
      setValues(JSON.stringify(Object.fromEntries(json.task.variableNames.map(name => [name, 0])), null, 2));
      setObjective(""); setHintsUsed(false); setGrade(null);
    } catch (e) {
      if (runId === epoch.current) setError(e instanceof Error ? e.message : "A feladat nem érhető el.");
    } finally {
      if (runId === epoch.current) { setBusy(false); request.current = null; }
    }
  }
  async function checkAnswer() {
    if (!active || busy) return;
    let valuesObject: unknown;
    try { valuesObject = JSON.parse(values); }
    catch { setError("A változóértékek JSON formátuma hibás."); return; }
    if (!valuesObject || typeof valuesObject !== "object" || Array.isArray(valuesObject)) {
      setError("A változóértékek JSON objektumot alkossanak."); return;
    }
    const reportedObjective = Number(objective);
    if (!objective.trim() || !Number.isFinite(reportedObjective)) {
      setError("Adj meg véges számot célfüggvényértékként."); return;
    }
    const input = { kind: active.kind, seed: String(active.seed), answer: {
      taskKind: active.kind, mathprog: source, values: valuesObject,
      reportedObjective, hintsUsed,
    } };
    const signature = JSON.stringify(input);
    const runId = ++epoch.current;
    const abort = new AbortController(); request.current?.abort(); request.current = abort;
    setBusy(true); setError(""); setGrade(null);
    try {
      const response = await fetch("/api/pilot/gusek", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input), cache: "no-store", signal: abort.signal,
      });
      const json: unknown = await response.json();
      if (!response.ok || !gradeResponse(json, active.task.id)) throw new Error("A szerver nem adott érvényes pontozási választ.");
      if (runId !== epoch.current) return;
      setGrade(json);
      // Only a fresh, validated server response enters the temporary advisory ledger.
      if (!seen.current.has(signature)) {
        const outcome = r15SessionOutcome(json, { kind: active.kind, seed: active.seed, hintsUsed });
        if (outcome) {
          seen.current.add(signature);
          setOutcomes(prev => [...prev, outcome].slice(-48));
        }
      }
    } catch (e) {
      if (runId === epoch.current) setError(e instanceof Error ? e.message : "Pontozási hiba.");
    } finally {
      if (runId === epoch.current) { setBusy(false); request.current = null; }
    }
  }
  const proposed = r15RecommendPractice({ history: [], session: outcomes, currentKind: kind, currentSeed: Number(seed) });
  const itinerary = outcomes.length ? r15cPracticeItinerary({ history: [], session: outcomes, currentKind: kind, currentSeed: Number(seed) }) : null;
  const chooseNext = (nextKind: Kind, nextSeed: number) => {
    clearTask(); setKind(nextKind); setSeed(String(nextSeed));
  };
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-5 md:p-9">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs uppercase tracking-widest opacity-60">Tredven add-on · R16</p>
          <h1 className="text-3xl font-bold">GUSEK / MathProg gyakorló</h1>
          <p className="mt-2 text-sm opacity-75">Önálló bővítmény. Az eredeti LearnHarness chat és tudásgráf változatlan.</p></div>
        <a className={button} href="/">LearnHarness főoldal</a>
      </header>
      <section className="rounded-xl border border-slate-400/40 p-4" aria-label="Feladatválasztás">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-2 text-sm">Feladattípus
            <select className={field} value={kind} onChange={e => changeKind(e.target.value as Kind)}>
              {choices.map(x => <option key={x.value} value={x.value}>{x.title}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm">Feladatvariáns (seed)
            <input className={field} inputMode="numeric" value={seed} onChange={e => changeSeed(e.target.value)} />
          </label>
          <div className="flex items-end"><button className={button} disabled={busy} onClick={() => void newTask()}>Új feladat létrehozása</button></div>
        </div>
      </section>
      {error && <p className="rounded-lg border border-red-400 p-3 text-red-600" role="alert">{error}</p>}
      {active && <>
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-400/40 p-4">
            <h2 className="mb-2 text-lg font-bold">{active.task.taskType}</h2>
            <p className="mb-3 text-xs opacity-65">Szerver által generált feladatadatok, megoldókulcs nélkül</p>
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-500/10 p-3 text-xs">{JSON.stringify(active.task, null, 2)}</pre>
          </div>
          <div className="rounded-xl border border-slate-400/40 p-4">
            <h2 className="mb-2 text-lg font-bold">MathProg (.mod) modell</h2>
            <textarea aria-label="MathProg modell" className={field} rows={17} maxLength={32000} spellCheck={false} value={source} onChange={e => editSource(e.target.value)} />
            <p className="text-xs opacity-60">A TODO sorokat egészítsd ki; a szerver csak a támogatott MathProg-résznyelvet pontozza.</p>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">Döntési változók (JSON)
            <textarea className={field} aria-label="Változóértékek JSON" rows={8} value={values} maxLength={12000} spellCheck={false} onChange={e => editValues(e.target.value)} />
          </label>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm">Kiszámolt célfüggvényérték
              <input className={field} value={objective} onChange={e => editObjective(e.target.value)} placeholder="Például: 123" />
            </label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={hintsUsed} onChange={e => { invalidatePendingAnswer(); setHintsUsed(e.target.checked); }}/>
              Segítséget használtam (önbevallás)</label>
            <p className="text-xs opacity-65">Segítséggel végzett feladat lehet hasznos gyakorlás, de nem jár önálló teljes pont.</p>
            <button className={button} disabled={busy} onClick={() => void checkAnswer()}>Ellenőrzés a szerveren</button>
          </div>
        </section>
        {grade && <section className="rounded-xl border border-slate-400/40 p-4" aria-live="polite">
          <h2 className="text-xl font-bold">{grade.points === 1 ? "Teljes pont (1/1)" : grade.points === 0 ? "Nem teljesített (0/1)" : "Nem értékelhető"}</h2>
          <p className="mt-2 text-sm opacity-75">Kizárólag a szerver pontoz. A nem értékelhető MathProg-alak nem bizonyít hibás matematikai megoldást.</p>
          {grade.errors.length > 0 && <p className="mt-3 text-sm">Hibakódok: {grade.errors.join(", ")}</p>}
        </section>}
      </>}
      {outcomes.length > 0 && <section className="rounded-xl border border-slate-400/40 p-4">
        <h2 className="text-xl font-bold">Adaptív következő lépés</h2>
        <p className="mt-1 text-xs opacity-65">Csak ennek a lapnak a munkamenetében gyűjtött, szerverválaszból ellenőrzött eredmények. Nincs tartós mentés vagy tudásszint-minősítés.</p>
        {proposed && <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm">{proposed.reason}</p>
          <button className={button} onClick={() => chooseNext(proposed.kind as Kind, proposed.seed as number)}>
            Kiválasztás: {kindLabel(proposed.kind as Kind)} / {proposed.seed}
          </button>
        </div>}
        {itinerary && <div className="mt-4 grid gap-2 md:grid-cols-3">
          {itinerary.steps.map(step => <div className="rounded-lg border border-slate-400/30 p-3" key={step.position}>
            <p className="font-semibold">{step.position}. {step.title}</p>
            <p className="my-2 text-sm opacity-75">{step.label} · seed {step.seed}</p>
            <button className={button} onClick={() => chooseNext(step.kind as Kind, step.seed as number)}>Feladat kiválasztása</button>
          </div>)}
        </div>}
      </section>}
      <p className="text-xs opacity-60">R16 standalone profil: natív GLPK futtatás és chat-integráció nincs automatikusan engedélyezve. A meglévő R15 ágat nem módosítja.</p>
    </main>
  );
}
