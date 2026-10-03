// Genuine gaps for WS3's debrief: only what the expert has not answered yet. Never padded; if
// fewer than three gaps exist, fewer are returned. Descriptions say what is missing, never what
// the answer might be. Guardrails and conflicts come first.

import { findTendencyHedges, findUncertainHedges } from "./cues";
import { prepareMaterial, roleOfKind, type ClassifiedLine, type MaterialInput } from "./material";
import type { KnowledgeEntryContent } from "./schema";
import type { Gap, GapKind } from "./synthesis-types";

const PRIORITY: Record<GapKind, Gap["priority"]> = {
  unclear_guardrail: 1,
  conflict: 1,
  missing_reason: 2,
  unqualified_exception: 2,
  ambiguous_reference: 3,
  missing_evidence: 3,
};

export type GapInput = MaterialInput & {
  /** The current revision of every entry (after synthesis). */
  entries: readonly KnowledgeEntryContent[];
};

const uniqSorted = (ids: string[]) => [...new Set(ids)].sort();
const quoteList = (words: string[]) => [...new Set(words)].map(w => `"${w}"`).join(", ");

export function findGaps(input: GapInput): Gap[] {
  const m = prepareMaterial(input);
  const gaps = new Map<string, Gap>();
  const add = (kind: GapKind, subject: string, description: string, events: string[], exchanges: string[]) => {
    const gap_id = `gap-${kind}-${subject}`;
    if (!gaps.has(gap_id)) {
      gaps.set(gap_id, {
        gap_id,
        kind,
        description,
        related_event_ids: uniqSorted(events),
        related_exchange_ids: uniqSorted(exchanges),
        priority: PRIORITY[kind],
      });
    }
  };

  const linesOn = (eventId: string, pick: (l: ClassifiedLine) => boolean) =>
    m.lines.filter(l => l.event_id === eventId && pick(l));
  const eventIds = [...new Set(m.lines.map(l => l.event_id))].sort();
  const ruleRoles = new Set(["guardrail", "escalation"]);

  for (const eventId of eventIds) {
    const step = linesOn(eventId, l => l.role === "step");
    const reasons = step.filter(l => l.use === "reasoning");
    const exceptions = linesOn(eventId, l => l.role === "exception");
    const rules = linesOn(eventId, l => ruleRoles.has(l.role));

    if (step.length && !reasons.length) {
      add("missing_reason", eventId, `The expert explained what they see at ${eventId} but gave no reason for it.`, [eventId], step.map(l => l.exchange_id));
    }

    const hedges = step.flatMap(l => findTendencyHedges(l.text));
    if (hedges.length && !exceptions.length) {
      add(
        "unqualified_exception",
        eventId,
        `The expert said ${quoteList(hedges)} about ${eventId} but did not say when it does not apply.`,
        [eventId],
        step.filter(l => findTendencyHedges(l.text).length).map(l => l.exchange_id)
      );
    }

    // The latest word on a stop condition decides: a hedge followed by a clear answer is answered.
    for (const role of ruleRoles) {
      const own = rules.filter(l => l.role === role);
      const last = own.at(-1);
      if (last && findUncertainHedges(last.text).length) {
        add(
          "unclear_guardrail",
          eventId,
          `The expert's stop condition at ${eventId} is hedged (${quoteList(findUncertainHedges(last.text))}); it is not clear when to stop.`,
          [eventId],
          own.map(l => l.exchange_id)
        );
      }
    }

    const event = m.events.get(eventId);
    if (event && event.mapping_status !== "resolved" && !m.clarified_event_ids.has(eventId)) {
      add(
        "ambiguous_reference",
        eventId,
        `It is not clear which part of the screen ${eventId} refers to (mapping ${event.mapping_status}).`,
        [eventId],
        linesOn(eventId, () => true).map(l => l.exchange_id)
      );
    }
  }

  // A guardrail question the expert has not answered (and nothing later answered it).
  for (const x of m.exchanges) {
    if (x.kind !== "guardrail" || x.answer_lines.some(l => l.text.trim())) continue;
    const subject = x.event_id ?? x.exchange_id;
    const laterRule = x.event_id && m.lines.some(l => l.event_id === x.event_id && ruleRoles.has(l.role));
    if (!laterRule) {
      add("unclear_guardrail", subject, `The expert was asked when to stop${x.event_id ? ` at ${x.event_id}` : ""} and has not answered yet.`, x.event_id ? [x.event_id] : [], [x.exchange_id]);
    }
  }

  const hasSteps = m.lines.some(l => l.role === "step");
  const hasRules = m.lines.some(l => ruleRoles.has(l.role)) || input.entries.some(e => ruleRoles.has(roleOfKind(e.kind)));
  if (hasSteps && !hasRules) {
    add("unclear_guardrail", "session", "The expert has not said when to stop or escalate.", eventIds, []);
  }

  for (const u of m.unlocated_corrections) {
    add(
      "conflict",
      u.confirmation.confirmation_id,
      `The expert corrected the teach-back (${u.confirmation.expert_response_exchange_id}), but it is not clear which step the correction changes: ${u.reason}.`,
      [],
      [u.confirmation.expert_response_exchange_id]
    );
  }
  const byRevision = new Map<string, Set<string>>();
  for (const c of input.confirmations) {
    byRevision.set(c.revision_id, (byRevision.get(c.revision_id) ?? new Set()).add(c.status));
  }
  for (const [revisionId, results] of byRevision) {
    if (results.has("confirmed") && results.has("unresolved")) {
      const related = input.confirmations.filter(c => c.revision_id === revisionId).map(c => c.expert_response_exchange_id);
      add("conflict", revisionId, `The expert both confirmed ${revisionId} and marked it unresolved.`, [], related);
    }
  }

  for (const x of m.unlinked) {
    add("missing_evidence", x.exchange_id, `The expert's answer in ${x.exchange_id} is not linked to a screen moment.`, [], [x.exchange_id]);
  }

  return [...gaps.values()]
    .filter(g => !m.answered_gaps.has(g.gap_id))
    .sort((a, b) => a.priority - b.priority || a.gap_id.localeCompare(b.gap_id));
}
