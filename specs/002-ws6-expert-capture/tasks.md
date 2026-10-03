# Tasks: WS6 Expert Capture Path (Sprint 1)

**Input**: `specs/002-ws6-expert-capture/` (spec, plan, research R1–R14, data-model, contracts)
**Tests**: required (prompt mandates TDD; every test uses fresh temp `KNOWLEDGE_DIR`/`RUNTIME_DIR`).
Paths are relative to the worktree root; `web/` is the Next app (alias `@/` → `web/`).

## Phase 1: Setup

- [ ] T001 Add `seg` to `IdPrefix` in web/lib/backend/ids.ts and a test in web/lib/backend/ids.test.ts
- [ ] T002 Add request/response schemas `CreateSessionRequestSchema`, `LifecycleRequestSchema`, `RecordStateRequestSchema` (web/lib/contracts/session.ts), `AssetUploadMetaSchema` (web/lib/contracts/asset.ts), `EventAckSchema`, `ExchangePutSchema` (web/lib/contracts/expert.ts) with tests in web/lib/contracts/requests.test.ts
- [ ] T003 Add `ASSET_MAX_BYTES` (default 15 MiB) to web/lib/backend/config.ts and a test in web/lib/backend/config.test.ts

## Phase 2: Foundational (lead, before lanes)

- [ ] T004 Test-first `diag()` allow-list + daily ndjson append in web/lib/backend/diag.ts / diag.test.ts (content keys dropped, invalid ids dropped, never throws)
- [ ] T005 `handleRoute({component, op, ids}, fn)` timing + diag + `toErrorResponse` in web/lib/backend/route.ts with web/lib/backend/route.test.ts
- [ ] T006 Path helpers `sessionDir`, `imagesRoot`, `assetDir` in web/lib/backend/paths.ts
- [ ] T007 Test-first bus: `appendBus`, `readBusAfter`, `subscribe`, `findBusSeq` in web/lib/backend/bus.ts / bus.test.ts (monotonic seq, persist then publish, replay after N exact and ordered, torn last line skipped, unsubscribe)
- [ ] T008 Test-first pure lifecycle `applyLifecycle`, `applyRecordState` in web/lib/backend/session-lifecycle.ts / session-lifecycle.test.ts (all table cells incl. illegal → invalid_transition, stale rev, no-op)
- [ ] T009 Test-first sessions lib `createSession` (Idempotency-Key), `getSession`, `changeLifecycle`, `changeRecordState`, `requireWritableSession`, `requireActiveSession` in web/lib/backend/sessions.ts / sessions.test.ts (emits `session.updated`, `record_state.changed`)

**Checkpoint**: commit foundation; spawn lanes from it.

## Phase 3: US1 — session lifecycle routes (Lane A)

- [ ] T010 [P] [US1] `POST /api/sessions` in web/app/api/sessions/route.ts
- [ ] T011 [P] [US1] `GET /api/sessions/:sid` in web/app/api/sessions/[sid]/route.ts
- [ ] T012 [P] [US1] `POST …/lifecycle` in web/app/api/sessions/[sid]/lifecycle/route.ts
- [ ] T013 [P] [US1] `POST …/record-state` in web/app/api/sessions/[sid]/record-state/route.ts
- [ ] T014 [US1] Route tests web/app/api/sessions/sessions.routes.test.ts (201/200 replay, illegal transition 409, stale rev 409, bad id 400, diag line written)

## Phase 4: US2 + US4 — assets, events, exchanges (Lane B)

- [ ] T015 [P] [US2] Test-first `sniffImage` (PNG/JPEG type + dims) in web/lib/backend/image-info.ts / image-info.test.ts
- [ ] T016 [US2] Test-first `putAsset`, `getAsset`, `readAssetFile` in web/lib/backend/assets.ts / assets.test.ts (same hash 200, different 409, off-record 403 nothing written, dims mismatch 400, size cap, meta written last, traversal impossible incl. symlink in images root → 404, deleted → 404)
- [ ] T017 [US2] Test-first `putEvent`, `listEvents`, `getEvent` in web/lib/backend/events.ts / events.test.ts (same PUT twice → one file + identical ack; different body 409; missing asset 409 nothing stored and no bus line; asset of other session / no highlighted 409; refs rewritten; path mismatch 400; ordering by captured_at then arrival; crash-recovery seq)
- [ ] T018 [US4] Test-first `putExchange`, `listExchanges`, `getExchange` in web/lib/backend/exchanges.ts / exchanges.test.ts (stale rev 409 unchanged; event_id change 409; late answer after newer events keeps event_id; unknown event 404; null event_id ok; emits on create/higher rev only)
- [ ] T019 [P] [US2] Routes `PUT /api/sessions/:sid/assets/:aid`, `GET /api/assets/:aid{,/original,/highlighted}` in web/app/api/sessions/[sid]/assets/[aid]/route.ts and web/app/api/assets/[aid]/{route,original/route,highlighted/route}.ts
- [ ] T020 [P] [US2] Routes events in web/app/api/sessions/[sid]/events/route.ts and [eid]/route.ts
- [ ] T021 [P] [US4] Routes exchanges in web/app/api/sessions/[sid]/exchanges/route.ts and [xid]/route.ts
- [ ] T022 [US2] Route tests web/app/api/sessions/capture.routes.test.ts (multipart upload, image read headers, traversal `..%2F` → 400/404, event ack)

## Phase 5: US3 — live stream (Lane C)

- [ ] T023 [US3] Test-first `sessionStream(sid, {after, signal, heartbeatMs})` in web/lib/backend/sse.ts / sse.test.ts (replay then live without gaps/dupes, heartbeat, cleanup on abort)
- [ ] T024 [US3] `GET /api/sessions/:sid/stream` in web/app/api/sessions/[sid]/stream/route.ts + route test reading first chunks with Last-Event-ID

## Phase 6: US5 — session-scoped voice token (Lane A)

- [ ] T025 [US5] Extend web/app/api/conversation-token/route.ts with `?session_id=` + test web/app/api/conversation-token/route.test.ts (404, 409 not active, unchanged without param, key never in body)

## Phase 7: US7 — replay script (Lane C)

- [ ] T026 [US7] web/scripts/replay-capture.mts + `replay-capture` npm script in web/package.json

## Phase 8: Polish

- [ ] T027 Merge lanes; `npm run typecheck`, `npx vitest run`
- [ ] T028 Dev server on 3006: replay ×2, file counts, SSE replay with Last-Event-ID
- [ ] T029 Update notes/ws6-api-v0.md (S1 routes implemented, error details, decisions) and write notes/ws6-sprints/handoff-sprint-1.md

## Dependencies

Setup → Foundational → {Lane A (US1, US5), Lane B (US2, US4), Lane C (US3, US7)} in parallel → Polish. US6 (diag) is delivered in Foundational and exercised by every route.

## Parallel example

After T009: Lane A agent runs T010–T014, T025; Lane B agent runs T015–T022; Lane C agent runs T023, T024, T026 — disjoint files.

## Implementation strategy

MVP = Foundational + US2/US4 (the robustness core). Lanes merge as they finish; replay script validates end-to-end.
