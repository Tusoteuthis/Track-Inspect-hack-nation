import { describe, expect, it } from "vitest";
import { initialCaptureState, screenCapture, type CaptureEvent } from "@/lib/practice/screenCapture";

describe("screenCapture", () => {
  it("starts idle when supported and unsupported otherwise", () => {
    expect(initialCaptureState(true).status).toBe("idle");
    expect(initialCaptureState(false).status).toBe("unsupported");
  });

  it("idle → requesting → active → stopped", () => {
    let s = initialCaptureState(true);
    s = screenCapture(s, { type: "START" });
    expect(s.status).toBe("requesting");
    s = screenCapture(s, { type: "GRANTED" });
    expect(s.status).toBe("active");
    s = screenCapture(s, { type: "ENDED" });
    expect(s.status).toBe("stopped");
  });

  it("denied and error can be retried", () => {
    for (const ev of [{ type: "DENIED" }, { type: "FAILED", error: "x" }] as CaptureEvent[]) {
      let s = screenCapture(initialCaptureState(true), { type: "START" });
      s = screenCapture(s, ev);
      expect(["denied", "error"]).toContain(s.status);
      expect(screenCapture(s, { type: "START" }).status).toBe("requesting");
    }
  });

  it("support detected after mount moves idle to unsupported", () => {
    expect(screenCapture(initialCaptureState(true), { type: "MARK_UNSUPPORTED" }).status).toBe("unsupported");
  });

  it("unsupported ignores everything", () => {
    const s = initialCaptureState(false);
    expect(screenCapture(s, { type: "START" })).toBe(s);
  });

  it("START while active or requesting is a no-op", () => {
    const req = screenCapture(initialCaptureState(true), { type: "START" });
    expect(screenCapture(req, { type: "START" })).toBe(req);
    const active = screenCapture(req, { type: "GRANTED" });
    expect(screenCapture(active, { type: "START" })).toBe(active);
  });

  it("records only acknowledged frames, and frame errors without leaving active", () => {
    let s = screenCapture(screenCapture(initialCaptureState(true), { type: "START" }), { type: "GRANTED" });
    s = screenCapture(s, { type: "FRAME_SENT", at_utc: "t1" });
    expect(s.last_frame_at_utc).toBe("t1");
    expect(s.frames_sent).toBe(1);
    s = screenCapture(s, { type: "FRAME_FAILED", error: "upload" });
    expect(s.status).toBe("active");
    expect(s.frame_error).toBe("upload");
    s = screenCapture(s, { type: "FRAME_SENT", at_utc: "t2" });
    expect(s.frame_error).toBeNull();
  });

  it("frame events outside active are ignored (late uploads after stop)", () => {
    const stopped = { ...initialCaptureState(true), status: "stopped" as const };
    expect(screenCapture(stopped, { type: "FRAME_SENT", at_utc: "t" })).toBe(stopped);
  });
});
