# Implementation Plan: WS7 Newcomer Practice and Pre-Save Review Loop

**Branch**: `ws7-sprint-2` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)
**Input**: `specs/003-ws7-practice-presave/spec.md`. Source of truth: `notes/ws7-sprints/sprint-2-practice-presave.md`, which wins on conflicts.

## Summary
This sprint replaces the `/practice` placeholder with three pieces:
- a pure review reducer, keyed on `{draft_revision, knowledge_revision_id}`, that ignores stale evaluations, guards against double submits and only reaches "saved" after an ack;
- the practice screen: trace, draft form, rectangle marker, status panel, guidance panel with the expert-example dialog, and a timeline;
- a scripted fixture evaluator and committer with latency and failure toggles;
- a tutor voice panel and screen observation through the verified route.

## Technical Context
**Language/Version**: TypeScript 5.9 strict
**Primary Dependencies**: Next.js 16.1, React 19.2, @elevenlabs/react 1.16.0. No new dependencies.
**Storage**: none. Fixtures live in `web/fixtures/ui`.
**Testing**: vitest 4.1 with jsdom opt-in, Testing Library, Playwright (port configurable via `PW_PORT`, default 3100)
**Target Platform**: desktop Chrome
**Constraints**: B2 trust rules. Touch only `/practice`, `components/practice/` and `lib/practice/`, plus additive changes to contracts, data and fixtures. S1 edits `contracts.ts`, `source.ts`, `fixtureSource.ts` and `workmap.json` in parallel, so diffs to those files stay minimal and the fixture practice logic lives in its own module.
**Scale/Scope**: 1 route, about 15 modules, about 60 new tests

## Constitution Check
| Principle / gate | How the design satisfies it |
|---|---|
| I Expert is source of truth | The fixture evaluator never inspects the draft and contains no answer. Citations are the expert's verbatim quotes from the workmap fixture. |
| II Verbatim evidence | Quotes are rendered in a distinct "Expert's words" block. The tutor and fixture message is labelled as guidance. |
| III Evidence linkage | Each citation carries entry_id/revision_id plus an EvidenceRef, and the dialog uses EvidenceViewer with frame checks. |
| V Fixtures labelled | `FixtureBanner`, plus "Fixture behaviour" in the scripted messages and a fixture-controls note. |
| VI Answer keys | The evaluator-field regex test covers the fixtures, and the build output is grepped. |
| VI Secrets | Only the existing token route is used. |
| VII Verifiable | Reducer, adapter, region math and capture reducer are built TDD. Component and e2e tests are included, and the human gate stays. |
| VIII Simplicity | Everything sits behind DataSource. No new infrastructure. |
| B2 UI does not trigger speech | Only `sendContextualUpdate`. No `sendUserMessage`, and no multimodal message unless the spike proves it is silent. |
| B2 Acknowledged state only | "saved" only follows SAVE_ACKED. |

Post-design re-check: pass.

## Project Structure
```text
web/lib/practice/reviewMachine.ts (+test)         pure reducer
web/lib/practice/outcomeToReviewState.ts (+test)  WS5 outcome adapter
web/lib/practice/reviewCopy.ts                    icon/label/disabled reason
web/lib/practice/regionDraw.ts (+test)            pointer points → normalized region
web/lib/practice/timeline.ts (+test)              transition → timeline entry
web/lib/practice/screenCapture.ts (+test)         capture state reducer
web/lib/practice/useScreenObservation.ts          getDisplayMedia + frame grab
web/lib/practice/contextMessages.ts (+test)       structured UI event → contextual-update text
web/lib/data/fixturePractice.ts (+test)           scripted evaluator/committer, latency/failure
web/lib/data/source.ts / fixtureSource.ts         + submitScreenFrame, commit options, createFixtureSource
web/lib/ui/contracts.ts                           + ReviewStatus, PracticeTimelineEntry, ScreenFrameRef, evaluation_id?
web/components/practice/*.tsx + practice.module.css (+tests)
web/app/practice/page.tsx
web/e2e/practice.spec.ts
notes/ws7-screen-observation.md, notes/ws7-sprints/handoff-sprint-2.md
```

## Complexity Tracking
| Deviation | Why |
|---|---|
| SAVE_REQUESTED is also allowed from `save_failed` | Retry needs it. The same reviewed revision and evaluation are still current, and the reducer re-checks this. |
| `uncertain` maps to guidance_needed | Fails closed until WS5 confirms. |
| Optional `PW_PORT` in playwright.config | Avoids a port collision with S1's parallel runs. |
