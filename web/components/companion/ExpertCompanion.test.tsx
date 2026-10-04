// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import evt001 from "@/fixtures/pointing-events/evt-001-resolved.json";
import evt003 from "@/fixtures/pointing-events/evt-003-repeat-of-001.json";
import evt004 from "@/fixtures/pointing-events/evt-004-ambiguous.json";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";
import { eventToEvidence } from "@/lib/companion/eventToEvidence";
import { acknowledged, failed } from "@/lib/data/source";
import { createStubSource } from "@/lib/data/stubSource";
import type { PointingEvent } from "@/lib/expert/contracts";
import type { SessionView } from "@/lib/ui/contracts";
import { ExpertCompanion } from "./ExpertCompanion";

const E1 = evt001 as PointingEvent;
const E3 = evt003 as PointingEvent;
const E4 = evt004 as PointingEvent;
const UNRESOLVED: PointingEvent = { ...E1, event_id: "evt-x", frame_id: "frame-x", mapping_status: "unresolved" };

const SID = E1.session_id;
const session = (patch: Partial<SessionView> = {}): SessionView => ({
  session_id: SID,
  role: "expert",
  lifecycle: "active",
  recording_state: "on_record",
  connection: { capture: "unknown", agent: "unknown", backend: "unknown" },
  case_id: "c",
  knowledge_revision_id: null,
  rev: 1,
  source: "fixture",
  ...patch,
});

async function setup(init: { session?: SessionView; events?: PointingEvent[] } = {}) {
  const stub = createStubSource({ session: init.session ?? session(), events: init.events ?? [] });
  render(<ExpertCompanion source={stub.source} sessionId={SID} caseAsset={null} agent="disconnected" />);
  await screen.findByTestId("control-rail");
  return { stub, user: userEvent.setup() };
}

const recording = () => screen.getByTestId("recording-status");

describe("ExpertCompanion: off-record is shown only after acknowledgement", () => {
  it("pending until acked; the indicator appears only after the ack", async () => {
    const { stub, user } = await setup();
    await user.click(screen.getByRole("button", { name: /Go off record/ }));

    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]).toMatchObject({ kind: "off_record", value: true });
    expect(recording()).toHaveAttribute("data-recording", "off_record_pending");
    expect(recording()).toHaveTextContent("Going off record… waiting for confirmation");
    expect(screen.queryByTestId("off-record-indicator")).toBeNull();

    await act(async () => stub.requests[0].result.resolve(acknowledged(session({ rev: 2, recording_state: "off_record" }))));
    expect(await screen.findByTestId("off-record-indicator")).toHaveTextContent("OFF RECORD");
    expect(screen.getByRole("button", { name: /Back on record/ })).toBeEnabled();
  });

  it("the acknowledgement may arrive through subscribe", async () => {
    const { stub, user } = await setup();
    await user.click(screen.getByRole("button", { name: /Go off record/ }));
    act(() => stub.push({ type: "session", session: session({ rev: 2, recording_state: "off_record" }) }));
    expect(await screen.findByTestId("off-record-indicator")).toBeInTheDocument();
  });

  it("a failed ack shows an error and keeps the previous state", async () => {
    const { stub, user } = await setup();
    await user.click(screen.getByRole("button", { name: /Go off record/ }));
    await act(async () => stub.requests[0].result.resolve(failed("Service unavailable.")));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed: Service unavailable\. You are still on record/);
    expect(recording()).toHaveAttribute("data-recording", "on_record");
    expect(screen.queryByTestId("off-record-indicator")).toBeNull();
  });

  it("a second press while pending sends nothing", async () => {
    const { stub, user } = await setup();
    await user.click(screen.getByRole("button", { name: /Go off record/ }));
    await user.keyboard("o");
    expect(stub.requests).toHaveLength(1);
  });
});

