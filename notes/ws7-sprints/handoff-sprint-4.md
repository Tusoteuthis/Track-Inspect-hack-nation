# WS7 Sprint 4 handoff: Learning summary, trust controls, real API, demo readiness
Branch: `ws7-sprint-4` (branched from `ws7-sprint-3`)   Worktree: `.claude/worktrees/ws7-sprint-3`   Spec: `specs/005-ws7-summary-integration/`   Date: 2026-10-04

**Prerequisite state found:**
- **S3 is not merged into `voice`.** `ws7-sprint-3` is unmerged, so S4 branches from it. Merging `ws7-sprint-4` brings S3 with it.
- **WS6 S0–S2 exists only on `004-ws6-knowledge-confirmation`.** It is not on `voice`. WS6 S3 (cases, drafts, evaluations, commit, assessment) and S4 (revoke, delete) don't exist anywhere yet.
- **Human decision (2026-10-04):** build `apiSource` against the WS6 api-v0 contract with mocked tests, and do **not** merge WS6. Every screen therefore stays **fixture**.

## Delivered (files + one line each)

**Contracts and data (additive)**
- `web/lib/ui/contracts.ts`:
  - `DataOrigin` gains `"stub"`.
  - New `AssessmentItem.interventions?` and `AssessmentView.limitations?`.
- `web/lib/data/source.ts`:
  - `SourceUpdate` gains `{type:"knowledge"}`.
  - New `revokeEntry` and `deleteEvidence`, plus the result types `RevokeResult` and `DeleteEvidenceResult`.
- `web/lib/data/fixtureKnowledge.ts` (+test): one shared, tab-wide store for revocations and deletions.
  - Cascade: deleting an event revokes every entry that cites it.
  - Views keep revoked items, marked "revoked".
  - Every listener receives `knowledge` pushes.
- `web/lib/data/fixtureSource.ts` (+tests):
  - `revokeEntry` / `deleteEvidence` acknowledge only after the latency, and refreshed Work Map and review views are pushed.
  - New options `failRevoke`, `failDelete` and `knowledge`.
  - Practice citations read the store live.
  - New `isFixtureDataSource`.
- `web/lib/data/fixturePractice.ts`: `workmap` can be a getter, so a later revoke is honoured.
- `web/lib/practice/fixtureSettings.ts` (+test): `fixture_fail=revoke|delete`.
- `web/lib/data/stubSource.ts`:
  - deferred `trust[]` requests;
  - `assessment`, `practiceCase`, `rejectAll` and `kind` options.
- `web/fixtures/ui/assessment.json`: filled in with one item per group, interventions, a citation to the fixture guardrail, and limitations. Labelled fixture; contains no answers.

**Lane A: Learning summary**
- `web/lib/summary/groups.ts` (+test): display guard. An item with interventions always goes to "Needed help".
- `web/components/summary/SummaryScreen.tsx` (+9 tests) + `summary.module.css`:
  - four groups, each with icon, heading and border style, so status never relies on colour;
  - "Help given" list;
  - citations deep-link with `mapHref(entry, rev)`;
  - limitations;
  - no score;
  - loading, empty (no session / empty assessment) and error states.
- `web/app/summary/page.tsx`: `?session=` support, and the source is chosen per screen.

**Lane B: Trust controls and states**
- `web/lib/trust/trustState.ts` (+test): pending until the Ack arrives; no double submit; a failure keeps the state and allows a retry; an acknowledged action can't be resubmitted.
- `web/components/trust/TrustControls.tsx` (+4 tests) + css:
  - **Remove from teaching** and **Delete evidence N**, each needing two presses (disarms after 5 s or on Esc);
  - "… waiting for confirmation" while pending;
  - `role=alert` when it fails;
  - a confirmed message after the ack.
  - Used on `/map` item detail (next to the existing correction / flag notes) and on `/review`.
- `web/lib/practice/reviewMachine.ts` (+4 tests): new `KNOWLEDGE_REVOKED` event. It invalidates a review whose evaluation cited the entry, or a pending one. A saved decision never changes.
- `web/components/practice/usePracticeLoop.ts` + `PracticeScreen.tsx`:
  - revoked citations are filtered out of the guidance;
  - a "removed from teaching, ask for a new review" notice appears;
  - after Saved there is a **See the learning summary** link.
