"use client";

import { useCallback, useReducer, useRef } from "react";
import { markKey, markReducer, markStatus, type MarkMap, type MarkStatus } from "@/lib/review/markState";
import type { Ack, DataSource } from "@/lib/data/source";
import type { ReviewMark, WorkMapStep } from "@/lib/ui/contracts";
import styles from "./review.module.css";

/** Mark state lives with the screen so a pending mark survives changing the selection. */
export function useReviewMarks(source: DataSource) {
  const [marks, dispatch] = useReducer(markReducer, {} as MarkMap);
  // Guards double submits that happen before React re-renders the disabled button.
  const inFlight = useRef(new Set<string>());
  const submit = useCallback(
    (mark: ReviewMark) => {
      const key = markKey(mark);
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);
      dispatch({ type: "submit", key });
      const resolved = (ack: Ack<{ received_at_utc: string }>) => {
        inFlight.current.delete(key);
        dispatch({ type: "resolved", key, ack });
      };
      source.submitReviewMark(mark).then(resolved, (error: unknown) =>
        resolved({ status: "failed", error: error instanceof Error ? error.message : String(error) })
      );
    },
    [source]
  );
  return { marks, submit };
}

const ACTIONS: { kind: ReviewMark["kind"]; label: string }[] = [
  { kind: "correction_requested", label: "Mark step for correction" },
  { kind: "flag_unresolved", label: "Flag unresolved" },
];

function StateText({ status }: { status: MarkStatus }) {
  switch (status.state) {
    case "idle":
      return null;
    case "pending":
      return <span className={styles.pending}>⧗ Pending: waiting for acknowledgement…</span>;
    case "acknowledged":
      return (
        <span className={styles.acknowledged}>
          ✓ Acknowledged: request received. Any change arrives as a new revision from the spoken review.
        </span>
      );
    case "failed":
      return (
        <span className={styles.failed} role="alert">
          ✕ Failed: {status.error} You can try again.
        </span>
      );
  }
}

type ReviewMarksProps = {
  sessionId: string;
  revisionId: string;
  step: WorkMapStep;
  marks: MarkMap;
  onSubmit: (mark: ReviewMark) => void;
};

/** Supplementary controls only. They never confirm or edit knowledge. */
export function ReviewMarks({ sessionId, revisionId, step, marks, onSubmit }: ReviewMarksProps) {
  if (step.status === "revoked" || step.status === "missing") return null;
  const actions = ACTIONS.filter(a => !(a.kind === "flag_unresolved" && step.status === "unresolved"));
  return (
    <section className={styles.marks} aria-labelledby="marks-title">
      <h3 id="marks-title">Notes for the spoken review</h3>
      <p className={styles.hint}>These send a note to the review. They do not confirm or change anything.</p>
      {actions.map(a => {
        const mark: ReviewMark = { session_id: sessionId, entry_id: step.entry_id, revision_id: revisionId, kind: a.kind };
        const status = markStatus(marks, markKey(mark));
        return (
          <div key={a.kind} className={styles.markRow} data-mark-state={status.state}>
            <button type="button" onClick={() => onSubmit(mark)} disabled={status.state === "pending"}>
              {a.label}
            </button>
            <span aria-live="polite">
              <StateText status={status} />
            </span>
          </div>
        );
      })}
    </section>
  );
}
