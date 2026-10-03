# WS7 Sprint 0 — App shell, UI contracts, data layer, evidence viewer

> **Status: DONE (2026-10-04)** on branch `ws7-sprint-0` and re-verified. See [handoff-sprint-0.md](handoff-sprint-0.md). Still open: the human gate and the merge into `voice`. Don't run this prompt again.

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 0** of WS7 (web frontend). This sprint builds the foundation every later screen uses. It ships no feature screens yet. Goals:
1. An app shell with routes and navigation.
2. A typed UI-state contract and one data-access layer that runs on labelled fixtures.
3. A reusable, correct **EvidenceViewer** (a trace image plus a region highlight).
4. A test setup: vitest, Testing Library and Playwright.

Context sections B1–B8 below apply to you in full.

## Read first

- `notes/07-frontend-user-experience.md` (all of it) and `notes/07a-ws7-sprint-plan.md`
- `notes/06-backend-integration.md` §4–5 (resources, state rules)
- `notes/05-knowledge-newcomer-tutor.md` §3–6 (entry structure, statuses, Work Map)
- `notes/02-glasses-iphone-visual-processing.md` §5 (region geometry, frame coordinates)
- `notes/04-prototype-data-scenarios.md` §5–7 (manifest; learner-visible vs evaluator-only)
- `web/app/page.tsx`, `web/components/voice/VoiceSession.tsx`, and `web/lib/expert/contracts.ts` if present

## Prerequisites

None. Branch from `voice`. If WS3 Sprint 0 has landed (`web/lib/expert/contracts.ts`, vitest), reuse it. Otherwise add vitest yourself in a way that won't conflict: use the same `vitest.config.ts` name and the same `test` script.

## Scope

### Lane A — Shell and routing
- Routes: `/` (entry: "Expert session" / "Newcomer practice" / "Work Map"), `/expert`, `/review`, `/map`, `/practice`, `/summary`, `/dev`. Every route except `/` and `/dev` is a placeholder page that names the sprint delivering it.
- Move the current `app/page.tsx` content (flow picker, `VoiceSession`, `ContextSender`) to `/dev` unchanged. This is the only change allowed to WS3-owned UI.
- Layout: top navigation, a FIXTURE banner slot and a main area. The design tokens in `globals.css` (`:root` custom properties) cover colour, spacing and type scale. Size them for **legibility on a large monitor viewed through the glasses**: large base font, high contrast, thick region outlines. Support a light and a dark theme. Status must never rely on colour alone.

### Lane B — UI contracts and data layer
- `web/lib/ui/contracts.ts`: UI-state types with snake_case fields that match the briefs. Import WS3 types where they exist and map from them; don't redefine their meaning. Mark the file "v0, pending WS6/WS5 agreement". Types:
  - `SessionView`: `session_id`, `role: "expert" | "newcomer"`, `lifecycle`, `recording_state: "on_record" | "off_record" | "off_record_pending" | "on_record_pending"`, `connection: { capture, agent, backend }` (each `"connected" | "disconnected" | "reconnecting" | "unknown"`), `case_id | null`, `knowledge_revision_id | null`, `source: "live" | "fixture"`.
  - `EvidenceAsset`: `asset_id`, `original_url`, `highlighted_url | null`, `frame_id`, `width_px`, `height_px`.
  - `EvidenceRegion`: `frame_id`, `coordinate_space: "original_frame_normalized"`, `x`, `y`, `width`, `height`, `mapping_status: "resolved" | "ambiguous" | "unresolved"`.
  - `KnowledgeStatus`: `"draft" | "confirmed" | "unresolved" | "revoked" | "missing"`.
  - `WorkMapView`: `revision_id`, `source`, and `steps[]`. Each step has `entry_id`, `revision_id`, `kind: "step" | "decision" | "guardrail" | "exception"`, `title`, `ai_summary`, `expert_quotes[]` (verbatim, each with `exchange_id`), `reasoning`, `guardrails`, `evidence[]` (asset + region + `event_id`) and `status`.
  - `LearnerDraft`: `draft_id`, `draft_revision`, `decision`, `reason`, `region | null`.
  - `LearnerEvaluation`: `draft_revision`, `knowledge_revision_id`, `outcome` (opaque string from WS5), `message`, `guiding_question | null`, `citations[]` (entry/revision + quote + evidence).
  - `AssessmentView`: `independent[]`, `assisted[]`, `unresolved[]`, `practice_next[]`, `evidence_used[]`.
