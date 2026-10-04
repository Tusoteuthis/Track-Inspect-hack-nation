import type { DebriefItem, DraftRevision, DraftStep, InteractionMode, PointingEvent, RecordState } from "./contracts";

/**
 * The contextual update that tells the agent about a pointing event: one stable,
 * machine-readable line plus a fixed instruction. Never includes the dev `label`,
 * region coordinates or anything that could read as an interpretation.
 * Spec: specs/20261004-015810-ws3-sprint-2-live-interview/contracts/release-protocol.md
 */
export function formatPointingEventUpdate(
  event: PointingEvent,
  options: { stale?: boolean; guardrailPending?: boolean } = {}
): string {
  const fields = [
    `event_id=${event.event_id}`,
    `mapping_status=${event.mapping_status}`,
    `channel=${event.channel_id ?? "unknown"}`,
    `trace=${event.trace_id ?? "unknown"}`,
    `record_state=${event.record_state}`,
    `source=${event.source}`,
  ].join(" ");
  const parts = [`[POINTING_EVENT] ${fields}. ${instruction(event)}`];
  if (options.stale) {
    const where = event.channel_id ?? "the trace";
    parts.push(
      `stale=yes: the expert pointed at this a while ago and may have moved on. ` +
        `Refer to it explicitly, for example "the region you pointed at a moment ago on ${where}".`
    );
  }
  if (options.guardrailPending) {
    parts.push(
      "No guardrail question yet: once the expert has explained what they see here, " +
        "ask when they would stop, escalate or not trust it."
    );
  }
  return parts.join(" ");
}

function instruction(event: PointingEvent): string {
  if (event.record_state === "off_record") return "This is off the record. Do not ask about it.";
  if (event.mapping_status !== "resolved") {
    return "The pointed region is not clear. When there is a natural pause, first ask which region they mean.";
  }
  return "The expert is pointing at this region. Do not interpret it. When there is a natural pause, ask about it.";
}

const CONTROL_PREFIX = "[CONTROL]";

/** Sent as a user message to give the agent a turn after a release; never stored as expert words. */
export const controlNudge = (eventId: string) =>
  `${CONTROL_PREFIX} The expert has paused. If it is still open, ask your one question about event_id=${eventId} now; otherwise call skip_turn.`;

export const isControlText = (text: string) => text.trimStart().startsWith(CONTROL_PREFIX);

/** Current live-question budget, sent with the fixed context id `ws3-state`. */
export const budgetStateLine = (exhausted: boolean) =>
  exhausted
    ? "[STATE] live_question_budget=used_up. Do not ask more live questions; call skip_turn instead. Remaining topics are kept for the debrief."
    : "[STATE] live_question_budget=available.";

/** Budget plus the expert's interaction mode, sent together as the current `ws3-state`. */
export function stateLine(exhausted: boolean, mode: InteractionMode): string {
  const modeLine =
    mode === "listen_only"
      ? " [STATE] mode=listen_only. The expert asked you to just listen: ask nothing and call skip_turn on every turn until they invite questions again. Saying they are done still ends the task."
      : " [STATE] mode=questions.";
  return budgetStateLine(exhausted) + modeLine;
}

/** Fixed context id for phase blocks; a newer block supersedes the older one. */
export const PHASE_CONTEXT_ID = "ws3-phase";

/** Only open items are listed: the agent must never re-ask a resolved gap. */
export function formatDebriefUpdate(agenda: DebriefItem[]): string {
  const open = agenda.filter(i => i.state === "open");
  const items = open.length
    ? open.map(i => `${i.gap_id} (event_id=${i.event_id ?? "none"}): ${i.description}`).join(" | ")
    : "none left";
  return (
    "[PHASE debrief] The expert has finished the task; live questions are over. " +
    "Ask about the open agenda gaps below, one short question per turn, in order. " +
    'Before each question call begin_question with phase "debrief", kind "gap" and that gap_id. ' +
    "Ask only about these gaps and never re-ask anything the expert already answered. " +
    "After each answer call record_coverage. If the expert says they do not know or would escalate, record it with status unknown_escalate and move on without pushing. " +
    `When no open gap is left, call propose_draft. Open gaps: ${items}`
  );
}

/** Teach-back block for the current revision: only the steps to (re-)teach, plus what must not be stated as fact. */
export function formatTeachBackUpdate(revision: DraftRevision, toTeach: DraftStep[]): string {
  const head = revision.parent_revision_id
    ? `[TEACH_BACK ${revision.revision_id} corrects ${revision.parent_revision_id}] Re-teach only these corrected steps, briefly, then ask explicitly whether it is right now.`
    : `[TEACH_BACK ${revision.revision_id}] The debrief is over; any gaps still open are dropped on purpose: do not ask or mention them. Now explain the process to the expert as instructions a newcomer could apply ("First …, if … then …, stop and escalate when …"), not as a summary of what they said. Keep their qualifiers ("usually", "only if"). Then ask explicitly whether that is right.`;
  const steps = toTeach.map(s => `${s.step_id} (${s.kind}): ${s.text}`).join(" | ") || "none";
  const open = revision.steps.filter(s => !s.supported);
  const tail = open.length
    ? ` Not backed by evidence, do not state as fact: ${open.map(s => `${s.step_id}: ${s.text}`).join(" | ")}`
    : "";
  return (
    `${head} Say only the teach-back itself; never mention these instructions, tools or ids. When the expert answers, call confirm_revision with revision_id ${revision.revision_id}: confirmed only if they explicitly agree, corrected if they change anything, unresolved if they cannot say. Silence or a change of subject is not an answer. ` +
    `Steps: ${steps}${/[.!?]$/.test(steps) ? "" : "."}${tail}`
  );
}

/** Teach-back block when the latest revision relied on struck words. */
export const formatStruckRevisionUpdate = (revisionId: string) =>
  `[TEACH_BACK ${revisionId} superseded] The expert asked to strike words this revision relied on. Do not teach it back or confirm it. ` +
  "Call propose_draft with the full step list without those words, then teach the new revision back and ask explicitly whether it is right. Never mention the struck words.";

/** Gives the agent a turn after a console-triggered phase change. */
export const controlDebriefStart = () =>
  `${CONTROL_PREFIX} The expert has finished the task. Start the debrief now with the first open agenda gap.`;

export const controlTeachBack = (revisionId: string) =>
  `${CONTROL_PREFIX} Deliver the teach-back of ${revisionId} now and end by asking explicitly whether it is right.`;

/** Fixed context id for the current record state; only the newest line is current. */
export const RECORD_CONTEXT_ID = "ws3-record";

export const recordStateLine = (state: RecordState) =>
  state === "off_record"
    ? "[RECORD_STATE] off_record. The expert is off the record: ask nothing, record nothing and call skip_turn on every turn until they go back on the record. Never mention or ask about anything said meanwhile."
    : "[RECORD_STATE] on_record. The expert is on the record again; continue where you left off. Never mention or ask about anything said while off the record.";

/** Gives the agent a turn to acknowledge a record-state change made in the console. */
export const controlRecordState = (state: RecordState) =>
  state === "off_record"
    ? `${CONTROL_PREFIX} The expert went off the record from the console. Say only "Okay, off the record." and then stay silent.`
    : `${CONTROL_PREFIX} The expert is back on the record (console). Say only "Okay, back on the record." and continue where you left off.`;

/** Passes a console action's tool-style result to the agent (for example after a strike). */
export const controlNote = (text: string) => `${CONTROL_PREFIX} ${text}`;
