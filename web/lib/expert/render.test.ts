import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PointingEvent } from "./contracts";
import { renderExchangesMd, renderTranscriptMd } from "./render";
import { type SessionAction, initialSession, injectFixture, reduceSession, toSnapshot } from "./session";

const SID = "ses-20261004-010000-abcd";
const fx = (f: string): PointingEvent =>
  injectFixture(JSON.parse(readFileSync(join(__dirname, "..", "..", "fixtures", "pointing-events", f), "utf8")), SID);
const at = (s: number) => ({ at_utc: `2026-10-04T01:00:${String(s).padStart(2, "0")}.000Z`, perf_ms: s * 1000 });

const actions: SessionAction[] = [
  { type: "connected", conversation_id: "conv_1" },
  { type: "user_final_line", line_id: "line-1", text: "Let me start here.", ...at(1) },
  { type: "event_received", event: fx("evt-001-resolved.json"), ...at(2) },
  { type: "question_begun", params: { event_id: "evt-001", kind: "explain", question: "plan" }, ...at(3) },
  { type: "agent_final_line", line_id: "line-2", text: "What do you recognize in this region?", ...at(4) },
  { type: "user_final_line", line_id: "line-3", text: "That's usually the joint.", ...at(5) },
  { type: "event_received", event: fx("evt-002-resolved-sys2.json"), ...at(6) },
  { type: "user_final_line", line_id: "line-4", text: "Only if it repeats, though.", ...at(7) },
  { type: "agent_final_line", line_id: "line-5", text: "Why there?", ...at(8) },
  { type: "session_ended", ...at(9) },
];
const snap = toSnapshot(actions.reduce(reduceSession, initialSession(SID, "2026-10-04T01:00:00.000Z")));

describe("renderExchangesMd", () => {
  const md = renderExchangesMd(snap, { imageHref: ref => `../img${ref}` });

  it("shows each exchange with event, image, verbatim question and verbatim answer", () => {
    expect(md).toContain("## ex-001 · evt-001 · explain");
    expect(md).toContain("![evt-001 highlighted](../img/fixtures/trace-a-evt-001-highlight.svg)");
    expect(md).toContain("**Question (verbatim):** What do you recognize in this region?");
    expect(md).toContain("> That's usually the joint.\n>\n> Only if it repeats, though.");
  });

  it("labels fixture events as FIXTURE and lists the timing marks", () => {
    expect(md).toContain("evt-001 (FIXTURE)");
    expect(md).toMatch(/question_tool_called 01:00:03\.000Z/);
    expect(md).toMatch(/answer_started 01:00:05\.000Z/);
    expect(md).toMatch(/answer_ended 01:00:07\.000Z/);
  });

  it("keeps the AI's planned question apart from the evidence", () => {
    expect(md).toContain("_Planned (AI, not evidence):_ plan");
  });

  it("includes preamble and unlinked agent questions", () => {
    expect(md).toContain("> Let me start here.");
    expect(md).toContain("Unlinked agent questions: 1");
    expect(md).toContain("- 01:00:08.000Z — Why there?");
  });

  it("never prints the fixture dev label", () => {
    expect(md).not.toContain("FIXTURE: upper channel");
  });

  it("marks a pending question and a question without event", () => {
    const pending = toSnapshot(
      reduceSession(initialSession(SID, "2026-10-04T01:00:00.000Z"), {
        type: "question_begun",
        params: { event_id: "none", kind: "gap", question: "Anything else?" },
        ...at(1),
      })
    );
    const out = renderExchangesMd(pending);
    expect(out).toContain("## ex-001 · no event · gap");
    expect(out).toContain("**Question (verbatim):** _(not spoken yet)_");
    expect(out).toContain("_(no answer)_");
  });
});

describe("renderTranscriptMd", () => {
  it("lists every line with time, role and the active exchange", () => {
    const md = renderTranscriptMd(snap);
    expect(md).toContain("- 01:00:01.000Z **expert** [—] Let me start here.");
    expect(md).toContain("- 01:00:04.000Z **agent** [ex-001] What do you recognize in this region?");
    expect(md).toContain("- 01:00:07.000Z **expert** [ex-001] Only if it repeats, though.");
    expect(md.split("\n").filter(l => l.startsWith("- "))).toHaveLength(5);
  });
});
