# WS7 Sprint 2 handoff: Newcomer practice and the pre-save review loop
Branch: `ws7-sprint-2`   Worktree: `.claude/worktrees/ws7-sprint-2`   Spec: `specs/003-ws7-practice-presave/`   Date: 2026-10-04

## Delivered (files + one line each)
**Lane A: review state machine (pure, TDD)**
- `web/lib/practice/reviewMachine.ts` (+test): reducer keyed on `{draft_revision, knowledge_revision_id}`. It ignores stale evaluations, guards against double submits, and reaches `saved` only after `SAVE_ACKED`. The test is a 7×13 transition table plus stale cases.
- `web/lib/practice/outcomeToReviewState.ts` (+test): the single WS5 outcome adapter. `ok` maps to review_complete; everything else maps to guidance_needed (fail closed).
- `web/lib/practice/reviewCopy.ts`: icon, text and Save-blocked reason for each state.
- `web/lib/practice/timeline.ts` (+test): proposed → guidance → corrected → saved, derived from transitions.
- `web/lib/practice/regionDraw.ts` (+test): pointer drag to a normalized rectangle on the practice frame, clamped, with a minimum size.

**Lane B: /practice**
- `web/app/practice/page.tsx`: loads the case. In fixture mode it reads `?fixture_latency=<ms>&fixture_fail=review|commit`.
- `web/components/practice/usePracticeLoop.ts`: connects the reducer to the DataSource. Transitions go through a ref, so a double click or a StrictMode re-run sends one request.
- `PracticeScreen.tsx`, `DraftForm.tsx` (free text or a case-supplied choice list), `RegionMarker.tsx`, `ReviewStatusPanel.tsx`, `GuidancePanel.tsx` (expert-example dialog: verbatim quote + EvidenceViewer focus), `PracticeTimeline.tsx`, `FixtureControls.tsx`, `practice.module.css`.
- `web/lib/data/fixturePractice.ts` (+test): scripted fixture review and commit. The first review of a draft returns `intervene` with a citation from the first confirmed expert entry with resolved evidence (guardrail preferred); later reviews return `ok`. It never reads the draft and holds no answer. Latency and failure are configurable. Commits are de-duplicated by idempotency key, and commits are refused on guidance or a stale evaluation (mirroring WS6).
- `web/lib/practice/fixtureSettings.ts` (+test): URL → fixture options.

**Lane C: tutor voice + screen observation**
- `web/components/practice/TutorPanel.tsx`: `<VoiceSession flow="tutor">`, plus:
  - agent status (listening / speaking / waiting / disconnected) from `useConversationStatus` and `useConversationMode`;
  - a separate microphone-permission line (Permissions API);
  - `TutorContextBridge`, which sends silent `sendContextualUpdate`s with a unique `contextId` each.
- `web/lib/practice/contextMessages.ts` (+test) and `practiceEvents.ts`: structured events (`draft_edited` debounced, `review_requested`, `evaluation_received` with outcome, guiding question and cited quotes only, `saved`, `screen_frame`).
- `web/components/practice/useScreenObservation.ts` + `ScreenSharePanel.tsx` (+test) + `web/lib/practice/screenCapture.ts` (+test): `getDisplayMedia` sends JPEG stills every 5 s and on "Request review" through `DataSource.submitScreenFrame`. States: unsupported, idle, requesting, active, denied, stopped and error.
- `notes/ws7-screen-observation.md`: spike findings with sources and the route decision.

**Tests**
- `web/components/practice/PracticeScreen.test.tsx`: 12 component tests.
- `web/components/practice/agentState.test.ts`.
- `web/e2e/practice.spec.ts` and `web/e2e/practice-screen.spec.ts`.
- `web/playwright.config.ts`: optional `PW_PORT` (default 3100) so parallel sprint worktrees don't collide.