- `web/lib/data/source.ts`: the `DataSource` interface:
  - Async getters per screen: `getSession`, `getWorkMap`, `getPracticeCase`, `getAssessment`.
  - Action methods that return acknowledgements: `submitDraftForReview`, `commitDraft`, `requestOffRecord`, and so on.
  - `subscribe(sessionId, onUpdate) → unsubscribe`.

  Methods that later sprints need may be stubbed with `throw new Error("not implemented: Sprint N")`.
- `web/lib/data/fixtureSource.ts` + `web/fixtures/ui/*.json` contain:
  - one expert session
  - one Work Map with ≥3 steps, including a guardrail and one `unresolved` step
  - one practice case with **learner-visible fields only**

  All fixtures have `source: "fixture"` and contain no domain interpretation. Use neutral placeholder text such as "Expert explanation (fixture)".
- A `useDataSource()` provider. A `FixtureBanner` renders whenever the data shown has `source: "fixture"`.
- Placeholder trace images in `web/public/fixtures/ui/`, visibly watermarked FIXTURE. SVGs are fine.

### Lane C — EvidenceViewer
- `web/components/evidence/EvidenceViewer.tsx` accepts an `asset`, an optional `region` and a `mode: "focus" | "full"`.
  - It renders the full image and maps the normalized region to the displayed size, including on responsive resize.
  - It draws the highlight as an outline plus a label. An ambiguous region uses a dashed outline and the text "Ambiguous region". An unresolved region draws nothing.
  - Focus mode zooms to the region with context padding. The user can toggle to the full image and open a full-screen inspect dialog. The dialog is keyboard accessible: Esc closes it and focus is trapped.
  - **The highlight is refused when `region.frame_id !== asset.frame_id`.** In that case the viewer shows "Region belongs to a different frame" and draws no highlight.
- Pure helper `web/lib/ui/regionGeometry.ts` (normalized → pixel, focus viewport with clamping), written test-first.
- A small showcase of the viewer states on `/dev/evidence` for the human gate.

### Lane D — Test setup
- vitest + `@testing-library/react` + jsdom for component tests.
- Playwright (chromium only) with one smoke test that visits every route and asserts the FIXTURE banner shows on fixture screens.
- Add `test` and `test:e2e` scripts. Keep Playwright artefacts ignored through `web/.gitignore`, not the root one.

## Out of scope

Real Work Map, practice and companion behaviour (S1–S3), the WS6 API and any styling framework decision beyond tokens.

## Acceptance criteria

- `npm run typecheck`, `npx vitest run` and `npx playwright test` pass.
- Tests cover:
  - region mapping at several sizes
  - focus viewport clamping at image edges
  - stale-frame refusal
  - ambiguous and unresolved rendering
  - the banner showing for fixture data and hiding for `source: "live"`
- `/dev` still runs the voice prototype exactly as before.
- No evaluator-only fields exist in `web/fixtures/ui/`.
- `notes/ws7-ui-contracts-v0.md` summarises the contracts and lists the **UI states WS7 needs from WS6**.
- `notes/ws7-sprints/handoff-sprint-0.md` is written.

## Human gate (~15 min)

1. Run `npm run dev` and open `/dev/evidence` on the **demo monitor**. Check through the glasses that the trace, outline and labels are legible.
2. Skim `notes/ws7-ui-contracts-v0.md` and send it to the WS6/WS5 owners.
3. Merge the branch into `voice`.

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
