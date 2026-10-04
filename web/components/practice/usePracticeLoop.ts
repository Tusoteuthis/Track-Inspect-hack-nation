"use client";

// Binds the pure review reducer to the data source. Transitions are applied
// synchronously through a ref, so a handler knows immediately whether its
// event was accepted: a second Save click (or a StrictMode re-run) sees the
// "saving" state and sends nothing.
import { useCallback, useEffect, useRef, useState } from "react";
import type { DataSource } from "@/lib/data/source";
import type { PracticeEventBus } from "@/lib/practice/practiceEvents";
import {
  initialReviewState,
  reviewMachine,
  type ReviewEvent,
  type ReviewMachineState,
} from "@/lib/practice/reviewMachine";
import { nextTimelineEntry } from "@/lib/practice/timeline";
import type {
  EvidenceRegion,
  LearnerDraft,
  LearnerEvaluation,
  PracticeCaseView,
  PracticeTimelineEntry,
} from "@/lib/ui/contracts";

export type DraftFields = { decision: string; reason: string; region: EvidenceRegion | null };

type LoopView = {
  review: ReviewMachineState;
  timeline: PracticeTimelineEntry[];
  /** Latest guidance, kept visible while the learner corrects the draft. */
  guidance: LearnerEvaluation | null;
  /** Entries removed from teaching during this attempt; never shown as citations. */
  revoked: string[];
  /** Cited expert knowledge was removed from teaching; the learner should ask for a new review. */
  revokedNotice: boolean;
};