## Verification evidence
```
$ npm run typecheck
> tsc --noEmit
exit=0

$ npx vitest run
 Test Files  18 passed (18)
      Tests  235 passed (235)
exit=0

$ PW_PORT=3102 npx playwright test
✓ e2e/practice.spec.ts › wrong draft → guidance with citation → expert example → edit → review complete → save → saved
✓ e2e/practice.spec.ts › a forced save failure is shown with retry and never as Saved
✓ e2e/practice.spec.ts › a slow save shows Saving until the acknowledgement
✓ e2e/practice.spec.ts › knowledge update invalidates a completed review
✓ e2e/practice.spec.ts › tutor panel shows agent and microphone status separately
✓ e2e/practice-screen.spec.ts › screen share: idle → active (frame acknowledged) → stopped
✓ e2e/smoke.spec.ts › (12 S0 smoke tests, incl. /practice FIXTURE banner + no internal ids)
18 passed (9.7s)
exit=0

$ npm run build
✓ Generating static pages using 11 workers (10/10)   … ○ /practice …   exit=0

$ grep -rliE 'expected[_ ]?(decision|answer)|acceptable[_ ]?explanation|common[_ ]?wrong|scoring|answer[_ ]?key|rubric' .next/static fixtures/ui public/fixtures/ui; echo "exit=$?"
exit=1
```
The grep prints no matches; `exit=1` means nothing matched in 24 static files. As a sanity check, `.next/static/chunks/9d17c6261d3bb662.js` contains "Draft changed / not yet reviewed", so the practice bundle was among the files scanned. `grep -rl "sendMultimodalMessage\|sendUserMessage" components/practice lib/practice app/practice` finds nothing (exit=1).

The e2e flow was run 3× after the drag fix, with 6/6 practice tests passing each time.

Screenshots are in `web/test-results/practice/` (gitignored, so re-run Playwright to regenerate):
- `01-draft.png`
- `02-guidance.png`
- `03-expert-example.png`
- `04-review-complete.png`
- `05-saved.png`
- `06-save-failed.png`
- `07-screen-sharing.png`

## Decisions made (and why)
1. **`uncertain` maps to guidance_needed (fail closed).** WS6's draft policy allows `uncertain` with escalation, but the UI has no honest escalated-save presentation yet. Unknown outcomes also fail closed so a new value can never unlock Save. To change this, edit only `outcomeToReviewState.ts`.
2. **SAVE_REQUESTED is also accepted from `save_failed`, as a retry.** The evaluation is still current for the same revision. The retry gets a **new** idempotency key, because it is a new save intent (WS6 §5.8: one key per click intent).
3. **Extra event `REVIEW_FAILED`.** An evaluation call that fails returns to "not yet reviewed" with the error shown and allows a new request. The prompt's event list had no way to leave `review_pending` on failure.
4. **REQUEST_REVIEW is ignored in `guidance_needed`.** The learner must change the draft first, since re-reviewing an unchanged draft adds nothing. Every keystroke is an EDIT and bumps `draft_revision`.
5. **A knowledge change during `saving` returns to unreviewed**, and a late ack is ignored. WS6 is authoritative: if it did commit, the next state sync shows that. `saved` is final.
6. **Screen route:** stills go through the DataSource, with silent contextual updates alongside. `sendMultimodalMessage` is a user turn that triggers a reply according to the ElevenLabs docs, so it is not used (B2). Details are in `notes/ws7-screen-observation.md`.
7. **The fixture evaluator lives in its own module** and reads citations from the Work Map fixture dynamically. S1 rewrites `workmap.json` in parallel, so no ids are hard-coded.
8. **Guidance stays visible after an edit**, labelled "This guidance was given on your earlier draft". It is cleared on review complete, reset or a knowledge change.
9. **The learner's region shows in the EvidenceViewer** with the caption "Outlined: the region you marked (part of your draft)". It is drawn only on the practice trace's frame, because it carries that frame's `frame_id`.

