/** Local-only GUSEK project snapshots. No credentials, scores, chat IDs
 * or solver results; a project always contains exactly model.mod and data.dat.
 */
import {validateWorkbenchFile} from './workspace-files.mjs';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME=80;
export function projectStoreKey(id){
 return typeof id==='string'&&ID.test(id)?'project-r14z:'+id.toLowerCase():null;
}
export function makeGusekProject({id,name,model,data,createdAt=Date.now()}){
 const key=projectStoreKey(id);
 if(!key||typeof name!=='string'||name.trim().length<1||
  new TextEncoder().encode(name).length>MAX_NAME||
  /[\x00-\x1f\x7f]/.test(name)||!Number.isSafeInteger(createdAt)||createdAt<0||
  !validateWorkbenchFile('model.mod',model).ok||
  !validateWorkbenchFile('data.dat',data).ok)
  throw new Error('invalid_local_project');
 return {schema:'learnharness.gusek-project.r14z',id:id.toLowerCase(),
  name:name.trim(),model,data,createdAt};
}
export function readGusekProject(stored){
 if(!stored||typeof stored!=='object'||stored.schema!=='learnharness.gusek-project.r14z')return null;
 try{return makeGusekProject(stored);}catch{return null;}
}
export function summarizeProjects(items){
 if(!Array.isArray(items))return [];
 const seen=new Set();
 return items.map(readGusekProject).filter(x=>{
  if(!x||seen.has(x.id))return false;
  seen.add(x.id);return true;
 }).sort((a,b)=>b.createdAt-a.createdAt||a.name.localeCompare(b.name))
  .slice(0,40).map(({id,name,createdAt})=>({id,name,createdAt}));
}
