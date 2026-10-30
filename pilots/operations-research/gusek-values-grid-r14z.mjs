/** Presentation-only adapter between the existing authoritative JSON answer
 * and a 3x3 / product / tablet editor. Never computes, grades or imports
 * an oracle solution, and never changes the server's JSON contract.
 */
const VALID_NAME=/^(?:[A-Za-z_][A-Za-z0-9_]{0,63}|x\[[1-3],[1-3]\])$/;
const NUM=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/;
const MAX_JSON=8192;
const isVariableName=name=>typeof name==='string'&&VALID_NAME.test(name)&&!['__proto__','prototype','constructor'].includes(name);
export function expectedGridNames(kind,variableNames,dialect='scalar'){
 if(!['transport','froccs','tablet'].includes(kind))return null;
 if(kind==='transport'&&dialect==='indexed')
  return Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>'x['+(i+1)+','+(j+1)+']')).flat();
 if(dialect!=='scalar'||!Array.isArray(variableNames)||variableNames.length!==
  (kind==='transport'?9:kind==='froccs'?10:2)||
  !variableNames.every(isVariableName)||
  new Set(variableNames).size!==variableNames.length)return null;
 return [...variableNames];
}
export function readGridAnswer(json,names){
 if(typeof json!=='string'||json.length>MAX_JSON||!Array.isArray(names)||names.length<1||
  names.length>30||new Set(names).size!==names.length||names.some(n=>!isVariableName(n)))
  return {ok:false,code:'invalid_grid_input',cells:[]};
 let source;
 try{source=JSON.parse(json);}catch{return {ok:false,code:'invalid_json',cells:[]};}
 if(!source||typeof source!=='object'||Array.isArray(source))return {ok:false,code:'invalid_json_object',cells:[]};
 if(Object.keys(source).length!==names.length||names.some(n=>!Object.hasOwn(source,n)))
  return {ok:false,code:'different_variable_set',cells:[]};
 const cells=names.map(name=>{
  const value=source[name];
  const valid=typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e9;
  return {name,text:valid?String(value):typeof value==='string'?value:'',valid};
 });
 return {ok:true,code:cells.every(c=>c.valid)?null:'invalid_numeric_value',cells};
}
export function editGridAnswer(json,names,name,input){
 const parsed=readGridAnswer(json,names);
 if(!parsed.ok||!names.includes(name)||typeof input!=='string'||input.length>48)
  return {ok:false,code:parsed.code??'invalid_edit'};
 const clean=input.trim();
 const numeric=clean&&NUM.test(clean)?Number(clean):NaN;
 const value=Number.isFinite(numeric)&&Math.abs(numeric)<=1e9?numeric:input;
 const next=Object.fromEntries(parsed.cells.map(cell=>[cell.name,cell.name===name?value:
  cell.valid?Number(cell.text):cell.text]));
 const serialized=JSON.stringify(next,null,2);
 return serialized.length>MAX_JSON?{ok:false,code:'too_large'}:{ok:true,json:serialized};
}
export function pasteGridAnswer(json,names,startName,text){
 const parsed=readGridAnswer(json,names),start=names.indexOf(startName);
 if(!parsed.ok||start<0||typeof text!=='string'||text.length>1200)
  return {ok:false,code:'invalid_paste'};
 const tokens=text.trim().split(/[\t\r\n ]+/).filter(Boolean);
 if(tokens.length<2||start+tokens.length>names.length)
  return {ok:false,code:'invalid_paste_shape'};
 const values=tokens.map(token=>NUM.test(token)?Number(token):NaN);
 if(values.some(v=>!Number.isFinite(v)||Math.abs(v)>1e9))
  return {ok:false,code:'invalid_paste_value'};
 const next=Object.fromEntries(parsed.cells.map(c=>[c.name,c.valid?Number(c.text):c.text]));
 for(let i=0;i<values.length;i++)next[names[start+i]]=values[i];
 const serialized=JSON.stringify(next,null,2);
 return serialized.length>MAX_JSON?{ok:false,code:'too_large'}:{ok:true,json:serialized,imported:values.length};
}
