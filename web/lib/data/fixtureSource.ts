// Development data source backed by labelled fixtures in web/fixtures/ui/.
// Every view it returns carries source: "fixture", which makes the FIXTURE
// banner appear. It never contains evaluator-only answers.
import assessment from "@/fixtures/ui/assessment.json";
import practiceCase from "@/fixtures/ui/practice-case.json";
import sessionExpert from "@/fixtures/ui/session-expert.json";
import workmap from "@/fixtures/ui/workmap.json";
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
const WORKMAP = workmap as WorkMapView;
const PRACTICE = practiceCase as PracticeCaseView;
const ASSESSMENT = assessment as AssessmentView;

function found<T>(value: T, id: string, expected: string, what: string): Promise<T> {
  if (id !== expected) return Promise.reject(new Error(`Unknown ${what}: ${id}`));
  return Promise.resolve(structuredClone(value));
}

const notImplemented = (sprint: number) => () =>
  Promise.reject(new Error(`not implemented: Sprint ${sprint}`));

export const fixtureSource: DataSource = {
  kind: "fixture",
  getSession: id => found(SESSION, id, SESSION.session_id, "session"),
  getWorkMap: id => found(WORKMAP, id, WORKMAP.session_id, "session"),
  getPracticeCase: id => found(PRACTICE, id, PRACTICE.case_id, "case"),
  getAssessment: id => found(ASSESSMENT, id, ASSESSMENT.session_id, "session"),
  requestOffRecord: notImplemented(3),
  submitDraftForReview: notImplemented(2),
  commitDraft: notImplemented(2),
  // Fixture event replay arrives in Sprint 3.
  subscribe: () => () => {},
};
