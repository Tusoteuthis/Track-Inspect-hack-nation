# Contract: DataSource (v0)

The one interface every screen uses. Implementations: `fixtureSource` (S0), `apiSource` (S4, WS6).

```ts
interface DataSource {
  readonly kind: "fixture" | "api";
  getSession(sessionId: string): Promise<SessionView>;
  getWorkMap(sessionId: string): Promise<WorkMapView>;
  getPracticeCase(caseId: string): Promise<PracticeCaseView>;
  getAssessment(sessionId: string): Promise<AssessmentView>;
  // actions resolve with an Ack; they never throw for domain failures
  requestOffRecord(sessionId: string, offRecord: boolean): Promise<Ack<SessionView>>;
  submitDraftForReview(draft: LearnerDraft): Promise<Ack<LearnerEvaluation>>;
  commitDraft(draft: LearnerDraft, evaluation: LearnerEvaluation): Promise<Ack<{ committed_at_utc: string }>>;
  subscribe(sessionId: string, onUpdate: (u: SourceUpdate) => void): () => void;
}
```

Rules:

- Getters reject when the resource is unknown. Screens render an error state.
- In S0, the fixture actions not yet needed reject with `Error("not implemented: Sprint N")`. `subscribe` returns a no-op unsubscribe.
- No method returns evaluator-only data.
