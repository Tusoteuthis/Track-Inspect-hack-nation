# Tasks: WS3 Sprint 0 — Capability Spike, Shared Contracts & Test Foundation

**Input**: Design documents from `specs/20261003-235822-ws3-sprint-0-spike-contracts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: requested (Constitution VII: logic is test-first; spec FR-008).

All paths are relative to the worktree root `.claude/worktrees/ws03-sprint-0/`.

## Phase 1: Setup

- [x] T001 Add `vitest` as a devDependency and a `"test": "vitest run"` script in web/package.json
- [x] T002 Create web/vitest.config.mts that maps the `@` alias to the web/ directory and includes `**/*.test.ts`

## Phase 2: Foundational

- [x] T003 Create web/lib/expert/contracts.ts with `SCHEMA_VERSION`, the shared enums, and the `ValidationResult<T>` type (`{ok:true,value}|{ok:false,errors}`)

## Phase 3: User Story 4 — Automated checks exist (P2, enabling for US2/US3)

**Goal**: a working test command. **Independent test**: `npm test` runs and passes.

- [x] T004 [US4] Write a sanity test in web/lib/voice/transcript.test.ts: a final line replaces a tentative line of the same role, and an exact repeat is skipped
- [x] T005 [US4] Run `npm test` in web/ and confirm it passes

## Phase 4: User Story 3 — Labeled sample events (P2)

**Goal**: five valid fixture events plus FIXTURE images. **Independent test**: all fixtures validate and invalid samples are rejected.

- [x] T006 [US3] Write failing tests in web/lib/expert/contracts.test.ts:
  - all 5 fixtures validate and have `source: "fixture"`
  - a missing event_id, a bad mapping_status and an out-of-range region are each rejected with an error message
  - edge cases: a region touching 0/1 is accepted; `x+width>1` is rejected; `signal_interval` with start>end is rejected; a non-null interval must have a unit
- [x] T007 [US3] Implement the PointingEvent type and `validatePointingEvent` in web/lib/expert/contracts.ts until T006 passes
- [x] T008 [P] [US3] Create placeholder SVGs in web/public/fixtures/: trace-a-full.svg, trace-a-evt-001-highlight.svg, trace-a-evt-002-highlight.svg and trace-a-evt-004-highlight.svg. Each has a neutral grid, two unlabeled curves and large "FIXTURE — not real data" text.
- [x] T009 [P] [US3] Create fixtures in web/fixtures/pointing-events/: evt-001-resolved.json, evt-002-resolved-sys2.json, evt-003-repeat-of-001.json, evt-004-ambiguous.json and evt-005-off-record.json. Use session `fixture-session-001` and `source: "fixture"`, with no interpretation in any field.
- [x] T010 [US3] Run `npm test` and confirm all fixture and invalid-input tests pass

## Phase 5: User Story 2 — One shared data contract (P1)

**Goal**: the complete v0 types and a partner-facing summary. **Independent test**: a partner can read each field's meaning and nullability.

- [x] T011 [US2] Add the remaining types to web/lib/expert/contracts.ts: ExpertExchange, CoverageItem, OpenQuestion, DraftRevision, ExpertConfirmation, SessionCompletion, TimingMark and RecordingSegment. Doc-comment the rules, for example that `note` and step `text` are AI synthesis and `answer_lines` are verbatim.
- [x] T012 [P] [US2] Write notes/ws3-sprints/docs/contracts-v0.md: "v0, pending agreement", every record and field with its meaning, nullability and producer, and the open questions for WS2, WS5 and WS6
- [x] T013 [US2] Run `npm run typecheck` in web/ and confirm there are no errors

## Phase 6: User Story 1 — Verified platform facts (P1)

**Goal**: the capability reference. **Independent test**: Q1–Q10 are answered with sources, and the six mechanisms have fallbacks and labels.

- [x] T014 [US1] Receive notes/ws3-sprints/docs/elevenlabs-capabilities.md from the research subagent
- [x] T015 [US1] Review it against FR-001/FR-002: every question has a source, every recommendation has a fallback and a VERIFIED/DOCUMENTED-ONLY label, and the temporary agent was deleted. Fix gaps or mark them as open risks.

## Phase 7: Polish

- [x] T016 Write notes/ws3-sprints/handoff-sprint-0.md (template in the sprint prompt, section A8) with pasted typecheck/test output, decisions, limitations and the human-gate checklist
- [x] T017 Run the quickstart.md checks, mark the tasks done, and commit

## Dependencies

Setup (T001–T002) → Foundational (T003) → US4 (T004–T005) → US3 (T006–T010) → US2 (T011–T013). US1 (T014–T015) runs in parallel, through the subagent, from the start. Polish comes last.

## Parallel examples

- T008 and T009 work on different files and can run in parallel after T007.
- T012 (doc) can be written in parallel with T011.
- US1 runs fully in parallel through the background research agent.

## Implementation strategy

MVP = contracts and fixtures validated by tests (US4 + US3 + US2). The capability doc (US1) arrives asynchronously and is reviewed before the handoff.
