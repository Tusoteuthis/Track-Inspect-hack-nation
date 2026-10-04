"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { AgentStateBridge } from "@/components/companion/AgentStateBridge";
import { CompanionFixtureControls } from "@/components/companion/CompanionFixtureControls";
import { ExpertCompanion } from "@/components/companion/ExpertCompanion";
import { ExpertScreenShare } from "@/components/companion/ExpertScreenShare";
import { ExpertSetup } from "@/components/companion/ExpertSetup";
import styles from "@/components/companion/companion.module.css";
import { useExpertSession } from "@/components/expert/useExpertSession";
import { FixtureBanner } from "@/components/shell/FixtureBanner";
import { VoiceSession } from "@/components/voice/VoiceSession";
import { useScreenSource } from "@/components/shell/useScreenSource";
import { DataSourceProvider } from "@/lib/data/DataSourceProvider";
import { createFixtureSource, type FixtureDataSource } from "@/lib/data/fixtureSource";
import type { DataSource } from "@/lib/data/source";
import { parseFixtureSettings } from "@/lib/practice/fixtureSettings";
import type { AgentState } from "@/lib/ui/agentState";
import type { CaseSummary } from "@/lib/ui/contracts";

export default function ExpertPage() {
  return (
    <Suspense fallback={<p className="state-message">Loading expert session…</p>}>
      <Expert />
    </Suspense>
  );
}

type Phase = { kind: "setup" } | { kind: "session"; sessionId: string; chosen: CaseSummary };

function Expert() {
  const base = useScreenSource("expert");
  const query = useSearchParams().toString();
  // Fixture mode only: latency, failures and replay speed come from the URL so the human gate can force them.
  const fixture: FixtureDataSource | null = useMemo(
    () => (base.kind === "fixture" ? createFixtureSource(parseFixtureSettings(new URLSearchParams(query))) : null),
    [base.kind, query]
  );
  const source: DataSource = fixture ?? base;
  const fixtureControls = fixture?.expertControls ?? null;

  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentState>("disconnected");
  // WS3 expert flow: its reducer records exchanges; this page only reads the agent state.
  const expert = useExpertSession();

  return (
    <DataSourceProvider source={source}>
      <div className={styles.screen}>
        <FixtureBanner source={source.kind === "fixture" ? "fixture" : "live"} />
        <header className={styles.header}>
          <h1>Expert session</h1>
          <p className={styles.hint}>
            You point at the trace and talk through the glasses. This page shows what was understood and the session
            state.
          </p>
        </header>

        {phase.kind === "setup" ? (
          <ExpertSetup
            agent={agent}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onStarted={(session, chosen) => {
              setSelectedId(chosen.case_id);
              setPhase({ kind: "session", sessionId: session.session_id, chosen });
            }}
          />
        ) : (
          <ExpertCompanion
            source={source}
            sessionId={phase.sessionId}
            caseAsset={phase.chosen.asset}
            agent={agent}
            voice={
              <VoiceSession flow="expert" {...expert.voiceProps}>
                <AgentStateBridge onChange={setAgent} />
              </VoiceSession>
            }
            fixtureControls={fixtureControls ? <CompanionFixtureControls controls={fixtureControls} /> : undefined}
          />
        )}

        {/* Same tree position in both phases, so sharing survives the switch from setup to session. */}
        {selectedId || phase.kind === "session" ? (
          <ExpertScreenShare source={source} caseId={phase.kind === "session" ? phase.chosen.case_id : selectedId!} />
        ) : null}
      </div>
    </DataSourceProvider>
  );
}
