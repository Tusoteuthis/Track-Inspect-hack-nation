# WS7 Sprint 2 — Newcomer practice and the pre-save review loop

> **Status: DONE (2026-10-04)** on branch `ws7-sprint-2`. See [handoff-sprint-2.md](handoff-sprint-2.md). Still open: the human gate (live tutor voice + screen sharing with keys) and the merge into `voice`. Don't run this prompt again.

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 2** of WS7, covering brief §3.E. This is the challenge's key moment: **a wrong learner decision is caught before it is saved**. You build the practice screen, the draft-review-save state machine, tutor voice integration and browser screen observation. Context sections B1–B8 apply in full.

## Read first

- `notes/07-frontend-user-experience.md` §3.E, §4 (the learner review states), §5, §9
- `notes/06-backend-integration.md` §5 (stale evaluations, double submits, server-side enforcement)
- `notes/05-knowledge-newcomer-tutor.md` §7–8 (tutor, pre-save intervention, assessment inputs)
- `notes/04-prototype-data-scenarios.md` §4, §7 (newcomer task; evaluator-only separation)
- `notes/05-sprint-plan.md` (WS5's generic task: draft decision + reason → review → commit)
- `notes/ws7-sprints/handoff-sprint-0.md`, `web/lib/ui/contracts.ts`, `web/lib/data/`, `web/components/voice/VoiceSession.tsx`, `web/lib/voice/flows.ts`
- `notes/ws3-voice-interface.md` and `notes/ws3-elevenlabs-capabilities.md` if present

## Prerequisites

S0 is merged. This sprint may run **in parallel with S1**. Touch only `/practice`, `components/practice/` and `lib/practice/`, plus additive changes to contracts, the data source and fixtures.

## Scope

### Lane A — Review state machine (pure, test-first)
- `web/lib/practice/reviewMachine.ts` is a pure reducer. Its state is keyed on `{ draft_revision, knowledge_revision_id }`.
- **States:**

  | State | Displayed as |
  |---|---|
  | `editing_unreviewed` | "Draft changed / not yet reviewed" |
  | `review_pending` | |
  | `guidance_needed` | |
  | `review_complete` | |
  | `saving` | |
  | `saved` | |
  | `save_failed` | |

- **Events:** `EDIT`, `REQUEST_REVIEW`, `EVALUATION_RECEIVED(evaluation)`, `KNOWLEDGE_REVISION_CHANGED`, `SAVE_REQUESTED`, `SAVE_ACKED`, `SAVE_FAILED`, `RESET`.
- **Rules:**
  - Any `EDIT` after review resets to `editing_unreviewed` and bumps `draft_revision`.
  - An evaluation whose `draft_revision` or `knowledge_revision_id` doesn't match the current state is **ignored as stale**.
  - `KNOWLEDGE_REVISION_CHANGED` invalidates the review.
  - Save is allowed only from `review_complete`. Which evaluation outcomes count as "review complete" is defined by WS5. Map the outcome in one small adapter (`outcomeToReviewState.ts`); don't judge correctness in UI code.
  - `SAVE_REQUESTED` while `saving` is a no-op (double-submit guard).
  - `saved` only ever follows `SAVE_ACKED`.
- Cover every transition and every stale case with a test table.

### Lane B — Practice screen (`/practice`)
- **Trace:** the unseen trace in the EvidenceViewer (full mode), plus the learner-visible context only.
- **Draft control:** a generic **decision** field, either free text or a choice list supplied by the case data (never hard-coded domain categories), plus a **reason**. The learner can optionally mark a region on the trace. Keep that interaction a simple rectangle; this is not a chart editor.
- **Review status panel:** shows each state with icon + text. The Save button is enabled only in `review_complete`. When Save is disabled, the panel explains why.
- **Guidance panel:** shows the tutor message, the guiding question and **citations**. Each citation opens the cited expert example (EvidenceViewer + quote) in a side panel or dialog.
- **Timeline:** proposed → guidance → corrected → saved.
- **Fixture behaviour:** `fixtureSource` simulates WS5 evaluation and the WS6 commit with configurable latency and failure.
  - It returns a scripted "guidance needed" for the first submission and "review complete" after an edit, labelled as fixture behaviour.
  - **It must not contain the correct answer.**
  - Real evaluation comes from WS5 through WS6.

### Lane C — Tutor voice and screen observation (EXT)
- Embed `VoiceSession` with `flow="tutor"`. Show agent status (listening / speaking / waiting / disconnected) from real SDK state, and show microphone permission separately from session status.
- **Spike first:** verify in Chrome how frames from `navigator.mediaDevices.getDisplayMedia` can reach the tutor. Candidates are periodic still frames uploaded through `DataSource` for WS6/WS5, or a description sent via `sendContextualUpdate`. Check the ElevenLabs docs and the installed SDK typings for any image/multimodal input, and never invent API surface. Record the findings with sources in `notes/ws7-screen-observation.md`.
- Implement the verified route, with clear permission, active-sharing and stopped states. Structured UI events (draft edited, review requested) are sent as context **in addition to** visual context, never as a replacement for it.

## Out of scope

The tutor prompt and evaluation logic (WS5), backend commit enforcement (WS6) and the assessment screen (S4).

## Acceptance criteria

- The reducer test table passes.
- Component tests cover:
  - Editing after review disables Save and shows "Draft changed / not yet reviewed".
  - A stale evaluation is ignored.
  - A knowledge-revision change invalidates the review.
  - A double click on Save sends one commit.
  - No "Saved" appears before the ack, and a save failure is shown with a retry.
- Playwright on fixtures: wrong draft → guidance with citation → inspect expert example → edit → review complete → save → saved. Screenshots go in the handoff.
- Run `npm run build`, then grep `.next/static` and `web/fixtures/ui` for the evaluator-only field names from the WS4 brief (expected decision, acceptable explanations, common wrong decision, scoring). There must be zero hits; paste the command and its output.
- `notes/ws7-screen-observation.md` is written.
- `handoff-sprint-2.md` lists the exact learner draft/evaluation/commit API needed from WS6 and the evaluation outcome values needed from WS5.

## Human gate (~30 min)

1. With the tutor keys present in `web/.env`, open `/practice` with voice and screen sharing on. Submit a wrong draft, hear and see the guidance, inspect the cited example, correct the draft and save.
2. Edit after review and confirm that Save is blocked. Then raise the fixture latency or force a save failure, and confirm there is no false "Saved".
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
