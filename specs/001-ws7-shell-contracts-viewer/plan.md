# Implementation Plan: WS7 App Shell, UI Contracts and Evidence Viewer

**Branch**: `ws7-sprint-0` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-ws7-shell-contracts-viewer/spec.md`. Source of truth: `notes/ws7-sprints/sprint-0-shell-contracts-viewer.md`.

## Summary

This plan lays the WS7 foundation:

- an App Router shell with seven routes
- the existing voice prototype moved to `/dev`
- WS7 UI-state types
- one `DataSource` interface with a fixture implementation and a visible FIXTURE banner
- a geometry-correct `EvidenceViewer` that refuses stale-frame highlights
- vitest, Testing Library and Playwright

Everything runs on labelled fixtures. There's no backend.

## Technical Context

**Language/Version**: TypeScript 5.9 (strict), Node 26 locally
**Primary Dependencies**: Next.js 16.1 (App Router, Turbopack), React 19.2, `@elevenlabs/react` (only on `/dev`, unchanged)
**Storage**: none. Fixtures are static JSON in `web/fixtures/ui/` and SVGs in `web/public/fixtures/ui/`
**Testing**: vitest 5 + @vitejs/plugin-react + jsdom + @testing-library/react 16; @playwright/test 1.63, chromium only (browsers already in the local cache)
**Target Platform**: desktop Chrome on the demo monitor (viewed through Meta Ray-Ban glasses) and a laptop
**Project Type**: web application (single Next.js app under `web/`)
**Performance Goals**: none specific; region overlay stays aligned on resize (SC-003)
**Constraints**: no evaluator-only data in the client; status never conveyed by colour alone; no change to `VoiceSession` internals; don't touch the root `.gitignore`
**Scale/Scope**: 7 routes, ~10 modules, 3 fixture files, ~30 tests

## Constitution Check

`.specify/memory/constitution.md` is still the unfilled template; WS3 Sprint 0 owns it. The gates applied instead are the sprint prompt's rules (B2):

| Gate | Status |
|---|---|
| Fixtures labelled and bannered; no fixture shown as live | PASS by design (FR-003, `source` on every view) |
| No evaluator-only answers in client or fixtures | PASS by design (fixture schema has no such fields; grep check in quickstart) |
| No highlight on a mismatched or ambiguous frame shown as confident | PASS by design (FR-007/008) |
| No second backend; all data via `DataSource` | PASS |
| Don't modify WS3-owned internals | PASS: `/dev` reuses `VoiceSession` as-is |
| Status not colour-only; keyboard accessible | PASS by design |

Re-checked after Phase 1: no violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-ws7-shell-contracts-viewer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── data-source.md
│   └── evidence-viewer.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
web/
├── app/
│   ├── layout.tsx                 # shell: nav + DataSourceProvider + main
│   ├── page.tsx                   # entry (replaced; prototype moves to /dev)
│   ├── expert|review|map|practice|summary/page.tsx   # placeholders
│   ├── dev/page.tsx               # former app/page.tsx, unchanged behaviour
│   ├── dev/evidence/page.tsx      # EvidenceViewer showcase
│   └── globals.css                # design tokens (light/dark), shell styles, voice styles kept
├── components/
│   ├── shell/{AppNav,FixtureBanner,PlaceholderPage}.tsx
│   └── evidence/EvidenceViewer.tsx (+ EvidenceViewer.module.css)
├── lib/
│   ├── ui/contracts.ts            # WS7 v0 UI-state types
│   ├── ui/regionGeometry.ts       # pure geometry
│   └── data/{source.ts,fixtureSource.ts,DataSourceProvider.tsx}
├── fixtures/ui/{session-expert.json,workmap.json,practice-case.json}
├── public/fixtures/ui/*.svg
├── tests/ (unit + component, *.test.ts[x]) and e2e/ (Playwright)
├── vitest.config.ts, vitest.setup.ts, playwright.config.ts
notes/ws7-ui-contracts-v0.md, notes/ws7-sprints/handoff-sprint-0.md
```

**Structure Decision**: a single Next.js app in `web/`. Unit and component tests sit next to the code as `*.test.ts(x)`. Playwright specs live in `web/e2e/`. This matches the WS3 convention of `vitest.config.ts` plus a `test` script.

## Complexity Tracking

None.
