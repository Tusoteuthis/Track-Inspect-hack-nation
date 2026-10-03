# Feature Specification: WS5 Sprint 1 — Knowledge schema, eligibility & retrieval

**Feature dir**: `specs/20261004-004251-ws5-sprint-1-knowledge-schema`  **Branch**: `worktree-ws05-sprint-1`  **Created**: 2026-10-04  **Status**: Implemented
**Input**: `notes/ws5-sprints/sprint-1-knowledge-schema.md` (that prompt wins on conflicts)

## User scenarios

### US1 — A knowledge entry is a readable, lossless Markdown document (P1)
WS6 stores, and WS7 renders, an entry as `rev-<n>.md`. A human can read it: the expert's words are blockquotes carrying the exchange id, AI synthesis is under its own heading, and each step shows an image.
**Acceptance:** `parseEntryMarkdown(renderEntryMarkdown(e))` deep-equals `e` for every fixture.

### US2 — Invariants are enforced and reported together (P1)
**Acceptance:** `validateEntry` returns every violation. That covers a missing image, a missing quote, a non-verbatim quote, a confirmed entry without bound confirmation evidence, and a revoked entry without `revoked_at_utc`/`revoked_reason`.

### US3 — Only eligible knowledge teaches (P1)
**Acceptance:** `isTeachable` returns each reason (`not_confirmed`, `superseded`, `revoked`, `off_record_evidence`, `fixture_not_allowed`, `invalid`, `not_knowledge`). `selectEligible` on the fixture set pins exactly the confirmed, current, on-record, valid revisions.

### US4 — Status transitions are a pure table WS6 can call (P2)
**Acceptance:** `nextStatus` is tested exhaustively. A correction never mutates the reviewed revision; it requires a new revision.

### US5 — Explainable retrieval over pinned knowledge (P2)
**Acceptance:** results are deterministic and ranked with a `why`. Eligible guardrails and escalation rules are always included. Ineligible input throws.

## Functional requirements
- FR-001: Types `ws5.v0` in `web/lib/knowledge/schema.ts`, reusing WS3 `Region`, `SignalInterval`, `Source`, `ExpertExchange` and `PointingEvent`.
- FR-002: `signal_interval` and `session_time_ms` are separate and nullable, and neither is derived from the other.
- FR-003: Markdown render/parse with fixed headings, relative image links, and the "Synthesis (AI, not expert words)" heading.
- FR-004: `validateEntry` and `assertQuotesVerbatim` (exact substring of one answer line of the linked exchange).
- FR-005: `nextStatus`, `isTeachable`, `selectEligible` and `retrieve`, exported from `web/lib/knowledge/index.ts`.
- FR-006: Labelled fixtures (`source: "fixture"`, `fixture-session-001`) reusing WS3 events. Placeholder expert wording only.
- FR-007: Schema doc `notes/ws5-sprints/docs/knowledge-schema-v0.md` with the WS6/WS3 mapping, and the handoff note.

## Out of scope
Synthesis (S2), tutor evaluation (S3), routes and storage (WS6), UI (WS7), and any LLM call.

## Success criteria
`cd web && npm run typecheck && npx vitest run` is green, and every acceptance criterion above is covered by a test.
