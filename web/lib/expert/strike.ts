// "Forget what I just said": removes the expert's last answer from every record, redacts AI text
// derived from it, supersedes the revisions that relied on it and invalidates any confirmation
// that no longer holds. The exchange stays as an id shell so links remain valid.

import type { DraftRevision, ExpertConfirmation, ExpertExchange, OpenQuestion, Strike } from "./contracts";
import { latestRevision, openTeachBackExchange, withPhase } from "./debrief";
import type { SessionState } from "./session";
import { type Stamp, closeActive } from "./session-util";

/** A spoken strike request; such lines are meta-talk, never evidence, and are removed as well. */
export const STRIKE_PHRASE =
  /\b(forget (what|that|everything) i (just )?said|forget that|strike (that|this)|scratch that|delete (that|what i (just )?said)|don'?t (use|keep) (that|what i (just )?said))\b/i;

export const REDACTED = "(removed at the expert's request)";
export const REDACTED_STEP = "(step removed: it relied on words the expert asked to strike)";

const pad = (n: number) => String(n).padStart(3, "0");
const isStrikeLine = (text: string) => STRIKE_PHRASE.test(text);

/** Confirmations that still count (not invalidated by a strike). */
export function invalidatedConfirmationIds(state: Pick<SessionState, "strikes">): Set<string> {
  return new Set(state.strikes.flatMap(s => s.invalidated_confirmation_ids));
}
export function supersededRevisionIds(state: Pick<SessionState, "strikes">): Set<string> {
  return new Set(state.strikes.flatMap(s => s.superseded_revision_ids));
}

function redactRevision(rev: DraftRevision, exchangeId: string): DraftRevision {
  const cites = (ids: string[]) => ids.includes(exchangeId);
  return {
    ...rev,
    steps: rev.steps.map(s => (cites(s.supporting_exchange_ids) ? { ...s, text: REDACTED_STEP, supported: false } : s)),
    change_reason: cites(rev.change_exchange_ids) ? REDACTED : rev.change_reason,
  };
}

/** The struck exchange: the latest one holding expert words other than a strike request. */
function strikeTarget(state: SessionState): ExpertExchange | undefined {
  return [...state.exchanges].reverse().find(x => x.answer_lines.some(l => !isStrikeLine(l.text)));
}

export function strikeLastAnswer(state: SessionState, trigger: Strike["trigger"], at: Stamp): SessionState {
  const target = strikeTarget(state);
  if (!target) return { ...state, last_tool_result: "error nothing to strike: no answer from the expert is recorded." };
  const id = target.exchange_id;
  const firstAt = Date.parse(target.answer_lines[0].at_utc);
  const closed = closeActive(state);

  // the target's lines, plus strike requests said since (meta-talk, never evidence)
  const removed = new Set(target.answer_lines.map(l => l.transcript_line_id));
  const isRequestSince = (l: { text: string; at_utc: string }) => isStrikeLine(l.text) && Date.parse(l.at_utc) >= firstAt;
  for (const x of closed.exchanges) for (const l of x.answer_lines) if (isRequestSince(l)) removed.add(l.transcript_line_id);
  for (const l of closed.preamble) if (isRequestSince(l)) removed.add(l.transcript_line_id);

  const revisions = closed.revisions;
  const superseded = revisions
    .filter(r => r.change_exchange_ids.includes(id) || r.steps.some(s => s.supporting_exchange_ids.includes(id)))
    .map(r => r.revision_id);
  const alreadyInvalid = invalidatedConfirmationIds(closed);
  const invalidated = closed.confirmations
    .filter((c: ExpertConfirmation) => !alreadyInvalid.has(c.confirmation_id) && (superseded.includes(c.revision_id) || c.expert_response_exchange_id === id))
    .map(c => c.confirmation_id);

  const redactedTeachBacks = new Set(
    closed.exchanges.filter(x => x.kind === "teach_back" && x.revision_id !== null && superseded.includes(x.revision_id)).map(x => x.exchange_id)
  );
  const exchanges = closed.exchanges.map(x => {
    const answer_lines = x.answer_lines.filter(l => !removed.has(l.transcript_line_id));
    const next = answer_lines.length === x.answer_lines.length ? x : { ...x, answer_lines, answer_started_at_utc: answer_lines[0]?.at_utc ?? null, answer_ended_at_utc: answer_lines.at(-1)?.at_utc ?? null };
    return redactedTeachBacks.has(x.exchange_id) ? { ...next, question: REDACTED, question_planned: null } : next;
  });
  const transcript = closed.transcript
    .filter(t => !removed.has(t.line_id))
    .map(t => (t.role === "agent" && t.exchange_id !== null && redactedTeachBacks.has(t.exchange_id) ? { ...t, text: REDACTED } : t));

  const coverage = closed.coverage.flatMap(c => {
    if (!c.supporting_exchange_ids.includes(id)) return [c];
    const rest = c.supporting_exchange_ids.filter(x => x !== id);
    return rest.length ? [{ ...c, supporting_exchange_ids: rest, note: null }] : [];
  });
  const debrief_agenda = closed.debrief_agenda.map(g => {
    if (!g.exchange_ids.includes(id)) return g;
    const answered = g.exchange_ids.some(x => x !== id && exchanges.find(e => e.exchange_id === x)?.answer_lines.length);
    return answered ? g : { ...g, state: "open" as const };
  });
  const open_questions = closed.open_questions.map((q: OpenQuestion) => {
    let next = q.answered_by_exchange_id === id ? { ...q, answered_by_exchange_id: null } : q;
    if (q.related_exchange_ids.includes(id) && q.missing_fact.startsWith("Draft step")) next = { ...next, missing_fact: `A draft step ${REDACTED}.` };
    return next;
  });

  const strike: Strike = {
    strike_id: `str-${pad(closed.strikes.length + 1)}`,
    exchange_id: id,
    at_utc: at.at_utc,
    trigger,
    removed_line_count: removed.size,
    superseded_revision_ids: superseded,
    invalidated_confirmation_ids: invalidated,
  };
  let next: SessionState = {
    ...closed,
    exchanges,
    transcript,
    preamble: closed.preamble.filter(l => !removed.has(l.transcript_line_id)),
    coverage,
    debrief_agenda,
    open_questions,
    revisions: revisions.map(r => (superseded.includes(r.revision_id) ? Object.freeze(redactRevision(r, id)) : r)),
    strikes: [...closed.strikes, strike],
  };

  const parts = [`ok struck ${id} (${strike.strike_id}): the expert's words are removed.`];
  if (invalidated.length) parts.push(`The expert's confirmation ${invalidated.join(", ")} no longer counts.`);
  if (next.phase === "confirmed" && invalidated.length) next = withPhase(next, "teach_back", "strike", at);
  const latest = latestRevision(next);
  if (next.phase === "teach_back" && latest) {
    if (superseded.includes(latest.revision_id)) {
      parts.push(
        `Revision ${latest.revision_id} relied on those words. Acknowledge briefly, then call propose_draft with the full step list without them, and teach the result back again.`
      );
    } else {
      next = openTeachBackExchange(next, latest.revision_id, at);
      parts.push(`Acknowledge briefly, then ask the expert again whether the procedure you taught back is right.`);
    }
  } else {
    parts.push("Acknowledge briefly (for example \"Okay, I've dropped that.\") and never refer to it again.");
  }
  return { ...next, last_tool_result: parts.join(" ") };
}
