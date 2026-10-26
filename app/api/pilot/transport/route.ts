/** R4 bounded offline transport endpoint for the existing Next.js app.
 * No persistence, provider calls or untrusted MathProg execution.
 * The teacher may explain an error, but this route alone determines 0/1 points.
 */
import { gradeTransportExam, makeTransportTask, publicTransportTask } from "../../../../pilots/operations-research/transport-exam-r3.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIMIT = 65_536;
const jsonHeaders = { "Cache-Control": "no-store, private", "Content-Type": "application/json; charset=utf-8" };
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}
function seedOf(value: unknown): number | null {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,9})$/.test(value)) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : null;
}
async function boundedBody(request: Request): Promise<string> {
  const length = request.headers.get("content-length");
  if (length && Number(length) > LIMIT) throw new Error("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("empty_body");
  let bytes = 0;
  const parts: Uint8Array[] = [];
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMIT) throw new Error("body_too_large");
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!bytes) throw new Error("empty_body");
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const part of parts) { merged.set(part, offset); offset += part.byteLength; }
  return new TextDecoder("utf-8", {fatal: true}).decode(merged);
}

/** GET only discloses the task, never the reference allocation/objective. */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const seed = seedOf(url.searchParams.get("seed"));
  if (seed === null || [...url.searchParams.keys()].some(k => k !== "seed") || url.searchParams.getAll("seed").length !== 1)
    return json({ error: "invalid_seed" }, 400);
  return json({ schema: "learnharness.transport-task.r4", task: publicTransportTask(seed) });
}

/** POST accepts the learner's full structured submission and returns only 0 or 1. */
export async function POST(request: Request): Promise<Response> {
  if (!/application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? ""))
    return json({ error: "content_type_must_be_json" }, 415);
  let payload: unknown;
  try {
    payload = JSON.parse(await boundedBody(request));
  } catch (e) {
    const code = e instanceof Error && e.message === "body_too_large" ? "body_too_large" : "invalid_json";
    return json({ error: code }, code === "body_too_large" ? 413 : 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "invalid_request" }, 400);
  const data = payload as Record<string, unknown>;
  if (Object.keys(data).sort().join(",") !== "answer,seed") return json({ error: "invalid_request_fields" }, 400);
  const seed = seedOf(data.seed);
  if (seed === null) return json({ error: "invalid_seed" }, 400);
  const answer = data.answer;
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return json({ error: "invalid_answer" }, 400);
  const grade = gradeTransportExam(makeTransportTask(seed), answer);
  // score is formative, not a supervised exam attestation; hintsUsed is self-reported.
  return json({ schema: "learnharness.transport-grade.r4", taskId: `synthetic-transport-r3-${seed}`,
    ...grade, assessmentScope: "self_reported_practice_not_proctored" });
}
