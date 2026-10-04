// Development data source backed by labelled fixtures in web/fixtures/ui/.
// Every view it returns carries source: "fixture", which makes the FIXTURE
// banner appear. It never contains evaluator-only answers.
import assessment from "@/fixtures/ui/assessment.json";
import cases from "@/fixtures/ui/cases.json";
import practiceCase from "@/fixtures/ui/practice-case.json";
import sessionExpert from "@/fixtures/ui/session-expert.json";
import confirmedWorkmap from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import { createExpertScript, type ExpertScriptControls } from "@/lib/data/fixtureExpertScript";
import { sharedFixtureKnowledge, type FixtureKnowledge } from "@/lib/data/fixtureKnowledge";
import { createFixturePractice } from "@/lib/data/fixturePractice";
import { createReviewScript } from "@/lib/data/fixtureReviewScript";
import { acknowledged, failed, type DataSource } from "@/lib/data/source";
import type {
  AssessmentView,
  CaseSummary,
  PracticeCaseView,
  SessionView,
  WorkMapView,
} from "@/lib/ui/contracts";

export const FIXTURE_IDS = {
  expertSession: sessionExpert.session_id,
  newcomerSession: assessment.session_id,
  practiceCase: practiceCase.case_id,
} as const;

// JSON imports widen literal unions (e.g. "fixture") to string, hence the casts.
const SESSION = sessionExpert as SessionView;
const PRACTICE = practiceCase as PracticeCaseView;
// Practice is pinned to confirmed knowledge only: the scripted review cites from it.
const CONFIRMED_WORKMAP = confirmedWorkmap as WorkMapView;
const ASSESSMENT = assessment as AssessmentView;
const CASES = cases.cases as CaseSummary[];

function found<T>(value: T, id: string, expected: string, what: string): Promise<T> {
  if (id !== expected) return Promise.reject(new Error(`Unknown ${what}: ${id}`));
  return Promise.resolve(structuredClone(value));
}

// The Work Map and review follow the scripted debrief (rev-1 → correction → rev-2 → confirmed).
const reviewScript = createReviewScript();
/** Fixture playback controls for the review screen and tests. Only meaningful with fixtureSource. */
export const fixtureReviewControls = reviewScript.controls;

export type FixtureSourceOptions = {
  /** Simulated latency for review, commit and screen-frame calls (ms). */
  latencyMs?: number;
  failReview?: boolean;
  failCommit?: boolean;
  /** Interval of the scripted expert pointing-event replay (ms). */
  replayMs?: number;
  failOffRecord?: boolean;
  failPause?: boolean;
  failStop?: boolean;
  failRevoke?: boolean;
  failDelete?: boolean;
  /** Revocation/deletion state; defaults to the store shared by every fixture source in the tab. */
  knowledge?: FixtureKnowledge;
};

export const DEFAULT_FIXTURE_LATENCY_MS = 600;
export const DEFAULT_FIXTURE_REPLAY_MS = 2500;

/** A fixture source plus the controls of its scripted expert session (drop/restore). */
export type FixtureDataSource = DataSource & {
  readonly expertControls: ExpertScriptControls;
  readonly knowledge: FixtureKnowledge;
};