- `web/components/practice/PracticeRevocation.test.tsx`: an integration test with the real fixture source. A revoke from another source instance removes the citation on `/practice`, and later reviews never cite it.
- `web/components/shell/ConnectionStatus.tsx`:
  - the single shared banner (`useConnectionState`, `SessionConnectionStatus`): reconnecting/disconnected with icon and text;
  - nothing is shown while connected or unknown;
  - used on `/expert` (replacing the companion's own banner), `/review`, `/map`, `/practice` and `/summary`.
- `web/app/routeErrors.test.tsx`: each of `/expert`, `/expert/display`, `/review`, `/map`, `/practice` and `/summary` renders its `role=alert` error when the source rejects.
- `web/app/layout.tsx` + `globals.css`: a **Skip to main content** link, and `main#main` can take focus.
- `web/components/shell/FixtureBanner.tsx`: shows a STUB OUTPUT banner for stub data.

**Lane C: apiSource (written by a subagent; reviewed and integrated by me)**
- `web/lib/data/ws6Wire.ts`: the subset of the WS6 wire types we use, copied from api-v0. Replace with `@/lib/contracts` once WS6 merges.
- `web/lib/data/ws6Mappers.ts` (+31 tests): WS6 → UI types, with every mismatch listed below.
- `web/lib/data/apiSource.ts` (+27 tests):
  - fetch with the error envelope; EventSource for the live stream;
  - a BusEvent triggers a re-fetch, which becomes a `SourceUpdate`;
  - evaluations are polled;
  - Idempotency-Key header and idempotency_key body field are sent;
  - each method without a WS6 route rejects or fails with "… not available from the backend yet".
- `web/lib/data/screenSources.ts` (+8 tests): `NEXT_PUBLIC_WS7_LIVE_SCREENS`, `NEXT_PUBLIC_WS6_BASE_URL`, and one shared `getApiSource()`.
- `web/components/shell/useScreenSource.ts`: `useScreenSource(screen)`, `useFixtureOverrides(source)` (fixture URL settings on `/map` and `/review`) and `useSessionParam`.
- Every page (`/expert`, `/expert/display`, `/review`, `/map`, `/practice`, `/summary`) now picks its source per screen.
- `/review`, `/map` and `/summary` take `?session=`. Without one, a live screen shows its empty state.
- The expert "Open debrief review" link now carries `?session=`.

**Lane D: Demo readiness**
- `web/e2e/journey.spec.ts`, at 1920×1080:
  - the full journey: entry → expert → review → Work Map (+ evidence deletion) → practice (wrong → guidance → corrected → saved) → summary → citation back into the Work Map;
  - skip link on each route;
  - a forced removal failure on `/map`;
  - an acknowledged removal on `/review`.
- `notes/ws7-demo-navigation.md`: the route-by-route path with what to click and say, the B3 moment each step proves, fallbacks, and what is live vs fixture.
- `web/README.md` (new): startup, verification, environment variables, and the live/fixture table per screen.
- `notes/ws7-ui-contracts-v0.md` §8.

## Verification evidence
```
$ npm run typecheck
> tsc --noEmit
typecheck exit=0

$ npx vitest run
 Test Files  60 passed (60)
      Tests  719 passed (719)          # was 602 at S3; +117

$ PW_PORT=3104 npx playwright test
✓ e2e/journey.spec.ts › entry → expert companion → review → Work Map → practice (wrong → guidance → corrected → saved) → summary (14.8s)
✓ e2e/journey.spec.ts › keyboard: the skip link moves focus to the main content on every route
✓ e2e/journey.spec.ts › removal on /map: pending, then a forced failure is shown and the item keeps its content
✓ e2e/journey.spec.ts › removal on /review: pending until acknowledged, then marked Revoked
✓ (29 existing S0–S3 tests)
33 passed (17.6s)

$ npm run build
✓ Generating static pages using 11 workers (11/11)   … ○ /map ○ /practice ○ /review ○ /summary …

$ grep -rliE 'expected[_ ]?(decision|answer)|acceptable[_ ]?explanation|common[_ ]?wrong|scoring|answer[_ ]?key|rubric' .next/static fixtures/ui public/fixtures/ui; echo "grep exit=$?"
grep exit=1        # no matches (21 chunk files scanned)
```

**The acceptance criteria and the tests that cover them:**
- **The summary never places assisted items under "done independently":** `SummaryScreen.test.tsx` › "never places an assisted item…", plus `groups.test.ts`.
- **A deletion stays pending until acked:** `TrustControls.test.tsx` › "a deletion needs two presses and stays pending until acknowledged", plus `fixtureSource.test.ts` › "a revoke is acknowledged only after the latency…".
- **A revoked item disappears from `/practice` citations:** `PracticeRevocation.test.tsx`, plus `PracticeScreen.test.tsx` › "a revoked expert entry disappears…".
- **Every route renders its error state:** `app/routeErrors.test.tsx` (6 routes).

**Screenshots** are in `web/test-results/journey/` (gitignored; re-run Playwright to regenerate them), all at 1920×1080:
- `01-entry`
- `02-expert-companion`
- `03-review-rev1`
- `04-review-confirmed`
- `05-workmap-guardrail`
- `06-workmap-delete-pending`
- `07-workmap-delete-acknowledged`
- `08-practice-guidance`
- `09-practice-saved`
- `10-summary`
- `11-workmap-remove-failed`
- `12-review-removed`

## Decisions made (and why)
1. **Branch from `ws7-sprint-3`.** S3 was not yet merged, and S4 builds on its contracts.
2. **Spec-kit artifacts were written directly** (`spec.md`, `plan.md`, `tasks.md`) instead of running each `/speckit-*` command. The scope was fully specified by the prompt, and I recorded the user's one clarification (Lane C) in `spec.md`.
3. **"Deletion" means two controls.**
   - **Remove from teaching** maps to WS6 `revoke` for an entry.
   - **Delete evidence** maps to WS6 `DELETE event`. Following the WS6 cascade, it also revokes the entries that cite that evidence.
   - **Correction** stays the existing "Mark step for correction" note (`submitReviewMark`), now also on `/map`. A real correction happens in the spoken teach-back, which produces a new revision.
4. **Revoked items stay visible where history is shown.** On `/map` and `/review` they are marked **Revoked**, with no teaching content (the existing `WorkMapDetail` rule). They disappear from teaching: `/practice` citations and new evaluations.
5. **A revocation invalidates a practice review only if that review cited the entry, or if the review is still pending.** This mirrors WS6 marking dependent evaluations stale. A revocation that touched nothing the learner relied on leaves "Review complete" alone. If WS6 still rejects the commit as stale, the save shows as failed (no optimistic Saved).
6. **Fixture trust state lives in one store per tab.** That way a revoke on `/map` shows on `/practice` after in-app navigation. A reload resets it, the same as the review script.
7. **Summary display guard.** Interventions mean "Needed help" even if upstream labels the item independent. This is a trust display rule, not a domain judgment: WS5 still assigns the classes. There is no score, because WS5 supplies none.
8. **Two-press confirm for destructive actions.** It is the same pattern as Stop in S3, and a dialog would hide the evidence.
9. **Source per screen via public env**, defaulting to fixture. `useFixtureOverrides` gives `/map` and `/review` the same `fixture_*` URL settings as `/expert` and `/practice`, for the human gate.
10. **Skip link added during the keyboard pass.** While checking it, I found a WS3 issue (see below), so `/practice` is excluded from the skip-link e2e test.

## Contract changes (`web/lib/ui/contracts.ts`, DataSource)
All are additive; see `notes/ws7-ui-contracts-v0.md` §8.
- `DataOrigin += "stub"`.
- `AssessmentItem.interventions?`, `AssessmentView.limitations?`.
- `SourceUpdate += {type:"knowledge", entry_id, revision_id, status}`.
- `DataSource.revokeEntry(entryId, revisionId) → Ack<RevokeResult>`.
- `DataSource.deleteEvidence(sessionId, eventId) → Ack<DeleteEvidenceResult>`.

## WS6 ↔ UI mismatches handled in the mapping layer (`ws6Mappers.ts` / `apiSource.ts`)

**Session, connection and stream**
1. Lifecycle: `aborted` → `ended`, so incomplete and completed endings can't be told apart. `created` → `not_started`.
2. There is no `paused` state (WS7-Q2): `requestPause` fails with "Pause is not supported by the backend yet."
3. There is no capture or agent presence signal (WS7-Q1): capture and agent show `unknown`. Backend status comes from the EventSource state.
4. `pinned_knowledge[]` → singular `knowledge_revision_id` (the first entry).
5. WS6 `source: stub` → UI `"stub"`, which shows a banner.
6. Live events can arrive twice, through both the named listener and `onmessage`. They are deduplicated by `seq`, which WS6 persists per session.

**Work Map**
7. The Work Map is global (WS7-Q3): `session_id` is the WS6 one, else the requested one.
8. There is no single Work Map revision id: `revision_id` = `job_id`, else `generated_at_utc`, else `"workmap"`. The label is "Current Work Map", and `parent_revision_id` and `change_reason` are `null`.
9. The map's `source` is the least trustworthy step source: fixture, then stub, then live.
10. The map is fetched with `include=draft`, so non-confirmed items appear, each labelled with its status.
11. WS5 kind `escalation` → `guardrail`; unknown kinds → `step` (WS5-Q2).
12. A null `revision_id` or status → `missing`, with `revision_id: ""`.
13. `is_current: false` has no UI field, so a superseded revision looks current.
14. With no WS5 `content`: answer lines become verbatim quotes, and there is no summary or guardrails.
15. Guardrails become "When <trigger>: <action>". `reasoning` and `open_question` are always `null`.
16. There is no `frame_id` on assets or evidence (WS7-Q4): `asset.frame_id = region.frame_id = "asset:<asset_id>"`, which WS6 §2/§7 allows. The size comes from `region.frame_*_px`.
17. Evidence has no `mapping_status`, so it is always `resolved`. The real value is on the PointingEvent and is not fetched.
18. Relative asset URLs get the base URL prefixed, in both Work Map evidence and PointingEvent image refs.

**Assessment**
19. Classes: `correct_unassisted` → independent; `correct_after_help` → assisted; `unresolved_or_escalated` and any unknown class → unresolved.
20. Interventions → assisted (the trust guard).
21. With no `content`: never independent. One assisted item if there was assistance, else one unresolved item.
22. `practice_next` and `limitations` come from WS5 `content`, else WS6's top-level field. `evidence_used` comes from the refs.

**Learner evaluation and commit**
23. `knowledge_revision_ids[]` → `knowledge_revision_id`, comma-joined (WS7-Q5).
24. Evaluation defaults: no outcome → `"failed"`; missing feedback → `""`; missing guiding question → `null`.
25. A citation quote is attached only when WS6 sends one.
26. The UI `draft_id` is used as the WS6 newcomer session id (WS6 §8). `visual_context` is sent as `[]`, because a UI region has no asset id or frame size.
27. If the server's `draft_rev` differs from the UI's, the review fails ("The draft changed on the server").
28. Commit errors keep their code visible ("evaluation_stale: …"). A commit with no `evaluation_id` fails without calling the backend.

**Revoke, delete and errors**
29. `revokeEntry` echoes the ids it was asked about. `deleteEvidence` returns `revoked_entry_ids: []`; revoked entries arrive later as `entry.revoked`.
30. An error envelope becomes its `message`, else "HTTP <status>". A network error becomes "Could not reach the backend."

## UI states needed from WS6 / content needed from WS5 (for the human to forward)

**WS6**
- **Merge S0–S2 into `voice`.** After that, `/map` can go live (`NEXT_PUBLIC_WS7_LIVE_SCREENS=map`).
- **Missing routes that block live screens:**
  - learner-safe case list (`listCases`, for `/expert` setup);
  - `pause`/`resume` lifecycle actions;
  - a review view (current + previous revision, open questions, confirmations) or agreement that WS7 composes it from `workmap?include=draft`, `draft`, `gaps` and confirmations;
  - a review-mark route;
  - an expert screen-frame endpoint.
- **S3:** `LearnerCase` shape, plus the draft, evaluation, commit and assessment routes (for `/practice` and `/summary`).
- **S4:**
  - `POST /api/knowledge/entries/:id/revoke`;
  - `DELETE …/events/:eid` with a cascade summary listing the revoked entries;
  - `entry.revoked` emitted on newcomer streams as well.
- **Add to records:**
  - `frame_id` and `mapping_status` on Work Map evidence;
  - a Work Map revision id;
  - `is_current`-aware status;
  - capture and agent presence (WS7-Q1).

**WS5**
- Assessment `content.decisions[]` with `outcome_class`, `interventions` and `cited_entries`, plus `limitations` and `practice_next`, as WS5 S4 plans.
- Please confirm that interventions on a `correct_unassisted` decision can't happen. The UI shows such an item as assisted.
- Entry kind `escalation`: the UI currently shows it as a guardrail (WS5-Q2).

**WS3**
- **Keyboard focus bug.** `VoiceSession` calls `transcriptEnd.scrollIntoView` on mount, even with an empty transcript. That moves Chrome's Tab starting point past the page content, so on `/practice` (and in the expert companion) the first Tab skips the skip link and the form. Fix: scroll only when there is at least one transcript line.
- The off-record, session-id and pointing-ingestion gaps from the S3 handoff are still open.

## Known limitations / fixture-only screens

| Screen | Live or fixture | Reason |
|---|---|---|
| `/expert`, `/expert/display` | **fixture** | WS6 is not on `voice`. Once it is, the case list and pause still have no route. |
| `/review` | **fixture** | WS6 is not on `voice`, and it has no review view or review-mark route. |
| `/map` | **fixture** | WS6 is not on `voice`. It could go live right after the WS6 S2 merge; revoke and delete then need WS6 S4. |
| `/practice` | **fixture** | WS6 S3 does not exist yet. |
| `/summary` | **fixture** | WS6 S3 (assessment) and WS5 S4 (`decisions[]`) do not exist yet. |

- `apiSource` has been tested only against mocks. Nothing has been run against a live WS6 server.
- Fixture revocations last only for the tab (in memory). A reload restores everything.
- `/review` accepts a revoke on any item. In the fixture, the confirmed stage and the later stages share entry ids, so a revoked entry stays revoked across stages.
- The connection banner can only appear on screens with a live source; the fixture only simulates drops on `/expert`.

## Human gate checklist (~30 min)
1. **Start the app.** In `.claude/worktrees/ws7-sprint-3/web`, run `npm run dev -- -p 3104`. Open `http://localhost:3104/` in Chrome on the **intended demo display** (1920×1080 was checked), ideally with the WS1 demo owner.
2. **Run the demo** following `notes/ws7-demo-navigation.md` steps 0–9 in one tab. Check that:
   - the expert replay shows a solid region, then the ambiguous dashed region;
   - the review steps through to confirmed;
   - the Work Map shows Revision 2 with evidence and expert words;
   - deleting evidence on Workflow step 1 shows "Deleting… waiting for confirmation" before the item turns **Revoked**;
   - practice: wrong draft → Guidance needed (Save disabled, expert example cited) → revised → Review complete → Saved;
   - the summary puts the corrected decision under **Needed help** with the help given, has no score, and its citation opens the guardrail.
3. **Revocation reaches practice.** Reload. On `/map`, open **Guardrail** and **Remove from teaching** (press twice). Then go to **Practice** and request a review: the guidance must cite no expert example. If a review with the citation is already open on `/practice` in another step, the example disappears and the "removed from teaching" notice appears.
4. **Failures are visible.** On `/map?entry=fixture-entry-001&rev=fixture-rev-1&fixture_fail=revoke`, the removal alert should say "Removal not confirmed. The item is unchanged.", and the item keeps its content.
5. **B3 and labelling.** Check that every challenge moment in B3 is visible, and that **every data screen shows FIXTURE DATA**: nothing fixture-backed may be presented as live.
6. **Keyboard.** Tab from the top of `/summary` and `/map`: Skip link, then nav, then content; focus is always visible.
7. **Live voice (if keys work):** start the voice apprentice on `/expert` and the tutor on `/practice`, and check that nothing speaks because of a click.
8. **Merge.** Merge `ws7-sprint-4` into `voice`. This also brings in S3, which is unmerged.

## Notes for the next sprint / integration
- **After WS6 merges:**
  - set `NEXT_PUBLIC_WS7_LIVE_SCREENS=map` first and check `/map` against a real synthesis run;
  - add `expert` once a case-list route exists.
- **Replace `ws6Wire.ts` with imports from `@/lib/contracts`,** and keep the mapper tests as the compatibility check.
- **Live verification gap:** the EventSource dedupe by `seq` and the evaluation polling interval (500 ms, 20 s timeout) need checking against the real server.
