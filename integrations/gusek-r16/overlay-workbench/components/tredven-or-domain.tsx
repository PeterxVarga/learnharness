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
// R16.20: bounded, offline study primers sourced from the checked-in R16.10
// Hungarian learning cards. These are NOT the student's earlier uploaded PDFs.
const lessons={
 assignment:{
  title:'Hozzárendelés – a modell felépítése',
  objective:'Mikor használunk bináris változót, és hogyan lesz minden párosítás pontosan egyszeri?',
  steps:[
   'Döntési változó: a(i,j) értéke 1, ha az i-edik munkatárs a j-edik feladatot végzi; különben 0.',
   'Célfüggvény: az összes párosítás idő- vagy költségadatának minimalizálása.',
   'Munkatársi korlát: minden sor összege pontosan 1.',
   'Feladatkorlát: minden oszlop összege pontosan 1. A <= 1 nem biztosítaná, hogy minden munka elkészüljön.'
  ],
  syntax:'var a11 binary;\ns.t. munkatars_1: a11 + a12 + a13 = 1;',
  question:'Melyik feltétel biztosítja, hogy minden feladat kapjon pontosan egy munkatársat?',
  choices:['Minden oszlop összege legfeljebb 1.','Minden oszlop összege pontosan 1.','Csak a célfüggvény minimalizálása.'],
  correct:1,
  why:'A pontosan egy feltétel egyenlőség; a legfeljebb egy feltétel mellett maradhat gazdátlan feladat.'
 },
 production:{
  title:'Egészértékű termeléstervezés – erőforrások',
  objective:'Hogyan kapcsolódik össze a célfüggvény, a kapacitás és az egész darabszám?',
  steps:[
   'Döntési változó: az A és B termékek darabszáma, nemnegatív egészként.',
   'Célfüggvény: egységnyi nyereség × termelt mennyiség, majd az összeg maximalizálása.',
   'Erőforráskorlát: az egyes termékek anyagigénye × darabszáma nem lépheti túl a készletet.',
   'A munkaórakorlát külön egyenlőtlenség; egy megengedett terv még nem feltétlenül optimális.'
  ],
  syntax:'var x >= 0, integer;\nvar y >= 0, integer;\ns.t. material: 3*x + 5*y <= 29;\nmaximize profit: 19*x + 31*y;',
  question:'Melyik a helyes változótartomány, ha egész darab termékek készülhetnek?',
  choices:['Tetszőleges valós szám.','Csak 0 vagy 1.','Nemnegatív egész szám.'],
  correct:2,
  why:'A darabszám 0, 1, 2… lehet; sem törtdarabot, sem negatív mennyiséget nem gyárthatunk.'
 }
} as const;
// R16.21 – original micro-lessons, never raw or full course materials.
const examLessons={
 transport:{
  title:'Szállítási modell (1. feladattípus)',
  theory:['A döntési változó x[i,j] egy adott forrásból adott célhoz szállított mennyiség.',
   'A költségminimalizálás a költség és a szállított mennyiség szorzatösszege.',
   'A pontos kereslet és kötelező szállítás egyenlőség, az útvonal limitje felső korlát.'],
  question:'Egy bolt pontosan 70 egységet vár. Melyik helyes?',
  options:['A beérkező mennyiségek összege = 70.','A beérkező mennyiségek összege <= 70.','Minden forrásból külön 70.'],
  correct:0,
  remedy:'A pontosan előírt igény egyenlőség. A legfeljebb feltétel engedné a hiányt.',
  transfer:'Új helyzet: egyetlen útvonalon legfeljebb 9 egység vihető. Melyik korlát helyes?',
  transferOptions:['Az érintett x[i,j] = 9.','Az érintett x[i,j] <= 9.','Minden bolt teljes igénye <= 9.'],
  transferCorrect:1,
  why:'Az útvonalkorlát csak egy forrás–cél pár mennyiségének felső korlátja.',
  next:'Gyakorolj eltérő adatokkal egy 3×3 szállítási feladatot a GUSEK Workbenchben.',
  href:'/pilot/gusek'
 },
 indexed:{
  title:'Általános GMPL-modell (2. feladattípus)',
  theory:['A set halmazok az indexeket, a param paraméterek a konkrét értékeket adják.',
   'A var x{i in I,j in J} minden forrás–cél párhoz döntési változót rendel.',
   'A sum{j in J} x[i,j] rögzített i esetén az összes célhoz menő mennyiséget adja.'],
  question:'Mit számol a sum{j in J} x[i,j] rögzített i mellett?',
  options:['Minden forrás összes mennyiségét.','Az i forrásból minden célhoz küldött mennyiséget.','Csak az első cél mennyiségét.'],
  correct:1,
  remedy:'Az i rögzített, a j végigfut az összes célon; ezért keletkezik egy forrásonkénti összeg.',
  transfer:'Ha új bolt nyílik, mit változtatsz elsődlegesen az általános modellben?',
  transferOptions:['A halmazt és a hozzá tartozó adatokat.','Minden képletet kézzel megduplázol.','Minden változót binárissá teszel.'],
  transferCorrect:0,
  why:'A halmazos modell méretfüggetlen; a városok számának változása az adatokat érinti.',
  next:'Készíts külön modell- és adatrészt egy 2×3 szállítási példához. A teljes indexelt GMPL automatikus pontozása még nem bizonyított.',
  href:'/pilot/gusek'
 },
 simplex:{
  title:'Kézi szimplex (3. feladattípus)',
  theory:['A <= típusú lineáris korláthoz nemnegatív hiányváltozót adunk.',
   'A pivot egy változót bevisz a bázisba és egy másikat kivesz.',
   'A kilépő sor kiválasztása pozitív pivot-oszlopelemek mellett a legkisebb megengedett hányadost használja.'],
  question:'Miért kell elvégezni a hányadostesztet?',
  options:['A megengedettség megőrzéséhez.','Az egészértékűség bizonyításához.','A célfüggvény elhagyásához.'],
  correct:0,
  remedy:'A sorválasztás nem önkényes: az új bázismegoldásnak is teljesítenie kell a korlátokat.',
  transfer:'Két pozitív pivotelem 2 és 5, a jobb oldalak 12 és 20. Melyik sor lép ki?',
  transferOptions:['Az első, mert 12/2 = 6.','A második, mert 20/5 = 4.','Egyik sem.'],
  transferCorrect:1,
  why:'A két hányados 6 és 4. A kisebb, 4-es hányados jelöli a kilépő sort.',
  next:'Oldj meg kézzel egy szimplextáblát. Ez nem GLPK-s automatikus pontozó.',
  href:'/chat/new?mode=teach'
 },
 graphical:{
  title:'Grafikus LP (4. feladattípus)',
  theory:['Minden kétváltozós lineáris egyenlőtlenség egy félsíkot jelöl.',
   'A megengedett tartomány a félsíkok közös metszete, ami lehet üres.',
   'Ha van nem üres korlátos sokszög, egy lineáris célfüggvény szélsőértéke csúcspontban is felvehető.'],
  question:'Ha x+y <= 2 és x+y >= 3, mi igaz?',
  options:['Az origó az optimális.','Nincs megengedett megoldás.','A maximum biztosan korlátlan.'],
  correct:1,
  remedy:'E két félsíknak nincs közös pontja. A megengedettséget mindig az optimum keresése előtt ellenőrizd.',
  transfer:'Új feltételek: 3x+3y <= 15 és x+y >= 6. Mi igaz?',
  transferOptions:['Egyetlen megoldás van.','A tartomány biztosan nem üres.','A korlátok ellentmondásosak.'],
  transferCorrect:2,
  why:'Az első feltétel x+y <= 5, a második x+y >= 6, tehát nincs közös pont.',
  next:'Rajzold meg papíron a két félsíkot. Nincs hitelesített grafikus feladatpontozó.',
  href:'/chat/new?mode=teach'
 }
} as const;
type ExamKind=keyof typeof examLessons;
type ExamOutcome='retry'|'supported_transfer'|'independent_transfer';
const examOrder:ExamKind[]=['transport','indexed','simplex','graphical'];
function ExamStudy(){
 const [topic,setTopic]=useState<ExamKind>('transport');
 const [first,setFirst]=useState<number|null>(null);
 const [transfer,setTransfer]=useState<number|null>(null);
 const [results,setResults]=useState<Partial<Record<ExamKind,ExamOutcome>>>({});
 const item=examLessons[topic];
 const select=(kind:ExamKind)=>{setTopic(kind);setFirst(null);setTransfer(null);};
 const answerTransfer=(i:number)=>{
  setTransfer(i);
  setResults(prev=>({...prev,[topic]:i!==item.transferCorrect?'retry':
   first===item.correct?'independent_transfer':'supported_transfer'}));
 };
 const recommended=examOrder.find(k=>results[k]==='retry')??
  examOrder.find(k=>results[k]===undefined)??
  examOrder.find(k=>results[k]==='supported_transfer')??'transport';
 return <section className="space-y-4 rounded border p-4" data-testid="or-exam-study">
  <h2 className="text-xl font-semibold">Mintavizsgára felkészítő: előbb elmélet, utána alkalmazás</h2>
  <p className="text-xs text-neutral-500">A négy témához írt saját magyarázatok, nem az eredeti egyetemi PDF-ek és .mod fájlok másolatai. A kérdések nem vizsgapontok. Nincs tartósan mért tudásszint.</p>
  <label className="block font-semibold">Vizsgatéma:
   <select aria-label="Mintavizsga témája" data-testid="or-exam-topic" className="ml-2 rounded border bg-background p-2" value={topic} onChange={e=>select(e.target.value as ExamKind)}>
    {examOrder.map(k=><option value={k} key={k}>{examLessons[k].title}</option>)}
   </select>
  </label>
  <ol className="list-decimal space-y-2 pl-5 text-sm">{item.theory.map(s=><li key={s}>{s}</li>)}</ol>
  <fieldset className="space-y-2 rounded border p-3" data-testid="or-exam-diagnostic">
   <legend className="font-semibold">1. Fogalmi ellenőrzés</legend><p>{item.question}</p>
   {item.options.map((answer,i)=><label className="flex items-start gap-2" key={answer}>
    <input type="radio" name="or-exam-first" checked={first===i} onChange={()=>{setFirst(i);setTransfer(null);}}/><span>{answer}</span>
   </label>)}
  </fieldset>
  {first!==null&&<section className="space-y-3 rounded border p-3" data-testid="or-exam-branch">
   <p role="status">{first===item.correct?'Helyes. Próbáld átvinni egy új helyzetre.':'Célzott újramagyarázás: '+item.remedy}</p>
   <fieldset className="space-y-2" data-testid="or-exam-transfer">
    <legend className="font-semibold">2. Új helyzet (átvitel)</legend><p>{item.transfer}</p>
    {item.transferOptions.map((answer,i)=><label className="flex items-start gap-2" key={answer}>
     <input type="radio" name="or-exam-transfer-answer" checked={transfer===i} onChange={()=>answerTransfer(i)}/><span>{answer}</span>
    </label>)}
   </fieldset>
   {transfer!==null&&<div role="status" className="space-y-2" data-testid="or-exam-feedback">
    <p>{transfer===item.transferCorrect?'A második ellenőrzés helyes.':'A második ellenőrzés hibás.'} {item.why}</p>
    <p>{transfer!==item.transferCorrect?'Ajánlott a célzott ismétlés.':
     first===item.correct?'Következő a saját feladat, más számadatokkal.':'Segítséggel sikerült, később önálló újrapróba ajánlott.'}</p>
    <button type="button" className="rounded border px-3 py-2" onClick={()=>{setFirst(null);setTransfer(null);}}>Újrapróbálom</button>
   </div>}
  </section>}
  <p className="text-sm">{item.next}</p>
  <Link href={item.href} className="inline-block rounded border px-3 py-2 text-sm">Gyakorló / tanító megnyitása</Link>
  <aside data-testid="or-exam-adaptive-next" className="space-y-2 rounded border p-3 text-sm">
   <p className="font-semibold">Ajánlott folytatás ebben a munkamenetben</p>
   <p>{results[recommended]==='retry'?'Hibás átviteli feladat ismétlése.':
     results[recommended]==='supported_transfer'?'Segítség utáni önálló újrapróba.':'Még nem próbált témakör.'}</p>
   <button type="button" className="rounded border px-3 py-2" onClick={()=>select(recommended)}>{examLessons[recommended].title}</button>
   <p className="text-xs text-neutral-500">Kézi témaváltás, nincs automatikus grade, új feladatindítás, tartós tanulói nyilvántartás vagy vizsgakészültség-állítás.</p>
  </aside>
  <p className="text-xs text-neutral-500">Az indexelt modell, a szimplex és a grafikus feladat teljes értékelése még nincs automatizálva. A tanítóhoz külön AI-modellbeállítás szükséges lehet.</p>
 </section>;
}

