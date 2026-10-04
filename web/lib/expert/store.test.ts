import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PointingEvent } from "./contracts";
import { type SessionAction, initialSession, injectFixture, reduceSession, toSnapshot } from "./session";
import { SESSION_FILES, createFileStore, knowledgeRoot } from "./store";

const SID = "ses-20261004-010000-abcd";
const evt = injectFixture(
  JSON.parse(
    readFileSync(join(__dirname, "..", "..", "fixtures", "pointing-events", "evt-001-resolved.json"), "utf8")
  ) as PointingEvent,
  SID
);
const at = (s: number) => ({ at_utc: `2026-10-04T01:00:0${s}.000Z`, perf_ms: s * 1000 });
const actions: SessionAction[] = [
  { type: "event_received", event: evt, ...at(1) },
  { type: "question_begun", params: { event_id: "evt-001", kind: "explain", question: "q" }, ...at(2) },
  { type: "agent_final_line", line_id: "line-1", text: "What do you see?", ...at(3) },
  { type: "user_final_line", line_id: "line-2", text: "A step.", ...at(4) },
];
const snap = toSnapshot(actions.reduce(reduceSession, initialSession(SID, "2026-10-04T01:00:00.000Z")));

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ws3-store-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("file store", () => {
  it("writes all session files, including the timing report", async () => {
    const store = createFileStore(join(root, "knowledge"), { publicDir: join(root, "web", "public") });
    const res = await store.saveSnapshot(snap);
    const dir = join(root, "knowledge", "sessions", SID);
    expect(readdirSync(dir).sort()).toEqual([...SESSION_FILES].sort());
    expect(res.files).toEqual([...SESSION_FILES]);

    expect(JSON.parse(readFileSync(join(dir, "events.json"), "utf8"))).toEqual(snap.events);
    expect(JSON.parse(readFileSync(join(dir, "exchanges.json"), "utf8"))).toEqual(snap.exchanges);
    expect(JSON.parse(readFileSync(join(dir, "timing.json"), "utf8"))).toEqual(snap.timing);
    const session = JSON.parse(readFileSync(join(dir, "session.json"), "utf8"));
    expect(session).toMatchObject({ session_id: SID, counts: { events: 1, exchanges: 1, unlinked_agent_questions: 0 } });
    expect(session.events).toBeUndefined();
    const md = readFileSync(join(dir, "exchanges.md"), "utf8");
    expect(md).toContain("> A step.");
    // image link is relative from the session folder to web/public
    expect(md).toContain("](../../../web/public/fixtures/trace-a-evt-001-highlight.svg)");
    expect(readFileSync(join(dir, "transcript.md"), "utf8")).toContain("[ex-001] A step.");
    expect(SESSION_FILES).toContain("timing-report.md");
    expect(readFileSync(join(dir, "timing-report.md"), "utf8")).toContain(`# Timing report — ${SID}`);
    expect(session.counts).toMatchObject({ live_questions: 1, guardrail_questions: 0, interruptions: 0, topics: 1 });
    expect(session.topics).toHaveLength(1);
  });

  it("is idempotent: saving the same snapshot twice leaves identical files and no temp files", async () => {
    const store = createFileStore(root);
    await store.saveSnapshot(snap);
    const dir = join(root, "sessions", SID);
    const first = readFileSync(join(dir, "exchanges.json"), "utf8");
    await store.saveSnapshot(snap);
    expect(readFileSync(join(dir, "exchanges.json"), "utf8")).toBe(first);
    expect(JSON.parse(first)).toHaveLength(1);
    expect(readdirSync(dir)).toHaveLength(SESSION_FILES.length);
  });

  it.each(["../escape", "..", "a/b", "ABC", ""])("refuses unsafe session id %j", async id => {
    const store = createFileStore(root);
    await expect(store.saveSnapshot({ ...snap, session_id: id })).rejects.toThrow(/session id/);
    expect(readdirSync(root)).toEqual([]);
  });
});

describe("knowledgeRoot", () => {
  it("defaults to ../knowledge relative to the web dir", () => {
    expect(knowledgeRoot({}, "/repo/web")).toBe("/repo/knowledge");
  });

  it("honours KNOWLEDGE_DIR (relative to the web dir)", () => {
    expect(knowledgeRoot({ KNOWLEDGE_DIR: "/data/k" }, "/repo/web")).toBe("/data/k");
    expect(knowledgeRoot({ KNOWLEDGE_DIR: "out/k" }, "/repo/web")).toBe("/repo/web/out/k");
  });
});
