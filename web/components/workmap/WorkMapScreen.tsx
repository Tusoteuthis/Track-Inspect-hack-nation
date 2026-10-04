"use client";

import { useEffect, useState } from "react";
import { ReviewMarks, useReviewMarks } from "@/components/review/ReviewMarks";
import { SessionConnectionStatus } from "@/components/shell/ConnectionStatus";
import { FixtureBanner } from "@/components/shell/FixtureBanner";
import { TrustControls, useTrustActions, type TrustActions } from "@/components/trust/TrustControls";
import { WorkMapDetail } from "@/components/workmap/WorkMapDetail";
import { WorkMapList } from "@/components/workmap/WorkMapList";
import { useDataSource, useSourceQuery } from "@/lib/data/DataSourceProvider";
import { resolveDeepLink } from "@/lib/workmap/deepLink";
import type { MarkMap } from "@/lib/review/markState";
import type { ReviewMark, WorkMapView } from "@/lib/ui/contracts";
import styles from "./workmap.module.css";

export type WorkMapScreenProps = {
  /** Session whose live updates refresh the map; null = none (the WS6 Work Map itself is global). */
  sessionId: string | null;
  /** From the address (`?entry=`); null = nothing selected. */
  entryId: string | null;
  /** From the address (`?rev=`). */
  revisionId: string | null;
  onSelect: (entryId: string, revisionId: string) => void;
};

/** Router-free Work Map screen: the page binds the address to these props. */
export function WorkMapScreen({ sessionId, entryId, revisionId, onSelect }: WorkMapScreenProps) {
  const source = useDataSource();
  const query = useSourceQuery(`workmap:${sessionId ?? ""}`, s => s.getWorkMap(sessionId ?? ""));
  const [pushed, setPushed] = useState<WorkMapView | null>(null);
  const trust = useTrustActions(source);
  const { marks, submit } = useReviewMarks(source);

  useEffect(() => {
    if (!sessionId) return;
    return source.subscribe(sessionId, update => {
      if (update.type === "workmap" && update.workmap.session_id === sessionId) setPushed(update.workmap);
    });
  }, [source, sessionId]);

  const view = pushed ?? (query.status === "ready" ? query.data : null);

  return (
    <>
      <FixtureBanner source={view?.source} />
      <section className={styles.screen}>
        <header className={styles.screenHeader}>
          <h1>Work Map</h1>
          {view ? <p className={styles.revision}>Showing {view.revision_label}</p> : null}
        </header>
        <SessionConnectionStatus source={source} sessionId={sessionId} />
        {view ? (
          <MapBody
            view={view}
            entryId={entryId}
            revisionId={revisionId}
            onSelect={onSelect}
            trust={trust}
            marks={marks}
            onMark={submit}
          />
        ) : query.status === "error" ? (
          <p className="state-message error" role="alert">
            Could not load the Work Map: {query.error}
          </p>
        ) : (
          <p className="state-message" aria-live="polite">
            Loading…
          </p>
        )}
      </section>
    </>
  );
}

type MapBodyProps = { view: WorkMapView; trust: TrustActions; marks: MarkMap; onMark: (mark: ReviewMark) => void } & Omit<
  WorkMapScreenProps,
  "sessionId"
>;

function MapBody({ view, entryId, revisionId, onSelect, trust, marks, onMark }: MapBodyProps) {
  const { selectedId, notice } = resolveDeepLink(view, entryId, revisionId);
  const selected = view.steps.find(s => s.entry_id === selectedId) ?? null;

  return (
    <>
      <p className="muted">
        The interpretation process in order. Use the arrow keys to move through it and Enter to open an item.
      </p>
      {notice ? (
        <p className={styles.notice} role="note" data-link-notice={notice}>
          {notice === "unknown_entry"
            ? `The linked item is not part of ${view.revision_label}.`
            : `The link referred to another revision. Showing the current one, ${view.revision_label}.`}
        </p>
      ) : null}
      {view.steps.length === 0 ? (
        <p className="state-message">This Work Map has no items yet.</p>
      ) : (
        <div className={styles.layout}>
          <WorkMapList
            steps={view.steps}
            selectedId={selectedId}
            onSelect={id => onSelect(id, view.revision_id)}
            label="Work Map process"
          />
          <div className={styles.detailPane}>
            {selected ? (
              <WorkMapDetail key={`${view.revision_id}:${selected.entry_id}`} step={selected}>
                <ReviewMarks
                  sessionId={view.session_id}
                  revisionId={view.revision_id}
                  step={selected}
                  marks={marks}
                  onSubmit={onMark}
                />
                <TrustControls sessionId={view.session_id} step={selected} trust={trust} />
              </WorkMapDetail>
            ) : (
              <p className="state-message">Select an item to see its evidence and the expert&apos;s words.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
