# Implementation Plan: WS6 Expert Capture Path (Sprint 1)

**Branch**: `002-ws6-expert-capture` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: `specs/002-ws6-expert-capture/spec.md`; sprint prompt `notes/ws6-sprints/sprint-1-expert-capture-path.md` (wins on conflicts, except where the approved route map `notes/ws6-api-v0.md` D7/D8 supersedes it — see research R1).

## Summary

Flow steps 1–3 on the S0 foundation: expert sessions with a pure lifecycle state machine and record state; multipart evidence upload with hash idempotency and safe reads; immutable, idempotent pointing events with asset-availability checks and stable acks; versioned exchanges with an immutable event link; a per-session persisted SSE bus with replay; session-scoped voice tokens; an allow-list diagnostics log; a fixture replay script.

## Technical Context

**Language/Version**: TypeScript 5.9 strict, Node 20+, Next.js 16 route handlers
**Primary Dependencies**: zod ^4, vitest ^4 (existing). No new dependencies.
**Storage**: filesystem via S0 `store.ts` (`putImmutable`, `putMutable`, `writeFileAtomic`)
**Testing**: vitest, fresh `mkdtemp` `KNOWLEDGE_DIR`/`RUNTIME_DIR` per test; route tests call handlers with `new Request()`
**Target Platform**: one `next dev` process, port 3006, LAN via `-H 0.0.0.0`
**Project Type**: web service inside the existing Next app
**Performance Goals**: demo scale; event PUT → SSE delivery well under 1 s
**Constraints**: single process (in-memory locks + bus), no `any`, IDs-only logs and SSE
**Scale/Scope**: ~14 routes, ~9 lib modules, 1 script

## Constitution Check

| Gate | Status |
|---|---|
| W1 authoritative state | PASS — lifecycle/record state only changed by server routes; guards server-side |
| W2 idempotent stable IDs | PASS — assets (hash), events (`putImmutable`), exchanges (`putMutable`), session create (Idempotency-Key) |
| W3 revision-bound | PASS — lifecycle requires current `rev`; exchanges monotonic `rev` |
| W4 off-record not stored | PASS (S1 minimum) — content writes refused while off-record; diag/SSE IDs only |
| W5 labelled fixtures | PASS — replay script sends `source:"fixture"` everywhere |
| W6 evaluator key | PASS — asset reads confined to `knowledge/images`, runtime dir rejected |
| W7 time/frames | PASS — events stored as received apart from image-ref rewrite |
| W8 simplicity | PASS — fs + in-process bus; single-process assumption documented in `bus.ts` |

Post-design re-check: PASS. No complexity tracking needed.

## Project Structure

```text
web/lib/contracts/   session.ts (+requests), asset.ts (+AssetUploadMeta), expert.ts (+EventAck, ExchangePut)
web/lib/backend/
  route.ts             handleRoute(): timing + diag + toErrorResponse
  diag.ts              allow-list diagnostics
  bus.ts               appendBus / readBusAfter / subscribe (persist then publish)
  sse.ts               sessionStream(): replay + live + heartbeat + cleanup
  session-lifecycle.ts pure applyLifecycle / applyRecordState
  sessions.ts          create/get/changeLifecycle/changeRecordState/requireWritableSession/requireActiveSession
  image-info.ts        PNG/JPEG sniff + dimensions
  assets.ts            putAsset / getAsset / readAssetFile
  events.ts            putEvent / listEvents / getEvent
  exchanges.ts         putExchange / listExchanges / getExchange
  paths.ts             sessionDir / imagesRoot helpers
web/app/api/sessions/route.ts
web/app/api/sessions/[sid]/{route,lifecycle/route,record-state/route,stream/route}.ts
web/app/api/sessions/[sid]/assets/[aid]/route.ts
web/app/api/sessions/[sid]/events/{route,[eid]/route}.ts
web/app/api/sessions/[sid]/exchanges/{route,[xid]/route}.ts
web/app/api/assets/[aid]/{route,original/route,highlighted/route}.ts
web/app/api/conversation-token/route.ts   (+ session_id)
web/scripts/replay-capture.mts            (+ npm script)
```

## Execution: lanes

1. **Foundation (lead, sequential)**: contract additions, `paths.ts`, `diag.ts`, `route.ts`, `bus.ts`, `session-lifecycle.ts`, `sessions.ts` (lib) — these are the shared interfaces every lane imports.
2. **Parallel lanes** in nested worktrees branched from the foundation commit:
   - **A**: session routes (create/get/lifecycle/record-state) + conversation-token extension + route tests.
   - **B**: `image-info`, `assets`, `events`, `exchanges` libs + their routes + tests.
   - **C**: `sse.ts` + stream route + replay script + npm script.
3. Merge lanes, full verification, replay ×2 against dev server, handoff + api doc.

## Complexity Tracking

None.
