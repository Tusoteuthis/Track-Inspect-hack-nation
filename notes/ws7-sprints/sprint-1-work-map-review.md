# WS7 Sprint 1 — Clickable Work Map and debrief/review view

> **Status: DONE (2026-10-04)** on branch `ws7-sprint-1` and re-verified (typecheck, 168 vitest, 16 Playwright). See [handoff-sprint-1.md](handoff-sprint-1.md). Still open: the human gate and the merge into `voice`. Don't run this prompt again.

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 1** of WS7. You build brief §3.D (clickable Work Map) and §3.C (debrief and expert review) on top of the S0 data layer and EvidenceViewer. Context sections B1–B8 apply in full.

## Read first

- `notes/07-frontend-user-experience.md` §3.C–D, §4, §9
- `notes/05-knowledge-newcomer-tutor.md` §3–6 (entry structure, statuses, Work Map minimum content)
- `notes/03-elevenlabs-expert-interaction.md` (debrief, teach-back, revisions, corrections)
- `notes/ws7-sprints/handoff-sprint-0.md`, `notes/ws7-ui-contracts-v0.md`, `web/lib/ui/contracts.ts`, `web/lib/data/`
- `web/lib/expert/contracts.ts` (WS3 `DraftRevision`, `ExpertConfirmation`, `OpenQuestion`) if present

## Prerequisites

S0 is merged into `voice` and `handoff-sprint-0.md` exists. This sprint may run **in parallel with S2**. Touch only `/map`, `/review`, `components/workmap/` and `components/review/`, plus additive changes to contracts, the data source and fixtures. Record contract additions in your handoff.

## Scope

### Lane A — Work Map (`/map`)
- Render the interpretation workflow as an ordered process of steps, decision points and guardrails/exceptions, not as an image gallery. Each item is keyboard navigable (arrow keys + Enter) and has a visible kind label.
- Selecting an item shows a detail panel with:
  - **Evidence:** the EvidenceViewer in focus mode on the linked region, with a toggle to the full image. When an item has several pieces of evidence, each one can be selected.
  - **Expert words:** the expert's original words as verbatim quotes, styled as the expert speaking.
  - **AI summary:** labelled "Apprentice summary" and visually distinct from the quotes.
  - **Reasoning, guardrails/exceptions and a confirmation status badge** (icon + text).
- `revoked` and `missing` items are visibly marked and never shown as teaching material. `unresolved` items say so and show the open question. An item with no evidence or no quote shows an explicit "Missing visual evidence" or "Missing expert words" state, never a placeholder.
- The URL carries the selection (`/map?entry=<id>&rev=<rev>`) so the demo can deep-link to it.

### Lane B — Review/debrief view (`/review`)
- Shows:
  - the **revision currently under review**: its revision label and a "changed since previous" indicator
  - the draft process, reusing the Work Map list component
  - open questions and gaps, each marked answered or unanswered
- When `subscribe` delivers a new revision, the view updates and marks what changed. A correction shows old → new.
- Optional supplementary controls ("Mark step for correction", "Flag unresolved") call `DataSource` actions and show pending/acknowledged/failed. **No "Approve" button that confirms without speech.** Show text explaining that confirmation happens in the spoken teach-back.
- Extend `fixtureSource` with a scripted sequence (rev-1 → correction → rev-2 → confirmed) so the update path can be tested.

## Out of scope

Live voice on these pages, the expert companion (S3), and editing knowledge content directly. Corrections come through WS3/WS5.

## Acceptance criteria

- Component tests:
  - Every fixture step opens the correct asset and region and shows its quotes.
  - Quotes and the AI summary render in distinct, labelled containers.
  - Draft, unresolved, revoked and missing items never render the "Confirmed" badge.
  - A new revision delivered via `subscribe` updates the review view and the change marker.
  - A pending action shows "pending" until acknowledged, and a failure is displayed.
- Playwright: navigate the map by keyboard only and deep-link to an entry. Save screenshots of the map, the detail panel and the review view into the handoff.
- Typecheck, vitest and Playwright pass. `handoff-sprint-1.md` is written and includes the **content needed from WS5** (the fields they must supply per step).

## Human gate (~20 min)

1. On the demo display, click through every step and guardrail. Check that each one opens the right region and words, and that the quote vs summary distinction is obvious.
2. On `/review`, run the fixture correction sequence and check the revision label and change marker.
3. Merge into `voice`.

---

