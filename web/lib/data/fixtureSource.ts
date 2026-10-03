// Development data source backed by labelled fixtures in web/fixtures/ui/.
// Every view it returns carries source: "fixture", which makes the FIXTURE
// banner appear. It never contains evaluator-only answers.
import assessment from "@/fixtures/ui/assessment.json";
import practiceCase from "@/fixtures/ui/practice-case.json";
import sessionExpert from "@/fixtures/ui/session-expert.json";
import { createReviewScript } from "@/lib/data/fixtureReviewScript";
import type { DataSource } from "@/lib/data/source";
import type {
  AssessmentView,
  PracticeCaseView,
  SessionView,
} from "@/lib/ui/contracts";

export const FIXTURE_IDS = {
  expertSession: sessionExpert.session_id,
  newcomerSession: assessment.session_id,
  practiceCase: practiceCase.case_id,
} as const;

// JSON imports widen literal unions (e.g. "fixture") to string, hence the casts.
const SESSION = sessionExpert as SessionView;
const PRACTICE = practiceCase as PracticeCaseView;
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

export const fixtureSource: DataSource = {
  kind: "fixture",
  getSession: id => found(SESSION, id, SESSION.session_id, "session"),
  getWorkMap: reviewScript.getWorkMap,
  getPracticeCase: id => found(PRACTICE, id, PRACTICE.case_id, "case"),
  getAssessment: id => found(ASSESSMENT, id, ASSESSMENT.session_id, "session"),
  getReview: reviewScript.getReview,
  submitReviewMark: reviewScript.submitReviewMark,
  requestOffRecord: notImplemented(3),
  submitDraftForReview: notImplemented(2),
  commitDraft: notImplemented(2),
  // Pushes the scripted review stages; expert-session event replay arrives in Sprint 3.
  subscribe: reviewScript.subscribe,
};
