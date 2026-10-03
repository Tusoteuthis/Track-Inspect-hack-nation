"use client";

import { PlaceholderPage } from "@/components/shell/PlaceholderPage";
import { FIXTURE_IDS } from "@/lib/data/fixtureSource";

export default function ExpertPage() {
  return (
    <PlaceholderPage
      title="Expert session"
      sprint="Sprint 3"
      description="Session setup and the expert companion: active trace, latest indicated region, agent and recording status."
      queryKey={`session:${FIXTURE_IDS.expertSession}`}
      load={source => source.getSession(FIXTURE_IDS.expertSession)}
      summarize={s => `Session ${s.session_id} loaded (${s.lifecycle}).`}
    />
  );
}
