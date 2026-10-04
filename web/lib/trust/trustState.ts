// Revoke/delete requests: shown as done only after the source acknowledges.
// Keyed per entry/event so the state survives changing the selection.
import type { Ack } from "@/lib/data/source";

export type TrustStatus =
  | { state: "idle" }
  | { state: "pending" }
  | { state: "acknowledged" }
  | { state: "failed"; error: string };

export type TrustMap = Readonly<Record<string, TrustStatus>>;

export type TrustAction = { type: "submit"; key: string } | { type: "resolved"; key: string; ack: Ack<unknown> };

export const revokeKey = (entryId: string) => `revoke|${entryId}`;
export const deleteKey = (eventId: string) => `delete|${eventId}`;

export const trustStatus = (map: TrustMap, key: string): TrustStatus => map[key] ?? { state: "idle" };

export function trustReducer(map: TrustMap, action: TrustAction): TrustMap {
  const current = trustStatus(map, action.key);
  if (action.type === "submit") {
    // Pending: no double request. Acknowledged: the removal already happened.
    if (current.state === "pending" || current.state === "acknowledged") return map;
    return { ...map, [action.key]: { state: "pending" } };
  }
  if (current.state !== "pending") return map;
  const next: TrustStatus =
    action.ack.status === "acknowledged" ? { state: "acknowledged" } : { state: "failed", error: action.ack.error };
  return { ...map, [action.key]: next };
}
