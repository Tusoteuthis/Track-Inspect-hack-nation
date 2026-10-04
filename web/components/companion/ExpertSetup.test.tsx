// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { acknowledged, failed } from "@/lib/data/source";
import { createStubSource } from "@/lib/data/stubSource";
import type { CaseSummary, SessionView } from "@/lib/ui/contracts";
import { ConnectionPanel } from "./ConnectionPanel";
import { ExpertSetup } from "./ExpertSetup";

const CASE: CaseSummary = {
  case_id: "case-1",
  title: "Trace A",
  asset: { asset_id: "a", original_url: "/a.svg", highlighted_url: null, frame_id: "f", width_px: 1600, height_px: 900 },
  source: "fixture",
};
const ACTIVE: SessionView = {
  session_id: "s",
  role: "expert",
  lifecycle: "active",
  recording_state: "on_record",
  connection: { capture: "unknown", agent: "unknown", backend: "unknown" },
  case_id: "case-1",
  knowledge_revision_id: null,
  rev: 1,
  source: "fixture",
};

function Harness({ onStarted }: { onStarted: (s: SessionView) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <ExpertSetup agent="disconnected" selectedId={selected} onSelect={setSelected} onStarted={s => onStarted(s)} />;
}

async function setup() {
  const stub = createStubSource({ cases: [CASE] });
  const onStarted = vi.fn();
  render(
    <DataSourceProvider source={stub.source}>
      <Harness onStarted={onStarted} />
    </DataSourceProvider>
  );
  await screen.findByRole("radio", { name: "Trace A" });
  return { stub, onStarted, user: userEvent.setup() };
}

describe("ExpertSetup", () => {
  it("shows unknown status as Unknown and a fixture backend as fixture data, never Connected", async () => {
    await setup();
    expect(screen.getByTestId("connection-Capture device")).toHaveTextContent("Unknown");
    expect(screen.getByTestId("connection-Voice apprentice")).toHaveTextContent("Apprentice not connected");
    expect(screen.getByTestId("connection-Backend")).toHaveTextContent("No backend: fixture data");
    expect(screen.queryByText(/^Connected$/)).toBeNull();
  });

  it("preselects the case and links to its full-bleed display without showing ids", async () => {
    await setup();
    expect(screen.getByRole("radio", { name: "Trace A" })).toBeChecked();
    expect(screen.getByRole("link", { name: /Open trace display/ })).toHaveAttribute("href", "/expert/display?case=case-1");
    expect(document.body).not.toHaveTextContent("case-1");
  });

  it("start is pending until acknowledged", async () => {
    const { stub, onStarted, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Start session" }));
    expect(screen.getByRole("button", { name: /Starting… waiting for confirmation/ })).toBeDisabled();
    expect(onStarted).not.toHaveBeenCalled();
    await act(async () => stub.requests[0].result.resolve(acknowledged(ACTIVE)));
    expect(onStarted).toHaveBeenCalledWith(ACTIVE);
  });

  it("a failed start is shown and the setup stays", async () => {
    const { stub, onStarted, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Start session" }));
    await act(async () => stub.requests[0].result.resolve(failed("Unknown case.")));
    expect(await screen.findByRole("alert")).toHaveTextContent("The session did not start: Unknown case.");
    expect(onStarted).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Start session" })).toBeEnabled();
  });
});

describe("ConnectionPanel", () => {
  it("states a real connected backend only when reported", () => {
    render(<ConnectionPanel capture="connected" agent="listening" backend="reconnecting" />);
    expect(screen.getByTestId("connection-Capture device")).toHaveTextContent("Connected");
    expect(screen.getByTestId("connection-Voice apprentice")).toHaveTextContent("Apprentice is listening");
    expect(screen.getByTestId("connection-Backend")).toHaveTextContent("Reconnecting…");
  });
});
