"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AgentStateBridge } from "@/components/companion/AgentStateBridge";
import { CompanionFixtureControls } from "@/components/companion/CompanionFixtureControls";
import { ExpertCompanion } from "@/components/companion/ExpertCompanion";
import { ExpertScreenShare } from "@/components/companion/ExpertScreenShare";
import { displayHref, ExpertSetup } from "@/components/companion/ExpertSetup";
import { MonitorStrip } from "@/components/companion/MonitorStrip";
import { InlineVideoPlayer } from "@/components/monitor/InlineVideoPlayer";
import { useMonitorLink } from "@/components/monitor/useMonitorLink";
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
import type { MonitorStateMessage, SessionRecording } from "@/lib/monitor/monitorChannel";
import type { CaseSummary } from "@/lib/ui/contracts";
import { PageEyebrow } from "@/components/shell/PageEyebrow";

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

  // Demo monitor link (video cases): mirror its playback here, send it the recording state.
  const [recording, setRecording] = useState<SessionRecording>("none");
  const monitor = useMonitorLink(phase.kind === "session" ? recording : "none");
  // Video cases play inline on this page once the session starts (single screen). A monitor window, once
  // open, takes over: the page goes back to mirroring it, so there is only ever one player.
  const [inline, setInline] = useState<MonitorStateMessage | null>(null);
  const playing = monitor ?? inline;
  const renderMonitor = (chosen: CaseSummary, showOpenLink: boolean) =>
    chosen.media ? (
      <MonitorStrip
        caseId={chosen.case_id}
        media={chosen.media}
        monitor={monitor}
        openHref={displayHref(chosen.case_id)}
        showOpenLink={showOpenLink}
      />
    ) : null;

  // Fixture mode: a monitor hold stands in for the glasses' pointing detection.
  const sessionCase = phase.kind === "session" ? phase.chosen : null;
  useEffect(() => {
    if (!fixtureControls || !sessionCase?.media || playing?.status !== "held") return;
    if (playing.case_id !== sessionCase.case_id) return;
    const hold = sessionCase.media.holds.find(h => h.hold_id === playing.hold_id);
    if (hold) fixtureControls.pointAtHold(hold);
  }, [fixtureControls, playing, sessionCase]);

  return (
    <DataSourceProvider source={source}>
      <div className={styles.screen}>
        <FixtureBanner source={source.kind === "fixture" ? "fixture" : "live"} />
        <header className={styles.header}>
          <PageEyebrow />
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
            renderMonitor={chosen => renderMonitor(chosen, false)}
          />
        ) : (
          <ExpertCompanion
            source={source}
            sessionId={phase.sessionId}
            caseAsset={phase.chosen.media ? null : phase.chosen.asset}
            agent={agent}
            voice={
              <VoiceSession flow="expert" {...expert.voiceProps}>
                <AgentStateBridge onChange={setAgent} />
              </VoiceSession>
            }
            fixtureControls={fixtureControls ? <CompanionFixtureControls controls={fixtureControls} /> : undefined}
            monitorStrip={
              phase.chosen.media && !monitor ? (
                <InlineVideoPlayer
                  caseId={phase.chosen.case_id}
                  title={phase.chosen.title}
                  media={phase.chosen.media}
                  autoStart
                  onState={setInline}
                />
              ) : (
                renderMonitor(phase.chosen, true)
              )
            }
            onRecordingChange={setRecording}
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
