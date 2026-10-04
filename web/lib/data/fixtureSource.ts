// Development data source backed by labelled fixtures in web/fixtures/ui/.
// Every view it returns carries source: "fixture", which makes the FIXTURE
// banner appear. It never contains evaluator-only answers.
import assessment from "@/fixtures/ui/assessment.json";
import cases from "@/fixtures/ui/cases.json";
import practiceCase from "@/fixtures/ui/practice-case.json";
import sessionExpert from "@/fixtures/ui/session-expert.json";
import confirmedWorkmap from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import { createExpertScript, type ExpertScriptControls } from "@/lib/data/fixtureExpertScript";
import { createFixturePractice } from "@/lib/data/fixturePractice";
import { createReviewScript } from "@/lib/data/fixtureReviewScript";
import type { DataSource } from "@/lib/data/source";
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
};

export const DEFAULT_FIXTURE_LATENCY_MS = 600;
export const DEFAULT_FIXTURE_REPLAY_MS = 2500;

/** A fixture source plus the controls of its scripted expert session (drop/restore). */
export type FixtureDataSource = DataSource & { readonly expertControls: ExpertScriptControls };

export function createFixtureSource(options: FixtureSourceOptions = {}): FixtureDataSource {
  const practice = createFixturePractice({
    latencyMs: options.latencyMs ?? DEFAULT_FIXTURE_LATENCY_MS,
    failReview: options.failReview,
    failCommit: options.failCommit,
    knowledgeRevisionId: PRACTICE.knowledge_revision_id,
    workmap: CONFIRMED_WORKMAP,
  });
  const expert = createExpertScript({
    session: SESSION,
    caseIds: CASES.map(c => c.case_id),
    latencyMs: options.latencyMs ?? DEFAULT_FIXTURE_LATENCY_MS,
    replayMs: options.replayMs ?? DEFAULT_FIXTURE_REPLAY_MS,
    fail: { offRecord: options.failOffRecord, pause: options.failPause, stop: options.failStop },
  });
  return {
    kind: "fixture",
    expertControls: expert.controls,
    getSession: expert.getSession,
    getWorkMap: reviewScript.getWorkMap,
    getPracticeCase: id => found(PRACTICE, id, PRACTICE.case_id, "case"),
    getAssessment: id => found(ASSESSMENT, id, ASSESSMENT.session_id, "session"),
    getReview: reviewScript.getReview,
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
    // Review stages (S1) and the expert session replay (S3) both push to the expert session.
    subscribe(sessionId, onUpdate) {
      const offReview = reviewScript.subscribe(sessionId, onUpdate);
      const offExpert = expert.subscribe(sessionId, onUpdate);
      return () => {
        offReview();
        offExpert();
      };
    },
  };
}

export const fixtureSource: FixtureDataSource = createFixtureSource();
