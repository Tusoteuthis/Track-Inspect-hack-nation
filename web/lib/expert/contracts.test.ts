import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENT_SCHEMA_VERSION, validatePointingEvent } from "./contracts";

const fixturesDir = join(__dirname, "..", "..", "fixtures", "pointing-events");
const fixtureFiles = readdirSync(fixturesDir).filter(f => f.endsWith(".json")).sort();
const loadFixture = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));

function validEvent(): Record<string, unknown> {
  return structuredClone(loadFixture("evt-001-resolved.json"));
}

function errorsFor(input: unknown): string[] {
  const result = validatePointingEvent(input);
  return result.ok ? [] : result.errors;
}

describe("pointing-event fixtures", () => {
  it("has the five agreed fixtures", () => {
    expect(fixtureFiles).toEqual([
      "evt-001-resolved.json",
      "evt-002-resolved-sys2.json",
      "evt-003-repeat-of-001.json",
      "evt-004-ambiguous.json",
      "evt-005-off-record.json",
    ]);
  });

  it.each(fixtureFiles)("%s validates and is labeled as a fixture", file => {
    const result = validatePointingEvent(loadFixture(file));
    expect(result.ok ? [] : result.errors).toEqual([]);
    if (result.ok) {
      expect(result.value.source).toBe("fixture");
      expect(result.value.session_id).toBe("fixture-session-001");
      expect(result.value.schema_version).toBe(EVENT_SCHEMA_VERSION);
    }
  });

  it("covers the cases later sprints rely on", () => {
    const [e1, e2, e3, e4, e5] = fixtureFiles.map(loadFixture);
    expect(e1.mapping_status).toBe("resolved");
    expect(e2.channel_id).not.toBe(e1.channel_id);
    expect(e3.event_id).not.toBe(e1.event_id);
    expect(e3.region).toEqual(e1.region);
    expect(e4.mapping_status).toBe("ambiguous");
    expect(e5.record_state).toBe("off_record");
  });
});

describe("validatePointingEvent rejects invalid input", () => {
  it("rejects a missing event_id", () => {
    const event = validEvent();
    delete event.event_id;
    expect(errorsFor(event).join("\n")).toMatch(/event_id/);
  });

  it("rejects an unknown mapping_status", () => {
    expect(errorsFor({ ...validEvent(), mapping_status: "probably" }).join("\n")).toMatch(/mapping_status/);
  });

  it("rejects a region outside the frame", () => {
    const event = validEvent();
    event.region = { ...(event.region as object), x: 1.2 };
    expect(errorsFor(event).join("\n")).toMatch(/region\.x/);
  });

  it("rejects a region that overflows the right edge", () => {
    const event = validEvent();
    event.region = { ...(event.region as object), x: 0.9, width: 0.2 };
    expect(errorsFor(event).join("\n")).toMatch(/region\.x \+ region\.width/);
  });

  it("rejects a signal interval with start > end or without unit", () => {
    expect(errorsFor({ ...validEvent(), signal_interval: { start: 5, end: 1, unit: "ms" } }).join("\n")).toMatch(
      /signal_interval/
    );
    expect(errorsFor({ ...validEvent(), signal_interval: { start: 1, end: 5, unit: "" } }).join("\n")).toMatch(
      /signal_interval\.unit/
    );
  });

  it("rejects a wrong schema version and non-objects", () => {
    expect(errorsFor({ ...validEvent(), schema_version: "ws3.v9" }).join("\n")).toMatch(/schema_version/);
    expect(errorsFor(null)).not.toEqual([]);
    expect(errorsFor("evt-001")).not.toEqual([]);
  });
});

describe("validatePointingEvent edge cases", () => {
  it("accepts a region touching the frame edges", () => {
    const event = validEvent();
    event.region = { ...(event.region as object), x: 0, y: 0, width: 1, height: 1 };
    expect(errorsFor(event)).toEqual([]);
  });

  it("accepts unknown trace, channel and signal interval as null", () => {
    expect(errorsFor({ ...validEvent(), trace_id: null, channel_id: null, signal_interval: null })).toEqual([]);
  });

  it("rejects a guessed empty-string channel instead of null", () => {
    expect(errorsFor({ ...validEvent(), channel_id: "" }).join("\n")).toMatch(/channel_id/);
  });
});
