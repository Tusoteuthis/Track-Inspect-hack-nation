# Implementation Plan: WS6 Foundation & Contracts (Sprint 0)

**Branch**: `001-ws6-foundation-contracts` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-ws6-foundation-contracts/spec.md`. The sprint prompt is `notes/ws6-sprints/sprint-0-foundation-contracts.md`, and it wins on conflicts.

## Summary

This sprint lays the WS6 shared-backend foundation inside the existing Next.js app in `web/`:
- **Contracts:** zod transport contracts (`ws6.v0`). The WS3 v0 shapes are mirrored field for field.
- **Fixtures:** one labelled fixture per resource.
- **Store:** a filesystem store with atomic writes and idempotent immutable/mutable puts.
- **Locks:** an in-process per-key lock.
- **IDs:** ID rules and a config module.
- **Route:** `GET /api/health`, the only route this sprint.
- **Docs:** the route map `notes/ws6-api-v0.md` for partners, plus a WS6 section appended to the constitution.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node 20+, Next.js 16 route handlers (App Router)

**Primary Dependencies**: zod ^4 (runtime validation), vitest ^4.1.11 (same as WS3), Node `fs/promises`, `crypto`

**Storage**: local filesystem: `KNOWLEDGE_DIR` (default `../knowledge`) and `RUNTIME_DIR` (default `web/.runtime`)

**Testing**: vitest. Each test runs against a fresh `mkdtemp` directory. Route tests call the handler with `new Request()`.

**Target Platform**: a single `next dev` / `next start` process on a laptop, port 3006 for WS6

**Project Type**: web service (API routes inside an existing Next.js app)

**Performance Goals**: demo scale (one expert and one newcomer session). No throughput targets.

**Constraints**: single process (in-memory locks), no DB/queue/cloud, no `any`, no permanent secrets in clients

**Scale/Scope**: ~15 record types, 1 route, ~20 fixture files, 1 API doc

## Constitution Check

The constitution is WS3's ratified v1.0.0 (merged via `voice`): Principles I–VIII. The gates below combine those principles with the prompt's A2 rules. WS6 appends its own section as v1.1.0.

| Gate | Status |
|---|---|
| No competing specialist logic (WS6 hosts, doesn't implement) | PASS. Contracts treat WS5 content as opaque Markdown and outcome strings. |
| Stable IDs and idempotent PUT-by-ID | PASS. `putImmutable` and `putMutable` implement the rule. |
| Old work never overwrites new state (monotonic rev) | PASS. `putMutable` rejects stale writes. |
| Session time ≠ signal time; declared coordinate frame | PASS. The mirrored WS3 schema keeps both fields separate and the frame declared. |
| Fixtures labelled `source: "fixture"` | PASS. A test asserts this for every fixture. |
| Evaluator key never served | PASS. `EVALUATOR_DIR` lives under the gitignored runtime directory, and nothing serves it this sprint. |
| Simplicity | PASS. Filesystem only, one process. |

Post-design re-check: PASS. There are no violations, so Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-ws6-foundation-contracts/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/README.md   # points to notes/ws6-api-v0.md (canonical route map) + web/lib/contracts
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code

```text
web/
├── vitest.config.mts
├── lib/contracts/        version.ts common.ts expert.ts session.ts asset.ts knowledge.ts
│                         learner.ts assessment.ts bus.ts errors.ts parse.ts index.ts
│                         contracts.test.ts
├── lib/backend/          config.ts ids.ts errors.ts store.ts locks.ts health.ts  (+ *.test.ts)
├── app/api/health/route.ts (+ route.test.ts)
├── fixtures/ws6/         <resource>.json, knowledge-revision.md, fixture-frame*.png
└── scripts/make-fixture-pngs.mts
notes/ws6-api-v0.md
.specify/memory/constitution.md   (append "## WS6 Backend Principles")
.gitignore                        (runtime data dirs)
```

**Structure Decision**: Everything lives in the existing `web/` Next app. Contracts sit in `lib/contracts`, which is safe to import on both client and server. Server-only code sits in `lib/backend`. Route files stay thin.

## Execution: lanes

A shared setup commit (deps, vitest config, gitignore) goes first. After it, three parallel lanes run in nested worktrees, each touching disjoint files:
- **A:** backend primitives plus health
- **B:** contracts plus fixtures
- **C:** API doc plus constitution

Lane A defines its own `ErrorCode` union in `lib/backend/errors.ts`. After the merge it is re-pointed to `@/lib/contracts`.

## Complexity Tracking

None.
