"use client";

import { PlaceholderPage } from "@/components/shell/PlaceholderPage";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";

export default function ReviewPage() {
  return (
    <PlaceholderPage
      title="Review"
      sprint="Sprint 1"
      description="Debrief support: the revision under review, open questions and corrections from the spoken conversation."
      queryKey={`workmap:${FIXTURE_IDS.expertSession}`}
      load={source => source.getWorkMap(FIXTURE_IDS.expertSession)}
      summarize={m => `Revision ${m.revision_id} loaded with ${m.steps.length} items.`}
    />
  );
}