/** No grading authority on client. No automatic solve, no exam ledger. */
export function TredvenOrDomain(){
 const [kind,setKind]=useState<Kind>('assignment');const [seed,setSeed]=useState('42');
 const [stage,setStage]=useState<'theory'|'practice'>('theory');const [quizChoice,setQuizChoice]=useState<number|null>(null);
 const [task,setTask]=useState<Task|null>(null);const [model,setModel]=useState('');
 const [values,setValues]=useState('');const [objective,setObjective]=useState('');
 const [hints,setHints]=useState(false);const [grade,setGrade]=useState<Grade|null>(null);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const epoch=useRef(0);const active=useRef<AbortController|null>(null);
 const invalidate=()=>{epoch.current++;active.current?.abort();active.current=null;setGrade(null);setBusy(false);};
 const reset=()=>{invalidate();setTask(null);setModel('');setValues('');setObjective('');setError('');};
 const lesson=lessons[kind];
 async function load(){
  invalidate();const ticket=epoch.current;setBusy(true);setTask(null);setGrade(null);setError('');
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
  const ticket=epoch.current;const request=new AbortController();active.current=request;setBusy(true);setError('');setGrade(null);
  try{
   if(objective.trim()===''||!Number.isFinite(Number(objective)))throw Error('Adj meg véges célfüggvényértéket.');
   const body={kind:task.kind,seed:String(task.seed),answer:{mathprog:model,values:JSON.parse(values),
    reportedObjective:Number(objective),hintsUsed:hints}};
   const r=await fetch(endpoint,{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:request.signal});
   const data=await r.json();if(!r.ok)throw Error(data.error??'Sikertelen ellenőrzés.');
   if(data.taskId!==task.id||data.maxPoints!==1||![0,1,null].includes(data.points))throw Error('Érvénytelen szerverértékelés.');
   if(ticket===epoch.current)setGrade(data);
  }catch(e){if(ticket===epoch.current)setError(e instanceof Error?e.message:String(e));}
  finally{if(active.current===request)active.current=null;if(ticket===epoch.current)setBusy(false);}
 }
 return <main className="mx-auto max-w-5xl space-y-5 p-5">
  <Link className="text-sm underline" href="/pilot/gusek">← Vissza a GUSEK Workbenchhez</Link>
  <ExamStudy />
  <header className="space-y-2"><h1 className="text-3xl font-semibold">Operációkutatás – GUSEK szakmai gyakorló</h1>
   <p className="text-sm text-neutral-500">Két további, szintetikus, paraméterezett feladattípus. A feladatod: MathProg-modell, döntési változók és célfüggvényérték. Az ellenőrző nem futtatja a beadott kódot, és nincs részpont.</p></header>
  <nav className="flex flex-wrap gap-2" aria-label="Tanulási sorrend" data-testid="or-study-navigation">
   <button type="button" aria-current={stage==='theory'?'step':undefined} className="rounded border px-3 py-2 text-sm" onClick={()=>{invalidate();setStage('theory');}}>1. Elmélet</button>
   <button type="button" aria-current={stage==='practice'?'step':undefined} className="rounded border px-3 py-2 text-sm" disabled={quizChoice===null} onClick={()=>setStage('practice')}>2. Gyakorlás</button>
  </nav>
  {stage==='theory'?<section className="space-y-4 rounded border p-4" data-testid="or-theory">
   <p className="text-xs text-neutral-500">Forrás: R16.10 saját magyar GUSEK-tanulókártyák. A korábban feltöltött egyetemi PDF-ek és .mod állományok még nincsenek ebbe a nézetbe importálva; ez a jelenleg ellenőrzött, beépített elméleti alap.</p>
   <label className="block text-sm font-semibold">Válassz témát:
    <select className="ml-2 rounded border bg-background p-2" value={kind} onChange={e=>{setKind(e.target.value as Kind);setQuizChoice(null);reset();}}>
     <option value="assignment">Hozzárendelés</option><option value="production">Termeléstervezés</option>
    </select>
   </label>
   <h2 className="text-xl font-semibold">{lesson.title}</h2>
   <p>{lesson.objective}</p>
   <ol className="list-decimal space-y-2 pl-5">{lesson.steps.map(step=><li key={step}>{step}</li>)}</ol>
   <p className="text-sm font-semibold">GNU MathProg mintázat (részlet, nem kész megoldás)</p>
   <pre className="overflow-x-auto rounded border p-3 text-xs"><code>{lesson.syntax}</code></pre>
   <fieldset className="space-y-3 rounded border p-3" data-testid="or-theory-check">
    <legend className="font-semibold">Elméleti önellenőrzés – nem vizsgapont</legend>
    <p>{lesson.question}</p>
    {lesson.choices.map((option,i)=><label className="flex cursor-pointer items-start gap-2" key={option}>
      <input type="radio" name="or-theory-answer" checked={quizChoice===i} onChange={()=>setQuizChoice(i)}/><span>{option}</span>
    </label>)}
    {quizChoice!==null&&<p role="status" data-testid="or-theory-feedback">
      {quizChoice===lesson.correct?'Helyes. ':'Érdemes még egyszer átnézned. '}{lesson.why}
    </p>}
   </fieldset>
   <div className="flex flex-wrap gap-3">
    <button type="button" disabled={quizChoice===null} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50" onClick={()=>{setStage('practice');reset();}}>Tovább a saját feladatmegoldáshoz</button>
    <Link className="rounded border px-4 py-2 text-sm" href="/chat/new?mode=teach">Elmélet megbeszélése a tanítóval</Link>
   </div>
   <p className="text-xs text-neutral-500">A tanítói beszélgetéshez külön AI-modell beállítása szükséges lehet. A fenti elmélet és az önellenőrzés offline, modellhívás nélkül működik. A gyakorlás szerveroldali pontozása ettől független.</p>
  </section>:<>
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
    {grade.points===0&&<button type="button" className="rounded border px-3 py-2" onClick={()=>{setStage("theory");setQuizChoice(null);}}>Elmélet újratanulása a szerveres hibajelzés után</button>}
    <button type="button" className="rounded border px-3 py-2" onClick={()=>setGrade(null)}>Javítom és újra beadom</button></section>}</>}
  {error&&<p role="alert" className="rounded border border-red-500 p-3 text-red-600">{error}</p>}
  </>}
 </main>;
}
