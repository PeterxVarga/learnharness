"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {makeTeachingHandoff} from '../learning/teaching-handoff-r168.mjs';

type Grade={taskId:string;points:0|1|null;maxPoints:1;correct:boolean|null;errors:string[]};
type Brief={topic:string;steps:string[];state:string}|null;
type Suggestion={kind:string;seed:number;reason:string}|null;
/** This widget never POSTs, persists, or modifies an authoritative assessment. */
export function TredvenTeachingHandoff({grade,taskKind,task,diagnostic,suggestion,hintsUsed}:{
 grade:Grade;taskKind:string;task:unknown;diagnostic:Brief;suggestion:Suggestion;hintsUsed:boolean;
}){
 const [copyState,setCopyState]=useState<'idle'|'copied'|'select'>('idle');
 const brief=makeTeachingHandoff({grade,taskKind,task,diagnostic,suggestion,hintsUsed});
 useEffect(()=>{setCopyState('idle');},[brief?.text]);
 if(!brief)return null;
 return <details className="space-y-2 rounded-lg border p-3" data-testid="tredven-r168-teaching-handoff">
  <summary className="cursor-pointer text-sm font-semibold">Folytatás a LearnHarness tanítóval · tanulási brief</summary>
  <p className="mt-2 text-xs text-neutral-500">A már látható feladatadatokból és az R15 diagnosztikájából készül. A feladat számai is átkerülnek, ha bemásolod. Nincs benne a beadott modell, az optimum vagy GLPK-token; semmit nem küld automatikusan.</p>
  <textarea aria-label="Tanári átadási brief" readOnly value={brief.text} rows={10}
   className="mt-2 block w-full resize-y rounded border bg-transparent p-2 font-mono text-xs" data-testid="tredven-r168-handoff-text" />
  <div className="mt-2 flex flex-wrap items-center gap-3">
   <button type="button" className="rounded border px-3 py-2 text-sm" data-testid="tredven-r168-copy"
    onClick={async()=>{try{
       if(!navigator.clipboard?.writeText)throw Error('clipboard_unavailable');
       await navigator.clipboard.writeText(brief.text);setCopyState('copied');
     }catch{setCopyState('select');}}}>Brief másolása</button>
   <Link href="/chat/new?mode=teach" className="rounded border px-3 py-2 text-sm" data-testid="tredven-r169-open-teacher">Tanítóbeszélgetés megnyitása</Link>
   <span role="status" className="text-xs text-neutral-500">{copyState==='copied'?'Vágólapra másolva. Nyiss egy LearnHarness tanítóbeszélgetést és illeszd be.':
    copyState==='select'?'A vágólap nem elérhető. Jelöld ki és másold ki kézzel a fenti szöveget.':''}</span>
  </div>
  <p className="text-xs text-neutral-500">A tanítóban illeszd be a briefet, magyarázd el a saját gondolatmenetedet, majd térj vissza ide: javítsd a meglévő modellt, és az eredeti GUSEK-ellenőrzővel add be újra. A tanító válasza nem vizsgapont.</p>
 </details>;
}
