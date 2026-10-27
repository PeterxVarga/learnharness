/** R12 source-bound integration contracts; full browser and Next build require Fedora. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const get = p => readFileSync(join(root,p),'utf8');
const chat = get('components/chat.tsx');
const editor = get('components/transport-exam.tsx');
const page = get('app/pilot/transport/page.tsx');
const teacher = get('src/agent/teacher-agent.ts');
const course = get('src/agent/courses/operations-research-hu.ts');
const attempts = get('app/api/pilot/transport/attempts/route.ts');
const service = get('pilots/operations-research/attempt-service-r9.mjs');
describe('R12 native Practice transport integration source contracts',()=>{
 it('reuses one MathProg editor component, not duplicate graders',()=>{
  assert.match(chat,/import \{ TransportExam \} from "@\/components\/transport-exam"/);
  assert.match(page,/<TransportExam\s*\/>/);
  assert.match(editor,/export function TransportExam\(/);
  assert.doesNotMatch(editor,/gradeTransportExam\(|gradeIndexedMathProg\(/);
 });
 it('offers inline native Practice panel, without navigation',()=>{
  assert.match(chat,/data-testid="native-transport-exam-r12"/);
  assert.match(chat,/<TransportExam chatId=\{chatId\} embedded/);
  assert.doesNotMatch(chat,/href=\{\x60\/pilot\/transport\?chatId/);
 });
 it('embeds only within practice and keeps an explicit open/close choice',()=>{
  assert.match(chat,/kind === "practice" && transportExamOpen/);
  assert.match(chat,/setTransportExamOpen\(open => !open\)/);
  assert.match(chat,/setTransportExamOpen\(false\)/);
 });
 it('cannot open an exam while an active problem or turn is pending',()=>{
  assert.match(chat,/disabled=\{Boolean\(activeProblem\) \|\| busy \|\| compacting\}/);
  assert.match(attempts,/isTurnRunning\(chat\.id\) \|\| activeProblemOf\(chat\.messages\)/);
 });
 it('binds editor directly to the authoritative chatId, without URL dependence',()=>{
  assert.match(editor,/requestedChatId=chatId \?\? new URLSearchParams/);
  assert.match(editor,/fetch\(\x60\/api\/pilot\/transport\/attempts\?chatId=/);
  assert.match(editor,/\},\[chatId\]\)/);
 });
 it('read-only legacy route remains usable',()=>{
  assert.match(page,/Legacy deep link remains available/);
  assert.match(page,/<TransportExam\s*\/>/);
 });
 it('only explicit first-user opt-in activates Operations Research coaching',()=>{
  assert.match(chat,/data-testid="or-course-activate-r12"/);
  assert.match(chat,/createPracticeCourseStarter\(\)/);
  assert.match(chat,/!nativeMessages\.some\(m => m\.role === "user"\)/);
  assert.match(course,/if \(!isCourseActivated\(messages\)\) return null/);
 });
 it('unrelated Practice sessions do not get course context',()=>{
  assert.match(teacher,/practiceCourseContextForMessages\(opts\.messages \?\? \[\]\)/);
  assert.match(course,/isCourseActivated\(messages\)/);
 });
 it('teacher never turns AI explanations into a score',()=>{
  assert.match(course,/Never change the score/);
  assert.match(editor,/coachingFeedback\(grade\)/);
  assert.match(service,/gradeIndexedMathProg\(n,answer\)/);
 });
 it('feedback requests refresh server-receipt history before sending to agent',()=>{
  assert.match(chat,/await syncFromServer\(\);\s*await send\(/);
  assert.match(chat,/onRequestCoaching=\{\(\) =>/);
 });
 it('examination keeps server-only idempotent receipts and avoids persisting raw source',()=>{
  assert.match(attempts,/appendTransportAttempt\(/);
  assert.match(service,/answerSha256:stableAnswerHash\(answer\)/);
  assert.match(service,/No raw learner source/);
 });
 it('embedded editor preserves unassessable and 0\/1 semantics',()=>{
  assert.match(editor,/NEM ÉRTÉKELHETŐ/);
  assert.match(editor,/Teljes megoldás: 1 pont/);
  assert.match(editor,/A javítást nem AI végzi/);
 });
});
