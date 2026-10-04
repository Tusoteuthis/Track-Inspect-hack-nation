"use client";

import { Suspense } from "react";
import { ReviewScreen } from "@/components/review/ReviewScreen";
import { useFixtureOverrides, useScreenSource, useSessionParam } from "@/components/shell/useScreenSource";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";

function Review() {
  const source = useFixtureOverrides(useScreenSource("review"));
  const sessionId = useSessionParam(source, FIXTURE_IDS.expertSession);
  return (
    <DataSourceProvider source={source}>
      {sessionId ? (
        <ReviewScreen sessionId={sessionId} />
      ) : (
        <section>
          <h1>Review</h1>
          <p className="state-message">No expert session selected. Open the review from an ended expert session.</p>
        </section>
      )}
    </DataSourceProvider>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<p className="state-message">Loading…</p>}>
      <Review />
    </Suspense>
  );
}
