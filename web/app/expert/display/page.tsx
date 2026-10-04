"use client";

// Full-bleed trace for the demo monitor, read through the glasses: the trace
// at the largest size that fits, minimal chrome, Esc returns to setup.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/expert");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const chosen = cases.status === "ready" ? (cases.data.find(c => c.case_id === caseId) ?? null) : null;

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
