import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PointingEvent } from "./contracts";
import { formatPointingEventUpdate } from "./context-update";

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
