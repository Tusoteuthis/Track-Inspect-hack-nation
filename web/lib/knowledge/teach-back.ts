// The teach-back WS3 speaks to the expert: the current revisions as a process someone else could
// follow, quoting the expert verbatim, ending with an explicit question. A confirmation binds to
// exactly the revisions listed in `reviewed`.

import type { KnowledgeEntryContent, Statement } from "./schema";
import type { TeachBack } from "./synthesis-types";

export const TEACH_BACK_QUESTION = "Is that right, or what should I change?";

// A trailing full stop is dropped so the sentence reads well; the span stays a verbatim substring.
const span = (quote: string) => `"${quote.replace(/[.!?]+$/, "")}"`;
const quoted = (s: Statement[]) => s.flatMap(x => (x.type === "expert_quote" ? [span(x.quote)] : [])).join(" and ");

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
const ordinal = (i: number) => ORDINALS[i] ?? `number ${i + 1}`;

function sentence(e: KnowledgeEntryContent, region: string, isFirstStep: boolean): string {
  const at = `at the ${region} region you pointed to`;
  switch (e.kind) {
    case "step":
    case "decision": {
      const words = quoted(e.interpretation) || quoted(e.expert_words.map(q => ({ type: "expert_quote" as const, ...q })));
      const reason = e.reasoning.length ? `; your reason: ${quoted(e.reasoning)}` : "";
      return `${isFirstStep ? "First" : "Then"}, ${at}, check what you described: ${words}${reason}.`;
    }
    case "exception":
      return `If your exception applies ${at} (${quoted(e.exceptions.map(x => x.trigger))}), apply it instead of the usual step.`;
    case "guardrail":
      return `Stop and do not continue ${at} when this applies: ${quoted(e.exceptions.map(x => x.trigger))}.`;
    case "escalation":
      return `Stop and escalate ${at} when this applies: ${quoted(e.exceptions.map(x => x.trigger))}.`;
  }
}

/** `entries` must be the current revisions in workflow order. Revoked entries are skipped. */
export function buildTeachBack(entries: readonly KnowledgeEntryContent[]): TeachBack | null {
  const live = entries.filter(e => e.status !== "revoked");
  if (!live.length) return null;
  // Regions are named by the order the expert pointed at them (session time), not by event id.
  const firstTime = (e: KnowledgeEntryContent) => Math.min(...e.visual_evidence.map(v => v.session_time_ms ?? Infinity));
  const regions = [...new Set([...live].sort((a, b) => firstTime(a) - firstTime(b)).map(e => e.visual_evidence[0]?.event_id))];
  let seenStep = false;
  const items = live.map(e => {
    const isStep = e.kind === "step" || e.kind === "decision";
    const text = sentence(e, ordinal(regions.indexOf(e.visual_evidence[0]?.event_id)), isStep && !seenStep);
    if (isStep) seenStep = true;
    return { entry_id: e.entry_id, revision_id: e.revision_id, kind: e.kind, text };
  });
  return {
    text: ["To interpret a trace like this:", ...items.map(i => i.text), TEACH_BACK_QUESTION].join(" "),
    items,
    question: TEACH_BACK_QUESTION,
    reviewed: items.map(i => ({ entry_id: i.entry_id, revision_id: i.revision_id })),
  };
}
