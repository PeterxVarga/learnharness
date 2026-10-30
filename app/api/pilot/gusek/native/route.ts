/** R14 native GNU MathProg diagnostic endpoint.
 * Explicit local operator opt-in; never a scoring endpoint.
 * The existing Practice grade authority is deliberately unchanged.
 */
import { timingSafeEqual } from "node:crypto";
import { runNativeGmplAsync } from "../../../../../pilots/operations-research/glpk-native-async-r14.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Local single-user execution: no in-process queue; reject concurrent runs.
let nativeRunActive=false;
const LIMIT=140_000;
const SHA=/^sha256:[a-f0-9]{64}$/;
const TOKEN=/^[a-f0-9]{64}$/;
const localHost=/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"}});

function configured(){
 return process.env.LH_GLPK_ENABLE_LOCAL==="1" &&
   SHA.test(process.env.LH_GLPK_IMAGE_ID??"") &&
   TOKEN.test(process.env.LH_GLPK_RUN_TOKEN??"");
}
function verifiedLocalHost(req:Request):string|null{
 const host=req.headers.get("host")??"";
 // Next.js's own base-server synthesizes x-forwarded-host = Host for
 // direct requests. Reject any differing/spoofed forwarding authority.
 const forwarded=req.headers.get("x-forwarded-host");
 if(!localHost.test(host)||req.headers.has("forwarded")||
    (forwarded!==null&&forwarded!==host))return null;
 return host;
}
function sameOrigin(req:Request){
 const host=verifiedLocalHost(req);
 const origin=req.headers.get("origin")??"";
 if(host===null||origin!==`http://${host}`)return false;
 const site=req.headers.get("sec-fetch-site");
 return !site||site==="same-origin";
}
function authorized(req:Request){
 if(!configured()||!sameOrigin(req))return false;
 const secret=process.env.LH_GLPK_RUN_TOKEN!;
 const supplied=req.headers.get("x-lh-glpk-token")??"";
 if(!TOKEN.test(supplied))return false;
 return timingSafeEqual(Buffer.from(secret,"hex"),Buffer.from(supplied,"hex"));
}
export function GET(req:Request){
 // No solver secrets or image IDs are ever exposed.
 if(verifiedLocalHost(req)===null)
   return json({error:"local_only"},403);
 return json({schema:"learnharness.glpk-native-status.r14",available:configured(),scoreAuthority:false});
}
export async function POST(req:Request){
 if(!configured())return json({error:"native_runner_not_configured"},503);
 if(!authorized(req))return json({error:"native_runner_not_authorized"},403);
 if(!/^application\/json(?:\s*;|\s*$)/i.test(req.headers.get("content-type")??""))
   return json({error:"content_type_must_be_json"},415);
 const claimed=req.headers.get("content-length");
 if(claimed&&(!/^\d+$/.test(claimed)||Number(claimed)>LIMIT))return json({error:"body_too_large"},413);
 if(!req.body)return json({error:"invalid_json"},400);
 const reader=req.body.getReader(), chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>LIMIT)return json({error:"body_too_large"},413);chunks.push(value);}
 }catch{return json({error:"invalid_json"},400);}
 finally{await reader.cancel().catch(()=>{});}
 let data:unknown;
 try{const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 }catch{return json({error:"invalid_json"},400);}
 if(!data||typeof data!=="object"||Array.isArray(data))return json({error:"invalid_request"},400);
 const input=data as Record<string,unknown>;
 const keys=Object.keys(input).sort().join(",");
 if(keys!=="mode,model"&&keys!=="data,mode,model")return json({error:"invalid_request_fields"},400);
 if(typeof input.model!=="string"||typeof input.mode!=="string"||
   (input.mode!=="solve"&&input.mode!=="check")||
   (input.data!==undefined&&typeof input.data!=="string"))return json({error:"invalid_request_fields"},400);
 if(nativeRunActive)return json({error:"native_runner_busy"},429);
 nativeRunActive=true;
 try{
  const result=await runNativeGmplAsync({model:input.model,data:input.data as string|undefined,
   mode:input.mode,imageId:process.env.LH_GLPK_IMAGE_ID,signal:req.signal});
  return json({schema:"learnharness.glpk-native-diagnostic.r14",...result},result.status==="BLOCKED"?503:200);
 }finally{nativeRunActive=false;}
}