## Contract changes (`web/lib/ui/contracts.ts`, DataSource), all additive
- `ReviewStatus` union, `PracticeTimelineEntry`, `ScreenFrameRef`.
- `LearnerEvaluation.evaluation_id?: string`, needed for the WS6 commit.
- `DataSource.commitDraft(draft, evaluation, options?: { idempotency_key: string })`.
- New `DataSource.submitScreenFrame(caseId, frame: Blob, meta: { draft_revision; captured_at_utc }) → Ack<ScreenFrameRef>`.
- `fixtureSource.ts`: adds `createFixtureSource({ latencyMs, failReview, failCommit })` and `DEFAULT_FIXTURE_LATENCY_MS = 600`. The default `fixtureSource` is now `createFixtureSource()`, so `submitDraftForReview` and `commitDraft` are implemented (test updated).

**Merge note for S1:** S1 also edits `contracts.ts`, `source.ts` and `fixtureSource.ts`. My hunks are small and additive. Expect a trivial conflict in the `fixtureSource` object literal: keep both sets of methods.

## UI states needed from WS6 / content needed from WS5
**WS6: learner API the apiSource will call** (matches `ws6-api-v0.md` §5.8)
| DataSource call | WS6 |
|---|---|
| `submitDraftForReview(draft)` | 1. `PUT /api/sessions/:sid/draft {base_draft_rev, decision, reason, visual_context:[{asset_id, region}]}` → `LearnerDraft{draft_rev}`<br>2. `POST /api/sessions/:sid/evaluations {draft_rev}` → `202 Evaluation{status:"pending"}`<br>3. Wait for SSE `evaluation.updated`, or poll `GET /evaluations/:id` until `done`/`failed`/`stale`.<br>4. Return `acknowledged(LearnerEvaluation)` on `done`, or `failed(code)` on `failed`/`stale`. |
| `commitDraft(draft, ev, {idempotency_key})` | `POST /api/sessions/:sid/commit {draft_rev, evaluation_id, idempotency_key}` → `201/200 Commit`. A 409 `{error:{code}}` maps to `failed(code)`. Codes shown verbatim in the save-failed alert: `evaluation_required`, `evaluation_pending`, `evaluation_stale` (draft_changed/knowledge_changed), `commit_blocked` (already_committed/blocked_by_outcome). |
| `submitScreenFrame` | **New, proposed:** `POST /api/sessions/:sid/screen-frames` (multipart `frame` + `draft_rev` + `captured_at_utc`) → `{frame_id, captured_at_utc, draft_rev}`. Ids must match `^[a-z0-9][a-z0-9-]{0,63}$`. |
| `subscribe` | `workmap` update (or `entry.revoked` resolved to the new revision id) → the UI dispatches `KNOWLEDGE_REVISION_CHANGED(revision_id)`. |

Contract deltas to reconcile:
- **Naming:** WS7 uses `draft_revision`/`knowledge_revision_id` (singular) and `message`/`citations[{quote, evidence}]`; WS6 uses `draft_rev`/`knowledge_revision_ids[]` and `feedback_text`/`cited[{exchange_ids, quote}]`. The apiSource maps between them. For the knowledge revision: if WS6 keeps a list, WS7 compares it against the case's pinned revision.
- **Citations:** WS7 needs `EvidenceRef` (asset URL + region + frame_id) on each citation to open the expert example. WS6/WS5 should return the evidence pointer or let the apiSource resolve it from the cited `entry_id`/`revision_id` via the Work Map.
- **`stub` source:** `DataOrigin` has no `stub` value (WS6 open question). Treat `stub` as `fixture` for banner purposes.

