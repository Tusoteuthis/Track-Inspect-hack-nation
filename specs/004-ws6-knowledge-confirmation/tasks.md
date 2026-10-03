# Tasks: WS6 Knowledge Revisions & Confirmation (Sprint 2)

TDD: each backend task writes its vitest tests first (fresh temp KNOWLEDGE_DIR/RUNTIME_DIR).

## Phase 1 — Setup
- [x] T001 Merge `worktree-ws05-sprint-2` into the feature branch (human decision); regenerate WS5's gitignored `fixtures/ws5/synthesis/out/` locally
- [x] T002 Add `job` to `IdPrefix` (`web/lib/backend/ids.ts`)

## Phase 2 — Contracts
- [ ] T003 KnowledgeRevision optional `session_id`/`content_sha256`/`change_reason`; `StatusTransition` (`web/lib/contracts/knowledge.ts`)
- [ ] T004 `Job`, `Gap`, `GapsView`, `SessionDraftView`, `ConfirmationRequest` (WS6 + WS3 forms) (`web/lib/contracts/synthesis.ts`)
- [ ] T005 `WorkMapView` (`web/lib/contracts/workmap.ts`); tests in `contracts/synthesis.test.ts`

## Phase 3 — Lane B: revision store (US1)
- [ ] T006 [US1] `knowledge.ts`: frontmatter render/parse, module-frontmatter preservation (D16), write revision + current.json under lock, dedupe (D19), list/get entries and revisions, status log (D17), workflow.md + linkage (D21)

## Phase 4 — Lane A: modules, stub, jobs (US1)
- [ ] T007 [US1] `modules.ts` registry + WS5 adapter wiring; `synthesis-stub.ts`
- [ ] T008 [US1] `jobs.ts` job records; `synthesis.ts` snapshot/run/verify/persist, gaps.json, draft.json, bus events
- [ ] T009 [US1] Tests: rev-1 with valid frontmatter + resolvable images; no-dup re-run; discarded job; failed job; one active job; stub marking; real module on replayed fixtures

## Phase 5 — Lane C: confirmation, Work Map (US2, US3)
- [ ] T010 [US2] `confirmations.ts` + tests (confirm current, 409 stale after supersede, invalid exchange cases, idempotent replay, corrected → rev-2 via re-synthesis, unresolved)
- [ ] T011 [US3] `workmap.ts` + tests (image URLs return 200, verbatim lines, broken link reported, default vs include=draft)

## Phase 6 — Routes, health
- [ ] T012 Route handlers (thin) + route tests
- [ ] T013 `/api/health.modules` reports the active synthesis module

## Phase 7 — Polish
- [ ] T014 Update `notes/ws6-api-v0.md` (S2 rows, §5.12 notes, D16–D28)
- [ ] T015 Live run on `npm run dev -- -p 3006`: replay-capture → synthesis → confirm → workmap
- [ ] T016 `notes/ws6-sprints/handoff-sprint-2.md`
