// Structured practice-screen events as silent contextual updates for the tutor.
// They supplement the shared-screen frames; they never replace visual context
// and never ask the agent to speak.
import type { LearnerDraft, LearnerEvaluation, ScreenFrameRef } from "@/lib/ui/contracts";

export type PracticeContextEvent =
  | { kind: "draft_edited"; draft: LearnerDraft }
  | { kind: "review_requested"; draft_revision: number }
  | { kind: "evaluation_received"; evaluation: LearnerEvaluation }
  | { kind: "saved"; draft_revision: number }
  | { kind: "screen_frame"; frame: ScreenFrameRef };

export type ContextMessage = { text: string; contextId: string };

let seq = 0;

function describe(event: PracticeContextEvent): string {
  switch (event.kind) {
    case "draft_edited": {
      const d = event.draft;
      return (
        `[PRACTICE draft_edited draft_rev=${d.draft_revision}] decision: ${JSON.stringify(d.decision)} ` +
        `reason: ${JSON.stringify(d.reason)} region: ${d.region ? "marked" : "none"}`
      );
    }
    case "review_requested":
      return `[PRACTICE review_requested draft_rev=${event.draft_revision}]`;
    case "evaluation_received": {
      // Only what WS5 lets the tutor cite: outcome, question and verbatim quotes.
      const ev = event.evaluation;
      const quotes = ev.citations.flatMap(c => (c.quote ? [JSON.stringify(c.quote.text)] : []));
      return (
        `[PRACTICE evaluation draft_rev=${ev.draft_revision} outcome=${ev.outcome}]` +
        (ev.guiding_question ? ` guiding_question: ${ev.guiding_question}` : "") +
        (quotes.length ? ` cited: ${quotes.join(" | ")}` : "")
      );
    }
    case "saved":
      return `[PRACTICE saved draft_rev=${event.draft_revision}]`;
    case "screen_frame":
      return `[PRACTICE screen_frame frame=${event.frame.frame_id} draft_rev=${event.frame.draft_revision} captured=${event.frame.captured_at_utc}]`;
  }
}

export function practiceContext(event: PracticeContextEvent): ContextMessage {
  seq += 1;
  return { text: describe(event), contextId: `practice-${event.kind}-${seq}` };
}
