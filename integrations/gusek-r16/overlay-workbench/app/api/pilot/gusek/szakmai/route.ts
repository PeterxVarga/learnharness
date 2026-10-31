/** R16.10 subject-specific GUSEK exercises. No agent or solver execution. */
import {makeOrTask,orStarter,gradeOrTask,OR_KINDS} from '@/tredven/addons/domain/or-domain-r1610.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
const seed=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,9})$/.test(x)&&Number(x)<=4294967295?Number(x):null;
const supported=x=>typeof x==='string'&&OR_KINDS.includes(x);
export function GET(req:Request){
 const u=new URL(req.url),params=[...u.searchParams.keys()].sort();
 const kind=u.searchParams.get('kind'),s=seed(u.searchParams.get('seed'));
 if(params.join(',')!=='kind,seed'||u.searchParams.getAll('kind').length!==1||u.searchParams.getAll('seed').length!==1||!supported(kind)||s===null)return response({error:'invalid_task'},400);
 const task=makeOrTask(kind,s);
 return response({schema:'tredven.or-public-task.r1610',task,starter:orStarter(task),scope:'synthetic_unproctored_practice'});
}
export async function POST(req:Request){
 if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers.get('content-type')??''))return response({error:'content_type_must_be_json'},415);
 const header=req.headers.get('content-length');
 if(header!==null&&(!/^\d+$/.test(header)||Number(header)>65536))return response({error:'body_too_large'},413);
 let raw='';const reader=req.body?.getReader();if(!reader)return response({error:'invalid_json'},400);
 let total=0;const parts:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;
  if(total>65536)return response({error:'body_too_large'},413);parts.push(value);}}
 catch{return response({error:'invalid_json'},400);}finally{await reader.cancel().catch(()=>{});}
 let data:unknown;
 try{const b=new Uint8Array(total);let offset=0;for(const part of parts){b.set(part,offset);offset+=part.length;}
  data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));}
 catch{return response({error:'invalid_json'},400);}
 if(!data||typeof data!=='object'||Array.isArray(data))return response({error:'invalid_request'},400);
 const input=data as Record<string,unknown>;
 if(Object.keys(input).sort().join(',')!=='answer,kind,seed'||!supported(input.kind)||seed(input.seed)===null||
  !input.answer||typeof input.answer!=='object'||Array.isArray(input.answer))return response({error:'invalid_request_fields'},400);
 const answer=input.answer as Record<string,unknown>;
 if(Object.keys(answer).sort().join(',')!=='hintsUsed,mathprog,reportedObjective,values'||
  typeof answer.mathprog!=='string'||answer.mathprog.length>32000||
  (answer.hintsUsed!==true&&answer.hintsUsed!==false)||
  typeof answer.reportedObjective!=='number'||!Number.isFinite(answer.reportedObjective)||
  !answer.values||typeof answer.values!=='object'||Array.isArray(answer.values))return response({error:'invalid_answer_fields'},400);
 const grade=gradeOrTask(input.kind as string,seed(input.seed)!,answer);
 return response({schema:'tredven.or-grade.r1610',taskId:`or-${input.kind}-${input.seed}`,kind:input.kind,
  ...grade,scope:'synthetic_unproctored_practice',scoreAuthority:'r1610_server_only'});
}