describe("ExpertCompanion: pause and stop", () => {
  it("pause is pending until acknowledged", async () => {
    const { stub, user } = await setup();
    await user.keyboard("p");
    expect(stub.requests[0]).toMatchObject({ kind: "pause", value: true });
    expect(screen.getByRole("button", { name: /Pausing… waiting for confirmation/ })).toBeDisabled();
    expect(screen.queryByTestId("paused-status")).toBeNull();
    await act(async () => stub.requests[0].result.resolve(acknowledged(session({ rev: 2, lifecycle: "paused" }))));
    expect(await screen.findByTestId("paused-status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resume session/ })).toBeEnabled();
  });

  it("stop needs a second press, is pending until acked, then links to the review", async () => {
    const { stub, user } = await setup();
    await user.click(screen.getByRole("button", { name: /Stop session/ }));
    expect(stub.requests).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Press again to stop/ })).toBeInTheDocument();
    await user.keyboard("s");
    expect(stub.requests[0]).toMatchObject({ kind: "stop" });
    expect(screen.getByRole("button", { name: /Stopping… waiting for confirmation/ })).toBeDisabled();
    expect(screen.queryByTestId("session-ended")).toBeNull();

    await act(async () => stub.requests[0].result.resolve(acknowledged(session({ rev: 2, lifecycle: "ended" }))));
    expect(await screen.findByTestId("session-ended")).toHaveTextContent("Session ended");
    expect(screen.getByRole("link", { name: "Open debrief review" })).toHaveAttribute("href", `/review?session=${SID}`);
  });

  it("Escape cancels an armed stop", async () => {
    const { stub, user } = await setup();
    await user.click(screen.getByRole("button", { name: /Stop session/ }));
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: /Stop session/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Stop session/ }));
    expect(stub.requests).toHaveLength(0);
  });

  it("a failed stop keeps the session running and says so", async () => {
    const { stub, user } = await setup();
    await user.keyboard("ss");
    await act(async () => stub.requests[0].result.resolve(failed("Timeout.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stop not confirmed: Timeout. The session is still running.");
    expect(screen.queryByTestId("session-ended")).toBeNull();
  });

  it("shows visible shortcut hints on every control", async () => {
    await setup();
    for (const [name, key] of [
      [/Pause session/, "P"],
      [/Go off record/, "O"],
      [/Stop session/, "S"],
      [/Hide controls/, "["],
    ] as const) {
      expect(within(screen.getByRole("button", { name })).getByText(key)).toBeVisible();
    }
  });
});

describe("ExpertCompanion: indicated regions", () => {
  it("draws the latest resolved region solid on its own frame and lists recent pointing", async () => {
    const { stub } = await setup();
    act(() => stub.push({ type: "pointing_event", event: E1 }));
    act(() => stub.push({ type: "pointing_event", event: E3 }));
    const outline = await screen.findByTestId("region-outline");
    expect(outline).toHaveAttribute("data-style", "solid");
    expect(screen.getAllByTestId("recent-event")).toHaveLength(2);
    expect(screen.getAllByTestId("recent-event")[0]).toHaveTextContent("Latest: Region identified");
  });

  it("an ambiguous event renders a dashed outline and the clarify note", async () => {
    const { stub } = await setup();
    act(() => stub.push({ type: "pointing_event", event: E4 }));
    expect(await screen.findByTestId("region-outline")).toHaveAttribute("data-style", "dashed");
    expect(screen.getByText("Ambiguous: the apprentice will ask you to clarify")).toBeVisible();
    expect(screen.getAllByTestId("recent-event")[0]).toHaveTextContent("Channel unknown");
  });

  it("an unresolved event renders no highlight", async () => {
    const { stub } = await setup();
    act(() => stub.push({ type: "pointing_event", event: UNRESOLVED }));
    await screen.findByText("Region not identified: no highlight");
    expect(screen.queryByTestId("region-outline")).toBeNull();
  });

  it("the same event delivered twice appears once", async () => {
    const { stub } = await setup();
    act(() => stub.push({ type: "pointing_event", event: E1 }));
    act(() => stub.push({ type: "pointing_event", event: E1 }));
    await screen.findByTestId("region-outline");
    expect(screen.getAllByTestId("recent-event")).toHaveLength(1);
  });

  it("an event's region on a different frame is refused", () => {
    const a = eventToEvidence(E1);
    const b = eventToEvidence(E4);
    render(<EvidenceViewer asset={b.asset} region={a.region} />);
    expect(screen.queryByTestId("region-outline")).toBeNull();
    expect(screen.getByText("Region belongs to a different frame")).toBeVisible();
  });
});

describe("ExpertCompanion: reconnect", () => {
  it("shows Reconnecting… on a drop and resyncs the latest state on reconnect", async () => {
    const { stub } = await setup();
    act(() => stub.push({ type: "pointing_event", event: E1 }));
    act(() => stub.push({ type: "connection", state: "reconnecting" }));
    expect(await screen.findByTestId("reconnecting")).toHaveTextContent("Reconnecting…");

    // While disconnected, the service moved on: off record acknowledged and two more events.
    stub.state.session = session({ rev: 5, recording_state: "off_record" });
    stub.state.events = [E1, E3, E4];
    act(() => stub.push({ type: "connection", state: "connected" }));

    expect(await screen.findByTestId("off-record-indicator")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("recent-event")).toHaveLength(3));
    expect(screen.queryByTestId("reconnecting")).toBeNull();
    expect(screen.getByTestId("region-outline")).toHaveAttribute("data-style", "dashed");
  });
});
