// End-to-end trust check: a full fixture session with an off-record stretch and a strike is saved
// through the real file store, and EVERY file written for the session is scanned.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURE_EVENTS } from "./fixtures";
import { toSnapshot } from "./session";
import { END_FILES, createFileStore } from "./store";
import { SENTINEL, STRUCK_WORD, confirmedSession, fullSession } from "./test-driver";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ws3-trust-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function allFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? allFiles(path) : [path];
  });
}

describe("off-record and struck content never reach disk", () => {
  it("the sentinel phrase, the struck words and the off-record event are in no file the store writes", async () => {
    const d = fullSession("ses-20261004-130000-trst", { strike: true });
    const store = createFileStore(join(root, "knowledge"), { publicDir: join(root, "web", "public") });
    const { dir, files } = await store.saveSnapshot(toSnapshot(d.state));
    await store.exportDemoEvidence(d.state.session_id);
    await store.saveDeletionReport({ session_id: d.state.session_id, at_utc: "2026-10-04T05:10:00.000Z", results: [{ conversation_id: "conv_test_0001", status: "deleted", detail: null }] });

    const written = allFiles(dir);
    expect(written.length).toBeGreaterThanOrEqual(files.length + 1);
    for (const name of [...END_FILES, "knowledge-draft.md", "transcript.md", "revisions/rev-1.json", "elevenlabs-deletion.json"]) {
      expect(written).toContain(join(dir, name));
    }
    const offEvent = FIXTURE_EVENTS.find(e => e.record_state === "off_record")!;
    const imageName = offEvent.highlighted_image_ref.split("/").at(-1)!;
    for (const path of written) {
      const text = readFileSync(path, "utf8").toLowerCase();
      expect({ path, sentinel: text.includes(SENTINEL) }).toEqual({ path, sentinel: false });
      expect({ path, struck: text.includes(STRUCK_WORD) }).toEqual({ path, struck: false });
      expect({ path, event: text.includes(offEvent.event_id) || text.includes(imageName.toLowerCase()) }).toEqual({ path, event: false });
    }
    // the neutral marker is there instead
    expect(readFileSync(join(dir, "transcript.md"), "utf8")).toMatch(/off-record segment from .* \(content excluded/);
    expect(readFileSync(join(dir, "completion.md"), "utf8")).toMatch(/off-record segment from/);
  });

  it("round-trips through the files: loadSnapshot gives back the saved snapshot", async () => {
    const snap = toSnapshot(fullSession("ses-20261004-130000-load").state);
    const store = createFileStore(root);
    await store.saveSnapshot(snap);
    expect(await store.loadSnapshot(snap.session_id)).toEqual(snap);
    expect(await store.loadSnapshot("ses-20261004-130000-none")).toBeNull();
  });

  it("completion and demo evidence exist only for an ended session; a resume removes them", async () => {
    const d = fullSession("ses-20261004-130000-res1", { end: false });
    const store = createFileStore(root);
    const dir = join(root, "sessions", d.state.session_id);
    await store.saveSnapshot(toSnapshot(d.state));
    expect(existsSync(join(dir, "completion.json"))).toBe(false);
    d.act({ type: "session_ended", cause: "stop" });
    await store.saveSnapshot(toSnapshot(d.state));
    expect(JSON.parse(readFileSync(join(dir, "completion.json"), "utf8"))).toMatchObject({ end_reason: "completed", confirmed_revision_id: "rev-1" });
    expect(readFileSync(join(dir, "demo-evidence.md"), "utf8")).toMatch(/\| ✓ \| Off-record handling/);
  });

  it("an incomplete session's completion.md says incomplete", async () => {
    const d = confirmedSession("ses-20261004-130000-inc1");
    d.act({ type: "strike_requested", trigger: "console" });
    d.act({ type: "session_ended", cause: "disconnect" });
    const store = createFileStore(root);
    await store.saveSnapshot(toSnapshot(d.state));
    const md = readFileSync(join(root, "sessions", d.state.session_id, "completion.md"), "utf8");
    expect(md).toMatch(/INCOMPLETE/);
    expect(md).toMatch(/teach-back not confirmed/);
  });

  it("a strike may rewrite (redact) exactly the revisions it superseded", async () => {
    const d = confirmedSession("ses-20261004-130000-red1");
    const store = createFileStore(root);
    await store.saveSnapshot(toSnapshot(d.state));
    d.act({ type: "strike_requested", trigger: "console" }); // confirmation answer
    d.act({ type: "strike_requested", trigger: "console" }); // ex-002, cited by rev-1
    await store.saveSnapshot(toSnapshot(d.state));
    const rev = readFileSync(join(root, "sessions", d.state.session_id, "revisions", "rev-1.json"), "utf8");
    expect(rev).not.toMatch(/mango/);
    expect(rev).toMatch(/step removed/);
  });
});
