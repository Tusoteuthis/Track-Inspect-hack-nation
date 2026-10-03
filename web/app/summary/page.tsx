"use client";

import { PlaceholderPage } from "@/components/shell/PlaceholderPage";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";

export default function SummaryPage() {
  return (
    <PlaceholderPage
      title="Learning summary"
      sprint="Sprint 4"
      description="What the learner did independently, what needed help, and what to practise next."
      queryKey={`assessment:${FIXTURE_IDS.newcomerSession}`}
      load={source => source.getAssessment(FIXTURE_IDS.newcomerSession)}
      summarize={() => "Learning summary view loaded."}
    />
  );
}
