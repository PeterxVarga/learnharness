/** Deterministic, offline GMPL editing helpers.
 * This is an editor helper, not a validator or a GMPL parser. All text remains
 * untrusted; never infer mathematical correctness or grade from this module.
 */
export const LANGUAGE_TERMS=Object.freeze([
 'set','param','var','integer','binary','symbolic','default','within','in',
 'sum','prod','min','max','if','then','else','s.t.','subject to',
 'minimize','maximize','solve','end','data','display','printf','check',
 'table','let','for','include','cross','union','inter','diff'
]);
const MAX_SOURCE=65536;
const safe=s=>typeof s==='string'&&s.length<=MAX_SOURCE&&!s.includes('\0');
const RES=/(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z0-9_.]*)|(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(<=|>=|!=|:=|[+\-*\/=<>{}()[\],;:])/g;
const terms=new Set(LANGUAGE_TERMS);
export function tokenizeGmplLine(line){
 if(typeof line!=='string'||line.length>4096)return [];
 const out=[];let pos=0;
 for(const match of line.matchAll(RES)){
  const start=match.index;
  if(start>pos)out.push({text:line.slice(pos,start),kind:'plain'});
  const raw=match[0];
  const kind=match[1]?'comment':match[2]?'string':
   match[3]?(terms.has(raw.toLowerCase())?'keyword':'identifier'):
   match[4]?'number':'operator';
  out.push({text:raw,kind});
  pos=start+raw.length;
  if(match[1])break;
 }
 if(pos<line.length)out.push({text:line.slice(pos),kind:'plain'});
 return out;
}
export function lineNumberAt(source,offset){
 if(!safe(source)||!Number.isSafeInteger(offset))return 1;
 const at=Math.min(Math.max(offset,0),source.length);
 return 1+(source.slice(0,at).match(/\n/g)||[]).length;
}
export function nextSearchMatch(source,query,from=0){
 if(!safe(source)||typeof query!=='string'||query.length<1||query.length>256)return null;
 const at=Math.max(0,Number.isSafeInteger(from)?from:0);
 const position=source.toLowerCase().indexOf(query.toLowerCase(),at);
 const start=position<0?source.toLowerCase().indexOf(query.toLowerCase()):position;
 return start<0?null:{from:start,to:start+query.length,line:lineNumberAt(source,start)};
}
export function makeGmplEdit(source,from,to,insert){
 if(!safe(source)||typeof insert!=='string'||!Number.isSafeInteger(from)||
   !Number.isSafeInteger(to)||from<0||to<from||to>source.length)
  return null;
 const value=source.slice(0,from)+insert+source.slice(to);
 return safe(value)?{value,cursor:from+insert.length}:null;
}
export function indentGmplSelection(source,from,to,{outdent=false}={}){
 if(!safe(source)||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
   from<0||to<from||to>source.length)return null;
 const a=source.lastIndexOf('\n',Math.max(0,from-1))+1;
 const end=to>from&&source[to-1]==='\n'?to-1:to;
 const last=source.indexOf('\n',end);
 const b=last<0?source.length:last;
 const value=source.slice(a,b);
 const parts=value.split('\n');
 const next=parts.map(s=>outdent?s.replace(/^(?: {1,2}|\t)/,''):'  '+s);
 const count=next.reduce((acc,line,i)=>acc+line.length-parts[i].length,0);
 const edit=makeGmplEdit(source,a,b,next.join('\n'));
 return edit?{...edit,selectionStart:Math.max(a,from+(outdent?Math.max(-2,next[0].length-parts[0].length):2)),selectionEnd:Math.max(a,to+count)}:null;
}
export function commentGmplSelection(source,from,to){
 if(!safe(source)||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
   from<0||to<from||to>source.length)return null;
 const a=source.lastIndexOf('\n',Math.max(0,from-1))+1;
 const last=source.indexOf('\n',to);
 const b=last<0?source.length:last;
 const parts=source.slice(a,b).split('\n');
 const uncomment=parts.every(x=>/^\s*#/.test(x));
 const next=parts.map(x=>uncomment?x.replace(/^(\s*)# ?/,'$1'):'# '+x);
 const edit=makeGmplEdit(source,a,b,next.join('\n'));
 return edit?{...edit,selectionStart:a,selectionEnd:a+next.join('\n').length}:null;
}
export function completionForGmpl(fragment){
 if(typeof fragment!=='string'||fragment.length>64)return [];
 const prefix=/[A-Za-z_.]*$/.exec(fragment)?.[0]?.toLowerCase()??'';
 if(prefix.length<2)return [];
 return LANGUAGE_TERMS.filter(term=>term.startsWith(prefix)&&term!==prefix).slice(0,8);
}
