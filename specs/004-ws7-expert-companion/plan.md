# Implementation Plan: WS7 Sprint 3 — Session setup and expert companion

**Branch**: `ws7-sprint-3` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-ws7-expert-companion/spec.md`

## Summary

Replace the `/expert` placeholder with (A) a setup screen (case picker, honest connection status, trace display launcher, optional labelled screen share, Start) plus a full-bleed `/expert/display` route, and (B) the companion: the latest pointing event drawn on its own frame via `EvidenceViewer`, a recent-events strip, real agent status from the WS3 expert flow, and pause/off-record/stop controls in a non-overlapping edge rail. A pure reducer (`companionMachine`) keeps every control `*_pending` until an authoritative `SessionView` (Ack value or `subscribe` push) confirms it. `fixtureSource` gains a per-instance timed expert script (resolved → repeat → ambiguous, acks, drop/restore).

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Next.js 16 App Router

**Primary Dependencies**: `@elevenlabs/react` (status/mode hooks only), WS3 `useExpertSession` + `VoiceSession`

**Storage**: N/A (DataSource; fixtures in `web/fixtures/`)

**Testing**: vitest + Testing Library (jsdom), Playwright (chromium, `PW_PORT`)

**Target Platform**: Desktop Chrome (companion + demo monitor); layout must hold at phone width

**Project Type**: Web application (`web/`)

**Performance Goals**: Event shown within one render of its arrival; resync in one round trip

**Constraints**: No answer keys, no ids as text, FIXTURE banner, acknowledged state only, no speech triggers

**Scale/Scope**: 2 routes, ~10 new modules, 1 fixture script

## Constitution Check

| Principle | How this plan complies |
|---|---|
| I Expert is source of truth | Companion only displays; never sends context/user messages to the agent. |
| II Verbatim evidence | No quotes rendered here; nothing synthesized. |
| III Evidence linkage | Region drawn only on its event's own frame (`frame_id` from the event); mismatch refused. |
| IV Time discipline | Strip shows "session time"; signal interval shown only if present, else "unknown". |
| V Fixtures labelled | `/expert` and `/expert/display` show FIXTURE DATA; cases fixture has `source:"fixture"`. |
| VI Trust / off-record | Off-record indicator only after ack; failure keeps state; gap (agent mute) listed for WS3. |
| VII Verifiable increments | Reducer, mapper, shortcuts, fixture script test-first; outputs pasted in handoff. |
| VIII Simplicity | Extends existing DataSource; no new infrastructure. |

Gate: PASS (pre and post design).

## Project Structure

### Documentation (this feature)

```text
specs/004-ws7-expert-companion/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/data-source-s3.md
└── tasks.md
```

### Source Code

```text
web/
├── app/expert/page.tsx                 # setup ↔ companion ↔ ended
├── app/expert/display/page.tsx         # full-bleed trace display
├── components/companion/               # ExpertSetup, ExpertCompanion, ControlRail, RecentEvents,
│                                       # CompanionAgentStatus, ConnectionPanel, CompanionFixtureControls,
│                                       # useCompanion, companion.module.css, *.test.tsx
├── lib/companion/                      # companionMachine, eventToEvidence, shortcuts, copy (+tests)
├── lib/data/fixtureExpertScript.ts     # timed replay + acks + drop/restore (+test)
├── lib/data/{source,fixtureSource,stubSource}.ts   # additive
├── lib/ui/{contracts,agentState}.ts    # additive / moved helper
├── fixtures/ui/cases.json
└── e2e/expert.spec.ts
```

**Structure Decision**: `companion/` naming avoids colliding with WS3's `components/expert/` and `lib/expert/`.

## Complexity Tracking

None.
