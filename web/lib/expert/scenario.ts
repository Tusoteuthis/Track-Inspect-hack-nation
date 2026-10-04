// The scripted fixture run for the human gate: realistic gestures at fixed offsets
// while the human talks through a task. Every injected event stays source "fixture".
import type { ValidationResult } from "./contracts";

export type ScenarioStep = { event_id: string; offset_s: number };

/** evt-003 repeats evt-001 inside the dedup window; evt-004 is ambiguous. */
export const DEFAULT_SCENARIO: readonly ScenarioStep[] = [
  { event_id: "evt-001", offset_s: 0 },
  { event_id: "evt-003", offset_s: 8 },
  { event_id: "evt-002", offset_s: 70 },
  { event_id: "evt-004", offset_s: 140 },
];

export const formatScenarioOffsets = (steps: readonly ScenarioStep[]) => steps.map(s => s.offset_s).join(", ");

/** "0, 8, 70, 140" → offsets for the default scenario's events, in order. */
export function parseScenarioOffsets(text: string): ValidationResult<ScenarioStep[]> {
  const parts = text.split(",").map(p => p.trim());
  if (parts.length !== DEFAULT_SCENARIO.length) {
    return { ok: false, errors: [`give ${DEFAULT_SCENARIO.length} offsets in seconds, comma-separated`] };
  }
  const offsets = parts.map(p => (p === "" ? Number.NaN : Number(p)));
  if (offsets.some(o => !Number.isFinite(o) || o < 0)) return { ok: false, errors: ["offsets must be numbers ≥ 0"] };
  return { ok: true, value: DEFAULT_SCENARIO.map((s, i) => ({ event_id: s.event_id, offset_s: offsets[i] })) };
}
