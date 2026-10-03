"use client";

import { PlaceholderPage } from "@/components/shell/PlaceholderPage";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";

export default function WorkMapPage() {
  return (
    <PlaceholderPage
      title="Work Map"
      sprint="Sprint 1"
      description="The clickable interpretation workflow: every step and guardrail opens its trace region and the expert's own words."
      queryKey={`workmap:${FIXTURE_IDS.expertSession}`}
      load={source => source.getWorkMap(FIXTURE_IDS.expertSession)}
      summarize={m => `${m.steps.length} Work Map items loaded.`}
    />
  );
}
