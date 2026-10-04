# WS7 Sprint 3 handoff: Session setup and expert companion
Branch: `ws7-sprint-3`   Worktree: `.claude/worktrees/ws7-sprint-3`   Spec: `specs/004-ws7-expert-companion/`   Date: 2026-10-04

**Prerequisite step (done on `voice`, at your request):** WS3 Sprint 1 was finished but not merged, so I merged it into `voice`. The merge commit is `289de30`.
- `.gitignore`: kept both sides.
- `web/app/page.tsx`: kept the WS7 entry page. WS3's `ExpertConsole` wiring went to `web/app/dev/page.tsx`, where S0 had moved the voice prototype.
- `e2e/smoke.spec.ts`: the `/dev` test now opens the console's "raw contextual update" toggle first.
- After the merge: typecheck passed, vitest 538/538, smoke 12/12. `ws7-sprint-3` branches from that commit.

## Delivered (files + one line each)
**Contracts and data (additive)**
- `web/lib/ui/contracts.ts`: `SessionView.rev?`, `CaseSummary`, `CompanionEvent`.
- `web/lib/data/source.ts`:
  - `SourceUpdate` gains `pointing_event` (the WS3 `PointingEvent`) and `connection`.
  - New `DataSource` methods: `listCases`, `startSession`, `requestPause`, `requestStop`, `getRecentEvents`.
- `web/lib/data/fixtureExpertScript.ts` (+test, fake timers):
  - one script per source instance;
  - a timed replay of the WS3 fixtures: evt-001 resolved → evt-003 repeat → evt-004 ambiguous;
  - start, pause, off-record and stop resolve after the fixture latency, pushing the `session` update (`rev+1`) before the ack;
  - configurable failures, and replay holds while paused;
  - `dropConnection()` / `restore()`: events keep accumulating while dropped and are picked up by resync.
- `web/lib/data/fixtureSource.ts`:
  - wires in the script;
  - `createFixtureSource` now returns `FixtureDataSource` (`DataSource & {expertControls}`);
  - new options `replayMs`, `failOffRecord`, `failPause`, `failStop`;
  - `subscribe` merges the review script and the expert script.
- `web/fixtures/ui/cases.json`: one labelled fixture case (trace A, the same picture as the WS3 pointing fixtures), with no answers.
- `web/lib/data/stubSource.ts`: adds a session, deferred session requests (`requests[]`) and settable `state` for resync tests.
- `web/lib/practice/fixtureSettings.ts` (+test): adds `fixture_replay_ms` and `fixture_fail=offrecord|pause|stop`.

