# WS7 Sprint 1 handoff — Clickable Work Map and debrief/review view
Branch: `ws7-sprint-1` (from `voice` at 4aaa20c)   Worktree: `.claude/worktrees/ws7-sprint-1`   Spec: `specs/002-ws7-workmap-review/`   Date: 2026-10-04

## Delivered
**Screens**
- `web/app/map/page.tsx`: binds `?entry=&rev=` to `WorkMapScreen` (inside `<Suspense>`). Selecting an item calls `router.replace`.
- `web/app/review/page.tsx`: renders `ReviewScreen` for the fixture expert session.

**Work Map components (`web/components/workmap/`)**
- `WorkMapList.tsx`: the workflow as a numbered `<ol>` of buttons, each with a kind label, status badge and optional change marker. It uses a roving tabindex: ↑/↓/←/→ move focus without wrapping, Home/End jump, Enter/Space open.
- `WorkMapDetail.tsx`: the detail panel.
  - Evidence selector ("Evidence 1/2") and `EvidenceViewer` in focus mode, with a toggle to the full image.
  - Labelled regions: "Expert's words" (verbatim blockquotes, attributed to "Expert"), "Apprentice summary" (dashed box, "AI synthesis, not the expert's words"), "Reasoning" and "Guardrails and exceptions".
  - Revoked and missing items get a notice and no content.
  - Unresolved items get a notice and the open question.
  - Explicit "Missing visual evidence" and "Missing expert words" states.
- `StatusBadge.tsx`: icon + text; only `confirmed` reads "Confirmed".
- `WorkMapScreen.tsx`: router-free screen. It loads data, follows pushed `workmap` updates, and shows deep-link notices for an unknown item or another revision.
- `workmap.module.css`

**Review components (`web/components/review/`)**
- `ReviewScreen.tsx`: the debrief screen. It shows the spoken-teach-back explanation (no approve control) and a live announcement when a revision, confirmation or other update arrives. It reuses `WorkMapList`/`WorkMapDetail` and adds change markers, a removed-items list, change details and notes.
- `RevisionHeader.tsx`:
  - the revision label and a "Changed since Revision 1: N items changed" indicator
  - the reason for the revision
  - the teach-back status, for this exact revision only
  - parent-revision history
- `ChangeList.tsx`: old → new per changed field (`<del>` → `<ins>`).
- `OpenQuestions.tsx`: WS3 `OpenQuestion`s, each marked Answered or Unanswered.
- `ReviewMarks.tsx`: `useReviewMarks` plus the "Mark step for correction" and "Flag unresolved" controls, which show pending, acknowledged or failed.
- `FixturePlayback.tsx`: dev-only panel that steps the scripted sequence and can simulate failures. It is rendered only when the active source is `fixtureSource`.
- `review.module.css`

**Pure logic (TDD: tests were written first and failed before the code existed)**
- `web/lib/ui/status.ts`: status → icon/label/description/teachable, plus kind labels.
- `web/lib/workmap/listNav.ts`: keyboard navigation and roving tab stop.
- `web/lib/workmap/deepLink.ts`: `resolveDeepLink`, `mapHref`.
- `web/lib/review/revisionDiff.ts`: presentation-only diff between a revision and its parent: changed, added and removed items, plus old/new text. Never shows ids.
- `web/lib/review/reviewState.ts`: reducer for load, pushed updates and announcements. It ignores other sessions and late load results.
- `web/lib/review/markState.ts`: idle/pending/acknowledged/failed. No double submit; revision-scoped keys.
- `web/lib/review/ws3Mappers.ts`: `isAnswered`, `confirmationFor`, `confirmationSummary`, `previousRevisionNote`.

**Data and fixtures**
- `web/lib/data/fixtureReviewScript.ts`: scripted sequence Revision 1 → expert correction → Revision 2 → confirmed. It pushes `workmap` and `review` updates, simulates mark latency (700 ms) and has a failure toggle.
- `web/lib/data/fixtureSource.ts`: `getWorkMap`, `getReview`, `submitReviewMark` and `subscribe` now come from the script. It exports `fixtureReviewControls`.
- `web/fixtures/ui/workmap.json`: Revision 1, now 6 items:
  - a step with 2 pieces of evidence on 2 frames
  - a decision with an ambiguous region
  - a guardrail
  - an unresolved exception
  - a revoked guardrail
  - a missing step
