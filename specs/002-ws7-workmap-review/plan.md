# Implementation Plan: WS7 Clickable Work Map and Debrief/Review View

**Branch**: `ws7-sprint-1` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)
**Input**: `specs/002-ws7-workmap-review/spec.md`. Source of truth: `notes/ws7-sprints/sprint-1-work-map-review.md` (wins on conflicts).

## Summary

Replace the `/map` and `/review` placeholders with real screens on the S0 data layer:

- a shared, keyboard-navigable `WorkMapList` (ordered process, kind label, status badge) and `WorkMapDetail` (EvidenceViewer + evidence selector, expert quotes, apprentice summary, reasoning, guardrails, status-specific notices)
- `/map` with URL-carried selection (`?entry=&rev=`)
- `/review` with revision label, changed-since-previous indicator, change markers and old → new, open questions (WS3 `OpenQuestion`), teach-back confirmation status (WS3 `ExpertConfirmation`), and supplementary marks with pending/acknowledged/failed
- a scripted fixture review sequence (Revision 1 → correction → Revision 2 → confirmed) pushed through `subscribe`

Pure logic (list navigation, deep-link resolution, revision diff, review update reducer, mark-action reducer, WS3 mappers, status presentation) is written test-first.

## Technical Context

**Language/Version**: TypeScript 5.9 strict
**Primary Dependencies**: Next.js 16.1 App Router, React 19.2 (no new dependencies)
**Storage**: none; fixtures in `web/fixtures/ui/*.json`
**Testing**: vitest 4.1 (`web/vitest.config.ts`, jsdom opt-in), Testing Library, Playwright on port 3100
**Target Platform**: desktop Chrome on the demo display
**Project Type**: web application (`web/`)
**Performance Goals**: none specific
**Constraints**: B2 trust rules; touch only `/map`, `/review`, `components/workmap/`, `components/review/`, plus additive contract/data/fixture changes (S2 runs in parallel)
**Scale/Scope**: 2 routes, ~12 modules, 3 new fixture files, ~50 new tests

## Constitution Check

`.specify/memory/constitution.md` is still the template (WS3 owns it), so the B2 rules are the gates:

| Gate | How the design satisfies it |
|---|---|
| Expert words vs AI summary | Separate labelled regions "Expert's words" / "Apprentice summary"; reasoning and guardrails styled as non-verbatim |
| Status honesty | One `statusPresentation()` map; only `confirmed` yields "Confirmed"; revoked/missing hide teaching content; ambiguity handled by EvidenceViewer |
| Acknowledged state only | Mark actions go through `DataSource.submitReviewMark` → `Ack`; reducer shows pending until ack; no optimistic success |
| Spoken confirmation | No approve control; confirmation shown only from an `ExpertConfirmation` for the exact revision |
| UI does not trigger speech | Marks are data-source requests only; no voice code on these pages |
| Labelled fixtures | Fixture playback panel only when the source is `fixtureSource`; banner from `source` |
| No second backend | All data via `DataSource` (`getReview`, `submitReviewMark`, `subscribe`) |
| No internal ids as text | Labels use `revision_label` and "Evidence N"; smoke test guards `<main>` |

Post-design re-check: pass.

## Project Structure

```text
specs/002-ws7-workmap-review/  plan.md research.md data-model.md quickstart.md contracts/ tasks.md

web/lib/ui/contracts.ts               + revision_label, parent_revision_id, change_reason on WorkMapView; ReviewView; ReviewMark
web/lib/ui/status.ts (+test)          status → icon/label/teachable
web/lib/workmap/listNav.ts (+test)    arrow/Home/End navigation
web/lib/workmap/deepLink.ts (+test)   ?entry&rev → selection + notice
web/lib/review/revisionDiff.ts (+test)
web/lib/review/reviewState.ts (+test) review update reducer
web/lib/review/markState.ts (+test)   pending/acknowledged/failed reducer
web/lib/review/ws3Mappers.ts (+test)  OpenQuestion / ExpertConfirmation → view helpers
web/lib/data/source.ts                + getReview, submitReviewMark; SourceUpdate "review"
web/lib/data/fixtureReviewScript.ts (+test)  scripted sequence, listeners, controls
web/lib/data/fixtureSource.ts         wire the script in (small diff)
web/fixtures/ui/workmap.json          rev-1 (updated: labels, 6 items)
web/fixtures/ui/workmap-rev-2.json, workmap-rev-2-confirmed.json, review-script.json
web/components/workmap/{WorkMapList,WorkMapDetail,StatusBadge,WorkMapScreen}.tsx + workmap.module.css (+tests)
web/components/review/{ReviewScreen,RevisionHeader,OpenQuestions,ChangeList,ReviewMarks,FixturePlayback}.tsx + review.module.css (+tests)
web/app/map/page.tsx, web/app/review/page.tsx
web/e2e/workmap-review.spec.ts
```

**Structure Decision**: pure logic in `lib/workmap` and `lib/review`; components in the two allowed component folders; pages only bind URL/session to screen components so the screens are testable without the router.

## Complexity Tracking

None.
