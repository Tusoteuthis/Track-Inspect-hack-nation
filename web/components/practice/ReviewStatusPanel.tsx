"use client";

import { REVIEW_COPY, canSave } from "@/lib/practice/reviewCopy";
import type { ReviewMachineState } from "@/lib/practice/reviewMachine";
import styles from "./practice.module.css";

type Props = {
  review: ReviewMachineState;
  canRequestReview: boolean;
  onRequestReview: () => void;
  onSave: () => void;
};

export function ReviewStatusPanel({ review, canRequestReview, onRequestReview, onSave }: Props) {
  const copy = REVIEW_COPY[review.status];
  const saveEnabled = canSave(review.status);
  const requestEnabled = review.status === "editing_unreviewed" && canRequestReview;
  const requestHint =
    review.status === "editing_unreviewed" && !canRequestReview
      ? "Enter a decision and a reason to request a review."
      : null;

  return (
    <section className={styles.panel} aria-labelledby="review-status-heading">
      <h2 id="review-status-heading">Review before saving</h2>
      <p className={styles.status} data-tone={copy.tone} data-status={review.status} role="status" data-testid="review-status">
        <span aria-hidden="true" className={styles.statusIcon}>
          {copy.icon}
        </span>
        <span>{copy.label}</span>
      </p>

      {review.status === "editing_unreviewed" && review.error ? (
        <p role="alert" className={styles.error}>
          The review could not be completed: {review.error} You can request it again.
        </p>
      ) : null}
      {review.status === "save_failed" ? (
        <p role="alert" className={styles.error}>
          Your draft was not saved: {review.error ?? "unknown error"}
        </p>
      ) : null}

      <div className={styles.row}>
        <button
          type="button"
          onClick={onRequestReview}
          disabled={!requestEnabled}
          aria-describedby={requestHint ? "request-hint" : undefined}
        >
          Request review
        </button>
        <button
          type="button"
          className={styles.primary}
          onClick={onSave}
          disabled={!saveEnabled}
          aria-describedby={!saveEnabled && copy.saveBlockedReason ? "save-blocked-reason" : undefined}
        >
          {review.status === "save_failed" ? "Retry save" : "Save decision"}
        </button>
      </div>
      {requestHint ? (
        <p id="request-hint" className={styles.hint}>
          {requestHint}
        </p>
      ) : null}
      {!saveEnabled && copy.saveBlockedReason ? (
        <p id="save-blocked-reason" className={styles.hint} data-testid="save-blocked-reason">
          {copy.saveBlockedReason}
        </p>
      ) : null}
    </section>
  );
}
