# WS7 Sprint Plan: Frontend and User Experience

**Derived from:** [07-frontend-user-experience.md](07-frontend-user-experience.md)  
**Updated:** 3 October 2026  
**Execution:** coding agents, one spec-kit feature per sprint, each in its own git worktree, with short human visual gates.

## Context

The WS7 brief asks for one web app with six areas:

- **A** Session setup and trace display
- **B** Expert companion
- **C** Debrief and expert review
- **D** Clickable Work Map
- **E** Newcomer practice with pre-save review
- **F** Learning summary

The question was whether to build it in one go or split it.

**Verdict: split into Sprint 0 plus 4 sprints.** Code volume is not the reason; agents write it fast. The reasons are:

1. **Dependency readiness is uneven.** D and E can be built on fixtures today. B depends on live WS2/WS3 state that is still being built on branch `voice`.
2. **One high-risk core.** The pre-save review state machine is the challenge's key moment. It covers draft changed → pending → guidance → reviewed → saving → saved/failed, and resets when the draft is edited or the knowledge revision changes. It needs its own sprint and deterministic tests.
3. **One unverified browser capability.** Screen observation for the tutor (`getDisplayMedia` and how frames reach the tutor) must be verified, not assumed.
4. **Visual gates.** Only a human can judge whether a trace is legible through the glasses and on the demo display. Agents need checkable criteria per unit of work, not one giant diff.

## Decisions (user, 2026-10-03)

- **Data source:** WS7 defines a typed UI-state contract (`web/lib/ui/contracts.ts`) and one data-access module (`web/lib/data/`). That module has a `DataSource` interface, a `fixtureSource` implementation and, later, an `apiSource` implementation. Screens run on fixtures that are clearly labelled on screen. Each screen switches to the WS6 API when it exists. No second backend lives in frontend code.
- **Packaging:** each sprint is a paste-ready agent prompt in [`ws7-sprints/`](ws7-sprints/README.md), in the same format as WS3.
- **Isolation:** each sprint runs in its own git worktree. Other workstream agents work in parallel on the same repo.

### What already exists (branch `voice`; reuse it, don't rebuild it)

- `web/` uses Next.js 16, React 19 and TypeScript, with the path alias `@/*`.
- `components/voice/VoiceSession.tsx` provides the ElevenLabs session, orb and transcript. It accepts `clientTools`, `dynamicVariables` and `onFinalLine`, and its children can use the conversation hooks.
- `lib/voice/flows.ts` defines the `expert` and `tutor` flows. `api/conversation-token` issues short-lived tokens.
- `app/page.tsx` is the dev flow picker plus `ContextSender`.
- Nothing else exists yet: no routing, test runner, trace viewer or data layer. WS3 Sprint 0 will add `web/lib/expert/contracts.ts` and vitest. Reuse both if they have landed by the time a WS7 sprint starts.

## Estimation model

| Mode | Meaning | Agent autonomy |
|---|---|---|
| **V1 – unit** | Pure logic such as reducers, mappers and coordinate math, tested with vitest and Testing Library | Fully autonomous |
| **V2 – visual** | Playwright journeys and screenshots against fixture data | Autonomous; screenshots go into the handoff |
| **V3 – human** | Legibility through the glasses, demo-display feel, live voice | **Human gate** |
| **EXT** | Depends on a browser capability or another workstream's contract | Verify or coordinate first |

## Sprints

| # | Scope | Done when | Depends on |
|---|---|---|---|
| **S0 — Shell, contracts, evidence viewer** (agent ~1.5–2h, human ~15 min) | Routes, UI contracts, `DataSource` + fixtures + FIXTURE banner, `EvidenceViewer`, design tokens, vitest/Testing Library/Playwright | Typecheck, vitest and Playwright pass. Viewer tests cover coordinate mapping and refusal to draw on a stale frame. Human: trace legible on the demo monitor | Fixtures only |
| **S1 — Work Map + review/debrief** (D, C) (~2–3h, ~20 min) | Step/decision/guardrail navigation linked to evidence. Expert words separate from AI summary. Status badges. Review view with revision label, open questions and corrections | Every step resolves to a region and expert words. Non-confirmed material is never rendered as confirmed. A revision change updates the view | S0 |
| **S2 — Newcomer practice + pre-save loop** (E) (~3–4h, ~30 min) | Unseen trace, generic draft control, review reducer, invalidation, double-submit guard, tutor voice, screen-observation spike and implementation | Reducer tests cover all transitions and stale cases. The build output contains no evaluator fields. Human: wrong draft is caught → corrected → saved | S0; can run **in parallel with S1** |
| **S3 — Expert companion + session setup** (A, B) (~2–3h, ~20 min) | Entry, session creation, live trace + latest region, honest ambiguity, real agent status, pause/stop, off-record shown only once acknowledged, `subscribe` transport | Off-record stays pending until acknowledged. Ambiguous and stale regions render correctly. Human: live glasses session | S0; WS3 Sprint 1–2 contracts; WS2 event shape |
| **S4 — Summary, trust controls, integration, demo** (F) (~2h, ~30 min) | Learning summary, correction/deletion feedback, reconnect/errors, `apiSource` swap, keyboard/focus pass, demo navigation guide | Full Playwright journey with no mock screens wherever WS6 is live. Human: full demo run-through | S1–S3; WS5 assessment; WS6 API |

- **Totals:** ~11–14 h of agent time and ~2 h of human gates.
- **Critical path:** S0 → S2.
- **Most likely to slip:** S3, because it waits on WS3/WS2.

## Coordination risks

- **WS3 also edits `app/page.tsx` and `VoiceSession.tsx`.** WS7 S0 moves the prototype to `/dev` and must not change `VoiceSession` internals. Rebase on `voice` before handing off.
- **Contract drift.** WS3 has `web/lib/expert/contracts.ts`, WS5 has the knowledge entry schema and WS6 owns the transport. WS7 contracts describe *UI state* and map from those sources. They must not fork their field meanings.
- **Ownership overlap.** The older WS5 brief says WS5 owns "Work Map presentation". Per the WS7 brief and the WS5 sprint plan, WS7 owns all screens and WS5 supplies content and rules.
- **Open product decisions:** the learner task controls (WS4 + expert), the browser screen-capture route, the visual identity and the demo display.

## Verification (per sprint)

```bash
cd web
npm run typecheck
npx vitest run
npx playwright test
npm run dev    # human walks the sprint's route on the demo display
```

For S2 and S4, also run `npm run build`, then grep `.next/static` for evaluator-only field names. There must be no hits.
