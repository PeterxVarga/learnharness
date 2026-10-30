/** R14 Workbench file contract. Pure functions shared by editor and unit tests.
 * No solution or secret belongs in a workspace draft.
 */
export const MAX_MODEL_BYTES=65536;
export const MAX_DATA_BYTES=65536;
export const MAX_DIAGNOSTIC_BYTES=8192;
export const DEFAULT_MODEL=[
 '# GNU MathProg / GLPK',
 '# Írd meg a modellt. A solve; és end; az ellenőrzéshez szükséges lehet.',
 'var x >= 0;',
 'maximize objective: x;',
 's.t. limit: x <= 3;',
 'solve;',
 'end;',
].join('\n')+'\n';
export const DEFAULT_DATA='';
const utf8Length=s=>new TextEncoder().encode(s).byteLength;
export function validateWorkbenchFile(name,source){
 if(name!=='model.mod'&&name!=='data.dat')return {ok:false,error:'unsupported_file'};
 if(typeof source!=='string'||source.includes('\0'))return {ok:false,error:'invalid_file'};
 const size=utf8Length(source),max=name==='model.mod'?MAX_MODEL_BYTES:MAX_DATA_BYTES;
 return size<=max?{ok:true,error:null,bytes:size}:{ok:false,error:'file_too_large'};
}
export function makeWorkspaceDraft({model,data},modifiedAt=Date.now()){
 if(!validateWorkbenchFile('model.mod',model).ok||!validateWorkbenchFile('data.dat',data).ok)
  throw new Error('invalid_workspace_draft');
 if(!Number.isSafeInteger(modifiedAt)||modifiedAt<0)throw new Error('invalid_workspace_time');
 return {schema:'learnharness.gusek-workspace.r14',model,data,modifiedAt};
}
export function readWorkspaceDraft(x){
 if(!x||typeof x!=='object'||x.schema!=='learnharness.gusek-workspace.r14')return null;
 try{return makeWorkspaceDraft(x,x.modifiedAt);}catch{return null;}
}
export function sameRunInputs(snapshot,model,data){
 return !!snapshot&&snapshot.model===model&&snapshot.data===data;
}
export function glpkDiagnosticLine(log){
 if(typeof log!=='string')return null;
 // Match GLPSOL's "filename:LINE: ..." syntax. A reported path is untrusted.
 // Only known staged file names may cause an editor jump.
 const lines=log.slice(0,MAX_DIAGNOSTIC_BYTES).split(/\r?\n/);
 for(const line of lines){
  const match=/(?:^|[\s"'(])(?:\/input\/)?(model\.mod|data\.dat):([1-9]\d{0,5})(?::\d+)?(?::|\s|$)/.exec(line);
  if(match){
   const n=Number(match[2]);
   if(n>=1&&n<=100000)return {file:match[1],line:n};
  }
 }
 return null;
}
export function lineOffset(source,line){
 if(typeof source!=='string'||!Number.isSafeInteger(line)||line<1)return 0;
 let at=0;
 for(let i=1;i<line;i++){
  const next=source.indexOf('\n',at);
  if(next<0)return source.length;
  at=next+1;
 }
 return at;
}
