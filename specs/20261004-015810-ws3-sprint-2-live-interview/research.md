# Research — WS3 Sprint 2

Sources: `notes/ws3-sprints/docs/elevenlabs-capabilities.md` (Q1, Q4, Q5, Q9, mechanism (c)), installed typings in `web/node_modules/@elevenlabs/react/dist/conversation/ConversationControls.d.ts`, Sprint 1 handoff.

## R1. How a topic reaches the agent

- **Decision**: release = `sendContextualUpdate(text, { contextId: primary_event_id })` with the `[POINTING_EVENT]` line. Unique context id per event (Q1: a shared id marks earlier updates superseded).
- **Rationale**: verified live to be silent and used on the next natural turn.
- **Alternatives**: deliver on arrival (Sprint 1 behaviour) — rejected, it lets the agent pounce mid-explanation; `get_pointing_events` pull tool — extra round trip, no benefit once we gate.

## R2. Who takes the turn after a release (verified-gap)

- **Decision**: hybrid. After a release the agent may ask on its next natural turn. If within `nudge_after_ms` (default 2500 ms) the agent has neither called `begin_question` nor started speaking, and the gate still holds (agent silent, expert quiet ≥ `pause_ms`), send one `sendUserMessage("[CONTROL] …")` nudge. `[CONTROL]` lines are never stored as expert words.
- **Rationale**: Q1 — contextual updates never trigger a turn. Q9 — after `skip_turn` the turn timeout does not fire. Without the nudge a released question could wait for the expert's next utterance. `sendUserMessage` is documented to trigger a response (DOCUMENTED-ONLY → human gate verifies).
- **Alternatives**: `sendUserMessage` as the primary release (always forces a turn, noisier history); rely on `turn_timeout` (suppressed by skip_turn).
- **Fallback (documented)**: set `nudge_after_ms = 0` → pure contextual release + prompt restraint + turn settings.

## R3. "Expert is speaking" signal

- **Decision**: pure speech detector combining (a) server `vad_score` ≥ 0.5 (`onVadScore`; enabled in `client_events` since Sprint 1), (b) `tentative_user_transcript` via `onDebug`, (c) local `getInputVolume()` ≥ 0.04 polled each tick while the agent is not speaking (echo). A speaking interval ends `speech_hold_ms` (400 ms) after the last active observation and is stamped at that last activity. Final user lines only refresh "last activity" (they arrive after speech ends).
- **Rationale**: Q5 — none of the signals carry timestamps and VAD over WebRTC is unverified, so redundancy matters; local mic works regardless.
- **Limitation**: silence ≠ finished thinking. The prototype detects sound/no sound and transcript activity, not intent.

## R4. Turn-taking settings

- **Decision**: keep `turn_eagerness: patient`, `speculative_turn: false`; set `turn_timeout: 15` s; give `skip_turn` a custom description ("call instead of speaking when the expert is mid-explanation or thinking, or nothing new invites a question"). Pushed via `sync-agents` (new manifest fields `turnTimeout`, `skipTurnDescription`).
- **Rationale**: Q4 — turn fields are agent-level only; `turn_timeout` accepts −1 or 1–300 s live. 15 s avoids re-engaging a thinking expert after 7 s (API default).

## R5. Dedup clock

- **Decision**: compare client receive times (`performance.now()` at `event_received`). Window inclusive (≤ 20 s); IoU inclusive (≥ 0.5); same `channel_id` (null = null) and same `record_state`; compared against the topic's primary region; window measured from the topic's latest event (primary or alias).
- **Rationale**: one consistent clock for fixtures and live events; fixture `captured_at_utc` values are static.

## R6. Budget

- **Decision**: default max 5 live questions per rolling 10 minutes (`question_tool_called` marks in the window + a released-but-unasked topic). Checked at release time; the candidate becomes `deferred_to_debrief` (reason `budget`). When the budget flips to used-up, a `ws3-state` contextual update tells the agent to stop asking live questions; it flips back when the window frees up.

## R7. Clarify-first enforcement

- **Decision**: in the reducer, `begin_question` on a topic with `requires_clarification` and no `clarify_reference` exchange yet returns an error unless `kind = clarify_reference`. The prompt already tells the agent to correct and call again.
- **Rationale**: turns a prompt preference into a hard guarantee (constitution I).
