# WS7 Sprint 3 — Session setup and expert companion

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 3** of WS7, covering brief §3.A (session setup and trace display) and §3.B (expert companion). The expert works through the glasses, pointing and voice. The companion page is a **lightweight status and evidence view that needs few clicks**; it is not a capture tool. Context sections B1–B8 apply in full.

## Read first

- `notes/07-frontend-user-experience.md` §3.A–B, §5, §9
- `notes/02-glasses-iphone-visual-processing.md` §5 (PointingEvent, mapping status, record state)
- `notes/03-elevenlabs-expert-interaction.md` and the latest `notes/ws3-sprints/handoff-sprint-*.md` (what WS3 has actually delivered: client tools, off-record, phases)
- `notes/06-backend-integration.md` §4–5 (session lifecycle, live updates, acknowledgements)
- `notes/ws7-sprints/handoff-sprint-0.md` to `handoff-sprint-2.md`, `web/lib/ui/contracts.ts`, `web/lib/data/`, `web/lib/expert/contracts.ts`

## Prerequisites

S0 is merged; S1 and S2 should preferably be merged too. WS3 Sprint 1 must be merged into `voice`. If WS3 hasn't delivered something you need, such as the off-record mechanism:

- build against the documented contract using fixtures
- label it as fixture-backed
- list it in the handoff

Don't implement WS3 behaviour yourself.

## Scope

### Lane A — Entry and session setup (`/`, `/expert`)
- The entry offers "Expert session" or "Newcomer practice". Expert setup selects a WS4 case from the manifest via `DataSource`.
- Setup shows the **actual** connection status for the capture device, agent and backend. An unknown status is shown as unknown, never as connected.
- A trace display mode shows the case trace at the largest legible size for viewing through the glasses, full-bleed with minimal chrome.
- Optional browser screen sharing is labelled as a companion capability that **does not replace physical pointing**.

### Lane B — Expert companion (`/expert` during a session)
- **Trace and regions:** shows the active trace, the **most recent indicated region** and a small strip of recent events. The region is drawn in an EvidenceViewer using the event's own frame, so stale-frame refusal applies.
  - `mapping_status: "ambiguous"` shows "Ambiguous: the apprentice will ask you to clarify" with a dashed outline.
  - `"unresolved"` shows no highlight.
- **Status:** agent status (listening / speaking / waiting / disconnected) comes from real `VoiceSession` state via the expert flow. Recording state comes from `SessionView.recording_state`.
- **Controls:** pause, stop and an **off-record request**.
  - Each one calls `DataSource` and shows `*_pending` until the acknowledgement arrives through `subscribe`. A failure is shown explicitly.
  - The controls sit in a collapsible edge rail and never cover the trace. They have keyboard shortcuts with visible hints.
- **No speech on gestures:** the UI never sends anything that makes the agent speak when a gesture arrives. Pointing events are WS3's input; the companion only displays them.
- **Live updates:**
  - `fixtureSource.subscribe` replays a scripted, timed sequence: resolved, repeat, ambiguous, off-record ack.
  - If the connection drops, `subscribe` shows "Reconnecting…" and resyncs state on reconnect.

## Out of scope

The native capture UI (WS2) and question timing and content (WS3). The debrief screen is S1's `/review`, which is reused: link to it at the end of a session.

## Acceptance criteria

- Component tests:
  - An off-record request shows pending until acked, and the off-record indicator appears only after the ack. A failed ack shows an error and keeps the previous state.
  - An ambiguous event renders the dashed outline and text, and an unresolved event renders no highlight. An event whose frame differs from the asset's frame is refused.
  - Controls never overlap the trace bounding box (asserted in a layout test or in Playwright).
  - A disconnect shows "Reconnecting…", and resync restores the latest state.
- Playwright: setup → companion with the fixture event replay → off-record → stop → link to `/review`. Screenshots go in the handoff.
- Typecheck, vitest and Playwright pass. `handoff-sprint-3.md` lists the live-update events needed from WS6 and anything still missing from WS3.

## Human gate (~20 min)

1. Run a live expert session: glasses on, the trace on the demo monitor, and `/expert` on a second screen or laptop. Check that:
   - the trace is legible through the glasses
   - the status shown is accurate
   - nothing speaks just because of a UI action
2. Request off-record and check that the indicator only flips after the acknowledgement.
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
