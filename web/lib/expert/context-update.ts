import type { PointingEvent } from "./contracts";

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
    ? "[STATE] live_question_budget=used_up. Do not ask more live questions now; call skip_turn instead. Remaining topics are kept for the debrief."
    : "[STATE] live_question_budget=available.";
