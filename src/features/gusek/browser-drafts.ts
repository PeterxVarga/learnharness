/** Local-only draft persistence. Never sends .mod/.dat to Chat or remote APIs.
 * Storage is intentionally scoped to the browser profile, not a server account.
 */
import {makeWorkspaceDraft,readWorkspaceDraft} from './workspace-files.mjs';

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
