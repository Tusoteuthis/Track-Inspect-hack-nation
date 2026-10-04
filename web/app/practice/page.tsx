"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { FixtureControls } from "@/components/practice/FixtureControls";
import { PracticeScreen } from "@/components/practice/PracticeScreen";
import { TutorPanel } from "@/components/practice/TutorPanel";
import { useScreenSource } from "@/components/shell/useScreenSource";
import { createFixtureSource, FIXTURE_IDS } from "@/lib/data/fixtureSource";
import type { DataSource } from "@/lib/data/source";
import { parseFixtureSettings, type FixtureSettings } from "@/lib/practice/fixtureSettings";
import type { PracticeCaseView } from "@/lib/ui/contracts";

export default function PracticePage() {
  return (
    <Suspense fallback={<p className="state-message">Loading practice case…</p>}>
      <Practice />
    </Suspense>
  );
}

function Practice() {
  const base = useScreenSource("practice");
  const params = useSearchParams();
  const query = params.toString();
  // Fixture mode only: latency/failure come from the URL so the human gate can force them.
  const fixture: FixtureSettings | null = useMemo(
    () => (base.kind === "fixture" ? parseFixtureSettings(new URLSearchParams(query)) : null),
    [base.kind, query]
  );
  const source: DataSource = useMemo(() => (fixture ? createFixtureSource(fixture) : base), [base, fixture]);
  const caseId = FIXTURE_IDS.practiceCase;
  const [state, setState] = useState<
    { status: "loading" } | { status: "ready"; data: PracticeCaseView } | { status: "error"; error: string }
  >({ status: "loading" });

  useEffect(() => {
    let current = true;
    source.getPracticeCase(caseId).then(
      data => current && setState({ status: "ready", data }),
      (e: unknown) => current && setState({ status: "error", error: e instanceof Error ? e.message : String(e) })
    );
    return () => {
      current = false;
    };
  }, [caseId, source]);

  if (state.status === "loading") return <p className="state-message">Loading practice case…</p>;
  if (state.status === "error")
    return (
      <p className="state-message error" role="alert">
        The practice case could not be loaded: {state.error}
      </p>
    );

  return (
    // key: new fixture settings start a fresh attempt rather than mixing sources mid-review.
    <PracticeScreen
      key={query}
      source={source}
      caseView={state.data}
      sessionId={FIXTURE_IDS.newcomerSession}
      renderTutor={bus => <TutorPanel bus={bus} />}
      renderFixtureControls={
        fixture
          ? ({ simulateKnowledgeChange }) => (
              <FixtureControls settings={fixture} onSimulateKnowledgeChange={simulateKnowledgeChange} />
            )
          : undefined
      }
    />
  );
}
