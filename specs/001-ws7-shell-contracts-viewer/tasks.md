# Tasks: WS7 App Shell, UI Contracts and Evidence Viewer

**Input**: `specs/001-ws7-shell-contracts-viewer/` (plan, spec, research, data-model, contracts, quickstart)
**Tests**: requested (sprint prompt: TDD for pure logic, plus component and e2e checks)

## Phase 1: Setup

- [x] T001 Add dev deps (vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/jest-dom, @playwright/test) and `test`/`test:e2e` scripts in web/package.json
- [x] T002 [P] Create web/vitest.config.ts (alias `@` → web/, plugin-react, setup file) and web/vitest.setup.ts (jest-dom matchers, `<dialog>` showModal/close polyfill)
- [x] T003 [P] Create web/playwright.config.ts (chromium, webServer `next dev -p 3100`) and add test-results/, playwright-report/ to web/.gitignore

## Phase 2: Foundational

- [x] T004 Define v0 UI types per data-model.md in web/lib/ui/contracts.ts
- [x] T005 [P] Define the DataSource interface + Ack helpers in web/lib/data/source.ts per contracts/data-source.md
- [x] T006 Design tokens (light/dark, glasses-legible scale, focus ring) and shell layout styles in web/app/globals.css, keeping the existing voice styles

## Phase 3: User Story 1 — Inspect a captured trace region (P1)

**Goal**: geometry-correct EvidenceViewer that refuses stale/ambiguous misuse.
**Independent test**: `/dev/evidence` showcase + vitest geometry/component tests.

- [x] T007 [US1] Write failing tests for regionRenderState, regionToPercentRect and focusViewport (clamping, minimum window, sizes) in web/lib/ui/regionGeometry.test.ts
- [x] T008 [US1] Implement web/lib/ui/regionGeometry.ts to pass T007
- [x] T009 [US1] Write failing component tests (resolved outline, ambiguous dashed + text, unresolved none, frame mismatch refusal, focus/full toggle, inspect dialog Esc + focus return, image error) in web/components/evidence/EvidenceViewer.test.tsx
- [x] T010 [US1] Implement web/components/evidence/EvidenceViewer.tsx + EvidenceViewer.module.css to pass T009
- [x] T011 [P] [US1] Create watermarked FIXTURE trace SVGs in web/public/fixtures/ui/ (trace-a.svg, trace-b.svg)
- [x] T012 [US1] Build the showcase page web/app/dev/evidence/page.tsx (resolved, ambiguous, unresolved, mismatch, focus)

## Phase 4: User Story 2 — Navigate and see when data is fixture (P1)

**Goal**: shell, routes, data provider, banner, /dev prototype preserved.
**Independent test**: Playwright smoke across all routes; banner component tests.

- [x] T013 [P] [US2] Create fixtures web/fixtures/ui/session-expert.json, workmap.json (≥3 steps incl. guardrail + unresolved), practice-case.json (learner-visible only)
- [x] T014 [US2] Implement web/lib/data/fixtureSource.ts (getters; S2+ actions reject "not implemented: Sprint N"; no-op subscribe) with a test in web/lib/data/fixtureSource.test.ts
- [x] T015 [US2] Implement web/lib/data/DataSourceProvider.tsx (context, useDataSource, useSourceQuery loading/error/ready)
- [x] T016 [US2] Write failing test then implement web/components/shell/FixtureBanner.tsx (shows for fixture, hidden for live)
- [x] T017 [P] [US2] Implement web/components/shell/AppNav.tsx (current-page indication not colour-only) and web/components/shell/PlaceholderPage.tsx (sprint label, loads its fixture view via useSourceQuery, banner, error state)
- [x] T018 [US2] Move the old web/app/page.tsx to web/app/dev/page.tsx unchanged; update web/app/layout.tsx with the shell + provider
- [x] T019 [US2] Create the entry web/app/page.tsx and placeholders web/app/{expert,review,map,practice,summary}/page.tsx
- [x] T020 [US2] Playwright smoke: every route loads, nav works, banner on fixture screens, /dev shows the voice Start control in web/e2e/smoke.spec.ts

## Phase 5: User Story 3 — Contract for partners (P2)

- [x] T021 [US3] Write notes/ws7-ui-contracts-v0.md (types summary, DataSource methods, UI states needed from WS6, content needed from WS5, open questions)
- [x] T022 [US3] Add a test asserting the fixtures contain no evaluator-only keys in web/lib/data/fixtures.test.ts

## Phase 6: Polish

- [x] T023 Run typecheck, vitest, Playwright and the evaluator grep; fix failures
- [x] T024 Write notes/ws7-sprints/handoff-sprint-0.md with pasted outputs and the human gate checklist

## Dependencies

Setup → Foundational → US1 and US2 (independent; US2's PlaceholderPage doesn't need the viewer) → US3 → Polish.
Parallel: T002/T003; T005 with T004 after the types sketch; T011, T013, T017.

## Implementation strategy

MVP = US1 (the viewer is the most reused and the riskiest piece), then US2 shell, then US3 docs.
