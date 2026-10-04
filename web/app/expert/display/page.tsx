"use client";

// The demo monitor, read through the glasses. A video case gets the inspection
// player (VideoMonitor); a still trace is shown full-bleed at the largest size
// that fits, with minimal chrome. Esc returns to setup.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect } from "react";
import { VideoMonitor } from "@/components/monitor/VideoMonitor";
import { useScreenSource } from "@/components/shell/useScreenSource";
import { DataSourceProvider, useSourceQuery } from "@/lib/data/DataSourceProvider";
import styles from "./display.module.css";

export default function TraceDisplayPage() {
  return (
    <Suspense fallback={null}>
      <ExpertSource>
        <TraceDisplay />
      </ExpertSource>
    </Suspense>
  );
}

function ExpertSource({ children }: { children: React.ReactNode }) {
  return <DataSourceProvider source={useScreenSource("expert")}>{children}</DataSourceProvider>;
}

function TraceDisplay() {
  const caseId = useSearchParams().get("case");
  const router = useRouter();
  const cases = useSourceQuery("cases", s => s.listCases());
  const chosen = cases.status === "ready" ? (cases.data.find(c => c.case_id === caseId) ?? null) : null;
  const exit = useCallback(() => router.push("/expert"), [router]);
  const isVideo = Boolean(chosen?.media);

  // The video player has its own keys (Esc included).
  useEffect(() => {
    if (isVideo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit, isVideo]);

  // A video case gets the inspection player; still traces keep the plain full-bleed view.
  if (chosen?.media) return <VideoMonitor caseSummary={{ ...chosen, media: chosen.media }} onExit={exit} />;

  return (
    <div className={styles.display} data-testid="trace-display">
      {cases.status === "loading" ? (
        <p className={styles.message}>Loading trace…</p>
      ) : cases.status === "error" ? (
        <p className={styles.message} role="alert">
          The trace could not be loaded: {cases.error}
        </p>
      ) : !chosen ? (
        <p className={styles.message} role="alert">
          No case selected. Open the trace display from the expert session setup.
        </p>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- the trace must render unscaled-by-framework, contain-fit */}
          <img className={styles.trace} src={chosen.asset.original_url} alt={`Trace: ${chosen.title}`} />
          <div className={styles.chrome}>
            <span>{chosen.title}</span>
            {chosen.source === "fixture" ? (
              <span className={styles.badge} role="status">
                FIXTURE DATA
              </span>
            ) : null}
            <span className={styles.hint}>Esc to exit</span>
          </div>
        </>
      )}
    </div>
  );
}
