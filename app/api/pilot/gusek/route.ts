/** R13: source-only GUSEK/GMPL subset. Never invokes a solver on learner input. */
import {makeGusekTask,gradeGusekExam} from '../../../../pilots/operations-research/gusek-exam-r13.mjs';
import {indexedTransportStarter,indexedTransportData} from '../../../../pilots/operations-research/gusek-indexed-r14.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Cache-Control':'no-store, private','Content-Type':'application/json; charset=utf-8'}});
const KINDS=new Set(['transport','froccs','tablet']);
const seedOf=(x:unknown):number|null=>typeof x==='string'&&/^(0|[1-9]\d{0,9})$/.test(x)&&Number(x)<=4294967295?Number(x):null;
export function GET(req:Request){
 const url=new URL(req.url),kind=url.searchParams.get('kind'),seed=seedOf(url.searchParams.get('seed'));
 if([...url.searchParams.keys()].sort().join(',')!=='kind,seed'||url.searchParams.getAll('kind').length!==1||url.searchParams.getAll('seed').length!==1||(kind===null||!KINDS.has(kind))||seed===null)return json({error:'invalid_task'},400);
 const task=makeGusekTask(kind,seed);
 return json({schema:'learnharness.gusek-task.r13',task,
  ...(kind==='transport'?{indexed:{starter:indexedTransportStarter(),dataTemplate:indexedTransportData(task)}}:{})});
}
export async function POST(req:Request){
 if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers.get('content-type')??''))return json({error:'content_type_must_be_json'},415);
 const reader=req.body?.getReader();if(!reader)return json({error:'invalid_json'},400);
 const parts:Uint8Array[]=[];let len=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;len+=value.byteLength;if(len>65_536)return json({error:'body_too_large'},413);parts.push(value);}}
 catch{return json({error:'invalid_json'},400);}finally{await reader.cancel().catch(()=>{});}
 let data:unknown;
 try{const buf=new Uint8Array(len);let at=0;for(const part of parts){buf.set(part,at);at+=part.length;}data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buf));}
 catch{return json({error:'invalid_json'},400);}
 if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'invalid_request'},400);
 const input=data as Record<string,unknown>;
 if(Object.keys(input).sort().join(',')!=='answer,kind,seed'||!KINDS.has(String(input.kind))||seedOf(input.seed)===null||!input.answer||typeof input.answer!=='object'||Array.isArray(input.answer))return json({error:'invalid_request_fields'},400);
 const n=seedOf(input.seed)!;
 const answer=input.answer as Record<string,unknown>;
 if(Object.keys(answer).sort().join(',')!=='hintsUsed,mathprog,reportedObjective,taskKind,values'||answer.taskKind!==input.kind)return json({error:'invalid_answer_fields'},400);
 const grade=gradeGusekExam(String(input.kind),n,answer);
 return json({schema:'learnharness.gusek-grade.r13',taskId:`gusek-${input.kind}-${n}`,...grade,assessmentScope:'self_reported_practice_not_proctored'});
}