/** Teaching views never show a citation of revoked knowledge. */
function withoutRevoked(guidance: LearnerEvaluation | null, revoked: string[]): LearnerEvaluation | null {
  if (!guidance || !guidance.citations.some(c => revoked.includes(c.entry_id))) return guidance;
  return { ...guidance, citations: guidance.citations.filter(c => !revoked.includes(c.entry_id)) };
}

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function usePracticeLoop(
  source: DataSource,
  caseView: PracticeCaseView,
  bus: PracticeEventBus,
  sessionId: string | null
) {
  const [draftId] = useState(() => `draft-${newKey()}`);
  const [fields, setFields] = useState<DraftFields>({ decision: "", reason: "", region: null });
  const fieldsRef = useRef(fields);
  const viewRef = useRef<LoopView>({
    review: initialReviewState(caseView.knowledge_revision_id),
    timeline: [],
    guidance: null,
    revoked: [],
    revokedNotice: false,
  });
  const [view, setView] = useState<LoopView>(viewRef.current);

  /** Applies an event; returns true when the review state actually changed. */
  const apply = useCallback((event: ReviewEvent): boolean => {
    const prev = viewRef.current;
    const review = reviewMachine(prev.review, event);
    if (review === prev.review) return false;
    const entry = nextTimelineEntry(prev.review, review, prev.timeline, new Date().toISOString());
    const evaluation = event.type === "EVALUATION_RECEIVED" ? review.evaluation : null;
    const guidance =
      evaluation && review.status === "guidance_needed"
        ? evaluation
        : review.status === "review_complete" ||
            event.type === "RESET" ||
            event.type === "KNOWLEDGE_REVISION_CHANGED"
          ? null
          : prev.guidance;
    viewRef.current = {
      ...prev,
      review,
      timeline: entry ? [...prev.timeline, entry] : prev.timeline,
      guidance: withoutRevoked(guidance, prev.revoked),
      revokedNotice: event.type === "EDIT" || event.type === "RESET" ? false : prev.revokedNotice,
    };
    setView(viewRef.current);
    return true;
  }, []);

  const snapshot = useCallback(
    (revision: number): LearnerDraft => ({
      draft_id: draftId,
      draft_revision: revision,
      ...fieldsRef.current,
    }),
    [draftId]
  );

  const edit = useCallback(
    (patch: Partial<DraftFields>) => {
      if (!apply({ type: "EDIT" })) return;
      fieldsRef.current = { ...fieldsRef.current, ...patch };
      setFields(fieldsRef.current);
      bus.emit({ kind: "draft_edited", draft: snapshot(viewRef.current.review.draft_revision) });
    },
    [apply, bus, snapshot]
  );

  const requestReview = useCallback(async () => {
    if (!apply({ type: "REQUEST_REVIEW" })) return;
    const revision = viewRef.current.review.draft_revision;
    bus.emit({ kind: "review_requested", draft_revision: revision });
    try {
      const ack = await source.submitDraftForReview(snapshot(revision));
      if (ack.status === "acknowledged") {
        // The reducer drops it if the draft or knowledge moved on meanwhile.
        if (apply({ type: "EVALUATION_RECEIVED", evaluation: ack.value })) {
          bus.emit({ kind: "evaluation_received", evaluation: ack.value });
        }
      } else if (viewRef.current.review.requested_revision === revision) {
        apply({ type: "REVIEW_FAILED", error: ack.error });
      }
    } catch (error) {
      if (viewRef.current.review.requested_revision === revision) {
        apply({ type: "REVIEW_FAILED", error: error instanceof Error ? error.message : String(error) });
      }
    }
  }, [apply, bus, snapshot, source]);

  const save = useCallback(async () => {
    const key = newKey();
    if (!apply({ type: "SAVE_REQUESTED", idempotency_key: key })) return;
    const { draft_revision, evaluation } = viewRef.current.review;
    if (!evaluation) return;
    try {
      const ack = await source.commitDraft(snapshot(draft_revision), evaluation, { idempotency_key: key });
      if (viewRef.current.review.idempotency_key !== key) return; // superseded (e.g. knowledge changed)
      if (ack.status === "acknowledged") {
        if (apply({ type: "SAVE_ACKED" })) bus.emit({ kind: "saved", draft_revision });
      } else {
        apply({ type: "SAVE_FAILED", error: ack.error });
      }
    } catch (error) {
      if (viewRef.current.review.idempotency_key === key) {
        apply({ type: "SAVE_FAILED", error: error instanceof Error ? error.message : String(error) });
      }
    }
  }, [apply, bus, snapshot, source]);

  const knowledgeChanged = useCallback(
    (knowledgeRevisionId: string) => apply({ type: "KNOWLEDGE_REVISION_CHANGED", knowledge_revision_id: knowledgeRevisionId }),
    [apply]
  );

  const knowledgeRevoked = useCallback(
    (entryId: string) => {
      const prev = viewRef.current;
      if (prev.revoked.includes(entryId)) return;
      const cited = prev.guidance?.citations.some(c => c.entry_id === entryId) ?? false;
      const revoked = [...prev.revoked, entryId];
      viewRef.current = { ...prev, revoked, guidance: withoutRevoked(prev.guidance, revoked) };
      const invalidated = apply({ type: "KNOWLEDGE_REVOKED", entry_id: entryId });
      if (cited || invalidated) {
        viewRef.current = { ...viewRef.current, revokedNotice: true };
      }
      setView(viewRef.current);
    },
    [apply]
  );

  const reset = useCallback(() => {
    if (!apply({ type: "RESET" })) return;
    fieldsRef.current = { decision: "", reason: "", region: null };
    setFields(fieldsRef.current);
  }, [apply]);

  // Knowledge revisions arrive as Work Map updates; a new revision invalidates any review.
  // A revoked entry disappears from the guidance and invalidates a review that cited it.
  useEffect(() => {
    if (!sessionId) return;
    return source.subscribe(sessionId, update => {
      if (update.type === "workmap") knowledgeChanged(update.workmap.revision_id);
      if (update.type === "knowledge" && update.status === "revoked") knowledgeRevoked(update.entry_id);
    });
  }, [knowledgeChanged, knowledgeRevoked, sessionId, source]);

  return {
    ...view,
    fields,
    edit,
    requestReview,
    save,
    reset,
    knowledgeChanged,
    /** Current draft revision for frames captured right now. */
    currentRevision: () => viewRef.current.review.draft_revision,
  };
}
