"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useFixtureOverrides, useScreenSource, useSessionParam } from "@/components/shell/useScreenSource";
import { WorkMapScreen } from "@/components/workmap/WorkMapScreen";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";
import { mapHref } from "@/lib/workmap/deepLink";

// The address carries the selection (?entry=&rev=) so the demo can deep-link to an item.
function BoundWorkMap() {
  const params = useSearchParams();
  const router = useRouter();
  const source = useFixtureOverrides(useScreenSource("map"));
  const sessionId = useSessionParam(source, FIXTURE_IDS.expertSession);
  return (
    <DataSourceProvider source={source}>
      <WorkMapScreen
        sessionId={sessionId}
        entryId={params.get("entry")}
        revisionId={params.get("rev")}
        onSelect={(entry, rev) => {
          // Keep ?session= and fixture settings; only the selection changes.
          const rest = new URLSearchParams(params.toString());
          rest.delete("entry");
          rest.delete("rev");
          const extra = rest.toString();
          router.replace(extra ? `${mapHref(entry, rev)}&${extra}` : mapHref(entry, rev), { scroll: false });
        }}
      />
    </DataSourceProvider>
  );
}

export default function WorkMapPage() {
  return (
    <Suspense fallback={<p className="state-message">Loading…</p>}>
      <BoundWorkMap />
    </Suspense>
  );
}
