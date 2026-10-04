/**
 * Stub tutor evaluator (default until `WS5_MODULES=real`). It never judges content: the outcome
 * comes only from a test hook in the draft decision, and citations are mechanical (the first
 * pinned revision, its exchanges and the first verbatim answer line). Every output says STUB.
 */
import type { ModuleInfo } from "@/lib/contracts";
import type { TutorEvaluator, TutorHost, TutorResult } from "./modules";

export const STUB_TUTOR: ModuleInfo = { id: "ws6-stub-tutor", version: "0.1.0", source: "stub" };

/** Test hooks: the exact (trimmed) decision string selects the outcome. Anything else → ok. */
export const STUB_TUTOR_HOOKS = {
  FIXTURE_WRONG: "intervene",
  FIXTURE_UNCERTAIN: "uncertain",
  FIXTURE_FAIL: "throw",
} as const;

export function createStubTutor(host: TutorHost): TutorEvaluator {
  return {
    id: STUB_TUTOR.id,
    version: STUB_TUTOR.version,
    async evaluate({ draft, knowledge }): Promise<TutorResult> {
      const hook = STUB_TUTOR_HOOKS[draft.decision.trim() as keyof typeof STUB_TUTOR_HOOKS];
      if (hook === "throw") throw new Error("stub tutor: FIXTURE_FAIL test hook");
      const outcome: string = hook ?? "ok";
      const header = `STUB TUTOR — not a judgement (${STUB_TUTOR.id} ${STUB_TUTOR.version}). Outcome "${outcome}" comes from a test hook.`;
      if (outcome === "ok") {
        return { outcome, cited: [], feedback_text: header, guiding_question: null, uncertainty: null, escalation: null };
      }
      const first = knowledge[0];
      if (!first) return { outcome, cited: [], feedback_text: header, guiding_question: null, uncertainty: null, escalation: null };
      const { exchanges } = await host.loadRecords();
      const cited = exchanges.filter(x => first.evidence.exchange_ids.includes(x.exchange_id) && x.answer_lines.length > 0);
      const quote = cited[0]?.answer_lines[0]?.text;
      return {
        outcome,
        cited: [
          {
            entry_id: first.entry_id,
            revision_id: first.revision_id,
            exchange_ids: cited.map(x => x.exchange_id),
            ...(quote !== undefined ? { quote } : {}),
          },
        ],
        feedback_text: quote !== undefined ? `${header}\nThe expert said (${cited[0].exchange_id}): "${quote}"` : header,
        guiding_question: null,
        uncertainty: outcome === "uncertain" ? "STUB: uncertainty test hook." : null,
        escalation: null,
      };
    },
  };
}
