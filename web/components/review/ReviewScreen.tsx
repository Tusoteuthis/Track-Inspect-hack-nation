"use client";

import { useEffect, useReducer, useState } from "react";
import { ChangeList } from "@/components/review/ChangeList";
import { FixturePlayback } from "@/components/review/FixturePlayback";
import { OpenQuestions } from "@/components/review/OpenQuestions";
import { ReviewMarks, useReviewMarks } from "@/components/review/ReviewMarks";
import { RevisionHeader } from "@/components/review/RevisionHeader";
import { SessionConnectionStatus } from "@/components/shell/ConnectionStatus";
import { FixtureBanner } from "@/components/shell/FixtureBanner";
import { TrustControls, useTrustActions, type TrustActions } from "@/components/trust/TrustControls";
import { WorkMapDetail } from "@/components/workmap/WorkMapDetail";
import { WorkMapList } from "@/components/workmap/WorkMapList";
import { useDataSource } from "@/lib/data/DataSourceProvider";
import { fixtureReviewControls, isFixtureDataSource } from "@/lib/data/fixtureSource";
import { diffRevisions } from "@/lib/review/revisionDiff";
import { initialReviewState, reviewReducer, type ReviewNotice } from "@/lib/review/reviewState";
import type { MarkMap } from "@/lib/review/markState";
import type { ReviewMark, ReviewView } from "@/lib/ui/contracts";
import styles from "./review.module.css";
import { PageEyebrow } from "@/components/shell/PageEyebrow";

function noticeText(notice: ReviewNotice): string {
  switch (notice.kind) {
    case "new_revision":
      return `New revision received: ${notice.label}. Changed items are marked.`;
    case "confirmation":
      return `Teach-back result received for ${notice.label}.`;
    case "updated":
      return "Review updated.";
  }
}

/** Debrief support: the revision under review, what changed, open questions. Confirmation is spoken. */
export function ReviewScreen({ sessionId }: { sessionId: string }) {
  const source = useDataSource();
  const [state, dispatch] = useReducer(reviewReducer, sessionId, initialReviewState);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { marks, submit } = useReviewMarks(source);
  const trust = useTrustActions(source);

  useEffect(() => {
    let current = true;
    // Subscribe before loading so no update between the two is lost.
    const unsubscribe = source.subscribe(sessionId, update => dispatch({ type: "update", update }));
    source.getReview(sessionId).then(
      review => current && dispatch({ type: "loaded", review }),
      (error: unknown) => current && dispatch({ type: "load_failed", error: error instanceof Error ? error.message : String(error) })
    );
    return () => {
      current = false;
      unsubscribe();
    };
  }, [source, sessionId]);

  const review = state.status === "ready" ? state.review : null;

  return (
    <>
      <FixtureBanner source={review?.source} />
      <section className={styles.screen}>
        <PageEyebrow />
        <h1>Review</h1>
        <p className={styles.spoken}>
          <span aria-hidden="true">🗣 </span>
          Confirmation happens in the spoken teach-back with the expert. This screen cannot confirm knowledge: notes go
          to the spoken review, and removal or deletion takes effect only once the backend confirms it.
        </p>
        <p className={styles.announce} role="status" aria-live="polite" data-review-notice={state.status === "ready" ? state.notice?.kind ?? "" : ""}>
          {state.status === "ready" && state.notice ? noticeText(state.notice) : ""}
        </p>
        <SessionConnectionStatus source={source} sessionId={sessionId} />

        {state.status === "loading" ? (
          <p className="state-message" aria-live="polite">
            Loading…
          </p>
        ) : state.status === "error" ? (
          <p className="state-message error" role="alert">
            Could not load the review: {state.error}
          </p>
        ) : (
          <ReviewBody
            review={state.review}
            selectedId={selectedId}
            onSelect={setSelectedId}
            marks={marks}
            onMark={submit}
            trust={trust}
          />
        )}

        {isFixtureDataSource(source) ? <FixturePlayback controls={fixtureReviewControls} /> : null}
      </section>
    </>
  );
}

type ReviewBodyProps = {
  review: ReviewView;
  selectedId: string | null;
  onSelect: (id: string) => void;
  marks: MarkMap;
  onMark: (mark: ReviewMark) => void;
  trust: TrustActions;
};

function ReviewBody({ review, selectedId, onSelect, marks, onMark, trust }: ReviewBodyProps) {
  const { current, previous } = review;
  const diff = diffRevisions(previous, current);
  const markers: Record<string, string> = {};
  for (const id of Object.keys(diff.changed)) markers[id] = "Changed";
  for (const id of diff.added) markers[id] = "Added";
  const selected = current.steps.find(s => s.entry_id === selectedId) ?? null;

  return (
    <>
      <RevisionHeader review={review} diff={diff} />
      <div className={styles.layout}>
        <div className={styles.listColumn}>
          <h2>Draft process</h2>
          <WorkMapList steps={current.steps} selectedId={selected?.entry_id ?? null} onSelect={onSelect} label="Draft process" markers={markers} />
          {diff.removed.length ? (
            <div className={styles.removed}>
              <h3>Removed in {current.revision_label}</h3>
              <ul>
                {diff.removed.map(r => (
                  <li key={r.entry_id}>
                    <del>{r.title}</del>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className={styles.detailColumn}>
          {selected ? (
            <WorkMapDetail key={`${current.revision_id}:${selected.entry_id}`} step={selected}>
              <ChangeList
                changes={diff.changed[selected.entry_id] ?? []}
                added={diff.added.includes(selected.entry_id)}
                previousLabel={previous?.revision_label ?? null}
              />
              <ReviewMarks sessionId={review.session_id} revisionId={current.revision_id} step={selected} marks={marks} onSubmit={onMark} />
              <TrustControls sessionId={review.session_id} step={selected} trust={trust} />
            </WorkMapDetail>
          ) : (
            <p className="state-message">
              {selectedId ? `That item is not part of ${current.revision_label}.` : "Select an item to see its evidence, what changed and notes."}
            </p>
          )}
        </div>
      </div>
      <OpenQuestions questions={review.open_questions} />
    </>
  );
}
