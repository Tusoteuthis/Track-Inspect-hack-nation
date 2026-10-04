import { afterEach, describe, expect, it } from "vitest";
import { openMonitorChannel, parseMonitorMessage, type MonitorLink, type MonitorMessage } from "./monitorChannel";

const STATE = {
  type: "monitor_state",
  case_id: "case-1",
  status: "held",
  media_time_ms: 12_400,
  duration_ms: 22_773,
  hold_id: "hold-2",
  hold_index: 2,
  hold_count: 4,
  auto_holds: true,
} as const;

describe("parseMonitorMessage", () => {
  it("accepts every valid message type", () => {
    expect(parseMonitorMessage(STATE)).toEqual(STATE);
    expect(parseMonitorMessage({ type: "session_state", recording: "off_record" })).not.toBeNull();
    expect(parseMonitorMessage({ type: "hello", from: "companion" })).not.toBeNull();
    expect(parseMonitorMessage({ type: "bye", from: "monitor" })).not.toBeNull();
  });

  it("rejects malformed or unknown messages", () => {
    expect(parseMonitorMessage(null)).toBeNull();
    expect(parseMonitorMessage("hello")).toBeNull();
    expect(parseMonitorMessage({ type: "play" })).toBeNull();
    expect(parseMonitorMessage({ ...STATE, status: "rewinding" })).toBeNull();
    expect(parseMonitorMessage({ ...STATE, media_time_ms: -1 })).toBeNull();
    expect(parseMonitorMessage({ ...STATE, hold_index: 0 })).toBeNull();
    expect(parseMonitorMessage({ ...STATE, case_id: "" })).toBeNull();
    expect(parseMonitorMessage({ type: "session_state", recording: "maybe" })).toBeNull();
    expect(parseMonitorMessage({ type: "bye", from: "companion" })).toBeNull();
  });
});

describe("openMonitorChannel", () => {
  const links: MonitorLink[] = [];
  afterEach(() => links.splice(0).forEach(l => l.close()));

  it("delivers valid messages between two windows and drops invalid ones", async () => {
    const received: MonitorMessage[] = [];
    links.push(openMonitorChannel(m => received.push(m)));
    const sender = openMonitorChannel(() => {});
    links.push(sender);
    sender.post(STATE);
    sender.post({ type: "nonsense" } as unknown as MonitorMessage);
    sender.post({ type: "session_state", recording: "recording" });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(received).toEqual([STATE, { type: "session_state", recording: "recording" }]);
  });

  it("stops posting after close", async () => {
    const received: MonitorMessage[] = [];
    links.push(openMonitorChannel(m => received.push(m)));
    const sender = openMonitorChannel(() => {});
    sender.close();
    sender.post(STATE);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(received).toEqual([]);
  });
});
