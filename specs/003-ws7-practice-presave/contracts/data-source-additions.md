# DataSource additions (additive)

```ts
commitDraft(draft, evaluation, options?: { idempotency_key: string }): Promise<Ack<{ committed_at_utc: string }>>;
submitScreenFrame(caseId: string, frame: Blob, meta: { draft_revision: number; captured_at_utc: string }): Promise<Ack<ScreenFrameRef>>;
```
`LearnerEvaluation.evaluation_id?: string` (optional; required by WS6 commit).

## WS6 mapping (for the apiSource)
- `submitDraftForReview`: `PUT /api/sessions/:sid/draft {base_draft_rev, decision, reason, visual_context}`, then `POST /evaluations {draft_rev}`, then wait on `evaluation.updated` (SSE) or poll `GET /evaluations/:id` until the status is `done`, `failed` or `stale`.
- `commitDraft`: `POST /api/sessions/:sid/commit {draft_rev, evaluation_id, idempotency_key}`. A 409 maps to `failed(code)`.
- `submitScreenFrame`: proposed `POST /api/sessions/:sid/screen-frames` (multipart). Not in ws6-api-v0 yet.

## Fixture
`createFixtureSource({ latencyMs, failReview, failCommit })`. The `/practice` page reads `?fixture_latency=&fixture_fail=review|commit`.
