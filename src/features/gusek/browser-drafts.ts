/** Local-only draft persistence. Never sends .mod/.dat to Chat or remote APIs.
 * Storage is intentionally scoped to the browser profile, not a server account.
 */
import {makeWorkspaceDraft,readWorkspaceDraft} from './workspace-files.mjs';
import {makePracticeDraft,readPracticeDraft,practiceDraftKey} from './practice-draft-r14z.mjs';
import {makeGusekProject,readGusekProject,projectStoreKey,summarizeProjects} from './project-contract-r14z.mjs';

const DB_NAME='learnharness-gusek-workbench';
const STORE='drafts';
const VERSION=1;
const KEY='free-workspace-v1';
// IndexedDB opens per operation. Serialize writes so a slow previous commit
// cannot overwrite a newer revision with old .mod/.dat source.
let lastWrite:Promise<unknown>=Promise.resolve();
function inWriteOrder<T>(action:()=>Promise<T>):Promise<T>{
 const current=lastWrite.then(action);
 lastWrite=current.catch(()=>{});
 return current;
}
function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('indexeddb_unavailable'));return;}
  const request=indexedDB.open(DB_NAME,VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('draft_storage_unavailable'));
 });
}
async function withStore<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await openDb();
 try{
  return await new Promise<T>((resolve,reject)=>{
   const tx=db.transaction(STORE,mode);
   const req=action(tx.objectStore(STORE));
   let result:T|undefined;let hasResult=false;
   req.onsuccess=()=>{result=req.result;hasResult=true;};
   tx.oncomplete=()=>hasResult?resolve(result as T):reject(new Error('draft_request_incomplete'));
   tx.onerror=()=>reject(new Error('draft_storage_unavailable'));
   tx.onabort=()=>reject(new Error('draft_storage_aborted'));
  });
 }finally{db.close();}
}
export async function readFreeWorkspaceDraft():Promise<{model:string;data:string;modifiedAt:number}|null>{
 await lastWrite;
 const stored=await withStore<unknown>('readonly',store=>store.get(KEY));
 const valid=readWorkspaceDraft(stored);
 return valid?{model:valid.model,data:valid.data,modifiedAt:valid.modifiedAt}:null;
}
export async function saveFreeWorkspaceDraft(model:string,data:string):Promise<void>{
 const draft=makeWorkspaceDraft({model,data});
 await inWriteOrder(()=>withStore('readwrite',store=>store.put(draft,KEY)));
}
export async function clearFreeWorkspaceDraft():Promise<void>{
 await inWriteOrder(()=>withStore('readwrite',store=>store.delete(KEY)));
}

/** Private per-chat/seed/dialect drafts. Unknown chat keys fail closed. */
export async function readGusekPracticeDraft(
 chatId:string|null,kind:string,seed:string,dialect:string
):Promise<{model:string;values:string;objective:string;hintsUsed:boolean}|null>{
 const key=practiceDraftKey(chatId,kind,seed,dialect);
 if(!key)return null;
 await lastWrite;
 const stored=await withStore<unknown>('readonly',store=>store.get(key));
 const draft=readPracticeDraft(stored,{kind,seed,dialect});
 return draft?{model:draft.model,values:draft.values,objective:draft.objective,hintsUsed:draft.hintsUsed}:null;
}
export async function saveGusekPracticeDraft(
 chatId:string|null,input:{
  taskId:string;kind:string;seed:string;dialect:string;
  model:string;values:string;objective:string;hintsUsed:boolean
 }
):Promise<void>{
 const key=practiceDraftKey(chatId,input.kind,input.seed,input.dialect);
 if(!key)throw new Error('invalid_practice_draft_key');
 const draft=makePracticeDraft(input);
 await inWriteOrder(()=>withStore('readwrite',store=>store.put(draft,key)));
}

/** Named project snapshots; a new ID is generated only on explicit Save. */
export async function saveNamedGusekProject(
 name:string,model:string,data:string
):Promise<{id:string;name:string;createdAt:number}>{
 const id=crypto.randomUUID();
 const project=makeGusekProject({id,name,model,data});
 const key=projectStoreKey(project.id)!;
 await inWriteOrder(async()=>{
  const count=summarizeProjects(await withStore<unknown[]>('readonly',store=>store.getAll())).length;
  if(count>=40)throw new Error('Legfeljebb 40 helyi projektpillanatkép menthető.');
  await withStore('readwrite',store=>store.put(project,key));
 });
 return {id:project.id,name:project.name,createdAt:project.createdAt};
}
export async function listNamedGusekProjects():Promise<Array<{id:string;name:string;createdAt:number}>>{
 await lastWrite;
 const items=await withStore<unknown[]>('readonly',store=>store.getAll());
 return summarizeProjects(items);
}
export async function loadNamedGusekProject(id:string):Promise<{model:string;data:string;name:string}|null>{
 const key=projectStoreKey(id);
 if(!key)return null;
 await lastWrite;
 const stored=await withStore<unknown>('readonly',store=>store.get(key));
 const valid=readGusekProject(stored);
 return valid?{model:valid.model,data:valid.data,name:valid.name}:null;
}
export async function deleteNamedGusekProject(id:string):Promise<void>{
 const key=projectStoreKey(id);
 if(!key)throw new Error('invalid_project_id');
 await inWriteOrder(()=>withStore('readwrite',store=>store.delete(key)));
}
