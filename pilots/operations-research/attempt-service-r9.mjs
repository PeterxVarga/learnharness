/** R9: server-authoritative formative exam attempts, intentionally no model calls. */
import { createHash } from 'node:crypto';
import { makeTransportTask, gradeTransportExam } from './transport-exam-r3.mjs';
import { gradeExpandedMathProg } from './mathprog-expanded-r6.mjs';
import { gradeIndexedMathProg } from './mathprog-indexed-r7.mjs';
import { gradeGusekExam } from './gusek-exam-r13.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHAT = /^chat_[a-z0-9]+_[0-9a-f]{8}$/;
const SEED = /^(0|[1-9][0-9]{0,9})$/;
const ALLOWED_CODES = /^[a-z][a-z0-9_]{0,95}$/;
export function stableAnswerHash(answer) {
  return createHash('sha256').update(JSON.stringify(answer)).digest('hex');
}
export function prepareVerifiedAttempt({chatId,attemptId,seed,answer,at = new Date().toISOString()}) {
  if (typeof chatId !== 'string' || !CHAT.test(chatId)) throw new Error('invalid_chat_id');
  if (typeof attemptId !== 'string' || !UUID.test(attemptId)) throw new Error('invalid_attempt_id');
  if (typeof seed !== 'string' || !SEED.test(seed) || Number(seed) > 0xffffffff) throw new Error('invalid_seed');
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) throw new Error('invalid_answer');
  const n = Number(seed);
  const hasSource = Object.prototype.hasOwnProperty.call(answer,'mathprog');
  const code = typeof answer.mathprog === 'string' ? answer.mathprog.replace(/#[^\r\n]*/g,'') : '';
  const indexed = answer.mathprogDialect === 'indexed' ||
    (answer.mathprogDialect === undefined && (/\bvar\s+x\s*\{/.test(code) || /\bminimize\s+\w+\s*:\s*sum\s*\{/.test(code)));
  const isGusek = ['transport','froccs','tablet'].includes(answer.taskKind);
  const grade = isGusek ? gradeGusekExam(answer.taskKind,n,answer) : !hasSource ? gradeTransportExam(makeTransportTask(n),answer)
    : indexed ? gradeIndexedMathProg(n,answer)
    : (answer.mathprogDialect === undefined || answer.mathprogDialect === 'expanded') ? gradeExpandedMathProg(n,answer)
    : {status:'UNASSESSABLE',points:null,maxPoints:1,correct:null,errors:['unsupported_mathprog_dialect']};
  if (![0,1,null].includes(grade.points) || grade.maxPoints !== 1 ||
      grade.correct !== (grade.points === null ? null : grade.points === 1)) throw new Error('invalid_oracle_contract');
  const errors = [...new Set((grade.errors??[]).filter(x=>typeof x==='string' && ALLOWED_CODES.test(x)))].slice(0,24);
  if ((grade.errors??[]).length !== errors.length) throw new Error('invalid_oracle_errors');
  const status = grade.points === null ? 'UNASSESSABLE' : grade.points === 1 ? 'FULL_CREDIT' : 'ZERO_CREDIT';
  const receipt = {
    schema:'learnharness.transport-attempt.r9', id:attemptId, chatId, taskId:isGusek ? `gusek-${answer.taskKind}-${n}` : `synthetic-transport-r3-${n}`,
    seed:n, submittedAt:at, status, points:grade.points,maxPoints:1,correct:grade.correct,errors,
    dialect:isGusek ? 'gusek_scalar_r13' : !hasSource ? 'json' : indexed ? 'indexed' : 'expanded',
    answerSha256:stableAnswerHash(answer),scope:'formative_unproctored_self_reported_hints',
  };
  // Only server-derived, finite, bounded fields reach the model. No raw learner source or model text.
  const marker = {
    id:`transport_attempt_${attemptId}`,role:'custom',customType:'transport-attempt',display:false,
    timestamp:Date.parse(at),
    content:`[SERVER-VERIFIED ${isGusek ? 'GUSEK' : 'TRANSPORT'} PRACTICE RESULT; NOT A PROCTORED EXAM]\n`+
      `Task: ${receipt.taskId}; attempt: ${attemptId}; outcome: ${status}; `+
      `points: ${grade.points === null ? 'unassessable' : `${grade.points}/1`}; `+
      `error codes: ${errors.join(', ')||'none'}.\n`+
      `This is a formative deterministic check. The learner's assistance declaration is not independently verified. `+
      `Explain the first error in Hungarian without changing the recorded grade, inventing mastery, or showing a new problem before the learner requests it. `+
      `If UNASSESSABLE, explain that the checker does not support the submitted model, not that it is wrong.`,
    details:{attemptId,taskId:receipt.taskId,status,points:receipt.points,errors},
  };
  return {receipt,marker};
}
/** Pure state transition: dedupe before mutating either score ledger or model-visible record. */
export function appendOnceToChat(record, receipt, marker) {
  if (!record || record.id !== receipt.chatId || record.kind !== 'practice') throw new Error('not_practice_chat');
  const existing=(record.transportAttempts??[]).find(x=>x.id===receipt.id);
  if (existing) {
    if (existing.answerSha256!==receipt.answerSha256 || existing.taskId!==receipt.taskId) throw new Error('attempt_id_conflict');
    return {record,receipt:existing,replayed:true};
  }
  if ((record.transportAttempts??[]).length>=300) throw new Error('attempt_limit_reached');
  if (!Array.isArray(record.messages)) throw new Error('invalid_chat_record');
  const next={...record,transportAttempts:[...(record.transportAttempts??[]),receipt],messages:[...record.messages,marker]};
  return {record:next,receipt,replayed:false};
}
