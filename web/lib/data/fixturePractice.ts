// Fixture stand-in for WS5 evaluation and the WS6 commit on /practice.
// Scripted, not judged: the first review of a draft returns guidance, later
// reviews return "review complete". It never reads the draft content and
// holds no correct answer. Real evaluation comes from WS5 through WS6.
import { acknowledged, failed, type Ack } from "@/lib/data/source";
import type {
  Citation,
  LearnerDraft,
  LearnerEvaluation,
  ScreenFrameRef,
  WorkMapView,
} from "@/lib/ui/contracts";

export type FixturePracticeOptions = {
  /** Simulated latency per call, in milliseconds. */
  latencyMs?: number;
  failReview?: boolean;
  failCommit?: boolean;
  /** Knowledge revision the scripted evaluation claims to have used. */
  knowledgeRevisionId: string;
  /** Expert knowledge to cite (the fixture Work Map). */
  workmap: WorkMapView;
  now?: () => Date;
};

export const FIXTURE_GUIDANCE_MESSAGE =
  "Fixture behaviour: scripted guidance on the first review. Before saving, compare your reasoning with the cited expert example.";
export const FIXTURE_GUIDING_QUESTION =
  "What does the expert look at in the cited example, and have you checked the same thing on this trace?";
export const FIXTURE_COMPLETE_MESSAGE =
  "Fixture behaviour: scripted review complete after a change. Fixture mode does not check whether the decision is right.";

/** First confirmed expert entry with a quote and resolved evidence; guardrails preferred. */
export function fixtureCitations(workmap: WorkMapView): Citation[] {
  const usable = workmap.steps.filter(
    s =>
      s.status === "confirmed" &&
      s.expert_quotes.length > 0 &&
      s.evidence.some(e => e.region?.mapping_status === "resolved")
  );
  const step = usable.find(s => s.kind === "guardrail") ?? usable[0];
  if (!step) return [];
  return [
    {
      entry_id: step.entry_id,
      revision_id: step.revision_id,
      quote: step.expert_quotes[0],
      evidence: step.evidence.find(e => e.region?.mapping_status === "resolved") ?? null,
    },
  ];
}

export function createFixturePractice(options: FixturePracticeOptions) {
  const now = options.now ?? (() => new Date());
  const delay = () =>
    new Promise<void>(resolve => setTimeout(resolve, Math.max(0, options.latencyMs ?? 0)));
  const reviewsByDraft = new Map<string, number>();
  const commitsByKey = new Map<string, { committed_at_utc: string }>();
  let frameCount = 0;

  async function submitDraftForReview(draft: LearnerDraft): Promise<Ack<LearnerEvaluation>> {
    await delay();
    if (options.failReview) return failed("Fixture: review failed (forced by fixture settings).");
    const seen = reviewsByDraft.get(draft.draft_id) ?? 0;
    reviewsByDraft.set(draft.draft_id, seen + 1);
    const first = seen === 0;
    return acknowledged({
      evaluation_id: `fixture-evaluation-${draft.draft_id}-${draft.draft_revision}`,
      draft_revision: draft.draft_revision,
      knowledge_revision_id: options.knowledgeRevisionId,
      outcome: first ? "intervene" : "ok",
      message: first ? FIXTURE_GUIDANCE_MESSAGE : FIXTURE_COMPLETE_MESSAGE,
      guiding_question: first ? FIXTURE_GUIDING_QUESTION : null,
      citations: first ? structuredClone(fixtureCitations(options.workmap)) : [],
    });
  }

  async function commitDraft(
    draft: LearnerDraft,
    evaluation: LearnerEvaluation,
    commitOptions?: { idempotency_key: string }
  ): Promise<Ack<{ committed_at_utc: string }>> {
    const key = commitOptions?.idempotency_key ?? `${draft.draft_id}:${draft.draft_revision}`;
    const existing = commitsByKey.get(key);
    if (existing) return acknowledged(existing);
    await delay();
    if (options.failCommit) return failed("Fixture: save failed (forced by fixture settings).");
    // Mirrors the WS6 rule so fixture mode cannot hide a UI bug.
    if (evaluation.draft_revision !== draft.draft_revision) return failed("evaluation_stale");
    if (evaluation.outcome !== "ok") return failed("commit_blocked");
    const value = { committed_at_utc: now().toISOString() };
    commitsByKey.set(key, value);
    return acknowledged(value);
  }

  async function submitScreenFrame(
    _caseId: string,
    _frame: Blob,
    meta: { draft_revision: number; captured_at_utc: string }
  ): Promise<Ack<ScreenFrameRef>> {
    await delay();
    frameCount += 1;
    return acknowledged({
      frame_id: `fixture-screen-frame-${frameCount}`,
      captured_at_utc: meta.captured_at_utc,
      draft_revision: meta.draft_revision,
      source: "fixture",
    });
  }

  return {
    submitDraftForReview,
    commitDraft,
    submitScreenFrame,
    /** Number of distinct commits stored (for tests). */
    commitCount: () => commitsByKey.size,
  };
}
