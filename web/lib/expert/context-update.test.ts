import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PointingEvent } from "./contracts";
import {
  budgetStateLine,
  controlNudge,
  formatPointingEventUpdate,
  isControlText,
} from "./context-update";

const dir = join(__dirname, "..", "..", "fixtures", "pointing-events");
const fixtures: PointingEvent[] = readdirSync(dir)
  .filter(f => f.endsWith(".json"))
  .sort()
  .map(f => JSON.parse(readFileSync(join(dir, f), "utf8")));
const byId = (id: string) => fixtures.find(f => f.event_id === id)!;

describe("formatPointingEventUpdate", () => {
  it("formats a resolved on-record event as one stable line", () => {
    expect(formatPointingEventUpdate(byId("evt-001"))).toBe(
      "[POINTING_EVENT] event_id=evt-001 mapping_status=resolved channel=SYS1 trace=trace-A " +
        "record_state=on_record source=fixture. The expert is pointing at this region. " +
        "Do not interpret it. When there is a natural pause, ask about it."
    );
  });

  it.each(fixtures.map(f => [f.event_id, f] as const))("%s never leaks the dev label or region", (_id, evt) => {
    const text = formatPointingEventUpdate(evt);
    expect(evt.label).toBeTruthy();
    expect(text).not.toContain(evt.label!);
    expect(text).not.toContain("FIXTURE:");
    expect(text).not.toMatch(/region=|x=|0\.15/);
    expect(text).not.toContain("\n");
  });

  it("writes unknown for null channel and trace and asks to clarify an ambiguous region", () => {
    const text = formatPointingEventUpdate({ ...byId("evt-004"), trace_id: null });
    expect(text).toContain("mapping_status=ambiguous channel=unknown trace=unknown");
    expect(text).toContain("first ask which region they mean");
    expect(text).not.toContain("ask about it.");
  });

  it("treats unresolved like ambiguous", () => {
    const text = formatPointingEventUpdate({ ...byId("evt-001"), mapping_status: "unresolved" });
    expect(text).toContain("first ask which region they mean");
  });

  it("tells the agent not to ask about off-record events", () => {
    const text = formatPointingEventUpdate(byId("evt-005"));
    expect(text).toContain("record_state=off_record");
    expect(text).toContain("This is off the record. Do not ask about it.");
    expect(text).not.toContain("ask about it. ");
  });

  it("marks live events as live", () => {
    expect(formatPointingEventUpdate({ ...byId("evt-001"), source: "live" })).toContain("source=live.");
  });
});

describe("release wording (Sprint 2)", () => {
  it("adds an explicit earlier-moment reference when stale, naming the channel", () => {
    const text = formatPointingEventUpdate(byId("evt-001"), { stale: true });
    expect(text).toContain(" stale=yes: the expert pointed at this a while ago and may have moved on.");
    expect(text).toContain('Refer to it explicitly, for example "the region you pointed at a moment ago on SYS1".');
    expect(text).not.toContain("\n");
  });

  it("says 'on the trace' when the channel is unknown", () => {
    const text = formatPointingEventUpdate(byId("evt-004"), { stale: true });
    expect(text).toContain('"the region you pointed at a moment ago on the trace"');
  });

  it("is unchanged when not stale and no guardrail is pending", () => {
    expect(formatPointingEventUpdate(byId("evt-001"), { stale: false, guardrailPending: false })).toBe(
      formatPointingEventUpdate(byId("evt-001"))
    );
  });

  it("adds the guardrail preference when none was asked yet: a soft priority, never mandatory (D10)", () => {
    const text = formatPointingEventUpdate(byId("evt-001"), { guardrailPending: true });
    expect(text).toContain(
      "No guardrail question yet: if a follow-up is worth asking once the expert has explained what they see here, prefer asking when they would stop, escalate or not trust it."
    );
  });

  it("builds the control nudge and recognizes control text", () => {
    const n = controlNudge("evt-001");
    expect(n).toBe(
      "[CONTROL] The expert has paused. If it is still open, ask your one question about event_id=evt-001 now; otherwise call skip_turn."
    );
    expect(isControlText(n)).toBe(true);
    expect(isControlText("  [CONTROL] x")).toBe(true);
    expect(isControlText("So here the control unit…")).toBe(false);
  });

  it("states the budget", () => {
    expect(budgetStateLine(true)).toMatch(/^\[STATE\] live_question_budget=used_up\. .*skip_turn/);
    expect(budgetStateLine(false)).toBe("[STATE] live_question_budget=available.");
  });
});