- `web/fixtures/ui/workmap-rev-2.json` and `workmap-rev-2-confirmed.json`: the later revisions.
- `web/fixtures/ui/review-script.json`: the stages, with WS3-shaped open questions and confirmations.

**Tests**
- Unit tests: `lib/ui/status.test.ts`, `lib/workmap/{listNav,deepLink}.test.ts`, `lib/review/{revisionDiff,reviewState,markState,ws3Mappers}.test.ts`, `lib/data/fixtureReviewScript.test.ts`, plus an updated `lib/data/fixtureSource.test.ts`.
- Component tests: `components/workmap/{WorkMapDetail,WorkMapList,WorkMapScreen}.test.tsx`, `components/review/{ReviewScreen,ReviewMarks}.test.tsx`.
- E2E: `e2e/workmap-review.spec.ts`.
- Test helpers, not imported by app code (confirmed absent from `.next/static`): `lib/data/stubSource.ts`, `components/review/reviewStages.ts`.

**Notes**
- `notes/ws7-ui-contracts-v0.md`: S1 contract additions (§1, §2, new §6).

## Verification evidence
Fresh run after the last code change (2026-10-04 00:51):
```
$ npm run typecheck
> tsc --noEmit                                   (no errors)

$ npx vitest run
 Test Files  20 passed (20)
      Tests  168 passed (168)

$ npx playwright test
Running 16 tests using 6 workers
  ✓ smoke.spec.ts × 12 (all S0 tests, including /map and /review: FIXTURE banner, no alert, no "fixture-…" id in <main>)
  ✓ workmap-review.spec.ts:15  Work Map: navigate by keyboard only and open items
  ✓ workmap-review.spec.ts:61  Work Map: a deep link opens the named item
  ✓ workmap-review.spec.ts:74  Review: scripted correction sequence updates label, markers and confirmation
  ✓ workmap-review.spec.ts:111 Review: a simulated failure is shown
  16 passed (6.1s)

$ npm run build
✓ Generating static pages using 11 workers (10/10)   routes: / /dev /dev/evidence /expert /map /practice /review /summary /api/conversation-token

$ grep -riE "expected_decision|acceptable_explanation|common_wrong|scoring|answer_key" fixtures public/fixtures     → exit 1 (none)
$ grep -rliE "expected_decision|acceptable_explanation|common_wrong|answer_key" .next/static                         → exit 1 (none)
$ grep -rl "createStubSource" .next/static                                                                           → exit 1 (none)
```

Mapping from acceptance criteria to tests:

| Criterion | Test |
|---|---|
| Every fixture step opens the correct asset and region and shows its quotes | `WorkMapDetail.test.tsx` "every piece opens its asset and region". It covers 9 teachable item/revision pairs with evidence and every piece of evidence. It checks the `img` src, focus mode, the outline's left/top/width/height against `regionToPercentRect(focusViewport)`, and solid vs dashed. The quotes test checks each quote in "Expert's words". |
| Quotes and summary in distinct labelled containers | `WorkMapDetail.test.tsx` "quotes and summary are in separate labelled regions" (non-nested regions, no cross-contained text) |
| Draft, unresolved, revoked and missing never show "Confirmed" | `WorkMapDetail.test.tsx` "never shows a Confirmed badge" covers all 15 non-confirmed item/revision pairs in list + detail, with a positive control for confirmed |
| New revision via `subscribe` updates the review and the change marker | `ReviewScreen.test.tsx` "updates when subscribe delivers a new revision…" and "shows a confirmation only for the exact revision" |
| Pending until acknowledged; failure displayed | `ReviewMarks.test.tsx` (the stub source resolves under test control; double submit is checked) |
| Keyboard-only map plus deep link | Playwright `workmap-review.spec.ts:15` (Tab, arrows, Home, End, Enter, Space, Shift+Tab; no mouse, no `.focus()`) and `:61` |

Screenshots (gitignored; `npx playwright test` regenerates them):
- `web/test-results/s1-map.png`: Work Map
- `web/test-results/s1-map-detail.png`: detail panel, second piece of evidence
- `web/test-results/s1-review-rev1.png`: review at Revision 1
- `web/test-results/s1-review-rev2.png`: Revision 2 with change marker, old → new and an acknowledged mark
- `web/test-results/s1-review-confirmed.png`: Revision 2 confirmed

