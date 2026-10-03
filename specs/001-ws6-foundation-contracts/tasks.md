---
description: "Tasks for WS6 Sprint 0 — Foundation & contracts"
---

# Tasks: WS6 Foundation & Contracts (Sprint 0)

**Input**: `specs/001-ws6-foundation-contracts/` (plan.md, spec.md, data-model.md, research.md, contracts/, quickstart.md)

**Tests**: Required. The sprint prompt mandates TDD for all backend logic, so in each story the tests are written before the implementation.

**Lanes**:
- Lane A = US2 + US3, in `web/lib/backend`, `app/api/health`
- Lane B = US1, in `web/lib/contracts`, `web/fixtures/ws6`
- Lane C = US4, in `notes/ws6-api-v0.md` and the constitution

The lanes touch disjoint files and run in parallel after Phase 1.

## Phase 1: Setup (shared, before lanes split)

- [X] T001 Merge `voice` into the base (WS3 vitest and contracts arrive with it), then add `zod` ^4 to web/package.json.
- [X] T002 [P] Reuse the existing vitest config from `voice` (no new config).
- [X] T003 [P] Add `knowledge/sessions/`, `knowledge/images/`, `knowledge/assessments/` and `web/.runtime/` to .gitignore.
- [X] T004 Commit the setup on `001-ws6-foundation-contracts`, then create the nested lane worktrees `.claude/worktrees/ws06-s0-lane{A,B,C}`.

## Phase 2: Foundational

None beyond Phase 1. Lane A defines its own `ErrorCode` union in web/lib/backend/errors.ts and is re-pointed to contracts in Phase 7.

## Phase 3: User Story 1 — Agreed record shapes (P1) · Lane B

**Goal**: zod contracts plus labelled fixtures for every resource in data-model.md.
**Independent test**: `npx vitest run lib/contracts`.

- [ ] T010 [P] [US1] Write failing tests in web/lib/contracts/contracts.test.ts:
  - every fixture in web/fixtures/ws6 parses with its mapped schema and has `source: "fixture"` where the record has a source field
  - every session-scoped fixture has `session_id: "fixture-session-001"`
  - rejections: missing ID, bad enum, region x<0, x>1, x+width>1, width 0, IDs `../x`, `A-B`, `a/b`, `-a`, BusEvent with an extra `text` field, empty-string `trace_id`
  - the asset fixture's sha256 and width/height match the PNG files
  - `toConfirmation` maps the WS3 ExpertConfirmation
- [ ] T011 [P] [US1] Create web/lib/contracts/version.ts (`SCHEMA_VERSION = "ws6.v0"`), web/lib/contracts/parse.ts (`ParseResult`, `makeParser(schema)` turning zod issues into `{path, message}`), and web/lib/contracts/common.ts (`IdSchema`, `UtcSchema`, `SourceSchema`, `Ws3SourceSchema`, `RecordStateSchema`, `RegionSchema`, `SignalIntervalSchema`).
- [ ] T012 [US1] Create web/lib/contracts/expert.ts. It re-exports the WS3 types from `@/lib/expert/contracts` and wraps them in zod schemas: PointingEvent (+ `asset_id?`), AnswerLine, ExpertExchange (+ `rev?`), CoverageItem, OpenQuestion, DraftStep, DraftRevision, ExpertConfirmation, TimingMark, RecordingSegment. A compile-time check asserts that each schema's output type equals the WS3 type.
- [ ] T013 [P] [US1] Create the WS6 record files:
  - web/lib/contracts/session.ts (Session)
  - asset.ts (EvidenceAsset, AssetFile)
  - knowledge.ts (KnowledgeEntry, KnowledgeRevision, EntryStatus, Confirmation, `toConfirmation`)
  - learner.ts (LearnerDraft, Evaluation, Commit)
  - assessment.ts (Assessment)
  - bus.ts (strict BusEvent)
  - errors.ts (`ErrorCode`, `ERROR_STATUS` map, ApiErrorBody)
