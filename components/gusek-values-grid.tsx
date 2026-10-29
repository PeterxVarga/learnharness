'use client';
import {useMemo,useState} from 'react';
import type {ClipboardEvent,ChangeEvent} from 'react';
import {expectedGridNames,readGridAnswer,editGridAnswer,pasteGridAnswer} from '../pilots/operations-research/gusek-values-grid-r14z.mjs';

type Kind='transport'|'froccs'|'tablet';
type Props={
 kind:Kind;dialect:'scalar'|'indexed';variableNames:string[];
 value:string;onChange:(value:string)=>void;disabled?:boolean;
};
export function GusekValuesGrid({kind,dialect,variableNames,value,onChange,disabled=false}:Props){
 const [pasteNotice,setPasteNotice]=useState('');
 const [showJson,setShowJson]=useState(false);
 const names=useMemo(()=>expectedGridNames(kind,variableNames,dialect),[kind,variableNames,dialect]);
 const parsed=useMemo(()=>names?readGridAnswer(value,names):
  {ok:false,code:'unknown_variable_set',cells:[]},[value,names]);
 const columns=kind==='transport'?3:kind==='froccs'?5:2;
 function edit(name:string,raw:string){
  if(!names||disabled)return;
  const outcome=editGridAnswer(value,names,name,raw);
  if(!outcome.ok||typeof outcome.json!=='string'){setPasteNotice('Nem sikerült módosítani az értéket.');return;}
  onChange(outcome.json);setPasteNotice('');
 }
 function paste(e:ClipboardEvent<HTMLInputElement>,name:string){
  if(!names||disabled)return;
  const source=e.clipboardData.getData('text/plain');
  if(!/[\t\n\r]/.test(source))return;
  const outcome=pasteGridAnswer(value,names,name,source);
  e.preventDefault();
  if(!outcome.ok||typeof outcome.json!=='string'){setPasteNotice('Nem megfelelő táblázat: csak véges számok és legfeljebb '+names.length+' változó illeszthető be.');return;}
  onChange(outcome.json);
  setPasteNotice(outcome.imported+' változóérték beillesztve. Az eredményt még be kell adnod.');
 }
 function changeJson(e:ChangeEvent<HTMLTextAreaElement>){
  if(disabled)return;
  onChange(e.target.value);setPasteNotice('');
 }
 return <section data-testid="gusek-values-grid-r14z" className="space-y-3 rounded-xl border p-3" aria-label="Vizsgamegoldás változótáblázat">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div>
    <h3 className="font-semibold">Megoldás változóértékei</h3>
    <p className="text-xs text-neutral-500">{kind==='transport'?'3 × 3 szállítási mátrix':kind==='froccs'?'10 fröccstermék':'2 tablettatípus'} · Pontot kizárólag a külön beadás adhat.</p>
   </div>
   <button type="button" data-testid="gusek-values-json-toggle-r14z" aria-expanded={showJson}
    className="rounded border px-3 py-1.5 text-xs" onClick={()=>setShowJson(x=>!x)}>
    {showJson?'JSON bezárása':'JSON szerkesztése'}
   </button>
  </div>
  {parsed.ok&&names?<div className={'grid gap-2 '+(columns===3?'grid-cols-3':columns===5?'grid-cols-2 sm:grid-cols-5':'grid-cols-2')}>
   {parsed.cells.map((cell,index)=><label key={cell.name} className="min-w-0 space-y-1">
     <span className="block truncate font-mono text-xs" title={cell.name}>{kind==='transport'&&dialect==='indexed'?
       'R'+(Math.floor(index/3)+1)+' → B'+(index%3+1):cell.name}</span>
     <input data-testid={'gusek-value-cell-'+index} aria-label={cell.name} type="text" inputMode="decimal"
      autoComplete="off" disabled={disabled} value={cell.text}
      onPaste={e=>paste(e,cell.name)} onChange={e=>edit(cell.name,e.target.value)}
      className={'w-full min-w-0 rounded border bg-transparent px-2 py-2 font-mono text-sm disabled:opacity-50 '+(!cell.valid?'border-amber-600':'')}/>
    </label>)}
  </div>:<p role="alert" className="text-sm text-amber-700">
   Az értéktábla nem jeleníthető meg ({parsed.code}). Javítsd az eredeti JSON-t a haladó nézetben; nem írjuk felül automatikusan.
  </p>}
  {parsed.ok&&parsed.code==='invalid_numeric_value'&&<p role="alert" className="text-sm text-amber-700">
    Egyes értékek még nem érvényes számok. A teljes megoldás beadásához minden mezőbe szám szükséges.
  </p>}
  {pasteNotice&&<p role="status" className="text-xs">{pasteNotice}</p>}
  <p className="text-xs text-neutral-500">A táblában számokat adhatsz meg. Több értéket tabulátorral vagy sortöréssel is beilleszthetsz; a sorrend a fenti mezőké.</p>
  <div hidden={!showJson}>
   <label htmlFor="gusek-values" className="mb-1 block text-sm font-semibold">Haladó nézet: eredeti JSON változóértékek</label>
   <textarea id="gusek-values" data-testid="gusek-values-json-r14z" className="h-40 w-full rounded border bg-transparent p-3 font-mono text-sm"
    value={value} disabled={disabled} spellCheck={false} onChange={changeJson}/>
  </div>
 </section>;
}
