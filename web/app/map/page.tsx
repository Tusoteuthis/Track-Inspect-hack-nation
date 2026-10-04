"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WorkMapScreen } from "@/components/workmap/WorkMapScreen";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";
import { mapHref } from "@/lib/workmap/deepLink";

// The address carries the selection (?entry=&rev=) so the demo can deep-link to an item.
function BoundWorkMap() {
  const params = useSearchParams();
  const router = useRouter();
  return (
    <WorkMapScreen
      sessionId={FIXTURE_IDS.expertSession}
      entryId={params.get("entry")}
      revisionId={params.get("rev")}
      onSelect={(entry, rev) => router.replace(mapHref(entry, rev), { scroll: false })}
    />
  );
}

export default function WorkMapPage() {
  return (
    <Suspense fallback={<p className="state-message">Loading…</p>}>
      <BoundWorkMap />
    </Suspense>
  );
}
