// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MonitorStateMessage } from "@/lib/monitor/monitorChannel";
import type { CaseMedia } from "@/lib/ui/contracts";
import { MonitorStrip } from "./MonitorStrip";

const MEDIA: CaseMedia = {
  kind: "video",
  url: "/v.mp4",
  poster_url: "/p.jpg",
  duration_ms: 22_773,
  width_px: 832,
  height_px: 464,
  chapters: [{ chapter_id: "trace", label: "Signal trace", start_ms: 0, end_ms: 22_773 }],
  holds: [
    { hold_id: "hold-1", at_ms: 10_600, frame_url: "/h1.jpg", frame_width_px: 832, frame_height_px: 464 },
    { hold_id: "hold-2", at_ms: 12_400, frame_url: "/h2.jpg", frame_width_px: 832, frame_height_px: 464 },
  ],
};
const state = (over: Partial<MonitorStateMessage> = {}): MonitorStateMessage => ({
  type: "monitor_state",
  case_id: "case-video",
  status: "playing",
  media_time_ms: 3_000,
  duration_ms: 22_773,
  hold_id: null,
  hold_index: null,
  hold_count: 2,
  auto_holds: true,
  ...over,
});
const strip = (monitor: MonitorStateMessage | null, showOpenLink?: boolean) =>
  render(
    <MonitorStrip caseId="case-video" media={MEDIA} monitor={monitor} openHref="/expert/display?case=case-video" showOpenLink={showOpenLink} />
  );

describe("MonitorStrip", () => {
  it("offers to open the monitor when none is linked", () => {
    strip(null);
    expect(screen.getByTestId("monitor-strip")).toHaveAttribute("data-monitor", "none");
    expect(screen.getByText("Monitor not open")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open trace display/ })).toHaveAttribute(
      "href",
      "/expert/display?case=case-video"
    );
  });

  it("can leave the open link to the surrounding setup", () => {
    strip(null, false);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("mirrors playback with the media time", () => {
    strip(state());
    expect(screen.getByRole("status")).toHaveTextContent("Monitor · Playing");
    expect(screen.getByText(/3\.0 s \/ 22\.8 s/)).toBeInTheDocument();
    expect(screen.getByTestId("monitor-timeline")).toBeInTheDocument();
  });

  it("shows a hold neutrally, without naming what is on screen", () => {
    strip(state({ status: "held", hold_id: "hold-2", hold_index: 2, media_time_ms: 12_400 }));
    expect(screen.getByRole("status")).toHaveTextContent("Hold 2 of 2 · frame held for pointing");
    expect(screen.getByTestId("monitor-strip")).toHaveAttribute("data-monitor", "held");
  });

  it("warns when the monitor shows a different case, and reports video errors", () => {
    const { unmount } = strip(state({ case_id: "other" }));
    expect(screen.getByRole("alert")).toHaveTextContent("different case");
    unmount();
    strip(state({ status: "error" }));
    expect(screen.getByRole("status")).toHaveTextContent("Video error on the monitor");
  });
});
