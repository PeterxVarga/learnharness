'use client';
import {useEffect,useRef,useState} from 'react';
import type {KeyboardEvent,Ref} from 'react';
import {tokenizeGmplLine,makeGmplEdit,indentGmplSelection,commentGmplSelection,
 nextSearchMatch,completionForGmpl,lineNumberAt} from '@/src/features/gusek/gmpl-editor-core.mjs';

type Props={
 id?:string;value:string;onChange:(value:string)=>void;label:string;
 textareaRef?:Ref<HTMLTextAreaElement>;readOnly?:boolean;hidden?:boolean;
 diagnosticLine?:number|null;placeholder?:string;className?:string;
 onKeyDown?:(event:KeyboardEvent<HTMLTextAreaElement>)=>void;
 testId?:string;rows?:number;
};
const colors:Record<string,string>={
 keyword:'text-blue-700 dark:text-blue-300',
 identifier:'text-foreground',
 number:'text-amber-700 dark:text-amber-300',
 string:'text-emerald-700 dark:text-emerald-300',
 comment:'text-neutral-500 italic',
 operator:'text-violet-700 dark:text-violet-300',
 plain:'text-foreground'
};
const control='rounded border px-2 py-1 text-xs disabled:opacity-50';
export function GmplEditor({id,value,onChange,label,textareaRef,readOnly=false,hidden=false,
 diagnosticLine,placeholder,className='',onKeyDown,testId,rows=15}:Props){
 const local=useRef<HTMLTextAreaElement|null>(null);
 const gutter=useRef<HTMLDivElement|null>(null);
 const [findOpen,setFindOpen]=useState(false);
 const [previewOpen,setPreviewOpen]=useState(false);
 const [query,setQuery]=useState('');
 const [replacement,setReplacement]=useState('');
 const [cursor,setCursor]=useState(0);
 const [searchStatus,setSearchStatus]=useState('');
 const lines=value.split('\n');
 const completions=completionForGmpl(value.slice(Math.max(0,cursor-64),cursor));
 function attach(node:HTMLTextAreaElement|null){
  local.current=node;
  if(typeof textareaRef==='function')textareaRef(node);
  else if(textareaRef&&typeof textareaRef==='object')textareaRef.current=node;
 }
 function selection(from:number,to:number=from){
  requestAnimationFrame(()=>{
   const t=local.current;
   if(!t)return;t.focus();t.setSelectionRange(from,to);
   const before=value.slice(0,from).split('\n').length-1;
   t.scrollTop=Math.max(0,(before-3)*24);
   if(gutter.current)gutter.current.scrollTop=t.scrollTop;
  });
 }
 useEffect(()=>{
  if(!Number.isSafeInteger(diagnosticLine)||!diagnosticLine||diagnosticLine<1)return;
  const t=local.current;if(!t||hidden)return;
  const offset=value.split('\n').slice(0,diagnosticLine-1).reduce((n,s)=>n+s.length+1,0);
  selection(Math.min(offset,value.length));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[diagnosticLine,hidden]);
 function edit(from:number,to:number,insert:string){
  if(readOnly)return;
  const next=makeGmplEdit(value,from,to,insert);
  if(!next)return;
  onChange(next.value);setCursor(next.cursor);selection(next.cursor);
 }
 function handleKey(e:KeyboardEvent<HTMLTextAreaElement>){
  onKeyDown?.(e);
  if(e.defaultPrevented)return;
  const t=e.currentTarget,from=t.selectionStart,to=t.selectionEnd;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){
   e.preventDefault();setFindOpen(true);setSearchStatus('');return;
  }
  if(readOnly)return;
  if((e.ctrlKey||e.metaKey)&&e.key==='/'){
   e.preventDefault();const next=commentGmplSelection(value,from,to);
   if(next){onChange(next.value);selection(next.selectionStart,next.selectionEnd);}
   return;
  }
  if(e.key==='Tab'&&!e.ctrlKey&&!e.metaKey){
   e.preventDefault();
   if(to>from||e.shiftKey){
    const next=indentGmplSelection(value,from,to,{outdent:e.shiftKey});
    if(next){onChange(next.value);selection(next.selectionStart,next.selectionEnd);}
   }else edit(from,to,'  ');
   return;
  }
  if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey&&from===to){
   const start=value.lastIndexOf('\n',Math.max(0,from-1))+1;
   const indent=/^[ \t]*/.exec(value.slice(start,from))?.[0]??'';
   e.preventDefault();edit(from,to,'\n'+indent);
  }
 }
 function seek(from:number){
  const match=nextSearchMatch(value,query,from);
  if(!match){setSearchStatus('Nincs találat.');return;}
  selection(match.from,match.to);
  setSearchStatus('Találat: '+match.line+'. sor');
 }
 function replaceOne(){
  if(readOnly||!query)return;
  const t=local.current;
  const from=t?.selectionStart??0,to=t?.selectionEnd??0;
  const selected=value.slice(from,to);
  const m=selected.toLowerCase()===query.toLowerCase()?{from,to}:nextSearchMatch(value,query,from);
  if(!m){setSearchStatus('Nincs cserélhető találat.');return;}
  edit(m.from,m.to,replacement);
  setSearchStatus('Egy találat cserélve.');
 }
 function insertCompletion(word:string){
  if(readOnly)return;
  const t=local.current,at=t?.selectionStart??cursor;
  const prefix=/[A-Za-z_.]*$/.exec(value.slice(0,at))?.[0]??'';
  edit(at-prefix.length,at,word);
 }
 return <div hidden={hidden} data-testid={testId?testId+'-shell':undefined} className={'space-y-2 '+className}>
  <div className="flex flex-wrap items-center gap-2">
   <span className="font-mono text-xs text-neutral-500">{label}</span>
   <span className="text-xs text-neutral-500">{lines.length} sor · {lineNumberAt(value,cursor)}. sor</span>
   <span className="ml-auto"/>
   <button type="button" className={control} onClick={()=>setFindOpen(x=>!x)}>Keresés / csere</button>
   <button type="button" className={control} aria-pressed={previewOpen} onClick={()=>setPreviewOpen(x=>!x)}>Szintaxisnézet</button>
  </div>
  {findOpen&&<div className="flex flex-wrap items-center gap-2 rounded border p-2" data-testid="gusek-editor-find-r14">
    <input aria-label="Keresett szöveg" placeholder="Keresés" className="max-w-40 rounded border bg-transparent p-1 text-sm" value={query} onChange={e=>setQuery(e.target.value)} />
    <button type="button" className={control} onClick={()=>seek((local.current?.selectionEnd??0))}>Következő</button>
    {!readOnly&&<><input aria-label="Csere erre" placeholder="Csere erre" className="max-w-40 rounded border bg-transparent p-1 text-sm" value={replacement} onChange={e=>setReplacement(e.target.value)}/>
     <button type="button" className={control} onClick={replaceOne}>Csere</button></>}
    <span role="status" className="text-xs text-neutral-500">{searchStatus}</span>
   </div>}
  <div className="flex min-w-0 overflow-hidden rounded-lg border focus-within:ring-2 focus-within:ring-blue-500">
   <div ref={gutter} aria-hidden="true" className="max-h-[34rem] shrink-0 select-none overflow-hidden border-r bg-neutral-100/60 px-2 py-3 text-right font-mono text-xs leading-6 text-neutral-500 dark:bg-neutral-900/50">
    {lines.map((_,i)=><div key={i} className={diagnosticLine===i+1?'bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-white':''}>{i+1}</div>)}
   </div>
   <textarea ref={attach} id={id} aria-label={label} data-testid={testId} readOnly={readOnly}
    rows={rows} value={value} spellCheck={false} placeholder={placeholder}
    onChange={e=>{onChange(e.target.value);setCursor(e.target.selectionStart);}}
    onSelect={e=>setCursor(e.currentTarget.selectionStart)}
    onScroll={e=>{if(gutter.current)gutter.current.scrollTop=e.currentTarget.scrollTop;}}
    onKeyDown={handleKey}
    className="max-h-[34rem] min-h-[22rem] w-full min-w-0 resize-y bg-transparent p-3 font-mono text-sm leading-6 outline-none"/>
  </div>
  {!readOnly&&completions.length>0&&<div className="flex flex-wrap gap-1" aria-label="MathProg kulcsszójavaslatok">
   {completions.map(term=><button key={term} type="button" className={control} onClick={()=>insertCompletion(term)}>{term}</button>)}
  </div>}
  {previewOpen&&<section className="max-h-52 overflow-auto rounded border bg-neutral-50 p-3 font-mono text-xs dark:bg-neutral-900" aria-label="MathProg szintaxiskiemelt előnézet">
   {lines.slice(0,400).map((line,i)=><div key={i} className="min-h-5 whitespace-pre-wrap break-all">
    {tokenizeGmplLine(line).map((token,j)=><span key={j} className={colors[token.kind]??colors.plain}>{token.text}</span>)}
   </div>)}
   {lines.length>400&&<p className="text-neutral-500">Az előnézet az első 400 sorra korlátozódik.</p>}
  </section>}
  <p className="text-xs text-neutral-500">Tab: behúzás · Shift+Tab: visszahúzás · Ctrl+/: komment · Ctrl+F: keresés</p>
 </div>;
}
