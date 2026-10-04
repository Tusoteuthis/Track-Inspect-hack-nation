// @vitest-environment jsdom
// Every data route renders a visible error state (role=alert) when its source rejects.
import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";
import ExpertDisplayPage from "@/app/expert/display/page";
import ExpertPage from "@/app/expert/page";
import MapPage from "@/app/map/page";
import PracticePage from "@/app/practice/page";
import ReviewPage from "@/app/review/page";
import SummaryPage from "@/app/summary/page";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { createStubSource } from "@/lib/data/stubSource";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("session=s-1&case=c-1"),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

// The WS3 voice hooks need a browser audio stack; the expert setup never reaches them on error.
vi.mock("@/components/voice/VoiceSession", () => ({ VoiceSession: () => null }));

const ROUTES: [string, ComponentType, RegExp][] = [
  ["/expert", ExpertPage, /case list could not be loaded: backend down/],
  ["/expert/display", ExpertDisplayPage, /trace could not be loaded: backend down/],
  ["/review", ReviewPage, /Could not load the review: backend down/],
  ["/map", MapPage, /Could not load the Work Map: backend down/],
  ["/practice", PracticePage, /practice case could not be loaded: backend down/],
  ["/summary", SummaryPage, /Could not load the learning summary: backend down/],
];

describe("route error states", () => {
  for (const [route, Page, message] of ROUTES) {
    it(`${route} shows its error state when the source rejects`, async () => {
      const stub = createStubSource({ rejectAll: "backend down", kind: "api" });
      render(
        <DataSourceProvider source={stub.source}>
          <Page />
        </DataSourceProvider>
      );
      const alerts = await screen.findAllByRole("alert");
      expect(alerts.map(a => a.textContent).join(" ")).toMatch(message);
    });
  }
});
