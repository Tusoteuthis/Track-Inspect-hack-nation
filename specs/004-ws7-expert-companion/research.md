# Research: WS7 Sprint 3

## R1 What counts as an acknowledgement
- **Decision**: Pending clears when an authoritative `SessionView` reaches the requested target. That view can arrive as the `Ack` value or through a `subscribe` `session` push, whichever comes first. A view with a lower `rev` is ignored.
- **Rationale**: WS6 api-v0 says the `200 Session` from `POST /record-state` is the ack, and that `record_state.changed` arrives on SSE. Accepting both avoids a hang if one of them is lost. A failed Ack shows an error and keeps the previous state.
- **Alternatives**: Only `subscribe`. This would leave the UI stuck if the SSE push was missed during a reconnect.

## R2 Pause
- **Decision**: Add `DataSource.requestPause(sid, paused)`, backed by fixtures only. The lifecycle `paused` value already exists in `SessionView`.
- **Rationale**: WS6 has no pause yet (WS7-Q2). The prompt requires pause. The gap is listed for WS6 in the handoff.

## R3 Stop
- **Decision**: `requestStop(sid)` maps to WS6 lifecycle `end`. It needs a second confirming press: the first press arms it ("Press again to stop"), and the arm disarms after 5 s or on Escape.
- **Rationale**: Stop is irreversible. A confirm dialog would cover the trace.

## R4 Agent status source
- **Decision**: `/expert` hosts `<VoiceSession flow="expert" {...useExpertSession().voiceProps}>`. A child component maps `useConversationStatus`/`useConversationMode` through `agentState()`, which moves to `lib/ui/agentState.ts`.
- **Rationale**: The prompt requires the real VoiceSession state via the expert flow. WS3's reducer lives in this hook, so WS3 snapshots keep working. `deliverFixture` is never called: the companion displays only.

## R5 Event → evidence mapping
- **Decision**: The asset is built from the event: `frame_id`, `image_ref` (original), and size from `region.frame_*_px`. The region gets the event's `frame_id` and `mapping_status`.
- **Rationale**: Each WS3 fixture event has its own frame. Reusing a case asset with a different frame would correctly be refused, so the companion must use the event's own frame.

## R6 Reconnect / resync
- **Decision**: `SourceUpdate {type:"connection", state}`. On `reconnecting`, show a banner. On `connected` after a drop, call `getSession` and `getRecentEvents`, then dispatch `RESYNCED`.
- **Rationale**: This mirrors the WS6 rule "without Last-Event-ID, GET current state first".

## R7 Non-overlap of controls
- **Decision**: A CSS grid (`trace | rail`) on desktop. Below 48rem it stacks, with the rail below the trace. The rail is never `position: fixed` or `absolute`. Playwright checks with `boundingBox()` that the two boxes don't intersect.

## R8 Trace display
- **Decision**: The `/expert/display?case=` route is a `position: fixed; inset: 0` overlay on a near-black background. The `<img>` uses `object-fit: contain` at 100vw×100vh, with a small corner title, a FIXTURE badge, and Esc → `/expert`.
- **Rationale**: The root layout's nav and max-width can't be removed for a nested route without a route-group refactor. The overlay is simpler.

## R9 Screen sharing
- **Decision**: Reuse `useScreenObservation` + `ScreenSharePanel` with optional copy props. Frames go through `submitScreenFrame(caseId)`. The panel is labelled as an optional companion capability that does not replace pointing.
