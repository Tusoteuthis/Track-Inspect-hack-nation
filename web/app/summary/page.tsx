"use client";

import { Suspense } from "react";
import { useScreenSource, useSessionParam } from "@/components/shell/useScreenSource";
import { SummaryScreen } from "@/components/summary/SummaryScreen";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";

function Summary() {
  const source = useScreenSource("summary");
  const sessionId = useSessionParam(source, FIXTURE_IDS.newcomerSession);
  return (
    <DataSourceProvider source={source}>
      <SummaryScreen sessionId={sessionId} />
    </DataSourceProvider>
  );
}

export default function SummaryPage() {
  return (
    <Suspense fallback={<p className="state-message">Loading the learning summary…</p>}>
      <Summary />
    </Suspense>
  );
}
