import { describe, expect, it, vi } from "vitest";
import { toSnapshot } from "./session";
import { deleteSessionConversations, deletionRefusal } from "./elevenlabs-deletion";
import { confirmedSession, fullSession } from "./test-driver";

const NOW = new Date("2026-10-04T06:00:00.000Z");
const ended = () => toSnapshot(fullSession("ses-20261004-140000-del1").state);

describe("deleteSessionConversations", () => {
  it("deletes exactly the conversation ids stored in this session and reports each", async () => {
    const snap = { ...ended(), conversation_ids: ["conv_a", "conv_b", "conv_c"], conversation_id: "conv_c" };
    const del = vi.fn(async (id: string) => {
      if (id === "conv_b") throw Object.assign(new Error("Not found"), { statusCode: 404 });
      if (id === "conv_c") throw Object.assign(new Error("Server error"), { statusCode: 500 });
      return {};
    });
    const report = await deleteSessionConversations(snap, del, NOW);
    expect(del.mock.calls.map(c => c[0])).toEqual(["conv_a", "conv_b", "conv_c"]);
    expect(report).toEqual({
      session_id: snap.session_id,
      at_utc: NOW.toISOString(),
      results: [
        { conversation_id: "conv_a", status: "deleted", detail: null },
        { conversation_id: "conv_b", status: "not_found", detail: "already deleted or never stored (404)" },
        { conversation_id: "conv_c", status: "failed", detail: "500: Server error" },
      ],
    });
  });

  it("never sends a malformed id", async () => {
    const del = vi.fn(async () => ({}));
    const report = await deleteSessionConversations({ ...ended(), conversation_ids: ["../agents", "conv_ok"], conversation_id: "conv_ok" }, del, NOW);
    expect(del).toHaveBeenCalledTimes(1);
    expect(report.results[0]).toMatchObject({ conversation_id: "../agents", status: "failed" });
  });

  it("refuses sessions that are still running, have no off-record segment or no conversation", async () => {
    const running = toSnapshot(fullSession("ses-20261004-140000-del2", { end: false }).state);
    expect(deletionRefusal(running)).toMatch(/still running/);
    const d = confirmedSession("ses-20261004-140000-del3");
    d.act({ type: "connected", conversation_id: "conv_x" });
    d.act({ type: "session_ended", cause: "stop" });
    expect(deletionRefusal(toSnapshot(d.state))).toMatch(/no off-record segment/);
    expect(deletionRefusal({ ...ended(), conversation_ids: [], conversation_id: null })).toMatch(/no ElevenLabs conversation/);
    expect(deletionRefusal(ended())).toBeNull();
    const del = vi.fn(async () => ({}));
    await expect(deleteSessionConversations(running, del, NOW)).rejects.toThrow(/still running/);
    expect(del).not.toHaveBeenCalled();
  });
});
