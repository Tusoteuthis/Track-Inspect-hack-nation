import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBusAfter } from "./bus";
import { resetConfig, setConfigForTests } from "./config";
import { ApiError } from "./errors";
import {
  changeLifecycle,
  changeRecordState,
  createSession,
  getSession,
  requireActiveSession,
  requireWritableSession,
  withSessionLock,
} from "./sessions";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "ws6-sessions-"));
  setConfigForTests({ knowledgeDir: path.join(dir, "knowledge"), runtimeDir: path.join(dir, "runtime") });
});

afterEach(async () => {
  resetConfig();
  await fsp.rm(dir, { recursive: true, force: true });
});

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  return p.then(
    () => null,
    (e: unknown) => (e instanceof ApiError ? e.code : "other"),
  );
}

const expert = { role: "expert" as const, source: "fixture" as const, trace_ref: null };

describe("createSession", () => {
  it("creates an expert session with a server ID, on-record, one open segment, rev 1", async () => {
    const { status, session } = await createSession(expert);
    expect(status).toBe(201);
    expect(session.session_id).toMatch(/^ses-\d{14}-[a-z0-9]{6}$/);
    expect(session).toMatchObject({
      role: "expert",
      lifecycle: "created",
      record_state: "on_record",
      case_id: null,
      pinned_knowledge: null,
      source: "fixture",
      rev: 1,
    });
    expect(session.recording_segments).toHaveLength(1);
    expect(session.recording_segments[0]).toMatchObject({ state: "on_record", ended_at_utc: null });
    expect(await getSession(session.session_id)).toEqual(session);
  });

  it("returns the same session for a repeated Idempotency-Key (no second session)", async () => {
    const a = await createSession(expert, "key-123");
    const b = await createSession(expert, "key-123");
    const c = await createSession(expert, "other-key");
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.session.session_id).toBe(a.session.session_id);
    expect(c.session.session_id).not.toBe(a.session.session_id);
    expect(await fsp.readdir(path.join(dir, "knowledge", "sessions"))).toHaveLength(2);
  });

  it("concurrent creates with one key produce one session", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => createSession(expert, "same")));
    expect(new Set(results.map((r) => r.session.session_id)).size).toBe(1);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it.each(["", "x".repeat(201), "bad\nkey"])("rejects an invalid Idempotency-Key %j", async (key) => {
    expect(await codeOf(createSession(expert, key))).toBe("validation_failed");
  });
});

describe("getSession", () => {
  it("404 for unknown, 400 for invalid IDs", async () => {
    expect(await codeOf(getSession("ses-nope"))).toBe("not_found");
    expect(await codeOf(getSession("../etc"))).toBe("validation_failed");
  });
});

describe("changeLifecycle", () => {
  it("applies start → end, persists, and emits session.updated each time", async () => {
    const { session } = await createSession(expert);
    const sid = session.session_id;
    const started = await changeLifecycle(sid, { action: "start", rev: 1 });
    expect(started.lifecycle).toBe("active");
    const ended = await changeLifecycle(sid, { action: "end", rev: 2 });
    expect(ended).toMatchObject({ lifecycle: "ended", rev: 3 });
    expect(await getSession(sid)).toEqual(ended);
    const bus = await readBusAfter(sid, 0);
    expect(bus.map((e) => [e.type, e.ids])).toEqual([
      ["session.updated", { session_id: sid }],
      ["session.updated", { session_id: sid }],
    ]);
  });

  it("a retried action is a no-op without a new bus event", async () => {
    const { session } = await createSession(expert);
    await changeLifecycle(session.session_id, { action: "start", rev: 1 });
    const again = await changeLifecycle(session.session_id, { action: "start", rev: 1 });
    expect(again.rev).toBe(2);
    expect(await readBusAfter(session.session_id, 0)).toHaveLength(1);
  });

  it("illegal transition → invalid_transition, stored session unchanged", async () => {
    const { session } = await createSession(expert);
    expect(await codeOf(changeLifecycle(session.session_id, { action: "end", rev: 1 }))).toBe("invalid_transition");
    expect(await getSession(session.session_id)).toEqual(session);
  });

  it("stale rev → stale_revision", async () => {
    const { session } = await createSession(expert);
    await changeLifecycle(session.session_id, { action: "start", rev: 1 });
    expect(await codeOf(changeLifecycle(session.session_id, { action: "end", rev: 1 }))).toBe("stale_revision");
  });

  it("unknown session → not_found", async () => {
    expect(await codeOf(changeLifecycle("ses-nope", { action: "start", rev: 1 }))).toBe("not_found");
  });
});

describe("changeRecordState", () => {
  it("appends a segment and emits record_state.changed with the new segment_id", async () => {
    const { session } = await createSession(expert);
    const sid = session.session_id;
    const off = await changeRecordState(sid, { state: "off_record" });
    expect(off.record_state).toBe("off_record");
    expect(off.recording_segments).toHaveLength(2);
    const newSeg = off.recording_segments[1];
    expect(newSeg.segment_id).toMatch(/^seg-/);
    const bus = await readBusAfter(sid, 0);
    expect(bus.map((e) => [e.type, e.ids])).toEqual([["record_state.changed", { segment_id: newSeg.segment_id }]]);
  });

  it("same state is a no-op with no event", async () => {
    const { session } = await createSession(expert);
    const same = await changeRecordState(session.session_id, { state: "on_record" });
    expect(same).toEqual(session);
    expect(await readBusAfter(session.session_id, 0)).toEqual([]);
  });

  it("refused on ended sessions", async () => {
    const { session } = await createSession(expert);
    await changeLifecycle(session.session_id, { action: "abort", rev: 1 });
    expect(await codeOf(changeRecordState(session.session_id, { state: "off_record" }))).toBe("invalid_transition");
  });
});

describe("guards", () => {
  it("requireWritableSession: ok for created/active/ended, refuses aborted, off-record, off-record bodies", async () => {
    const { session } = await createSession(expert);
    const sid = session.session_id;
    await expect(requireWritableSession(sid)).resolves.toMatchObject({ session_id: sid });
    expect(await codeOf(requireWritableSession(sid, "off_record"))).toBe("off_record");
    await changeRecordState(sid, { state: "off_record" });
    expect(await codeOf(requireWritableSession(sid))).toBe("off_record");
    await changeRecordState(sid, { state: "on_record" });
    await changeLifecycle(sid, { action: "start", rev: 3 });
    await changeLifecycle(sid, { action: "end", rev: 4 });
    await expect(requireWritableSession(sid)).resolves.toMatchObject({ lifecycle: "ended" });

    const other = (await createSession(expert)).session;
    await changeLifecycle(other.session_id, { action: "abort", rev: 1 });
    expect(await codeOf(requireWritableSession(other.session_id))).toBe("invalid_transition");
    expect(await codeOf(requireWritableSession("ses-nope"))).toBe("not_found");
  });

  it("requireActiveSession: only active sessions pass", async () => {
    const { session } = await createSession(expert);
    expect(await codeOf(requireActiveSession(session.session_id))).toBe("invalid_transition");
    await changeLifecycle(session.session_id, { action: "start", rev: 1 });
    await expect(requireActiveSession(session.session_id)).resolves.toMatchObject({ lifecycle: "active" });
    expect(await codeOf(requireActiveSession("ses-nope"))).toBe("not_found");
  });

  it("withSessionLock serializes per session", async () => {
    const order: string[] = [];
    await Promise.all([
      withSessionLock("ses-a", async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push("first");
      }),
      withSessionLock("ses-a", async () => void order.push("second")),
    ]);
    expect(order).toEqual(["first", "second"]);
  });
});
