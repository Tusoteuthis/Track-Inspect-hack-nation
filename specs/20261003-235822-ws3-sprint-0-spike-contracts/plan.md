# Implementation Plan: WS3 Sprint 0 — Capability Spike, Shared Contracts & Test Foundation

**Branch**: `worktree-ws03-sprint-0` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20261003-235822-ws3-sprint-0-spike-contracts/spec.md`

## Summary

This sprint lays the foundation for the WS3 sprints in three parts:
1. A sourced ElevenLabs capability reference with recommended mechanisms, produced by a research subagent in parallel.
2. A ratified constitution (done).
3. The v0 shared data contracts as TypeScript types with dependency-free validators, five labeled fixture pointing events with FIXTURE placeholder images, a vitest test runner, and a partner-facing contract summary.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node 26 (local)

**Primary Dependencies**: Next.js 16, React 19, `@elevenlabs/react` ^1.16, `@elevenlabs/elevenlabs-js` ^2.70. New: `vitest` (dev only)

**Storage**: N/A in this sprint. Fixtures are static JSON files.

**Testing**: vitest (`npm test` → `vitest run`)

**Target Platform**: Browser (Next.js app) and Node scripts

**Project Type**: Web application (single Next.js project in `web/`)

**Performance Goals**: N/A (foundation sprint)

**Constraints**:
- No new runtime dependencies; validators are hand-written.
- Fixtures carry no trace interpretation.
- All work stays in the worktree.

**Scale/Scope**: 9 record types, 5 fixtures, ~3 test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan complies | Status |
|---|---|---|
| I. Expert is source of truth | Fixtures and images contain no interpretation; `label` is a dev-only hint and is documented as never sent to the agent | PASS |
| II. Verbatim evidence | Contracts separate verbatim `answer_lines` from AI `note`/step `text`; nullable fields use `null` | PASS |
| III. Evidence linkage | `ExpertExchange.event_id`, step `supporting_*_ids`, `ExpertConfirmation.revision_id` are required fields | PASS |
| IV. Time discipline | `session_time_ms` and `signal_interval` are distinct; validators never derive one from the other; `TimingMark` keeps `at_perf_ms` for latency math | PASS |
| V. Fixtures labeled | `source: "fixture"` is required in all fixtures (test enforced); images show "FIXTURE" | PASS |
| VI. Trust | `record_state` is on every event and exchange; `RecordingSegment` and `SessionCompletion.excluded` are defined; no secrets touched | PASS |
| VII. Verifiable increments | vitest added; validators developed test-first; no agent behavior yet (no probes needed) | PASS |
| VIII. Simplicity | No zod or other runtime deps; plain types plus small validators | PASS |

Post-design re-check: PASS (no new deviations introduced by data-model or contracts).

## Project Structure

### Documentation (this feature)

```text
specs/20261003-235822-ws3-sprint-0-spike-contracts/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── pointing-event.schema.md   # External input contract (WS2 → WS3)
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
web/
├── vitest.config.mts                 # NEW: "@" alias → web/
├── package.json                      # + vitest devDependency, "test" script
├── lib/
│   ├── voice/transcript.test.ts      # NEW: sanity test
│   └── expert/
│       ├── contracts.ts              # NEW: v0 types, SCHEMA_VERSION, validators
│       └── contracts.test.ts         # NEW: fixture + invalid-input tests
├── fixtures/pointing-events/*.json   # NEW: 5 fixture events
└── public/fixtures/*.svg             # NEW: FIXTURE placeholder images

notes/ws3-sprints/
├── docs/elevenlabs-capabilities.md   # research subagent
├── docs/contracts-v0.md              # NEW: partner summary
└── handoff-sprint-0.md               # NEW
```

**Structure Decision**: the existing single Next.js project in `web/`. The expert-domain code lives in `web/lib/expert/`, next to the existing `web/lib/voice/`.

## Complexity Tracking

No constitution violations to justify.
