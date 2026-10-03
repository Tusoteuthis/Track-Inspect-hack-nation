"use client";

import { PlaceholderPage } from "@/components/shell/PlaceholderPage";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";

export default function PracticePage() {
  return (
    <PlaceholderPage
      title="Newcomer practice"
      sprint="Sprint 2"
      description="Draft a decision on an unseen trace, get reviewed by the tutor before saving, then save."
      queryKey={`case:${FIXTURE_IDS.practiceCase}`}
      load={source => source.getPracticeCase(FIXTURE_IDS.practiceCase)}
      summarize={c => `Practice case ${c.case_id} loaded.`}
    />
  );
}