**Pure logic (TDD)**
- `web/lib/companion/companionMachine.ts` (+20-case test): requests stay pending until an authoritative `SessionView` reaches the target. It also handles the stale-`rev` guard, duplicate-request guard, failure-keeps-state, ended-clears-pending, dedupe/cap of events, and resync.
- `web/lib/companion/eventToEvidence.ts` (+test): `PointingEvent` → `CompanionEvent`, on the event's own frame; the dev `label` is dropped.
- `web/lib/companion/shortcuts.ts` (+test): P / O / S / [ ; ignored while typing in a field or with a modifier.
- `web/lib/companion/copy.ts`: icon + text for every status.
- `web/lib/ui/agentState.ts`: moved out of `TutorPanel` so tutor and companion share it; its test moved too.

**UI**
- `web/app/expert/page.tsx`:
  - setup → companion → ended;
  - fixture source taken from URL parameters;
  - hosts WS3's `useExpertSession()` + `<VoiceSession flow="expert">` in the rail;
  - FIXTURE banner.
- `web/components/companion/ExpertSetup.tsx`: case picker (no ids shown), connections, "Open trace display (new window)", and Start, which shows "Starting… waiting for confirmation".
- `web/components/companion/ConnectionPanel.tsx`:
  - capture comes from the session and shows "Unknown";
  - agent shows the real voice state;
  - backend shows "No backend: fixture data" in fixture mode;
  - it never says "Connected" without a signal.
- `web/components/companion/ExpertCompanion.tsx`:
  - status bar: recording / OFF RECORD indicator, agent, paused;
  - Reconnecting… banner;
  - trace column with `EvidenceViewer` (latest event's own frame; ambiguous → dashed + "Ambiguous: the apprentice will ask you to clarify"; unresolved → no highlight);
  - collapsible edge rail;
  - two-press stop;
  - ended view with "Open debrief review" → `/review`.
- `web/components/companion/ControlRail.tsx`: pending labels ("… waiting for confirmation"), a `role=alert` per failure stating the unchanged state, and `<kbd>` hints.
- `web/components/companion/RecentEvents.tsx`: up to 6 events newest first, each with mapping status + icon, session time (labelled as session time), channel or "unknown", and an off-record tag.
- `web/components/companion/useCompanion.ts`: subscribes before reading, resyncs after a reconnect, and routes requests through the reducer so a double press sends once.
- `web/components/companion/AgentStateBridge.tsx`: reads `useConversationStatus` / `useConversationMode` inside the VoiceSession and reports up; it sends nothing.
- `web/components/companion/CompanionFixtureControls.tsx`: "Simulate connection drop" / "Restore connection", labelled as Fixture behaviour.
- `web/components/companion/ExpertScreenShare.tsx`: an optional `<details>` panel labelled as a companion capability that does not replace pointing and does not connect to the glasses. It reuses S2's `useScreenObservation` + `ScreenSharePanel`.
- `web/app/expert/display/page.tsx` + `display.module.css`: a fixed full-viewport overlay; the trace uses `object-fit: contain` at 100vw×100vh; a small corner shows the title, the FIXTURE badge and "Esc to exit"; Esc goes to `/expert`.
- `web/components/evidence/EvidenceViewer.tsx`: optional `notice` override per render state (defaults unchanged).
- `web/components/practice/ScreenSharePanel.tsx`: optional `heading` and `copy` props (defaults unchanged).

**Tests**
- `components/companion/ExpertCompanion.test.tsx`: 15 tests.
- `components/companion/ExpertSetup.test.tsx`: 5 tests.
- `lib/companion/noSpeech.test.ts`: greps `components/companion`, `lib/companion` and `app/expert` for `sendContextualUpdate`, `sendUserMessage`, `sendMultimodalMessage`, `deliverFixture` and `sendUserActivity`.
- `e2e/expert.spec.ts`: 7 tests.

**Docs:** `notes/ws7-ui-contracts-v0.md` §7, plus the spec-kit artifacts in `specs/004-ws7-expert-companion/`.

## Verification evidence
```
$ npm run typecheck
> tsc --noEmit
exit=0

$ npx vitest run
 Test Files  50 passed (50)
      Tests  602 passed (602)

$ PW_PORT=3103 npx playwright test
✓ e2e/expert.spec.ts › setup → companion with event replay → off-record → stop → debrief review (6.0s)
✓ e2e/expert.spec.ts › controls never overlap the trace at 1280×800 (2.7s)
✓ e2e/expert.spec.ts › controls never overlap the trace at 390×844 (2.7s)
✓ e2e/expert.spec.ts › a dropped connection shows Reconnecting… and restore resyncs (4.3s)
✓ e2e/expert.spec.ts › a failed off-record request is shown and the session stays on record (2.2s)
✓ e2e/expert.spec.ts › trace display is full-bleed with minimal chrome and Esc exits (999ms)
✓ e2e/expert.spec.ts › entry offers Expert session and Newcomer practice (239ms)
✓ (22 existing S0–S2 tests, incl. /expert smoke: FIXTURE banner, no alert, no internal ids)
29 passed (10.3s)

$ npm run build
✓ Generating static pages using 11 workers (11/11)   … ○ /expert  ○ /expert/display …

$ grep -rliE 'expected[_ ]?(decision|answer)|acceptable[_ ]?explanation|common[_ ]?wrong|scoring|answer[_ ]?key|rubric' .next/static fixtures/ui public/fixtures/ui; echo "grep exit=$?"
grep exit=1        # no matches (23 chunk files scanned)
```

**Overlap check:** for each of 1280×800 and 390×844, and with the rail both expanded and collapsed (`[`), the bounding boxes of `companion-trace` and `control-rail` do not intersect. At 390 px the rail stacks under the trace.

**Screenshots** are in `web/test-results/expert/`. That folder is gitignored, so re-run Playwright to regenerate them.
- `01-setup.png`
- `02-resolved.png`
- `03-ambiguous.png`
- `04-off-record-pending.png`
- `05-off-record.png`
- `06-ended.png`
- `07-reconnecting.png`
- `08-off-record-failed.png`
- `09-trace-display.png`
- `layout-1280-expanded.png`, `layout-1280-collapsed.png`, `layout-390-expanded.png`, `layout-390-collapsed.png`

## Decisions made (and why)
1. **What counts as an acknowledgement.** Pending clears when a `SessionView` reaches the target, either as the `Ack` value or as a `subscribe` push.
   - WS6 api-v0 names the `200 Session` as the ack and also emits `record_state.changed`.
   - Accepting either one avoids a hang if the push is lost during a reconnect.
   - The prompt says "through subscribe". The fixture always pushes before resolving, so in fixture mode the push is what flips the state. A test also covers the subscribe-only path.
2. **Pause is fixture-backed.** WS6 has no pause (WS7-Q2). The new `requestPause` is used by the UI, and the WS6 gap is listed below.
3. **Stop takes two presses** ("Press again to stop"; disarms after 5 s or on Escape) instead of a dialog, because a dialog would cover the trace.
4. **The voice session lives in the companion's rail.** It stays mounted when the rail collapses, using `hidden` rather than unmounting. Agent status comes from the real ElevenLabs hooks through `AgentStateBridge`. During setup the agent reads "Apprentice not connected", because the voice is started from the companion.
5. **The companion never calls WS3's `deliverFixture` or any send method.** In fixture mode, the replayed pointing is therefore shown to the expert but not given to the agent. That is deliberate (B2): delivering events to the agent is WS3's input path.
6. **Rail as a grid column, not an overlay.** The layout uses `trace | 22rem rail` (4rem collapsed), stacked below 48rem. Overlap is ruled out by construction and asserted in Playwright.
7. **The trace display is a fixed overlay** above the root layout. The nav and max-width can't be removed for a single route without a route-group refactor.
8. **One fixture case.** All WS3 pointing fixtures are on trace A. A second case would have replayed trace-A events against a different trace.
9. **Screen frames from the expert** go through `submitScreenFrame(caseId, …, {draft_revision: 0})`. 0 means "not a learner draft". WS6 should decide whether expert frames get their own endpoint (see below).
10. **ElevenLabs hooks.** `agentState()` moved to `lib/ui/agentState.ts`. The ElevenLabs hooks are used only in `AgentStateBridge`, which follows the same pattern as S2's TutorPanel.

## Contract changes (`web/lib/ui/contracts.ts`, DataSource)
These are all additive. Details are in `notes/ws7-ui-contracts-v0.md` §7.
- `SessionView.rev?: number`, `CaseSummary`, `CompanionEvent`.
- `SourceUpdate`: `pointing_event`, `connection`.
- `DataSource`: `listCases()`, `startSession(caseId)`, `requestPause(sid, paused)`, `requestStop(sid)`, `getRecentEvents(sid)`.
- `fixtureSource.requestOffRecord` is now implemented. The old "not implemented: Sprint 3" test was replaced.

## UI states needed from WS6 / content needed from WS5
**Live-update events WS6 needs to provide (for apiSource):**

| UI need | WS6 |
|---|---|
| `session` push with `rev` | SSE `session.updated` and `record_state.changed` → GET session. Please include `Session.rev` in the record. |
| `pointing_event` push | SSE `event.stored {event_id}` → `GET /api/sessions/:sid/events/:event_id` returning the WS3 `PointingEvent` shape |
| `connection` push | Derived from EventSource readyState: error/connecting → `reconnecting`, open → `connected` |
| Resync | `Last-Event-ID` replay, or `GET /api/sessions/:sid` plus a **new `GET /api/sessions/:sid/events?limit=6`** |
| `startSession(caseId)` | `POST /api/sessions {role:"expert", case_id}` then lifecycle `start`. One call that returns an active session would be simpler. |
| `requestPause(sid, paused)` | **New:** lifecycle `pause` / `resume`, with `paused` in the lifecycle enum (WS7-Q2) |
| `requestStop(sid)` | Lifecycle `end`, or `abort` for incomplete sessions. Should "Stop" ever map to `abort`? |
| `listCases()` | A learner-safe case list from the WS4 manifest (`case_id`, title, trace image + frame size). No answers. |
| Connection status | An authoritative capture-device status (WS2 via WS6) and agent status (WS7-Q1). Both show "Unknown" until then. |
| Expert screen frames | An endpoint for expert-session stills, or confirmation that `screen-frames` covers both roles |

**Still missing from WS3:**
- **Off-record mechanism.** WS3 S1 has none; it is planned for WS3 S4. When the expert goes off record, the agent should mute or stop asking and POST `record-state`, and off-record content should be excluded. Today the companion only records the request through the DataSource. The agent itself is not informed.
- **Pause/stop semantics for the agent.** WS3 doesn't yet define what the agent does while the session is paused. When the session ends, the companion unmounts its VoiceSession, which should end the conversation. Please verify this in the live gate.
- **Session id alignment.** `useExpertSession` generates its own `session_id`, which differs from the DataSource/WS6 session the companion shows. WS3 should accept a session id from the page, or WS6 should create the session for both.
- **Pointing ingestion.** WS3 receives events only through dev `deliverFixture`. Once WS6 streams `event.stored`, WS3 (not the companion) should forward them to the agent.

**WS5:** nothing new this sprint.

## Known limitations / fixture-only screens
- `/expert` and `/expert/display` run on fixtures only, with the FIXTURE banner and badge. The case list, start, pause, off-record ack, event replay and connection drop are all fixture behaviour.
- Capture status is always "Unknown", because no WS2 signal reaches the web app.
- The voice apprentice is not live-tested here; that needs keys and the human gate. VoiceSession shows its own "Ready/Listening" label next to our agent status (WS3-owned, not changed).
- The rail's collapse state is not remembered between visits.
- Pointing shown during pause: the fixture holds the replay while paused. A real capture device might still send events, and the companion would display them.

## Human gate checklist (~20 min)
1. **Start the app.** In `.claude/worktrees/ws7-sprint-3/web`, `.env` is already copied from `web/.env`. If the key is stale, use `ELEVEN_LABS_KEY` from the repo-root `.env`. Run `npm run dev -- -p 3103` and open `http://localhost:3103/` in Chrome on the laptop or second screen.
2. **Entry and setup.**
   - Choose "Expert session" on the entry page.
   - Check that Capture reads "Unknown", Voice apprentice reads "Apprentice not connected", and Backend reads "No backend: fixture data". Nothing should say "Connected".
3. **Trace display.**
   - Click "Open trace display (new window)", move it to the demo monitor and make it full-screen.
   - **With the glasses on**, check that the trace is legible from the expert's position.
   - Esc should go back to `/expert`.
4. **Start the session.**
   - Press "Start session". It should read "Starting… waiting for confirmation", then the companion appears.
   - Over about 8 s you should see:
     - a solid "Indicated region";
     - a second "Region identified" (the repeat);
     - then a dashed "Ambiguous region" with "Ambiguous: the apprentice will ask you to clarify".
5. **Voice.**
   - In the rail, press Start under "Voice apprentice" and allow the microphone.
   - The status bar should move from "Waiting…" to "Apprentice is listening/speaking".
   - **Check that nothing speaks because of a UI action:** pointing arriving, pressing O/P, or collapsing the rail with `[` should cause no agent speech. The apprentice should only respond to your voice.
6. **Off record.**
   - Open `/expert?fixture_latency=5000`, start, then press `O`.
   - "Going off record… waiting for confirmation" should stay for about 5 s, and the red **OFF RECORD** indicator should appear only after that.
   - Then open `/expert?fixture_fail=offrecord`, start, and press `O`. You should get the alert "Off-record change not confirmed … You are still on record", and no indicator.
7. **Reconnect.** In "Fixture behaviour", click "Simulate connection drop". You should see "Reconnecting…". Click "Restore connection": the banner goes away and the latest events are shown.
8. **Stop.**
   - Press `S`. You should see "Press again to stop". Press `S` again: "Stopping… waiting for confirmation", then "Session ended".
   - Click "Open debrief review", which should open `/review`.
   - Also check that the voice conversation ended when the companion closed (see the WS3 gap above).
9. **Phone width.** Optionally, check at phone width (DevTools, 390 px) that the rail sits under the trace.
10. If everything passes, merge `ws7-sprint-3` into `voice`.

## Notes for the next sprint
- S4 (summary/integration): `apiSource` must implement the five new methods and the `pointing_event` / `connection` pushes, following the WS6 table above.
  - Keep the `rev` guard in the reducer even with SSE ordering.
  - Map EventSource `error` to `reconnecting`, and resync on `open`.
- When WS3 adds off-record, wire the companion's off-record control to the same WS6 `record-state` call.
  - The UI already waits for the ack.
  - Don't add a second toggle in WS3's console; the companion is the expert's control.
- When WS6 provides capture/agent status in `SessionView.connection`, `ConnectionPanel` shows it unchanged. Prefer the agent status from the voice hooks while the voice runs in this page.
