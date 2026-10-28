/** R9 exam attempts: canonical practice-chat persistence + server-only scoring. */
import { getChat, stores, isTurnRunning } from "@/src/server";
import { activeProblemOf } from "@/src/core/native-messages";
import type { LhMarkerMessage } from "@/src/core/native-messages";
import type { TransportAttemptReceipt } from "@/src/core/contracts/chat";
import { prepareVerifiedAttempt } from "../../../../../pilots/operations-research/attempt-service-r9.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIMIT = 65_536;
const CHAT = /^chat_[a-z0-9]+_[0-9a-f]{8}$/;
const headers = { "Cache-Control": "no-store, private", "Content-Type": "application/json; charset=utf-8" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data),{ status, headers });
function practiceChat(chatId: unknown) {
  if (typeof chatId !== "string" || !CHAT.test(chatId)) return null;
  const record = getChat(chatId);
  return record?.kind === "practice" ? record : null;
}
async function bodyAsJson(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > LIMIT) throw new Error("body_too_large");
  if (!request.body) throw new Error("invalid_json");
  const reader=request.body.getReader();
  let length=0;
  const chunks: Uint8Array[]=[];
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (done) break;
      length+=value.byteLength;
      if (length>LIMIT) throw new Error("body_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(()=>{}); }
  if (length===0) throw new Error("invalid_json");
  const content=new Uint8Array(length);
  let offset=0;
  for (const chunk of chunks) { content.set(chunk,offset);offset+=chunk.length; }
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(content));
}
export function GET(request: Request) {
  const url = new URL(request.url);
  const chatId = url.searchParams.get("chatId");
  if (url.searchParams.size !== 1 || url.searchParams.getAll("chatId").length !== 1)
    return json({error:"invalid_query"},400);
  const chat=practiceChat(chatId);
  if (!chat) return json({error:"practice_chat_not_found"},404);
  return json({schema:"learnharness.transport-attempt-list.r9",chatId,attempts:chat.transportAttempts??[]});
}
export async function POST(request: Request) {
  if (!/application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type")??""))
    return json({error:"content_type_must_be_json"},415);
  let data: unknown;
  try { data=await bodyAsJson(request); }
  catch (error) { const tooLarge=error instanceof Error && error.message==="body_too_large";
    return json({error:tooLarge?"body_too_large":"invalid_json"},tooLarge?413:400); }
  if (!data || typeof data!=="object" || Array.isArray(data)) return json({error:"invalid_request"},400);
  const input=data as Record<string,unknown>;
  if (Object.keys(input).sort().join(",")!=="answer,attemptId,chatId,seed")
    return json({error:"invalid_request_fields"},400);
  const chat=practiceChat(input.chatId);
  if (!chat) return json({error:"practice_chat_not_found"},404);
  // Prevent a score marker appearing in the middle of the practice agent's pending turn/problem.
  if (isTurnRunning(chat.id) || activeProblemOf(chat.messages))
    return json({error:"practice_session_busy_or_problem_active"},409);
  let prepared: ReturnType<typeof prepareVerifiedAttempt>;
  try { prepared=prepareVerifiedAttempt({
    chatId:input.chatId,attemptId:input.attemptId,seed:input.seed,answer:input.answer,
  }); }
  catch (e) { return json({error:e instanceof Error?e.message:"invalid_request"},400); }
  try {
    const outcome=stores.chatStore.appendTransportAttempt(chat.id,prepared.receipt as TransportAttemptReceipt,prepared.marker as LhMarkerMessage);
    return json({schema:"learnharness.transport-attempt-result.r9",receipt:outcome.receipt,
      replayed:outcome.replayed});
  } catch (error) {
    const code=error instanceof Error?error.message:"persistence_failure";
    if (code==="attempt_id_conflict") return json({error:code},409);
    if (code==="attempt_limit_reached") return json({error:code},409);
    if (code==="not_practice_chat" || code==="chat_not_found") return json({error:"practice_chat_not_found"},404);
    console.error("[R9 transport attempt] persistence refused",code);
    return json({error:"persistence_failure"},503);
  }
}
