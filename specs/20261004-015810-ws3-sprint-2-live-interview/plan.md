# Implementation Plan: WS3 Sprint 2 — Live interview quality

**Branch**: `worktree-ws03-sprint-2` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261004-015810-ws3-sprint-2-live-interview/spec.md` + sprint prompt `notes/ws3-sprints/sprint-2-live-interview.md` (wins on conflict).

## Summary

Pointing events stop going straight to the agent. Each event becomes a **topic** (pure `topics.ts`: dedup by channel + IoU + time window, ambiguity, staleness, budget). A **release planner** (pure, in `topics.ts`) decides on every 200 ms tick whether to release, nudge, defer or wait, using speech signals from a pure **speech detector** (`speech.ts`: server VAD, tentative user transcripts, local mic level). The session reducer stores topics, speech marks and release marks; a pure **timing report** (`timing.ts`) derives per-exchange processing latency, intentional wait, agent latency, interruptions and console counters from the stored records and is written as `timing-report.md`. The expert prompt, skip_turn description and turn timeout are tuned and pushed with `sync-agents`; 5 probe cases are added. The console gets counters, a gate-status line, a `pause_ms` control, a topics list, a timing table and a "Run fixture scenario" helper.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22 for scripts

**Primary Dependencies**: Next.js 16, React 19, `@elevenlabs/react` 1.16 (`sendContextualUpdate`, `sendUserMessage`, `getInputVolume`, `onVadScore`, `onDebug`, `onModeChange`), `@elevenlabs/elevenlabs-js` 2.70 (scripts)

**Storage**: local files under `knowledge/sessions/<id>/` via the existing `ExpertSessionStore` (+ `timing-report.md`)

**Testing**: vitest (pure logic, test-first); `npm run probe -- expert --runs 5` (agent behaviour)

**Target Platform**: desktop browser companion page (`/dev`), dev server on port 3102

**Project Type**: web app (single Next.js app in `web/`)

**Performance Goals**: release decision within one 200 ms tick of the pause threshold; processing latency (event → topic ready) < 50 ms

**Constraints**: no new infrastructure; no permanent key in the browser; agent never told an interpretation

**Scale/Scope**: one expert session at a time, ~10–40 events per session

## Constitution Check

| Principle | How this plan complies |
|---|---|
| I. Expert is source of truth | Release text has no interpretation; clarify-first enforced in the reducer (tool returns an error); clarification answers are flagged as never-an-interpretation. |
| II. Verbatim evidence | Control nudges (`[CONTROL] …`) are filtered out of the expert record; answer lines stay verbatim. |
| III. Evidence linkage | Exchanges keep the topic's primary `event_id` fixed at creation; merged aliases are listed in `related_event_ids`; merged events remain stored. |
| IV. Time discipline | Processing latency, intentional wait and agent latency are separate columns; dedup uses receive time only, never signal time. |
| V. Fixtures labelled | Scenario events stay `source: "fixture"`; console and report label them. |
| VI. Trust / off-record | Off-record topics are `dropped_off_record` and never released (further exclusion is Sprint 4). |
| VII. Verifiable increments | topics/speech/timing/scenario test-first; 5 probes ≥ 4/5 with counts; human gate. |
| VIII. Simplicity | Pure modules + existing reducer/store; no new services. |

Gate: **PASS** (re-checked after design: PASS).

## Project Structure

### Documentation (this feature)

```text
specs/20261004-015810-ws3-sprint-2-live-interview/
├── spec.md  plan.md  research.md  data-model.md  quickstart.md  tasks.md
├── contracts/release-protocol.md   # what the agent receives and when
├── contracts/timing-report.md      # report columns and formulas
└── checklists/requirements.md
```

### Source Code

```text
web/lib/expert/
├── contracts.ts        # + Topic, TopicState, InterviewConfig, related_event_ids, topic_id, new marks, validators
├── interview-config.ts # defaults + validation of the tunables
├── topics.ts           # NEW pure: IoU, dedup/ingest, staleness, budget, planRelease
├── speech.ts           # NEW pure: speech detector (VAD / mic / tentative / final)
├── timing.ts           # NEW pure: per-exchange timing, interruptions, counters, timing-report.md
├── scenario.ts         # NEW pure: fixture scenario steps + offset parsing
├── context-update.ts   # + stale / guardrail-pending wording, control nudge, budget state line
├── session.ts          # reducer: topics, release/defer/nudge/speech actions, clarify-first, alias → primary
├── store.ts            # + timing-report.md, counters in session.json
└── render.ts           # + related events, topic info in exchanges.md
web/lib/voice/transcript.ts            # + tentativeUserTextFrom
web/components/voice/VoiceSession.tsx  # + onVadScore, onUserTentative (optional props)
web/components/expert/useExpertSession.ts  # release controller tick, speech ref, scenario runner, control filter
web/components/expert/ExpertConsole.tsx    # counters, gate status, pause_ms, topics, timing table, scenario
agents/expert/system-prompt.md, agents/manifest(.example).json, agents/probes(.example).json
web/scripts/sync-agents.mts (turnTimeout, skipTurnDescription), web/scripts/probe-agents.mts (forbidKinds, requirePatterns, toolOptional)
```

**Structure Decision**: extend the existing `web/lib/expert` modules; every rule that can be pure is pure and tested; React only wires signals and side effects.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Control nudge via `sendUserMessage` after a release | A contextual update cannot trigger a turn, and after `skip_turn` the turn timeout no longer fires, so a released topic could wait until the expert speaks again | Pure contextual release alone: the question may come only after the *next* utterance. The nudge is configurable (`nudge_after_ms`, 0 = off), re-checks the gate first, and its text is filtered from the expert record. |