- [ ] T014 [US1] Create web/lib/contracts/index.ts re-exporting everything, with a `parseX` for each record.
- [ ] T015 [US1] Create web/scripts/make-fixture-pngs.mts, which uses node zlib to write 2 small labelled PNGs (gray frame, "FIXTURE" block pattern; highlighted version with a red rectangle). Run it once to produce web/fixtures/ws6/fixture-frame.png and fixture-frame-highlighted.png.
- [ ] T016 [US1] Create web/fixtures/ws6/*.json, one per record:
  - session, session-newcomer, evidence-asset, pointing-event, expert-exchange, draft-revision, expert-confirmation
  - knowledge-entry, knowledge-revision (+ knowledge-revision.md with JSON frontmatter in a `---` block), confirmation
  - learner-draft, evaluation, commit, assessment
  - bus-event, api-error, recording-segment, timing-mark, coverage-item, open-question

  Also add a README.md stating these are fixtures. All text is neutral, e.g. "FIXTURE expert answer line 1".
- [ ] T017 [US1] Make T010 pass, then run typecheck and commit.

## Phase 4: User Story 2 — Idempotent, atomic storage (P1) · Lane A

**Goal**: config, ids, store, locks.
**Independent test**: `npx vitest run lib/backend`.

- [ ] T020 [P] [US2] Write failing tests in web/lib/backend/ids.test.ts:
  - `isValidId` / `assertSafeId` accept or reject correctly (traversal, uppercase, leading hyphen, length 65)
  - `newId` prefixes and format
  - `safeJoin` rejects bad segments and stays inside its base
- [ ] T021 [P] [US2] Write failing tests in web/lib/backend/locks.test.ts:
  - concurrent `withLock` on the same key never overlaps and runs FIFO
  - different keys may overlap
  - a rejection releases the lock
- [ ] T022 [P] [US2] Write failing tests in web/lib/backend/store.test.ts, each against an mkdtemp dir:
  - `writeJsonAtomic` round trip
  - a failure on rename (via an injected fs or `vi.spyOn`) leaves the target unchanged or absent and no `.tmp` file
  - `readJson`: missing file returns null; invalid JSON or schema raises `validation_failed`
  - `putImmutable`: 201, then same body 200 (key order irrelevant), then different body `conflict_immutable` with the stored record unchanged
  - `putMutable`: create 201, higher rev 200 replaced, lower rev `stale_revision`, equal rev with different body `stale_revision`, equal rev with same body 200 no-op
  - concurrent `putImmutable` of the same new record yields one 201 and one 200
- [ ] T023 [P] [US2] Write web/lib/backend/config.test.ts: defaults resolve to absolute paths, env overrides work, `setConfigForTests`/`resetConfig` work.
- [ ] T024 [US2] Implement web/lib/backend/errors.ts: `ApiError` class (code, status, message, details), `ERROR_STATUS` map, `toErrorResponse(err)` (unknown errors → 500 `internal`, without leaking the message).
- [ ] T025 [US2] Implement web/lib/backend/ids.ts. Include a doc comment stating the idempotency rule.
- [ ] T026 [US2] Implement web/lib/backend/locks.ts: per-key promise chain. Include a comment stating the single-process assumption.
- [ ] T027 [US2] Implement web/lib/backend/config.ts.
- [ ] T028 [US2] Implement web/lib/backend/store.ts: `writeFileAtomic`, `writeJsonAtomic`, `readJson`, `canonicalJson`, `putImmutable`, `putMutable`.
- [ ] T029 [US2] Make T020–T023 pass, then commit.

## Phase 5: User Story 3 — Health check (P2) · Lane A

- [ ] T030 [US3] Write failing test web/app/api/health/route.test.ts: with `setConfigForTests` pointing at temp dirs, `GET()` returns 200 with the exact keys. When the knowledge dir is unwritable (a path under a file), it returns 503 with `ok: false`.
- [ ] T031 [US3] Implement web/lib/backend/health.ts (`checkHealth()`: mkdir -p + `fs.access` W_OK) and web/app/api/health/route.ts (`runtime = "nodejs"`, `dynamic = "force-dynamic"`, thin).
- [ ] T032 [US3] Make it pass, then commit.

## Phase 6: User Story 4 — Route map + constitution (P2) · Lane C

- [ ] T040 [P] [US4] Write notes/ws6-api-v0.md with these sections:
  - Status and conventions: IDs, idempotency, rev, nulls, time separation, the error envelope and codes table, BusEvent and SSE replay, the single-process note
  - Storage layout
  - Resource table → schema names
  - Route table grouped by session, assets, events/exchanges, stream, synthesis/draft/gaps, knowledge/confirmations/workmap, newcomer/case/draft/evaluation/commit/assessment, correction/revocation/deletion, health/diagnostics/token. Each row gives method, path, request/response schema, idempotency, errors, SSE events emitted and sprint.
  - Asset mapping
  - Per-partner sections WS2/WS3/WS5/WS7 (what they call, plus open questions)
  - Decisions on conflicts
- [ ] T041 [P] [US4] Append `## WS6 Backend Principles` to WS3's v1.0.0 .specify/memory/constitution.md. Bump the version to 1.1.0 and add a Sync Impact note. Do not rewrite WS3's content.
- [ ] T042 [US4] Commit.

## Phase 7: Polish & integration (on the feature branch after merging the lanes)

- [ ] T050 Merge lane branches A, B and C into `001-ws6-foundation-contracts`, then remove the nested worktrees and lane branches.
- [ ] T051 Re-point web/lib/backend/errors.ts to import `ErrorCode`/`ERROR_STATUS` from `@/lib/contracts` (one source of truth), then run tests.
- [ ] T052 Run `npm run typecheck`, `npx vitest run`, `npm run dev -- -p 3006` and `curl /api/health`, and capture the output. Stop the server.
- [ ] T053 Check `git status` for no runtime data. Write notes/ws6-sprints/handoff-sprint-0.md (template A8) and commit.

## Dependencies

- Phase 1 → (Phase 3 ∥ Phases 4–5 ∥ Phase 6) → Phase 7.
- Within each story, tests come before implementation. US3 depends on US2's config and errors.

## Parallel examples

- **Lane B:** T010, T011 and T013 in parallel.
- **Lane A:** T020, T021, T022 and T023 in parallel.
- **Lane C:** T040 and T041 in parallel.

## Implementation strategy

The MVP is US1 + US2 (the contracts and storage partners depend on), followed by US3 and US4. All four are delivered this sprint.
