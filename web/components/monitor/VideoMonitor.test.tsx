// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openMonitorChannel, type MonitorLink, type MonitorMessage } from "@/lib/monitor/monitorChannel";
import type { CaseMedia, CaseSummary } from "@/lib/ui/contracts";
import { VideoMonitor } from "./VideoMonitor";

const MEDIA: CaseMedia = {
  kind: "video",
  url: "/v.mp4",
  poster_url: "/p.jpg",
  duration_ms: 20_000,
  width_px: 832,
  height_px: 464,
  chapters: [
    { chapter_id: "a", label: "Train approach", start_ms: 0, end_ms: 8_000 },
    { chapter_id: "b", label: "Signal trace", start_ms: 8_000, end_ms: 20_000 },
  ],
  holds: [
    { hold_id: "hold-1", at_ms: 5_000, frame_url: "/h1.jpg", frame_width_px: 832, frame_height_px: 464 },
    { hold_id: "hold-2", at_ms: 12_000, frame_url: "/h2.jpg", frame_width_px: 832, frame_height_px: 464 },
  ],
};
const CASE: CaseSummary & { media: CaseMedia } = {
  case_id: "case-video",
  title: "Wheel sensor pass",
  asset: { asset_id: "a", original_url: "/p.jpg", highlighted_url: null, frame_id: "f", width_px: 832, height_px: 464 },
  media: MEDIA,
  source: "fixture",
};

let currentTime = 0;
const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();
const links: MonitorLink[] = [];

beforeEach(() => {
  currentTime = 0;
  play.mockClear();
  pause.mockClear();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(pause);
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get: () => currentTime,
    set: (v: number) => {
      currentTime = v;
    },
  });
});
afterEach(() => {
  links.splice(0).forEach(l => l.close());
  vi.restoreAllMocks();
});

const press = (key: string) => fireEvent.keyDown(window, { key });
const monitor = () => screen.getByTestId("video-monitor");

describe("VideoMonitor", () => {
  it("starts paused at 0 with a start prompt, the fixture badge and no session", () => {
    render(<VideoMonitor caseSummary={CASE} onExit={() => {}} />);
    expect(monitor()).toHaveAttribute("data-status", "start");
    expect(screen.getByTestId("monitor-prompt")).toHaveTextContent("Press Space to start");
    expect(screen.getByText("FIXTURE DATA")).toBeInTheDocument();
    expect(screen.getByTestId("monitor-session")).toHaveTextContent("No session");
    expect(screen.getByTestId("monitor-time")).toHaveTextContent("0.0 s / 20.0 s");
    const video = document.querySelector("video")!;
    expect(video.muted).toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it("plays on Space and holds at the first hold with a neutral prompt", async () => {
    render(<VideoMonitor caseSummary={CASE} onExit={() => {}} />);
    press(" ");
    expect(play).toHaveBeenCalledTimes(1);
    expect(monitor()).toHaveAttribute("data-status", "playing");
    currentTime = 5.2;
    await waitFor(() => expect(monitor()).toHaveAttribute("data-status", "held"));
    expect(pause).toHaveBeenCalled();
    expect(currentTime).toBe(5);
    const prompt = screen.getByTestId("monitor-prompt");
    expect(prompt).toHaveTextContent("Hold 1 of 2");
    expect(prompt).toHaveTextContent("Point at what you see and explain it.");
  });

  it("goes back with PageUp, ends, and restarts with R", async () => {
    render(<VideoMonitor caseSummary={CASE} onExit={() => {}} />);
    press("PageDown");
    currentTime = 13;
    await waitFor(() => expect(screen.getByTestId("monitor-prompt")).toHaveTextContent("Hold 1 of 2"));
    press(" ");
    currentTime = 12.5;
    await waitFor(() => expect(screen.getByTestId("monitor-prompt")).toHaveTextContent("Hold 2 of 2"));
    press("PageUp");
    expect(screen.getByTestId("monitor-prompt")).toHaveTextContent("Hold 1 of 2");
    fireEvent(document.querySelector("video")!, new Event("ended"));
    expect(screen.getByTestId("monitor-prompt")).toHaveTextContent("End of recording");
    press("r");
    expect(screen.getByTestId("monitor-prompt")).toHaveTextContent("Press Space to start");
  });

  it("shows an error state when the video fails", () => {
    render(<VideoMonitor caseSummary={CASE} onExit={() => {}} />);
    fireEvent(document.querySelector("video")!, new Event("error"));
    expect(screen.getByRole("alert")).toHaveTextContent("The video for Wheel sensor pass could not be loaded");
  });

  it("exits on Escape", () => {
    const onExit = vi.fn();
    render(<VideoMonitor caseSummary={CASE} onExit={onExit} />);
    press("Escape");
    expect(onExit).toHaveBeenCalled();
  });

  it("mirrors the companion's session state and reports holds to it", async () => {
    const received: MonitorMessage[] = [];
    const companion = openMonitorChannel(m => received.push(m));
    links.push(companion);
    render(<VideoMonitor caseSummary={CASE} onExit={() => {}} />);
    await act(async () => {
      companion.post({ type: "session_state", recording: "off_record" });
      await new Promise(r => setTimeout(r, 30));
    });
    expect(screen.getByTestId("monitor-session")).toHaveTextContent("OFF RECORD");

    press(" ");
    currentTime = 5.5;
    await waitFor(() =>
      expect(received).toContainEqual(
        expect.objectContaining({ type: "monitor_state", status: "held", hold_id: "hold-1", hold_index: 1, hold_count: 2 })
      )
    );
  });
});
