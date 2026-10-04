"use client";

// Optional browser screen sharing for the expert session. A companion aid only:
// physical pointing through the glasses remains the way to indicate a region.
import { useCallback } from "react";
import { ScreenSharePanel } from "@/components/practice/ScreenSharePanel";
import { useScreenObservation } from "@/components/practice/useScreenObservation";
import type { DataSource } from "@/lib/data/source";
import styles from "./companion.module.css";

const COPY = {
  idle: { icon: "○", text: "Screen not shared." },
  active: { icon: "●", text: "Sharing this browser screen with the session." },
  stopped: { icon: "■", text: "Screen sharing stopped." },
};

export function ExpertScreenShare({ source, caseId }: { source: DataSource; caseId: string }) {
  const send = useCallback(
    async (frame: Blob, capturedAtUtc: string) => {
      // draft_revision has no meaning for an expert session; 0 marks "not a learner draft".
      const ack = await source.submitScreenFrame(caseId, frame, { draft_revision: 0, captured_at_utc: capturedAtUtc });
      return ack.status === "acknowledged";
    },
    [caseId, source]
  );
  const screen = useScreenObservation(send);
  return (
    <details className={`${styles.panel} ${styles.optional}`} data-testid="screen-share">
      <summary>Optional: share this browser screen</summary>
      <p className={styles.hint}>
        A companion capability for viewing alongside the session. It does not replace pointing at the trace with your
        finger through the glasses, and it does not connect to the glasses.
      </p>
      <ScreenSharePanel
        state={screen.state}
        onStart={() => void screen.start()}
        onStop={screen.stop}
        heading="Browser screen (optional)"
        copy={COPY}
      />
    </details>
  );
}
