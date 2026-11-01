/**
 * Private R15 compatibility shape. NOT a LearnHarness core schema extension.
 * Standalone R16 Workbench does not write to upstream conversation storage.
 */
export interface TransportAttemptReceipt {
  schema: "learnharness.transport-attempt.r9";
  id: string;
  chatId: string;
  taskId: string;
  seed: number;
  submittedAt: string;
  status: "FULL_CREDIT" | "ZERO_CREDIT" | "UNASSESSABLE";
  points: 0 | 1 | null;
  maxPoints: 1;
  correct: boolean | null;
  errors: string[];
  dialect: "json" | "expanded" | "indexed" | "gusek_scalar_r13" | "gusek_indexed_r14";
  answerSha256: string;
  scope: "formative_unproctored_self_reported_hints";
}
