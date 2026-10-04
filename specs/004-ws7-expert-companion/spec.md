# Feature Specification: WS7 Sprint 3 — Session setup and expert companion

**Feature Branch**: `ws7-sprint-3`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "WS7 Sprint 3 — Session setup and expert companion. Lane A: entry and session setup (/, /expert), case selection, honest connection status, full-bleed trace display mode, optional labelled screen sharing. Lane B: expert companion with active trace, latest indicated region (ambiguous = dashed + clarify text, unresolved = no highlight, own-frame only), recent events, real agent status, recording state, pause/stop/off-record controls pending until acknowledged, collapsible edge rail with shortcuts that never covers the trace, no speech on gestures, scripted fixture replay, Reconnecting… with resync. Debrief links to /review." (full text in notes/ws7-sprints/sprint-3-expert-companion.md)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Expert sees honest evidence of what they pointed at (Priority: P1)

During a session the expert (or a colleague beside them) glances at the companion and sees the active trace, the region the system understood from the most recent pointing gesture, and a short strip of recent gestures. An ambiguous gesture is visibly marked as ambiguous with a note that the apprentice will ask to clarify; an unresolved gesture shows no highlight; a region is never drawn on a picture other than the one it was captured on.

**Why this priority**: The companion's core value is letting the expert verify that the apprentice "saw" the right region. Showing a confident highlight on the wrong place would corrupt captured knowledge.

**Independent Test**: Feed the companion a resolved, a repeated, an ambiguous, an unresolved and a wrong-frame gesture; check the rendered outline and text for each.

**Acceptance Scenarios**:

1. **Given** an active session, **When** a resolved gesture arrives, **Then** the trace shows a solid outline on that gesture's own captured frame and the gesture appears at the head of the recent strip.
2. **Given** an active session, **When** an ambiguous gesture arrives, **Then** a dashed outline and the text "Ambiguous: the apprentice will ask you to clarify" are shown.
3. **Given** an active session, **When** an unresolved gesture arrives, **Then** no outline is drawn and the state is stated in words.
4. **Given** a gesture whose region belongs to a different frame than the displayed picture, **When** it is rendered, **Then** the region is refused (no outline, explicit notice).
5. **Given** the same gesture is delivered twice, **When** both arrive, **Then** it appears once.

---

### User Story 2 - Off-record, pause and stop reflect acknowledged state only (Priority: P1)

The expert asks to go off record, pause, or stop. The companion shows each request as pending until the session service confirms it, and only then shows the new state. A failed request is shown as failed and the previous state remains.

**Why this priority**: Trust rule — off-record must never be shown as in effect before it is, or the expert may say something they believe is not recorded.

**Independent Test**: With a controllable data source, request off-record; verify "pending" until the acknowledgement; verify the OFF RECORD indicator only after it; make a request fail and verify the error and unchanged state.

**Acceptance Scenarios**:

1. **Given** on record, **When** off-record is requested, **Then** the state reads "Going off record… waiting for confirmation" and no OFF RECORD indicator is shown.
2. **Given** an off-record request is pending, **When** the acknowledgement arrives, **Then** the OFF RECORD indicator appears.
3. **Given** an off-record request is pending, **When** it fails, **Then** an error is shown and the state remains "On record".
4. **Given** an active session, **When** stop is requested and confirmed, **Then** "Stopping…" is shown until acknowledged, then "Session ended" with a link to the debrief review.
5. **Given** an active session, **When** pause is requested, **Then** "Pausing…" is shown until acknowledged, then "Paused" with a Resume control.

---

### User Story 3 - Controls never cover the trace and work from the keyboard (Priority: P2)

Controls sit in a collapsible edge rail beside the trace, never on top of it, at desktop and phone widths, expanded or collapsed. Each control has a visible keyboard shortcut hint.

**Why this priority**: The expert is reading the trace; a control overlay would hide evidence.

**Independent Test**: Measure the rail's and trace's bounding boxes at two viewport sizes with the rail expanded and collapsed; press each shortcut and verify the action is requested.

**Acceptance Scenarios**:

1. **Given** any viewport, **When** the rail is expanded or collapsed, **Then** its box does not intersect the trace's box.
2. **Given** focus is not in a text field, **When** the expert presses a shortcut key, **Then** the matching control is triggered and the hint is visible on the control.

---

### User Story 4 - Connection loss is visible and recovers to the latest state (Priority: P2)

If the live update connection drops, the companion shows "Reconnecting…" and, once restored, resynchronises to the latest session state and recent gestures (including any that arrived while disconnected).

**Independent Test**: Drop and restore the connection on a controllable source; verify the banner and the resynchronised state.

**Acceptance Scenarios**:

1. **Given** an active session, **When** the connection drops, **Then** "Reconnecting…" is shown.
2. **Given** the connection is restored, **When** resync completes, **Then** the banner disappears and the latest recording state and gestures are shown.

---

### User Story 5 - Session setup and trace display (Priority: P2)

