# 006 — WS7 Monitor video: the expert's inspection player

**Status:** design approved in chat 2026-10-04; spec awaiting review
**Branch:** `ws7-sprint-4` (worktree `ws7-sprint-3`)
**Source video:** `data/WhatsApp Video 2026-10-04 at 10.09.58.mp4` (832×464, 59.94 fps, 22.77 s, h264 + aac)

## 1. Context and intent

The expert session is the heart of the demo: the expert wears Meta Ray-Ban glasses, looks at a sensor trace on a monitor, physically points at a region and explains it to the ElevenLabs apprentice (`notes/project-brief.md` §1, §4.1). Today the monitor (`/expert/display`) shows one static SVG trace.

The team now has a short video that becomes **the main thing the expert looks at**: a train passing a rail wheel sensor, the sensor's measuring principle, then a scrolling two-channel trace (Sys1/Sys2) with track position, speed and bogie annotations. The monitor must behave like a professional inspection tool the expert can drive hands-light while wearing the glasses.

**What the user said:** embed the video as the main interface the expert assesses through the glasses; professional-tool feel; design from the project's workflow and the inspector's role. Choices made in brainstorming: auto-holds + clicker keys; neutral hold prompts; live mirror to the companion with hold-timed fixture evidence; extend the existing display route.

**Assumptions (confirmed by approval of the design):** the video plays on the demo monitor (not in the glasses); pointing at a moving trace needs held moments; domain labels in the video are visual content the expert talks about, never knowledge the tool asserts (`project-brief.md` §2: "not independently verified engineering rules").

### Success criteria
1. From `/expert` setup the presenter opens the monitor; the video case is shown full-bleed, paused at 0, with "Press Space to start".
2. The expert (or a clicker in their hand) plays the video; it auto-holds at each of the 4 hold moments with a neutral prompt; Space/PageDown resumes; PageUp returns to the previous hold.
3. No mouse is needed at any point; nothing covers the centre of the video.
4. The companion page shows the monitor's state (time, held/playing, hold n of 4) within ~250 ms, and in fixture mode a simulated pointing event with the hold's still frame appears when a hold is reached.
5. The still-image case and all existing tests keep working.

### Non-goals
Voice-controlled playback; real glasses pointing detection on video; backend/WS6 media storage or upload; labelling patterns for the expert; audio playback.

## 2. Video content map

Chapters (from scene-cut detection):

| id | label | start | end |
|---|---|---|---|
| `approach` | Train approach | 0.000 s | 8.608 s |
| `sensor` | Sensor principle | 8.608 s | 11.295 s |
| `trace` | Signal trace | 11.295 s | 22.773 s |

Holds (times verified against extracted frames; the *rationale* column is for the team only and is **never shown** in the UI):

| hold_id | at | what is on screen (team rationale) |
|---|---|---|
| `hold-1` | 10.600 s | Sensor animation: Sys1/Sys2 response curves cross, output pulses |
| `hold-2` | 12.400 s | Trace: first pair of sharp dips in both channels |
| `hold-3` | 15.000 s | Trace: sharp dips next to a long shallow plateau |
| `hold-4` | 18.000 s | Trace: small isolated spikes on the Sys2 baseline |

## 3. Monitor screen (`/expert/display?case=…`)

When the chosen case has `media.kind === "video"` the page renders the **inspection player**; otherwise the existing still-image view is unchanged.

### Layout (dark, full-bleed, legible through the glasses camera)
- **Video:** contain-fit, centred, `muted`, `playsInline`, `preload="auto"`, poster = first frame. Nothing is drawn over the central 70 % of the frame.
- **Top-left bar:** app logo, case title, session pill mirrored from the companion: `● REC` / `OFF RECORD` / `PAUSED` / `NO SESSION` (icon + text, not colour alone). Small `FIXTURE DATA` badge when `source === "fixture"`.
- **Bottom timeline (instrument bar):** three chapter segments with labels; numbered hold ticks (1–4) at their positions; the playhead; time readout `12.4 s / 22.8 s` in tabular numerals; auto-hold indicator `Auto-hold on/off`. Minimum chrome text size 20 px.
- **Held state:** video frozen at the hold; a 4 px violet inner frame along the screen edge; a prompt card docked at the bottom edge above the timeline:
  **"Hold 2 of 4 · Point at what you see and explain it."** plus key hints `Space resume · PgUp previous hold · ←/→ 1 s`.