**WS5:**
- Evaluation outcome values: currently assumed `"ok" | "intervene" | "uncertain"`. Please confirm, and say whether `uncertain` should permit an escalated save. If it should, WS7 needs `escalation` on the evaluation and an "escalated" save state.
- Fields WS7 renders: `feedback_text` (shown as tutor guidance), `guiding_question`, and `cited[]` with verbatim quotes.
- Whether the tutor or evaluator consumes the screen frames (`ScreenFrameRef`). WS7 only stores and announces them.
- The tutor receives `[PRACTICE …]` contextual updates (format in `contextMessages.ts`). The tutor prompt may rely on them, but must not expect them to replace visual context.

## Known limitations / fixture-only screens
- /practice runs on fixtures only. The scripted review is labelled "Fixture behaviour" and does not judge the decision.
- The practice case is selected with `FIXTURE_IDS.practiceCase`; the session for knowledge updates is `FIXTURE_IDS.newcomerSession`. Real case/session selection comes with WS6 (`POST /api/sessions {role:"newcomer"}`).
- The real Chrome picker, denial and the browser-bar "Stop sharing" path were not automated; Playwright uses an auto-select flag. Those are checked at the human gate.
- Not live-tested: tutor voice and contextual-update silence (need keys), and route C (multimodal upload).
- RegionMarker is pointer-only. Keyboard users can still submit without a region, since marking is optional.
- `VoiceSession` shows its own "Ready/Listening" label next to our agent status. Its internals belong to WS3 and weren't changed.

## Human gate checklist (~30 min)
1. `cd .claude/worktrees/ws7-sprint-2/web`. Copy the env file: `cp ../../../../web/.env .env`. It has `ELEVENLABS_AGENT_ID_TUTOR`. If the key there is stale, use `ELEVEN_LABS_KEY` from the repo-root `.env`. Then run `npm run dev` and open `http://localhost:3000/practice` in Chrome.
2. **Voice:** check that the microphone line shows the permission separately. Press Start in "Voice tutor", allow the mic, and check that the status goes from Waiting to Tutor is listening / speaking.
3. **Screen:** press "Share screen" and pick the tab or screen. Look for "Sharing your screen…" and "Last still image received at …". Stop once from the browser's own bar and check that it shows "stopped". Share again, then deny once and check that it shows "not allowed".
4. **The tutor must stay silent when you edit or share:** type a draft and wait. The tutor should **not** start talking because of UI events; contextual updates are silent.
5. Fill in Decision and Reason, then Request review. Look for "Review pending", then "Guidance needed", the guiding question, and "Open expert example 1". Open it and check the verbatim quote and the expert's region on the other trace. Close it. Talk to the tutor about the guidance.
6. Change the reason. The status should be "Draft changed / not yet reviewed" and Save disabled with an explanation. Request review, check for "Review complete", then Save. "Saving… waiting for confirmation" should come before "Saved", and the timeline should show Proposed → Guidance → Corrected → Saved.
7. **Edit after review:** reach "Review complete", type one character, and confirm that Save is blocked.
8. **No false "Saved":**
   - Open `/practice?fixture_latency=5000` and save. "Saving…" should stay for about 5 s and "Saved" appear only afterwards.
   - Open `/practice?fixture_fail=commit` and save. You should get an alert "not saved", a "Retry save" button, and no "Saved".
   - Optionally, use the fixture panel's "Simulate knowledge update" after Review complete; Save should be blocked.
9. If everything passes, merge `ws7-sprint-2` into `voice`.

## Notes for the next sprint
- S4 (summary): the timeline entries (`PracticeTimelineEntry`) and the guidance/correction sequence are what separate assisted from independent work. Keep `usePracticeLoop` as the source, and assessment classes come from WS5.
- The apiSource should implement `submitDraftForReview` as PUT, POST, then wait (see the table above). Keep stale-dropping in the reducer even with server enforcement.
- If WS5 agrees `uncertain` permits an escalated save, add an `escalated` flag to `review_complete` in `outcomeToReviewState` and show "Saved with escalation".
- Screen frames: once WS6 has the endpoint, nothing in the UI changes. Route C (multimodal upload on learner request) needs WS3 agent configuration and a live check.