From the entry page the expert chooses "Expert session", picks a case, sees the true status of the capture device, voice agent and backend (unknown shown as unknown), can open a full-bleed trace display for the demo monitor, optionally shares their browser screen (clearly labelled as a companion aid that does not replace physical pointing), and starts the session.

**Independent Test**: Open setup with all statuses unknown; verify none reads "Connected"; open trace display and verify the trace fills the viewport with minimal chrome.

**Acceptance Scenarios**:

1. **Given** the entry page, **When** it loads, **Then** "Expert session" and "Newcomer practice" are the primary choices.
2. **Given** setup, **When** a status is unknown, **Then** it reads "Unknown" with an icon, never "Connected".
3. **Given** a selected case, **When** trace display is opened, **Then** the trace fills the screen, with only a small title, a fixture badge if applicable and an exit hint.
4. **Given** setup, **When** "Start session" is pressed, **Then** "Starting…" is shown until acknowledged, then the companion appears.

---

### Edge Cases

- A gesture arrives while off record: shown in the strip tagged "off record"; it is display-only.
- A gesture has unknown trace or channel identity: shown as "unknown", never guessed.
- A stale session update (older revision) arrives after a newer one: ignored.
- A second request of the same kind while one is pending: ignored (single request).
- Stop requested while off-record pending: both pending states shown independently.
- Voice agent not started: agent status reads "Disconnected" (not "Listening").
- Shortcut keys pressed while typing in a field or with a modifier: ignored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The entry page MUST offer "Expert session" and "Newcomer practice" as primary choices.
- **FR-002**: Expert setup MUST list cases from the data source and let the expert pick one, without showing internal identifiers.
- **FR-003**: Setup MUST show capture, agent and backend status; unknown MUST display as "Unknown"; a fixture backend MUST be described as fixture data, never as connected.
- **FR-004**: A trace display mode MUST show the case trace full-bleed at the largest legible size with minimal chrome.
- **FR-005**: Optional browser screen sharing MUST be labelled as a companion capability that does not replace physical pointing.
- **FR-006**: The companion MUST show the latest gesture's region on that gesture's own frame, the active trace, and up to six recent gestures.
- **FR-007**: Ambiguous regions MUST render a dashed outline plus "Ambiguous: the apprentice will ask you to clarify"; unresolved regions MUST render no outline; regions for a different frame MUST be refused.
- **FR-008**: Agent status MUST derive from the real voice session state (listening / speaking / waiting / disconnected).
- **FR-009**: Recording state MUST derive from the session's acknowledged recording state; while a request is pending it MUST show the pending state.
- **FR-010**: Pause, stop and off-record controls MUST request via the data source and show pending until acknowledged; failures MUST be shown and the previous state kept.
- **FR-011**: Stop MUST require a confirming second action.
- **FR-012**: Controls MUST sit in a collapsible edge rail that never overlaps the trace and MUST have visible keyboard shortcut hints.
- **FR-013**: The companion MUST NOT send anything to the voice agent in response to gestures or UI actions.
- **FR-014**: In fixture mode, live updates MUST replay a timed sequence: resolved, repeat, ambiguous; off-record acknowledgement follows a request.
- **FR-015**: On connection loss the companion MUST show "Reconnecting…" and on restore MUST resync session and recent gestures.
- **FR-016**: After stop is acknowledged, the companion MUST link to the debrief review.
- **FR-017**: Every screen with fixture data MUST show the "FIXTURE DATA" banner; statuses MUST not be conveyed by colour alone.

### Key Entities

- **Case summary**: a learner-safe listing of a case (title, trace picture); never contains answers.
- **Session view**: lifecycle, recording state, connection statuses, revision counter.
- **Pointing gesture (event)**: captured frame, region, mapping status, record state, session time, optional trace/channel identity.
- **Pending request**: kind (off-record / pause / stop), target state, error.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of tested cases, the off-record indicator appears only after acknowledgement.
- **SC-002**: 0 cases where an ambiguous, unresolved or other-frame region is drawn as a confident highlight.
- **SC-003**: Controls overlap the trace by 0 pixels at desktop and phone widths, rail expanded or collapsed.
- **SC-004**: After a connection drop and restore, the companion shows the latest state within one resync.
- **SC-005**: An expert can go from entry to an active companion in 3 interactions or fewer (Expert session → pick case → Start).
- **SC-006**: 0 voice-agent messages are sent as a result of companion UI actions or gesture display.

## Assumptions

- No WS4 case manifest exists yet; the case list comes from a labelled fixture through the data source.
- The session service has no pause yet; pause is fixture-backed and listed for WS6.
- The voice agent has no off-record mechanism yet (WS3 Sprint 4); the companion records the request through the data source only and the handoff lists the gap.
- The voice session runs in the companion page (the browser hosts the expert conversation); its identifier is not yet aligned with the data-source session.
- The debrief review is the existing review screen, linked at session end.