export function createFixtureSource(options: FixtureSourceOptions = {}): FixtureDataSource {
  const latencyMs = options.latencyMs ?? DEFAULT_FIXTURE_LATENCY_MS;
  const knowledge = options.knowledge ?? sharedFixtureKnowledge;
  const delay = () => new Promise<void>(resolve => setTimeout(resolve, Math.max(0, latencyMs)));
  const practice = createFixturePractice({
    latencyMs,
    failReview: options.failReview,
    failCommit: options.failCommit,
    knowledgeRevisionId: PRACTICE.knowledge_revision_id,
    // A getter, so evaluations never cite an entry revoked after this source was created.
    workmap: () => knowledge.apply(CONFIRMED_WORKMAP),
  });
  const expert = createExpertScript({
    session: SESSION,
    caseIds: CASES.map(c => c.case_id),
    mediaCaseIds: CASES.filter(c => c.media).map(c => c.case_id),
    latencyMs,
    replayMs: options.replayMs ?? DEFAULT_FIXTURE_REPLAY_MS,
    fail: { offRecord: options.failOffRecord, pause: options.failPause, stop: options.failStop },
  });
  const getWorkMap = async (sessionId: string) => knowledge.apply(await reviewScript.getWorkMap(sessionId));
  const getReview = async (sessionId: string) => knowledge.applyReview(await reviewScript.getReview(sessionId));

  return {
    kind: "fixture",
    expertControls: expert.controls,
    knowledge,
    getSession: expert.getSession,
    getWorkMap,
    getPracticeCase: id => found(PRACTICE, id, PRACTICE.case_id, "case"),
    getAssessment: id => found(ASSESSMENT, id, ASSESSMENT.session_id, "session"),
    getReview,
    submitReviewMark: reviewScript.submitReviewMark,
    listCases: () => Promise.resolve(structuredClone(CASES)),
    startSession: expert.startSession,
    requestOffRecord: expert.requestOffRecord,
    requestPause: expert.requestPause,
    requestStop: expert.requestStop,
    getRecentEvents: expert.getRecentEvents,
    submitDraftForReview: practice.submitDraftForReview,
    commitDraft: practice.commitDraft,
    submitScreenFrame: practice.submitScreenFrame,
    async revokeEntry(entryId, revisionId) {
      await delay();
      if (options.failRevoke) return failed("Fixture: removal not confirmed (forced by fixture settings).");
      const map = await reviewScript.getWorkMap(FIXTURE_IDS.expertSession);
      if (!map.steps.some(s => s.entry_id === entryId)) return failed("Unknown item.");
      // Idempotent like WS6: an already revoked entry acknowledges again.
      if (!knowledge.isRevoked(entryId)) knowledge.revoke(entryId, revisionId);
      return acknowledged({ entry_id: entryId, revision_id: revisionId });
    },
    async deleteEvidence(sessionId, eventId) {
      await delay();
      if (options.failDelete) return failed("Fixture: deletion not confirmed (forced by fixture settings).");
      if (sessionId !== FIXTURE_IDS.expertSession) return failed("Unknown session.");
      const map = await reviewScript.getWorkMap(sessionId);
      return acknowledged({ event_id: eventId, revoked_entry_ids: knowledge.deleteEvent(eventId, map) });
    },
    // Review stages (S1) and the expert session replay (S3) push to the expert session;
    // revocations are broadcast to every session, like WS6 `entry.revoked`.
    subscribe(sessionId, onUpdate) {
      const offReview = reviewScript.subscribe(sessionId, update =>
        onUpdate(
          update.type === "workmap"
            ? { type: "workmap", workmap: knowledge.apply(update.workmap) }
            : update.type === "review"
              ? { type: "review", review: knowledge.applyReview(update.review) }
              : update
        )
      );
      const offExpert = expert.subscribe(sessionId, onUpdate);
      let active = true;
      const offKnowledge = knowledge.subscribe(update => {
        onUpdate(update);
        if (sessionId !== FIXTURE_IDS.expertSession) return;
        void Promise.all([getWorkMap(sessionId), getReview(sessionId)]).then(([workmap, review]) => {
          if (!active) return;
          onUpdate({ type: "workmap", workmap });
          onUpdate({ type: "review", review });
        });
      });
      return () => {
        active = false;
        offReview();
        offExpert();
        offKnowledge();
      };
    },
  };
}

export const fixtureSource: FixtureDataSource = createFixtureSource();

/** True for sources made by createFixtureSource (they all share the scripted review). */
export const isFixtureDataSource = (source: DataSource): source is FixtureDataSource =>
  source.kind === "fixture" && "expertControls" in source && "knowledge" in source;
