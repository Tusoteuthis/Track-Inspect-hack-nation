// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MonitorStateMessage } from "@/lib/monitor/monitorChannel";
import type { CaseMedia } from "@/lib/ui/contracts";
import { InlineVideoPlayer } from "./InlineVideoPlayer";

const MEDIA: CaseMedia = {
  kind: "video",
  url: "/v.mp4",
  poster_url: "/p.jpg",
  duration_ms: 20_000,
  width_px: 832,
  height_px: 464,
  chapters: [{ chapter_id: "a", label: "Signal trace", start_ms: 0, end_ms: 20_000 }],
  holds: [
    { hold_id: "hold-1", at_ms: 5_000, frame_url: "/h1.jpg", frame_width_px: 832, frame_height_px: 464 },
    { hold_id: "hold-2", at_ms: 12_000, frame_url: "/h2.jpg", frame_width_px: 832, frame_height_px: 464 },
  ],
};

let currentTime = 0;
const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

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
afterEach(() => vi.restoreAllMocks());

const player = () => screen.getByTestId("inline-video");

describe("InlineVideoPlayer", () => {
  it("starts playing on mount when autoStart is set", () => {
    render(<InlineVideoPlayer caseId="c" title="Wheel sensor pass" media={MEDIA} autoStart />);
    expect(play).toHaveBeenCalledTimes(1);
    expect(player()).toHaveAttribute("data-status", "playing");
    expect(document.querySelector("video")!.muted).toBe(true);
  });

  it("waits for the Play button without autoStart", () => {
    render(<InlineVideoPlayer caseId="c" title="Wheel sensor pass" media={MEDIA} />);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("holds at the first hold, reports it, and resumes from the button", async () => {
    const states: MonitorStateMessage[] = [];
    render(<InlineVideoPlayer caseId="c" title="Wheel sensor pass" media={MEDIA} autoStart onState={s => states.push(s)} />);
    currentTime = 5.2;
    await waitFor(() => expect(player()).toHaveAttribute("data-status", "held"));
    expect(pause).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Hold 1 of 2");
    expect(states.at(-1)).toMatchObject({ case_id: "c", status: "held", hold_id: "hold-1", hold_index: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(player()).toHaveAttribute("data-status", "playing");
  });

  it("shows an error when the video fails", () => {
    render(<InlineVideoPlayer caseId="c" title="Wheel sensor pass" media={MEDIA} autoStart />);
    fireEvent(document.querySelector("video")!, new Event("error"));
    expect(screen.getByRole("alert")).toHaveTextContent("The video could not be loaded");
  });
});
