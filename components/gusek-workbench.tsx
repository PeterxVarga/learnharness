'use client';
import {useEffect,useRef,useState} from 'react';
import type {ChangeEvent,KeyboardEvent} from 'react';
import {GusekExam} from './gusek-exam';
import {GmplEditor} from './gusek-gmpl-editor';
import {classifyGlpkFeedback} from '../pilots/operations-research/glpk-feedback-r14z.mjs';
import {readFreeWorkspaceDraft,saveFreeWorkspaceDraft,listNamedGusekProjects,saveNamedGusekProject,loadNamedGusekProject,deleteNamedGusekProject} from '@/src/features/gusek/browser-drafts';
import {DEFAULT_MODEL,DEFAULT_DATA,validateWorkbenchFile,glpkDiagnosticLine,lineOffset,sameRunInputs} from '@/src/features/gusek/workspace-files.mjs';

type FileName='model.mod'|'data.dat';
type RunMode='check'|'solve';
type RuntimeResult={
 status:string;code:string;graded:false;points:null;mode?:RunMode;solverStatus?:string;
 objective?:number|null;diagnostic?:string;solutionListing?:string|null;statusCode?:string;
 columnStatus?:string;columns?:{name:string;value:number}[];
 error?:string;
};
type RunReceipt={input:{model:string;data:string};result:RuntimeResult};
const initialToken='';
function exportFile(filename:FileName,contents:string){
 const objectUrl=URL.createObjectURL(new Blob([contents],{type:'text/plain;charset=utf-8'}));
 try{
  const anchor=document.createElement('a');
  anchor.href=objectUrl;anchor.download=filename;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
 }finally{window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}
}
function jumpToLine(area:HTMLTextAreaElement|null,text:string,line:number){
 if(!area)return;
 const start=lineOffset(text,line);
 const finish=text.indexOf('\n',start);
 area.focus();
 area.setSelectionRange(start,finish<0?text.length:finish);
 const linesBefore=text.slice(0,start).split('\n').length-1;
 area.scrollTop=Math.max(0,(linesBefore-3)*24);
}
function FreeWorkspace({incoming}:{incoming:{model:string;data:string;revision:number}|null}){
 const [model,setModel]=useState(DEFAULT_MODEL);
 const [data,setData]=useState(DEFAULT_DATA);
 const [active,setActive]=useState<FileName>('model.mod');
 const [ready,setReady]=useState(false);
 const [saveState,setSaveState]=useState<'loading'|'saved'|'saving'|'unavailable'>('loading');
 const [nativeAvailable,setNativeAvailable]=useState(false);
 const [token,setToken]=useState(initialToken);
 const [running,setRunning]=useState(false);
 const cancelRef=useRef<AbortController|null>(null);
 const [cancelling,setCancelling]=useState(false);
 const [runReceipt,setRunReceipt]=useState<RunReceipt|null>(null);
 const [message,setMessage]=useState('');
 const [projectName,setProjectName]=useState('');
 const [projectId,setProjectId]=useState('');
 const [projects,setProjects]=useState<Array<{id:string;name:string;createdAt:number}>>([]);
 const [projectBusy,setProjectBusy]=useState(false);
 const fileInput=useRef<HTMLInputElement|null>(null);
 const saveRevision=useRef(0);
 const workspaceRevision=useRef(0);
 const nativeRunRevision=useRef(0);
 const modelEditor=useRef<HTMLTextAreaElement|null>(null);
 const dataEditor=useRef<HTMLTextAreaElement|null>(null);
 const source=active==='model.mod'?model:data;
 const currentResult=runReceipt?.result??null;
 const feedback=currentResult?classifyGlpkFeedback(currentResult):null;
 const stale=runReceipt!==null&&!sameRunInputs(runReceipt.input,model,data);
 const diagnostic=glpkDiagnosticLine(currentResult?.diagnostic??'');
 function cancelActiveNativeRun(){
  // Once a different draft/project is current, no old response may mutate it.
  nativeRunRevision.current++;
  cancelRef.current?.abort();
  cancelRef.current=null;
  setRunning(false);
  setCancelling(false);
 }
 useEffect(()=>{
  let live=true;
  const startedAt=workspaceRevision.current;
  void readFreeWorkspaceDraft().then(saved=>{
   if(!live)return;
   if(saved&&startedAt===workspaceRevision.current){setModel(saved.model);setData(saved.data);}
   setReady(true);setSaveState(saved?'saved':'saving');
  }).catch(()=>{if(live){setReady(true);setSaveState('unavailable');}});
  return()=>{live=false;};
 },[]);
 useEffect(()=>{
  if(!ready||saveState==='unavailable')return;
  const revision=++saveRevision.current;
  setSaveState('saving');
  const id=window.setTimeout(()=>{
   void saveFreeWorkspaceDraft(model,data)
    .then(()=>{if(revision===saveRevision.current)setSaveState('saved');})
    .catch(()=>{if(revision===saveRevision.current)setSaveState('unavailable');});
  },600);
  return()=>window.clearTimeout(id);
 },[model,data,ready]);
 useEffect(()=>{
  let live=true;
  void fetch('/api/pilot/gusek/native',{cache:'no-store'})
   .then(async r=>r.ok?r.json():null)
   .then(x=>{if(live)setNativeAvailable(x?.available===true);})
   .catch(()=>{if(live)setNativeAvailable(false);});
  return()=>{live=false;};
 },[]);
 useEffect(()=>{
  let live=true;
  void listNamedGusekProjects().then(items=>{if(live)setProjects(items);}).catch(()=>{});
  return()=>{live=false;};
 },[]);
 async function saveProjectSnapshot(){
  if(projectBusy||!projectName.trim())return;
  setProjectBusy(true);
  try{
   const created=await saveNamedGusekProject(projectName,model,data);
   setProjects(await listNamedGusekProjects());
   setProjectId(created.id);setProjectName('');
   setMessage('Projektpillanatkép elmentve helyben: '+created.name);
  }catch(e){setMessage(e instanceof Error?e.message:'Nem sikerült menteni a projektet.');}
  finally{setProjectBusy(false);}
 }
 async function openProjectSnapshot(){
  if(projectBusy||!projectId)return;
  setProjectBusy(true);
  const revisionAtOpen=workspaceRevision.current;
  try{
   const saved=await loadNamedGusekProject(projectId);
   if(revisionAtOpen!==workspaceRevision.current){
    setMessage('A munkaterület megváltozott. A régi projektbetöltés nem írta felül.');
    return;
   }
   if(!saved)throw Error('A projekt nem található vagy érvénytelen.');
   cancelActiveNativeRun();
   workspaceRevision.current++;
   setModel(saved.model);setData(saved.data);setRunReceipt(null);setActive('model.mod');
   setMessage('Projekt betöltve: '+saved.name);
  }catch(e){setMessage(e instanceof Error?e.message:'Nem sikerült megnyitni a projektet.');}
  finally{setProjectBusy(false);}
 }
 async function deleteProjectSnapshot(){
  if(projectBusy||!projectId)return;
  if(!window.confirm('Törlöd ezt a helyi projektpillanatképet? A jelenlegi szerkesztés megmarad.'))return;
  setProjectBusy(true);
  try{
   await deleteNamedGusekProject(projectId);
   setProjectId('');setProjects(await listNamedGusekProjects());
   setMessage('A helyi projektpillanatkép törölve.');
  }catch(e){setMessage(e instanceof Error?e.message:'A projekt törlése sikertelen.');}
  finally{setProjectBusy(false);}
 }
 useEffect(()=>{
  if(!ready||!incoming)return;
  if(!validateWorkbenchFile('model.mod',incoming.model).ok||
     !validateWorkbenchFile('data.dat',incoming.data).ok)return;
  cancelActiveNativeRun();
  workspaceRevision.current++;
  setModel(incoming.model);setData(incoming.data);setActive('model.mod');setRunReceipt(null);
  setMessage('Vizsgafeladat-másolat megnyitva. Ebben a munkaterületben nincs vizsgapontozás.');
 // Each incoming revision is unique. Original Practice sources remain unchanged.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[ready,incoming?.revision]);
 function setSource(next:string){
  const validated=validateWorkbenchFile(active,next);
  if(!validated.ok){setMessage(validated.error==='file_too_large'?'A fájl meghaladja a 64 KiB korlátot.':'Érvénytelen fájltartalom.');return;}
  cancelActiveNativeRun();
  workspaceRevision.current++;
  if(active==='model.mod')setModel(next);else setData(next);
  setMessage('');
 }
 async function importSelected(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];
  event.target.value='';
  if(!file)return;
  const startedAt=workspaceRevision.current;
  if(file.size>65_536){setMessage('A kiválasztott fájl meghaladja a 64 KiB korlátot.');return;}
  try{
   const filename=file.name.toLowerCase();
   const target:FileName=filename.endsWith('.mod')?'model.mod':filename.endsWith('.dat')?'data.dat':active;
   if(!filename.endsWith('.mod')&&!filename.endsWith('.dat'))throw new Error('Csak .mod és .dat fájl importálható.');
   const text=await file.text();
   if(startedAt!==workspaceRevision.current){setMessage('Az időközben módosított munkaterület megőrzése miatt a korábbi fájlimportot elvetettem.');return;}
   const checked=validateWorkbenchFile(target,text);
   if(!checked.ok)throw new Error('Nem támogatott vagy túl nagy fájl.');
   cancelActiveNativeRun();
   workspaceRevision.current++;
   if(target==='model.mod')setModel(text);else setData(text);
   setActive(target);
   setMessage(target+' fájl importálva. A szerkesztőben ellenőrizheted.');
  }catch(e){if(startedAt===workspaceRevision.current)setMessage(e instanceof Error?e.message:'Fájlolvasási hiba.');}
 }
 function diagnosticJump(){
  if(!diagnostic)return;
  const file=diagnostic.file;
  if(file!=='model.mod'&&file!=='data.dat')return;
  setActive(file);
  requestAnimationFrame(()=>{
   const area=file==='model.mod'?modelEditor.current:dataEditor.current;
   jumpToLine(area,file==='model.mod'?model:data,diagnostic.line);
  });
 }
 async function runNative(mode:RunMode){
  if(!nativeAvailable||running||cancelRef.current)return;
  setMessage('');
  if(!/^[a-f0-9]{64}$/.test(token)){setMessage('Adj meg egy 64 karakteres, helyi GLPK futtatási tokent.');return;}
  if(!model.trim()){setMessage('A model.mod nem lehet üres.');return;}
  if(!validateWorkbenchFile('model.mod',model).ok||!validateWorkbenchFile('data.dat',data).ok){
   setMessage('A modell vagy az adatfájl túl nagy.');return;
  }
  const input={model,data};
  const controller=new AbortController();cancelRef.current=controller;
  const startedAt=++nativeRunRevision.current;
  setRunning(true);setCancelling(false);setRunReceipt(null);
  try{
   const response=await fetch('/api/pilot/gusek/native',{
    method:'POST',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json','X-LH-GLPK-Token':token},
    body:JSON.stringify({model:input.model,data:input.data,mode})
   });
   const result=await response.json() as RuntimeResult;
   if(controller.signal.aborted||nativeRunRevision.current!==startedAt)return;
   if(!response.ok&&result.status!=='BLOCKED')throw new Error(result.error??'GLPK futtatási hiba.');
   if(result.graded!==false||result.points!==null)throw new Error('Érvénytelen megoldóválasz.');
   if(nativeRunRevision.current===startedAt)setRunReceipt({input,result});
  }catch(e){
   if(nativeRunRevision.current===startedAt)
    setMessage(controller.signal.aborted?'A GLPK-futtatás megszakítva. A konténer felszabadításáig új kérés átmenetileg foglalt lehet.':e instanceof Error?e.message:'Nem sikerült futtatni a GLPK-t.');
  }finally{
   if(nativeRunRevision.current===startedAt&&cancelRef.current===controller){
    cancelRef.current=null;setCancelling(false);setRunning(false);
   }
  }
 }
 function keyDown(e:KeyboardEvent<HTMLTextAreaElement>){
  if(!(e.ctrlKey||e.metaKey))return;
  if(e.key.toLowerCase()==='s'){
   e.preventDefault();setMessage('A munkaterületet a böngésző automatikusan menti.');
  }else if(e.key==='Enter'){
   e.preventDefault();
   if(!nativeAvailable){setMessage('A helyi GLPK-futtatás nincs engedélyezve.');return;}
   void runNative(e.shiftKey?'check':'solve');
  }
 }
 return <div data-testid="gusek-free-workspace-r14" data-draft-ready={ready?'true':'false'} className="mx-auto max-w-[1500px] space-y-3 px-3 py-4 sm:px-6">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="text-xl font-semibold">Szabad MathProg-munkaterület</h2>
    <p className="text-sm text-neutral-500">Saját .mod és .dat fájlok · eredeti GNU GLPK · vizsgapontozás nélkül</p>
   </div>
   <span data-testid="gusek-draft-status-r14" className="text-xs text-neutral-500">
    {saveState==='loading'?'Piszkozat betöltése…':saveState==='saved'?'Helyben mentve':saveState==='saving'?'Mentés folyamatban…':'Helyi mentés nem elérhető'}
   </span>
  </header>
  <section className="flex flex-wrap items-end gap-2 rounded-xl border p-3" aria-label="Helyi GUSEK projektek" data-testid="gusek-project-manager-r14z">
   <label className="text-xs">Pillanatkép neve
    <input aria-label="Projektpillanatkép neve" maxLength={80} value={projectName} onChange={e=>setProjectName(e.target.value)}
     placeholder="Pl. szállítási feladat" className="mt-1 block rounded border bg-background p-2 text-sm"/>
   </label>
   <button type="button" data-testid="gusek-project-save-r14z" disabled={projectBusy||!projectName.trim()} onClick={()=>void saveProjectSnapshot()}
    className="rounded border px-3 py-2 text-sm disabled:opacity-50">Mentés projektként</button>
   <label className="text-xs">Mentett helyi projektek
    <select aria-label="Mentett helyi projektek" value={projectId} onChange={e=>setProjectId(e.target.value)}
     className="mt-1 block max-w-52 rounded border bg-background p-2 text-sm">
     <option value="">Projekt kiválasztása</option>
     {projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
   </label>
   <button type="button" data-testid="gusek-project-open-r14z" disabled={projectBusy||!projectId} onClick={()=>void openProjectSnapshot()}
    className="rounded border px-3 py-2 text-sm disabled:opacity-50">Projekt megnyitása</button>
   <button type="button" data-testid="gusek-project-delete-r14z" disabled={projectBusy||!projectId} onClick={()=>void deleteProjectSnapshot()}
    className="rounded border px-3 py-2 text-sm disabled:opacity-50">Pillanatkép törlése</button>
   <p className="w-full text-xs text-neutral-500">A projektmentés névvel ellátott helyi pillanatkép. A szerkesztőt külön automatikusan mentjük.</p>
  </section>
  <div className="flex flex-wrap gap-2">
   <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>fileInput.current?.click()}>Fájl importálása</button>
   <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>exportFile(active,source)}>Aktív fájl letöltése</button>
   <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={()=>{
    if(!window.confirm('Új üres munkaterületet szeretnél? A jelenlegi piszkozat felülíródik.'))return;
    workspaceRevision.current++;
    cancelActiveNativeRun();
    setModel('');setData('');setRunReceipt(null);setActive('model.mod');setMessage('Új munkaterület létrehozva.');
   }}>Új munkaterület</button>
   <input ref={fileInput} type="file" className="hidden" accept=".mod,.dat,text/plain" onChange={e=>void importSelected(e)} aria-label="Fájl feltöltése"/>
  </div>
  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(280px,380px)]">
   <section className="min-w-0 overflow-hidden rounded-xl border" aria-label="MathProg szerkesztő">
    <div className="flex items-center gap-1 border-b p-2">
     {(['model.mod','data.dat'] as const).map(name=><button type="button" key={name}
      data-testid={'gusek-file-'+name.replace('.','-')+'-r14'} aria-pressed={active===name}
      className={'rounded px-3 py-2 font-mono text-xs '+(active===name?'bg-neutral-200 font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-white':'text-neutral-500')}
      onClick={()=>setActive(name)}>{name}{name==='data.dat'&&!data.trim()?' (üres)':''}</button>)}
     <span className="ml-auto text-xs text-neutral-500">{new TextEncoder().encode(source).length} bájt</span>
    </div>
    <div className="p-3">
     <GmplEditor label="model.mod szerkesztő" testId="gusek-free-model-r14"
      textareaRef={modelEditor} value={model} onChange={setSource}
      hidden={active!=='model.mod'} onKeyDown={keyDown}
      diagnosticLine={active==='model.mod'?diagnostic?.file==='model.mod'?diagnostic.line:null:null} />
     <GmplEditor label="data.dat szerkesztő" testId="gusek-free-data-r14"
      textareaRef={dataEditor} value={data} onChange={setSource}
      hidden={active!=='data.dat'} onKeyDown={keyDown}
      diagnosticLine={active==='data.dat'?diagnostic?.file==='data.dat'?diagnostic.line:null:null} />
    </div>
    <p className="px-3 pb-2 text-xs text-neutral-500">Automatikus helyi piszkozat · Ctrl+Enter: GLPK-futtatás · Ctrl+Shift+Enter: ellenőrzés · Ctrl+S: mentési állapot. Nem kerül a Practice-előzményekbe.</p>
   </section>
   <section className="min-w-0 space-y-3 rounded-xl border p-4" aria-label="GLPK vezérlés és eredmény">
    <h3 className="font-semibold">GNU GLPK</h3>
    {nativeAvailable?<div className="space-y-3">
     <label className="block text-sm">Helyi futtatási token
      <input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}
       placeholder="64 karakteres hexadecimális token" className="mt-1 w-full rounded border bg-transparent p-2 font-mono text-sm"/>
     </label>
     <div className="flex flex-wrap gap-2">
      <button type="button" data-testid="gusek-free-check-r14" disabled={running||!ready} onClick={()=>void runNative('check')} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Fordítás ellenőrzése</button>
      <button type="button" data-testid="gusek-free-solve-r14" disabled={running||!ready} onClick={()=>void runNative('solve')} className="rounded bg-foreground px-3 py-2 text-sm text-background disabled:opacity-50">Megoldás GLPK-val</button>
      {running&&<button type="button" data-testid="gusek-free-cancel-r14" disabled={cancelling} onClick={()=>{setCancelling(true);cancelRef.current?.abort();}} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Futtatás megszakítása</button>}
     </div>
    </div>:<p data-testid="gusek-free-disabled-r14" className="text-sm text-neutral-500">A natív megoldó ezen a gépen nincs engedélyezve. A fájlok továbbra is szerkeszthetők és menthetők.</p>}
    {running&&<p role="status" className="text-sm">A modell futtatása folyamatban…</p>}
    {currentResult&&<div className="space-y-2" data-testid="gusek-free-result-r14">
     <p className="text-sm font-medium">Futtatás: {currentResult.status}</p>
     {feedback&&<div data-testid="gusek-free-feedback-r14z" role="status" className="space-y-1 border-l-2 border-neutral-400 pl-3">
      <p className="text-sm font-semibold">{feedback.title}</p>
      <p className="text-xs">{feedback.detail}</p>
      <p className="text-xs text-neutral-600 dark:text-neutral-300">{feedback.nextAction}</p>
     </div>}
     {stale?<p className="text-sm text-amber-700">A fájlok a futtatás óta módosultak. Az eredmény egy korábbi változathoz tartozik.</p>:null}
     <p className="text-sm">GLPK megoldási állapot: <strong>{currentResult.solverStatus??'UNKNOWN'}</strong></p>
     {currentResult.solverStatus==='OPTIMAL'&&typeof currentResult.objective==='number'&&
      <p className="text-sm">Célfüggvény: {currentResult.objective}</p>}
     {currentResult.solverStatus==='INFEASIBLE'&&<p className="text-xs text-amber-700">A modellre nem talált megengedett megoldást.</p>}
     {currentResult.columns&&currentResult.columns.length>0&&<div className="max-h-60 overflow-auto rounded border p-2" data-testid="gusek-free-columns-r14">
      <p className="mb-2 text-sm font-semibold">Strukturált változók ({currentResult.columns.length})</p>
      <table className="w-full text-xs"><thead><tr><th className="text-left">Név</th><th className="text-right">Érték</th></tr></thead>
       <tbody>{currentResult.columns.map(c=><tr key={c.name} className="border-t"><td className="break-all font-mono">{c.name}</td><td className="text-right font-mono">{c.value}</td></tr>)}</tbody>
      </table>
     </div>}
     {currentResult.solverStatus==='FEASIBLE_NOT_PROVEN_OPTIMAL'&&<p className="text-xs text-amber-700">Lehetséges megoldás, de nincs bizonyított optimum.</p>}
     <p className="text-xs text-neutral-500">A GLPK-kimenet nem vizsgapont és nem modellhelyességi bizonyíték.</p>
    </div>}
   </section>
  </div>
  <section className="space-y-2 rounded-xl border p-3" aria-label="GLPK kimenet">
   <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Konzol és megoldáslista</h3>
    {diagnostic&&<button type="button" onClick={diagnosticJump} className="rounded border px-2 py-1 text-xs">
     Ugrás a hibára: {diagnostic.file}:{diagnostic.line}
    </button>}
   </div>
   {message&&<p role="alert" className="text-sm text-amber-700">{message}</p>}
   {currentResult?.diagnostic&&<pre data-testid="gusek-free-console-r14" className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-3 font-mono text-xs text-neutral-900">{currentResult.diagnostic}</pre>}
   {currentResult?.solutionListing&&<pre data-testid="gusek-free-solution-r14" className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-100 p-3 font-mono text-xs text-neutral-900">{currentResult.solutionListing}</pre>}
   {!currentResult&&!message&&<p className="text-sm text-neutral-500">A fordítási hibák, megoldási státusz és változólista a futtatás után jelenik meg.</p>}
  </section>
 </div>;
}
export function GusekWorkbench({chatId,embedded=false,onRequestCoaching}:{
 chatId?:string;embedded?:boolean;onRequestCoaching?:()=>void;
}){
 const [mode,setMode]=useState<'practice'|'workspace'>('practice');
 const [hydrated,setHydrated]=useState(false);
 const [copied,setCopied]=useState<{model:string;data:string;revision:number}|null>(null);
 // SSR markup can exist before event handlers hydrate. Browser acceptance
 // must not mistake it for a ready interactive workbench.
 useEffect(()=>{setHydrated(true);},[]);
 const copyCounter=useRef(0);
 function copyToFree(model:string,data:string){
  if(!validateWorkbenchFile('model.mod',model).ok||!validateWorkbenchFile('data.dat',data).ok)return;
  if(!window.confirm('A szabad munkaterület jelenlegi szerkesztését felülírjuk a vizsgafeladat másolatával. Folytatod?'))return;
  setCopied({model,data,revision:++copyCounter.current});setMode('workspace');
 }
 return <div data-testid="gusek-workbench-r14" data-hydrated={hydrated?'true':'false'} className="w-full space-y-2">
  <nav aria-label="GUSEK munkaterület üzemmód" className="mx-auto flex max-w-[1500px] flex-wrap gap-2 px-5 pt-4">
   <button type="button" data-testid="gusek-mode-practice-r14" aria-pressed={mode==='practice'}
    className={'rounded-lg border px-4 py-2 text-sm '+(mode==='practice'?'bg-foreground text-background':'')}
    onClick={()=>setMode('practice')}>Vizsgagyakorlás</button>
   <button type="button" data-testid="gusek-mode-free-r14" aria-pressed={mode==='workspace'}
    className={'rounded-lg border px-4 py-2 text-sm '+(mode==='workspace'?'bg-foreground text-background':'')}
    onClick={()=>setMode('workspace')}>Szabad munkaterület</button>
  </nav>
  {/* Keep both mounted so switching never destroys an unsent practice attempt. */}
  <div hidden={mode!=='practice'}><GusekExam chatId={chatId} embedded={embedded} onRequestCoaching={onRequestCoaching} onCopyToWorkspace={copyToFree}/></div>
  <div hidden={mode!=='workspace'}><FreeWorkspace incoming={copied}/></div>
 </div>;
}