## B. Shared project context (identical in every WS7 sprint prompt)

### B1. The product in one paragraph

We are building an **AI Apprentice for railway sensor traces** for Challenge 1 ("The AI Apprentice") of the 7th Global AI Hackathon, powered by ElevenLabs. The flow works like this:

- An experienced railway engineer (the **expert**) wears **Meta Ray-Ban smart glasses**, looks at **sensor traces on a screen** and **physically points with a finger** at a region.
- A native iPhone app (WS2) captures the region and emits a PointingEvent.
- An **ElevenLabs voice agent** (WS3) asks the expert what the feature means, why, what could look similar, and when to stop or escalate.
- After a spoken debrief and a **teach-back that the expert confirms or corrects**, knowledge is stored as Markdown plus linked images (WS5 content, WS6 storage).
- A **voice tutor** then coaches a **newcomer** through an **unseen trace** and catches a wrong decision **before it is saved**.

**WS7 (us) owns the browser experience:** the expert companion, debrief/review, the clickable Work Map, newcomer practice and the learning summary.

### B2. Non-negotiable scope and trust rules

- **Traces only.** No technical drawings, field maintenance, labelling campaigns or classifier training.
- **Glasses-first.** The expert interacts through the glasses, physical pointing and voice. The web companion supports this; it never turns capture into mouse-driven knowledge capture. Don't imply that the browser can pair with or stream from the glasses.
- **UI does not trigger speech.** WS3 decides when the agent asks. Never make the agent speak just because the UI received a gesture or click.
- **Expert words vs AI summary.** Always show them as visually distinct. Never present AI synthesis, placeholders or fixtures as confirmed expert evidence.
- **Status honesty.** Show draft, unresolved, revoked, missing and ambiguous material as exactly that. An ambiguous region is never drawn as a confident highlight. Never highlight a region on a frame other than the one its coordinates belong to.
- **Acknowledged state only.** Off-record, stop, deletion, correction and save are shown as done only after the backend or data source acknowledges them. Until then they show as pending, and failures are visible. Never show an optimistic "Saved".
- **Spoken confirmation.** A silent "Approve" button never replaces the spoken teach-back and confirmation. UI controls may only supplement them.
- **No answer keys in the client.** WS4 evaluator-only answers never reach the browser: not in bundles, hidden JSON, tooltips, case metadata or fixtures served to `/practice`.
- **Labelled fixtures.** Any screen showing fixture data shows a visible "FIXTURE DATA" banner. Fixtures live in `web/fixtures/ui/` and carry `source: "fixture"`.
- **Session time ≠ signal time.** Recording/session time is never relabelled as a signal-axis interval. Unknown trace identity or interval is displayed as unknown.
- **No secrets in the browser.** No permanent ElevenLabs key; only the existing short-lived token route.
- **No second backend.** All data goes through `web/lib/data/` (`DataSource`). Don't put domain judgments (tutor evaluation, eligibility) in UI code. Render what WS5/WS6 return.

### B3. Challenge evidence the UI must make reviewable (not manufacture)

- ≥3 live questions, including a guardrail question.
- ≥3 debrief questions.
- An expert-confirmed teach-back.
- A Work Map where every step and guardrail has visual **and** verbal evidence.
- An unseen newcomer case with a pre-save correction and learning feedback that separates independent from assisted performance.

### B4. Workstream map

| WS | Owns | Relationship to WS7 |
|---|---|---|
| WS1 | Pitch, demo sequence | Consumes our demo navigation guide |
| WS2 | iPhone/glasses capture, PointingEvent, evidence images | Supplies connection status and evidence geometry |
| WS3 | Expert agent behaviour, `VoiceSession`, `web/lib/expert/contracts.ts` | Supplies voice status/hooks, exchanges, revisions, confirmations |
| WS4 | Case manifest, trace assets, evaluator-only answers | Supplies learner-visible assets; answers stay out |
| WS5 | Knowledge content, eligibility, tutor evaluation, assessment | Supplies Work Map content and feedback; we render it |
| WS6 | Shared API, live updates, storage, commit enforcement | Will back `apiSource`; authoritative state |
| **WS7 (us)** | All web screens, browser state presentation, browser mic/screen capture | — |

Briefs: `notes/project-brief.md`, `notes/07-frontend-user-experience.md` (ours), `notes/06-backend-integration.md`, `notes/05-knowledge-newcomer-tutor.md`, `notes/04-prototype-data-scenarios.md`, `notes/03-elevenlabs-expert-interaction.md`, `notes/02-glasses-iphone-visual-processing.md`. Plan: `notes/07a-ws7-sprint-plan.md`.

