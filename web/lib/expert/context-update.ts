import type { PointingEvent } from "./contracts";

/**
 * The contextual update that tells the agent about a pointing event: one stable,
 * machine-readable line plus a fixed instruction. Never includes the dev `label`,
 * region coordinates or anything that could read as an interpretation.
 * Spec: specs/20261004-010622-ws3-sprint-1-golden-path/contracts/pointing-event-update.md
 */
export function formatPointingEventUpdate(event: PointingEvent): string {
  const fields = [
    `event_id=${event.event_id}`,
    `mapping_status=${event.mapping_status}`,
    `channel=${event.channel_id ?? "unknown"}`,
    `trace=${event.trace_id ?? "unknown"}`,
    `record_state=${event.record_state}`,
    `source=${event.source}`,
  ].join(" ");
  return `[POINTING_EVENT] ${fields}. ${instruction(event)}`;
}

function instruction(event: PointingEvent): string {
  if (event.record_state === "off_record") return "This is off the record. Do not ask about it.";
  if (event.mapping_status !== "resolved") {
    return "The pointed region is not clear. When there is a natural pause, first ask which region they mean.";
  }
  return "The expert is pointing at this region. Do not interpret it. When there is a natural pause, ask about it.";
}