## Decisions made (and why), including deviations from the prompt
1. **Revision 1 is now all draft.** In S0, `workmap.json` marked two Revision 1 items `confirmed`. Revision 1 is the revision *under review*, so that would show confirmed knowledge before any teach-back. Items become `confirmed` only in the final scripted stage, which carries an `ExpertConfirmation` for Revision 2. As a result, `/map` after a fresh load shows only Draft/Unresolved/Revoked/Missing badges. To see confirmed badges, run the script on `/review` and then click "Work Map" in the nav (same tab; the e2e test does exactly this).
2. **The fixture state is per browser tab.** `getWorkMap` follows the script's current stage. A reload resets it to Revision 1.
3. **WS3 types are embedded, not copied.** `ReviewView.open_questions` is `OpenQuestion[]` and `confirmations` is `ExpertConfirmation[]`, and `WorkMapView.parent_revision_id`/`change_reason` are typed as `DraftRevision[...]`. `DraftRevision.steps` is not used, because the Work Map needs evidence and quotes that only WS5 content supplies.
4. **Reasoning and guardrails are styled as non-verbatim** ("Apprentice wording, not verbatim"). This is a conservative reading of B2: only `expert_quotes` count as the expert's words. If WS5 supplies verbatim reasoning, it should arrive as quotes.
5. **Revoked/missing detail shows nothing but the notice.** That means no evidence, quotes, summary or guardrails, in both `/map` and `/review`. No review marks are offered for them either.
6. **"Flag unresolved" is hidden on items that are already unresolved.**
7. **A mark acknowledgement means "received", not "corrected".** The text says that any change arrives as a new revision from the spoken review. A mark for a revision that is no longer under review fails in the fixture.
8. **A fixture playback panel sits on `/review`.** The human gate needs a way to run the sequence. The panel is labelled "Fixture playback (development only)", renders only for `fixtureSource`, and simulates WS3/WS5 pushes. It is not a confirmation control.
9. **Files outside the listed folders (deviation).** The prompt allowed `/map`, `/review`, `components/workmap/`, `components/review/` plus additive contract/data/fixture changes. I also added new pure modules in `web/lib/ui/status.ts`, `web/lib/workmap/` and `web/lib/review/`, and a test helper `web/lib/data/stubSource.ts`. All are new files, so S2 cannot conflict on them. I also extended `notes/ws7-ui-contracts-v0.md`, which is WS7's own note.
10. **The spec directory is `specs/002-ws7-workmap-review`.** If S2 also chose `002-…`, rename one of them at merge time. Only the directory name collides, not file contents.
11. **spec-kit.** `/speckit-clarify` was skipped because nothing was ambiguous. `/speckit-analyze` found:
    - 0 critical issues
    - C1 (medium): "selected item disappears in a new revision" needed a test. It is now covered in `WorkMapScreen.test.tsx`.
    - C2 (low): the no-ids guard should also run after selection and updates. Now covered in both e2e and `ReviewScreen.test.tsx`.

## Contract changes
`web/lib/ui/contracts.ts` (additive):
- `WorkMapView` gains `revision_label: string`, `parent_revision_id: DraftRevision["parent_revision_id"]` and `change_reason: DraftRevision["change_reason"]`. All three are required, so every `WorkMapView` fixture or producer must supply them.
- New `ReviewView` `{ session_id, current, previous, open_questions: OpenQuestion[], confirmations: ExpertConfirmation[], source }`.
- New `ReviewMark` `{ session_id, entry_id, revision_id, kind: "correction_requested" | "flag_unresolved" }`.

`web/lib/data/source.ts`:
- New method `getReview(sessionId): Promise<ReviewView>`.
- New method `submitReviewMark(mark): Promise<Ack<{ received_at_utc }>>`.
- `SourceUpdate` gains `{ type: "review"; review }`.

Any other `DataSource` implementation must add both methods. `stubSource.ts` already does.

## UI states needed from WS6 / content needed from WS5
**From WS5, per Work Map step** (the human should forward this):

