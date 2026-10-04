"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";
import { SessionConnectionStatus } from "@/components/shell/ConnectionStatus";
import { FixtureBanner } from "@/components/shell/FixtureBanner";
import type { DataSource } from "@/lib/data/source";
import { createPracticeEventBus, type PracticeEventBus } from "@/lib/practice/practiceEvents";
import type { PracticeCaseView } from "@/lib/ui/contracts";
import { DraftForm } from "./DraftForm";
import { GuidancePanel } from "./GuidancePanel";
import { PracticeTimeline } from "./PracticeTimeline";
import { RegionMarker } from "./RegionMarker";
import { ReviewStatusPanel } from "./ReviewStatusPanel";
import { ScreenSharePanel } from "./ScreenSharePanel";
import { usePracticeLoop } from "./usePracticeLoop";
import { useScreenObservation } from "./useScreenObservation";
import styles from "./practice.module.css";

type Props = {
  source: DataSource;
  caseView: PracticeCaseView;
  /** Session whose live updates may change the knowledge revision. */
  sessionId: string | null;
  /** Voice tutor slot; omitted in component tests. */
  renderTutor?: (bus: PracticeEventBus) => ReactNode;
  /** Fixture-only controls (latency/failure/knowledge change). */
  renderFixtureControls?: (actions: { simulateKnowledgeChange: () => void }) => ReactNode;
};

export function PracticeScreen({ source, caseView, sessionId, renderTutor, renderFixtureControls }: Props) {
  const bus = useMemo(() => createPracticeEventBus(), []);
  const loop = usePracticeLoop(source, caseView, bus, sessionId);
  const [marking, setMarking] = useState(false);
  const { review } = loop;
  const locked = review.status === "saving" || review.status === "saved";

  const sendFrame = useCallback(
    async (frame: Blob, capturedAtUtc: string) => {
      const ack = await source.submitScreenFrame(caseView.case_id, frame, {
        draft_revision: loop.currentRevision(),
        captured_at_utc: capturedAtUtc,
      });
      if (ack.status !== "acknowledged") return false;
      bus.emit({ kind: "screen_frame", frame: ack.value });
      return true;
    },
    [bus, caseView.case_id, loop, source]
  );
  const screen = useScreenObservation(sendFrame);

  const requestReview = () => {
    // The reviewed draft's screen goes with it, so visual context matches the draft.
    if (screen.state.status === "active") void screen.captureNow();
    void loop.requestReview();
  };

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1>Newcomer practice</h1>
        <p className="muted">
          Look at this trace, draft your decision with a reason, and get it reviewed by the tutor before saving.
        </p>
      </header>
      <FixtureBanner source={caseView.source} />
      <SessionConnectionStatus source={source} sessionId={sessionId} />
      {renderFixtureControls?.({
        simulateKnowledgeChange: () => loop.knowledgeChanged(`${review.knowledge_revision_id}-next`),
      })}

      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.panel} aria-labelledby="trace-heading">
            <h2 id="trace-heading">Practice trace</h2>
            {marking ? (
              <RegionMarker
                asset={caseView.asset}
                region={loop.fields.region}
                onChange={region => loop.edit({ region })}
                onDone={() => setMarking(false)}
              />
            ) : (
              <>
                <EvidenceViewer
                  asset={caseView.asset}
                  region={loop.fields.region}
                  mode="full"
                  caption={loop.fields.region ? "Outlined: the region you marked (part of your draft)" : undefined}
                />
                <div className={styles.row}>
                  <button type="button" onClick={() => setMarking(true)} disabled={locked}>
                    {loop.fields.region ? "Change marked region" : "Mark a region (optional)"}
                  </button>
                </div>
              </>
            )}
            {caseView.visible_context.length > 0 ? (
              <>
                <h3>Context</h3>
                <ul className={styles.context}>
                  {caseView.visible_context.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <DraftForm fields={loop.fields} options={caseView.decision_options} locked={locked} onEdit={loop.edit} />
        </div>

        <aside className={styles.side}>
          <ReviewStatusPanel
            review={review}
            canRequestReview={loop.fields.decision.trim() !== "" && loop.fields.reason.trim() !== ""}
            onRequestReview={requestReview}
            onSave={() => void loop.save()}
          />
          {loop.revokedNotice ? (
            <p className={styles.hint} role="status" data-testid="revoked-notice">
              <span aria-hidden="true">⊘ </span>
              Expert knowledge cited for this case was removed from teaching. It is no longer shown; ask for a new
              review before saving.
            </p>
          ) : null}
          <GuidancePanel guidance={loop.guidance} currentRevision={review.draft_revision} />
          {review.status === "saved" ? (
            <p className={styles.hint}>
              <Link href={sessionId ? `/summary?${new URLSearchParams({ session: sessionId })}` : "/summary"}>
                See the learning summary
              </Link>
            </p>
          ) : null}
          <PracticeTimeline entries={loop.timeline} />
          {renderTutor?.(bus)}
          <ScreenSharePanel state={screen.state} onStart={() => void screen.start()} onStop={screen.stop} />
        </aside>
      </div>
    </div>
  );
}
