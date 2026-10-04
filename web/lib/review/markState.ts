// Supplementary review marks: shown as done only after the source acknowledges.
import type { Ack } from "@/lib/data/source";
import type { ReviewMark } from "@/lib/ui/contracts";

export type MarkStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "acknowledged"; received_at_utc: string }
  | { state: "failed"; error: string };

export type MarkMap = Readonly<Record<string, MarkStatus>>;

export type MarkAction =
  | { type: "submit"; key: string }
  | { type: "resolved"; key: string; ack: Ack<{ received_at_utc: string }> };

/** Revision is part of the key, so a new revision shows fresh controls. */
export const markKey = (m: ReviewMark): string => `${m.revision_id}|${m.entry_id}|${m.kind}`;

export const markStatus = (map: MarkMap, key: string): MarkStatus => map[key] ?? { state: "idle" };

export function markReducer(map: MarkMap, action: MarkAction): MarkMap {
  const current = markStatus(map, action.key);
  if (action.type === "submit") {
    if (current.state === "pending") return map; // no double submit
    return { ...map, [action.key]: { state: "pending" } };
  }
  if (current.state !== "pending") return map;
  const next: MarkStatus =
    action.ack.status === "acknowledged"
      ? { state: "acknowledged", received_at_utc: action.ack.value.received_at_utc }
      : { state: "failed", error: action.ack.error };
  return { ...map, [action.key]: next };
}
