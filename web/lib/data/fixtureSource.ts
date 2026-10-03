// Development data source backed by labelled fixtures in web/fixtures/ui/.
// Every view it returns carries source: "fixture", which makes the FIXTURE
// banner appear. It never contains evaluator-only answers.
import assessment from "@/fixtures/ui/assessment.json";
import practiceCase from "@/fixtures/ui/practice-case.json";
import sessionExpert from "@/fixtures/ui/session-expert.json";
import confirmedWorkmap from "@/fixtures/ui/workmap-rev-2-confirmed.json";
import { createFixturePractice } from "@/lib/data/fixturePractice";
import { createReviewScript } from "@/lib/data/fixtureReviewScript";
import type { DataSource } from "@/lib/data/source";
import type {
  AssessmentView,
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

function found<T>(value: T, id: string, expected: string, what: string): Promise<T> {
  if (id !== expected) return Promise.reject(new Error(`Unknown ${what}: ${id}`));
  return Promise.resolve(structuredClone(value));
}

// The Work Map and review follow the scripted debrief (rev-1 → correction → rev-2 → confirmed).
const reviewScript = createReviewScript();
/** Fixture playback controls for the review screen and tests. Only meaningful with fixtureSource. */
export const fixtureReviewControls = reviewScript.controls;

const notImplemented = (sprint: number) => () =>
  Promise.reject(new Error(`not implemented: Sprint ${sprint}`));

export type FixtureSourceOptions = {
  /** Simulated latency for review, commit and screen-frame calls (ms). */
  latencyMs?: number;
  failReview?: boolean;
  failCommit?: boolean;
};

export const DEFAULT_FIXTURE_LATENCY_MS = 600;

export function createFixtureSource(options: FixtureSourceOptions = {}): DataSource {
  const practice = createFixturePractice({
    latencyMs: options.latencyMs ?? DEFAULT_FIXTURE_LATENCY_MS,
    failReview: options.failReview,
    failCommit: options.failCommit,
    knowledgeRevisionId: PRACTICE.knowledge_revision_id,
    workmap: CONFIRMED_WORKMAP,
  });
  return {
    kind: "fixture",
    getSession: id => found(SESSION, id, SESSION.session_id, "session"),
    getWorkMap: reviewScript.getWorkMap,
    getPracticeCase: id => found(PRACTICE, id, PRACTICE.case_id, "case"),
    getAssessment: id => found(ASSESSMENT, id, ASSESSMENT.session_id, "session"),
    getReview: reviewScript.getReview,
    submitReviewMark: reviewScript.submitReviewMark,
    requestOffRecord: notImplemented(3),
    submitDraftForReview: practice.submitDraftForReview,
    commitDraft: practice.commitDraft,
    submitScreenFrame: practice.submitScreenFrame,
    // Pushes the scripted review stages (expert session only); expert-session event replay arrives in Sprint 3.
    subscribe: reviewScript.subscribe,
  };
}

export const fixtureSource: DataSource = createFixtureSource();
