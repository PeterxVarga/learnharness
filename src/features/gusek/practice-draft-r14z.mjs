/** Bounded, private browser-local GUSEK Practice draft.
 * No token, grade, response, solver evidence or chat transcript is stored.
 * A draft can only be restored into the exact seeded task and dialect.
 */
const KINDS=new Set(['transport','froccs','tablet']);
const DIALECTS=new Set(['scalar','indexed']);
const UTF8=s=>new TextEncoder().encode(s).byteLength;
const SEED=/^(0|[1-9]\d{0,9})$/;
const CHAT=/^chat_[a-z0-9]+_[0-9a-f]{8}$/;
export function practiceDraftKey(chatId,kind,seed,dialect){
 if(!KINDS.has(kind)||!DIALECTS.has(dialect)||
  (kind!=='transport'&&dialect==='indexed')||typeof seed!=='string'||
  !SEED.test(seed)||Number(seed)>4294967295)return null;
 if(chatId!==null&&chatId!==undefined&&(!CHAT.test(chatId)))return null;
 return 'practice-r14z:'+(chatId??'standalone')+':'+kind+':'+seed+':'+dialect;
}
export function makePracticeDraft({taskId,kind,seed,dialect,model,values,objective,hintsUsed},time=Date.now()){
 const key=practiceDraftKey(null,kind,seed,dialect);
 if(!key||taskId!=='gusek-'+kind+'-'+seed||
    typeof model!=='string'||typeof values!=='string'||typeof objective!=='string'||
    !Number.isSafeInteger(time)||time<0||typeof hintsUsed!=='boolean'||
    model.includes('\0')||values.includes('\0')||objective.includes('\0')||
    UTF8(model)>65536||UTF8(values)>8192||UTF8(objective)>128)
  throw new Error('invalid_practice_draft');
 return {schema:'learnharness.gusek-practice-draft.r14z',
  taskId,kind,seed,dialect,model,values,objective,hintsUsed,modifiedAt:time};
}
export function readPracticeDraft(stored,{kind,seed,dialect}){
 if(!stored||typeof stored!=='object'||stored.schema!=='learnharness.gusek-practice-draft.r14z')
  return null;
 try{
  const draft=makePracticeDraft(stored,stored.modifiedAt);
  return draft.kind===kind&&draft.seed===seed&&draft.dialect===dialect?draft:null;
 }catch{return null;}
}