- **Start state:** paused at 0 with a bottom-docked card "Press Space to start".
- **End state:** last frame held; card "End of recording · R to replay".
- **Error states:** video fails to load → centred message "The video for <case title> could not be loaded · Esc to return"; case not found / loading: existing messages.

### Keys (presentation-clicker friendly; ignored with modifier keys)
| Key | Action |
|---|---|
| Space, Enter, PageDown | From start: play. From held: resume (plays on to the next hold). From ended: no-op (use R) |
| PageUp | Seek to the previous hold (or 0 if before hold 1) and hold there |
| ArrowLeft / ArrowRight | Seek −1 s / +1 s (stays in the current play/hold state; clamped) |
| R | Restart: seek 0, paused, start state |
| H | Toggle auto-holds |
| Esc | Back to `/expert` (existing behaviour) |

### Hold behaviour
- While playing, if the playhead crosses a hold time (previous tick time < `at_ms` ≤ current time) and auto-holds are on, the player pauses and seeks exactly to `at_ms`, entering `held(k)`.
- Resuming from `held(k)` plays on; hold k is not re-triggered until the playhead moves before it again.
- Seeking past holds with ←/→ or PageUp does not trigger holds.

## 4. Data contracts (additive)

In `web/lib/ui/contracts.ts`:

```ts
export type MediaChapter = { chapter_id: string; label: string; start_ms: number; end_ms: number };
export type MediaHold = {
  hold_id: string;
  at_ms: number;            // media time
  frame_url: string;        // still captured from the video at at_ms
  frame_width_px: number;
  frame_height_px: number;
};
export type CaseMedia = {
  kind: "video";
  url: string;
  poster_url: string;
  duration_ms: number;
  width_px: number;
  height_px: number;
  chapters: MediaChapter[];
  holds: MediaHold[];       // sorted by at_ms
};
// CaseSummary gains:  media?: CaseMedia
```