| Field | Required | Notes |
|---|---|---|
| `entry_id`, `revision_id` | yes | Stable. Never displayed. Carried in the URL. |
| `kind` | yes | `step`, `decision`, `guardrail` or `exception` |
| `title` | yes | Short process wording. Shown as the item name. |
| `status` | yes | `draft`, `confirmed`, `unresolved`, `revoked` or `missing`. `confirmed` only after an `ExpertConfirmation` of that revision. |
| `expert_quotes[]` | yes for teachable items | Verbatim `{exchange_id, text}`, one per relevant exchange. An empty list renders "Missing expert words". |
| `evidence[]` | yes for teachable items | `{event_id, asset{asset_id, original_url, frame_id, width_px, height_px}, region{frame_id, normalized box, mapping_status}}`, with the region on the **same** frame as the asset. An empty list renders "Missing visual evidence". Several pieces are allowed. |
| `ai_summary` | optional | Shown only as "Apprentice summary" |
| `reasoning` | optional | Shown as apprentice wording, not verbatim. If verbatim, send it as a quote instead. |
| `guardrails[]` | for guardrail/exception items | What changes the decision and what to do when it triggers |
| `open_question` | when `unresolved` | One sentence, shown to the learner |

**Per revision (WS5/WS6):** `revision_id`, a human-readable `revision_label`, `parent_revision_id` and `change_reason`. **Per review (WS3 via WS6):** `OpenQuestion[]` with `answered_by_exchange_id`, and `ExpertConfirmation[]`, each naming its `revision_id`.

**From WS6:**
- `getReview` (or equivalent) returning the revision under review plus its parent.
- Push of new revisions and confirmations on the session stream.
- An endpoint that accepts `ReviewMark` and acknowledges receipt.

**Open question for WS3/WS5:** what should a review mark trigger in the agent's debrief? WS7 never makes the agent speak because of it.

## Known limitations / fixture-only screens
- Both screens are fixture-only; no WS6 API exists yet. The FIXTURE banner shows.
- The scripted state resets on reload and is not shared between tabs.
- The diff compares displayed text. Reordering items is not reported as a change.
- The Work Map shows the current revision only; there is no browsing of old revisions. A link to another revision gets a notice and the current revision.
- Not checked on the real demo display or through the glasses. That is the human gate.

## Human gate checklist
1. `cd .claude/worktrees/ws7-sprint-1/web && npm run dev`, then open http://localhost:3000/map on the demo display. `web/.env` is already copied and is gitignored.
2. Click through all 6 items, and repeat with the keyboard only (Tab into the list, ↑/↓, Enter). Check that:
   - item 1 has "Evidence 1/2" (two different traces)
   - item 2 has a dashed "Ambiguous region"
   - item 3's guardrail region is at the lower right
   - item 4 says Unresolved, shows the open question and both "Missing …" states
   - items 5 and 6 show only the "not teaching material" notice
   - the quote box (solid green bar, italic, "Expert") is clearly different from the dashed "Apprentice summary" box
3. Copy the address of a selected item, open it in a new tab, and check that the same item is selected.
4. Open `/review`. In "Fixture playback", press Next three times and check after each press:
   1. "The expert corrected Revision 1…"
   2. "Revision under review: Revision 2", "Changed since Revision 1: 1 item changed.", a "Changed" marker on the decision, and old → new in its detail
   3. "The expert confirmed Revision 2 in the spoken teach-back."
5. Select a step and press "Mark step for correction". It should show Pending, then Acknowledged. Tick "Simulate action failures" and try "Flag unresolved"; a failure message should appear.
6. Click "Work Map" in the nav and check that Revision 2 shows three Confirmed badges.
7. Merge from the main checkout: `git merge ws7-sprint-1`. If S2 merged first, expect conflicts in `web/lib/data/source.ts` and `fixtureSource.ts`/`fixtureSource.test.ts`; keep both sides' methods. Also add any new S2 `DataSource` methods to `web/lib/data/stubSource.ts`.

## Notes for the next sprint
- S3 (expert companion) can reuse `subscribe`. Extend `SourceUpdate` additively. `fixtureReviewScript` shows the pattern for scripted pushes plus a dev playback panel.
- S4 (summary) can link citations to `/map?entry=…&rev=…` via `mapHref`.
- `statusPresentation()` is the one place that decides status wording. Reuse it instead of writing new badge text.
- With an `apiSource`, map WS5/WS6 records into `WorkMapView`/`ReviewView` in one adapter, and keep `revision_label` human-readable.
