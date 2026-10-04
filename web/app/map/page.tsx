"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useScreenSource, useSessionParam } from "@/components/shell/useScreenSource";
import { WorkMapScreen } from "@/components/workmap/WorkMapScreen";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";
import { mapHref } from "@/lib/workmap/deepLink";

// The address carries the selection (?entry=&rev=) so the demo can deep-link to an item.
function BoundWorkMap() {
  const params = useSearchParams();
  const router = useRouter();
  const source = useScreenSource("map");
  const sessionId = useSessionParam(source, FIXTURE_IDS.expertSession);
  return (
    <DataSourceProvider source={source}>
      <WorkMapScreen
        sessionId={sessionId}
        entryId={params.get("entry")}
        revisionId={params.get("rev")}
        onSelect={(entry, rev) => {
          const href = mapHref(entry, rev);
          const session = params.get("session");
          router.replace(session ? `${href}&${new URLSearchParams({ session })}` : href, { scroll: false });
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