`CaseSummary.asset` stays required (the video case's `asset` is its poster frame) so every existing consumer keeps working.

**Time domains.** `media_time_ms` is a position in the case video. It is distinct from `session_time_ms` (recording time) and from `signal_interval` (the trace's horizontal axis, which in the video is drawn as "time [s]" but is *not* media time). Documented as §9 of `notes/ws7-ui-contracts-v0.md`. `CompanionEvent` gains optional `media_time_ms?: number | null` and `hold_id?: string | null`.

## 5. Monitor ⇄ companion channel

`web/lib/monitor/monitorChannel.ts` — a typed wrapper over `BroadcastChannel("nspct-monitor")`; a no-op when `BroadcastChannel` is undefined (SSR, old browsers).

Messages (validated on receipt; unknown/invalid messages ignored):

```ts
type MonitorState = {
  type: "monitor_state";
  case_id: string;
  status: "start" | "playing" | "held" | "ended" | "error";
  media_time_ms: number;
  duration_ms: number;
  hold_id: string | null;   // set when status === "held"
  hold_index: number | null; // 1-based
  hold_count: number;
  auto_holds: boolean;
};
type SessionState = { type: "session_state"; recording: "recording" | "off_record" | "paused" | "none" };
type Hello = { type: "hello"; from: "monitor" | "companion" };
type Bye = { type: "bye"; from: "monitor" };
```

- Monitor sends `monitor_state` on every status change and at most 4 Hz while playing; replies to `hello` with its current state; sends `bye` on unload.
- Companion sends `session_state` on change and in reply to `hello`.
- Companion treats the monitor as **disconnected** after `bye`, or after 3 s without a message while the last known status was `playing`. (Start/held/ended are quiet states, so silence there is expected.) While it has no monitor state, the companion sends `hello` every 5 s.

## 6. Companion (`/expert`)

- **Monitor strip** (`web/components/companion/MonitorStrip.tsx`) at the top of the trace pane in both setup and session phases:
  - *No monitor:* "Monitor not open" + "Open trace display (new window)" link (existing `displayHref`).
  - *Connected:* status text with icon (`▶ Playing` / `⏸ Hold 2 of 4` / `■ End` / `⚠ Video error`), time readout, mini timeline with chapter segments, hold ticks and playhead. Read-only (no remote control in this iteration).
- The companion broadcasts `session_state` derived from the existing companion machine state (recording / off-record / paused; `none` in setup).
- Setup: the video case is listed first with its poster thumbnail and a "Video · 22.8 s · 4 holds" meta line.

### Fixture hold evidence
In fixture mode, when the companion receives `monitor_state` with `status: "held"` for a hold it has not yet emitted in this session, the fixture source emits a pointing event for that hold: frame = `hold.frame_url` (with its pixel size), a fixture region box from the case fixture, `media_time_ms = at_ms`, `hold_id`, `mapping_status: "resolved"`, `channel_label` from the fixture (or null). It flows through the existing `subscribe` → `companionMachine` → `EvidenceViewer` path. For a case with media the existing timer replay (`fixtureExpertScript`) is not started. The live WS6 path is unchanged.

## 7. Assets

- `web/public/fixtures/video/wheel-sensor-pass.mp4` — remuxed from the source with `-c:v copy -an -movflags +faststart` (no audio; fast start).
- `web/public/fixtures/video/wheel-sensor-pass-poster.jpg` — frame at 0.
- `web/public/fixtures/video/hold-{1..4}.jpg` — frames at each `at_ms`, 832×464.
- `web/fixtures/ui/cases.json` — new first case `fixture-case-video-001`, title "Wheel sensor pass · Sys1/Sys2", `source: "fixture"`, `asset` = poster, `media` per §2/§4, plus per-hold fixture region boxes (normalized) used only for simulated evidence.
- The original file stays in `data/` (not served).

## 8. Accessibility and robustness
- All state shown as icon + text; the hold frame is reinforced by the prompt card text.
- Keyboard handler ignores events from inputs and with Ctrl/Meta/Alt.
- `prefers-reduced-motion`: no animated playhead easing.
- Autoplay policies are moot: playback only starts on a key press.
- Video `error` → error state + `monitor_state.status = "error"`.

## 9. Testing
- **Unit (vitest, node):** `lib/monitor/playback.ts` reducer — start→playing, hold crossing (including multiple ticks, exact boundary, auto-holds off), resume does not re-trigger, PageUp/←/→ seeking, restart, end; key mapping; channel message validation; fixture hold-event builder.
- **Component (vitest, jsdom):** `VideoMonitor` with `HTMLMediaElement.play/pause` stubbed — start card, held prompt "Hold 2 of 4", end card, error state, FIXTURE badge, session pill from a `session_state` message; `MonitorStrip` states (none / playing / held / error) with an injected fake channel.
- **E2E (Playwright, `web/e2e/expert.spec.ts`):** setup page + display page in one context: Space starts playback, hold 1 prompt appears (≤ 12 s), companion strip shows "Hold 1 of 4", a new evidence item appears; PageUp/R behave; screenshots `10-monitor-start`, `11-monitor-hold`, `12-companion-monitor-strip`. Existing display test for the still-image case stays green.
- Full suite: `npx tsc --noEmit`, `npx vitest run`, `npm run test:e2e`.

## 10. Files (expected)
New: `web/lib/monitor/{playback.ts,playback.test.ts,monitorChannel.ts,monitorChannel.test.ts,holdEvidence.ts,holdEvidence.test.ts}`, `web/components/monitor/{VideoMonitor.tsx,VideoMonitor.test.tsx,MonitorTimeline.tsx,monitor.module.css}`, `web/components/companion/{MonitorStrip.tsx,MonitorStrip.test.tsx}`, assets in §7.
Changed: `web/lib/ui/contracts.ts`, `web/app/expert/display/page.tsx`, `web/app/expert/page.tsx`, `web/components/companion/{ExpertSetup.tsx,ExpertCompanion.tsx}`, `web/lib/data/fixtureSource.ts`, `web/fixtures/ui/cases.json`, `web/e2e/expert.spec.ts`, `notes/ws7-ui-contracts-v0.md` (§9), `notes/ws7-demo-navigation.md` (monitor steps).
