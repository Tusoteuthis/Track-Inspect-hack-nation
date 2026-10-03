// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScreenSharePanel } from "@/components/practice/ScreenSharePanel";
import { initialCaptureState, type CaptureState } from "@/lib/practice/screenCapture";

const state = (over: Partial<CaptureState>): CaptureState => ({ ...initialCaptureState(true), ...over });

describe("ScreenSharePanel", () => {
  it.each([
    ["idle", /screen not shared/i, "Share screen"],
    ["requesting", /waiting for you to choose/i, "Share screen"],
    ["active", /sharing your screen/i, "Stop sharing"],
    ["denied", /not allowed/i, "Share screen"],
    ["stopped", /sharing stopped/i, "Share screen"],
    ["unsupported", /cannot share/i, "Share screen"],
  ] as const)("%s shows its state with text and the right control", (status, text, button) => {
    render(<ScreenSharePanel state={state({ status })} onStart={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByTestId("screen-status")).toHaveTextContent(text);
    expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  });

  it("while active, reports whether a still image has been received", () => {
    const { rerender } = render(<ScreenSharePanel state={state({ status: "active" })} onStart={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByText(/no still image received yet/i)).toBeInTheDocument();
    rerender(
      <ScreenSharePanel
        state={state({ status: "active", last_frame_at_utc: "2026-10-04T10:00:00Z", frames_sent: 1 })}
        onStart={vi.fn()}
        onStop={vi.fn()}
      />
    );
    expect(screen.getByText(/last still image received at/i)).toBeInTheDocument();
  });

  it("start is unavailable while unsupported or requesting", () => {
    render(<ScreenSharePanel state={state({ status: "unsupported" })} onStart={vi.fn()} onStop={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Share screen" })).toBeDisabled();
  });
});