### B5. Repository state

The repo root is `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation` and the base branch is **`voice`**. The `web/` app uses Next.js 16, React 19 and strict TypeScript, with the path alias `@/*` → `web/*`.

```
web/app/page.tsx                       Dev flow picker + <VoiceSession> + ContextSender (moved to /dev in S0)
web/app/api/conversation-token/route.ts  GET ?flow=expert|tutor → short-lived token
web/components/voice/VoiceSession.tsx  ConversationProvider wrapper (props: flow, dynamicVariables, clientTools,
                                       onFinalLine, onConnected, children) — owned by WS3, don't change internals
web/lib/voice/{flows,transcript}.ts    WS3 voice helpers
web/lib/expert/contracts.ts            WS3 v0 types (after WS3 Sprint 0) — import, don't duplicate
web/lib/ui/contracts.ts                WS7 UI-state types (S0)
web/lib/data/                          DataSource interface, fixtureSource, later apiSource (S0+)
web/fixtures/ui/                       WS7 fixtures (S0+)
.specify/ + .claude/skills/speckit-*   spec-kit
```

Code style:

- Small focused modules; comment only the non-obvious "why".
- No `any`.
- Plain CSS in `globals.css` plus CSS modules unless a sprint says otherwise. Don't add a UI framework without recording the decision.
- Accessible by default: keyboard focus, labels, and status conveyed with more than colour.
- No SDK names, internal IDs or debug logs in user-facing screens. Diagnostics belong on `/dev`.

### B6. How every WS7 sprint is executed

1. Read this whole prompt, then the "Read first" files.
2. **Work in your own git worktree.** Other workstream agents are working on this repo in parallel. First run `git rev-parse --show-toplevel` and `git branch --show-current`. If you are already inside `.claude/worktrees/ws7-sprint-N`, the human created it for you: stay there and skip creation. Otherwise, from the main checkout, run:
   ```bash
   git worktree add -b ws7-sprint-N .claude/worktrees/ws7-sprint-N voice
   ```
   spec-kit (`.specify/`, `.claude/skills/`) is tracked on `voice`, so it is already in the worktree. If a needed file is untracked in the main checkout, copy it in. Work only inside the worktree.
   - Never run bare `git stash`. The stash stack is shared.
   - Don't edit `.gitignore` or other workstreams' notes or code. The exception is the explicitly allowed move of `app/page.tsx` in S0.
3. Check the prerequisites: the previous handoff note exists and its branch is merged into `voice`.
4. Run spec-kit: `/speckit-specify`, passing "Scope" + "Acceptance criteria" as the description. Then `/speckit-clarify` (only if truly ambiguous), `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze` and `/speckit-implement`. This prompt wins on conflicts.
5. You may run the listed lanes as parallel subagents once the contracts are fixed.
6. Use test-driven development for reducers, mappers and coordinate math. Run the verification commands and paste the real output into the handoff note.
7. Make small commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Don't merge into `voice` and don't push.** The human merges after their gate.
8. Write `notes/ws7-sprints/handoff-sprint-N.md` (template in B8), then stop and report the human gate steps.

### B7. Verification commands

```bash
cd web
npm run typecheck
npx vitest run
npx playwright test          # once S0 has added it; screenshots → web/test-results/
npm run build                # S2/S4: then grep .next/static for evaluator-only field names (must be empty)
npm run dev                  # human gate at http://localhost:3000
```

Never fake a result. If something is blocked (missing `web/.env` keys, missing WS6 API), do everything else, list what is blocked, and ask the human.

### B8. Handoff note template (`notes/ws7-sprints/handoff-sprint-N.md`)

```markdown
# WS7 Sprint N handoff — <title>
Branch: <branch>   Worktree: <path>   Spec: specs/NNN-.../   Date: <date>
## Delivered (files + one line each)
## Verification evidence (pasted typecheck / vitest / playwright output; screenshot paths)
## Decisions made (and why) — esp. deviations from this prompt
## Contract changes (web/lib/ui/contracts.ts, DataSource methods)
## UI states needed from WS6 / content needed from WS5 (for the human to forward)
## Known limitations / fixture-only screens
## Human gate checklist (exact steps, what to look for)
## Notes for the next sprint
```
