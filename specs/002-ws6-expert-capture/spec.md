# Feature Specification: WS6 Expert Capture Path (Sprint 1)

**Feature Branch**: `002-ws6-expert-capture`

**Created**: 2026-10-04

**Status**: Draft

**Input**: WS6 Sprint 1 prompt (`notes/ws6-sprints/sprint-1-expert-capture-path.md`), brief flow steps 1–3:
create an expert session → the capture client uploads image evidence and posts pointing events → the voice agent (WS3) receives each event live with a resolvable evidence reference → WS3's exchanges are persisted, permanently linked to their original event. Where the prompt and `notes/ws6-api-v0.md` (approved S0 route map, decisions D7/D8) differ, the route map wins.

## User Scenarios & Testing *(mandatory)*

The "users" are partner workstreams: WS2 (glasses/iPhone capture) produces evidence and pointing events, WS3 (expert voice agent) consumes events and produces exchanges, WS7 (web UI) displays state. The human integrator gates the sprint.

### User Story 1 - Integrator runs an expert session through its lifecycle (Priority: P1)

The web companion creates an expert session, starts it, toggles on/off the record, and ends or aborts it. The backend is the only authority for that state; illegal moves are refused.

**Why this priority**: Every other record in the capture path belongs to a session.

**Independent Test**: Create, start, end a session via the API; try an illegal transition; retry a create with the same idempotency key.

**Acceptance Scenarios**:

1. **Given** no session, **When** an expert session is created, **Then** a session with a server-issued ID in state `created` and on-record is returned.
2. **Given** a create request with an idempotency key already used, **When** it is retried, **Then** the same session is returned and no second session exists.
3. **Given** a session in `created`, **When** `start` is applied with the current revision, **Then** it becomes `active` and a live update is emitted.
4. **Given** an `ended` or `aborted` session, **When** any transition is requested, **Then** it is refused with `invalid_transition` and nothing changes.
5. **Given** a transition carrying an outdated revision, **When** applied, **Then** it is refused with `stale_revision`.
6. **Given** an on-record session, **When** it is switched off-record, **Then** a new recording segment is appended, the previous one is closed, and a live update is emitted; switching to the same state again is a no-op.

---

### User Story 2 - Capture client delivers evidence and pointing events safely (Priority: P1)

WS2 uploads a frame (original plus optional highlighted image), then sends the pointing event referencing it. Retries, duplicates and reordering never produce duplicates, never attach an event to missing evidence, and never overwrite stored evidence.

**Why this priority**: This is the core robustness promise of the sprint.

**Independent Test**: Upload an asset, PUT an event twice, PUT a conflicting event, PUT an event before its asset.

**Acceptance Scenarios**:

1. **Given** a valid image upload, **When** it is stored, **Then** the asset record carries the content hash, type and dimensions and the images are readable by ID.
2. **Given** a stored asset, **When** the identical upload is retried, **Then** it succeeds without change; **When** different bytes are uploaded under the same ID, **Then** it is refused with `conflict_immutable`.
3. **Given** a session that is off-record, **When** an asset is uploaded, **Then** it is refused with `off_record` and nothing is written.
4. **Given** a pointing event whose asset is not stored for this session, **When** it is sent, **Then** it is refused with `asset_not_available` and nothing is stored.
5. **Given** a pointing event, **When** the same event is sent twice, **Then** exactly one record exists and both acknowledgements are identical (same sequence number).
6. **Given** a stored event, **When** a different body is sent under the same event ID, **Then** it is refused with `conflict_immutable`.
7. **Given** stored events, **When** they are listed, **Then** they come back ordered by capture time, then arrival.
8. **Given** an asset ID crafted to escape the image directory, **When** it is used for a read or write, **Then** it is rejected and no file outside the image directory is touched or served.

---

### User Story 3 - Voice agent receives events live and can catch up after a disconnect (Priority: P1)

WS3 (and WS7) subscribe to a session's live stream. Each stored record produces one ID-only notification. After a disconnect, the client reconnects with the last sequence it saw and receives exactly what it missed, in order.

**Why this priority**: WS3 asks questions in response to events; missed or duplicated notifications break the conversation.

**Independent Test**: Publish events, disconnect, publish more, reconnect with the last-seen sequence.

**Acceptance Scenarios**:

1. **Given** a subscriber, **When** an event is first stored, **Then** the subscriber receives an `event.stored` notification containing only IDs.
2. **Given** a client that last saw sequence N, **When** it reconnects with N, **Then** it receives exactly the notifications after N, in order, then live ones.
3. **Given** an idle stream, **When** 15 seconds pass, **Then** a heartbeat keeps the connection open.

---

### User Story 4 - Exchanges stay linked to their original event (Priority: P1)

WS3 saves each question/answer exchange repeatedly as answer lines grow (increasing revision). An exchange is permanently linked to the event it was asked about, even if the answer finishes after newer events arrived.

**Why this priority**: The challenge requires every exchange to link to the screen moment it explains.

**Independent Test**: Store an exchange for event 1, store events 2 and 3, append answer lines to the exchange, check it still links event 1; try changing its event; send an outdated revision.

**Acceptance Scenarios**:

1. **Given** an exchange referencing a stored event, **When** it is saved, **Then** it is stored and an `exchange.updated` notification is emitted.
2. **Given** an exchange at revision N, **When** revision N+1 with more answer lines arrives after newer events, **Then** it is stored and still references its original event.
3. **Given** an exchange at revision N, **When** a write with revision ≤ N and different content arrives, **Then** it is refused with `stale_revision` and the stored record is unchanged.
4. **Given** a stored exchange, **When** a higher revision changes its event link, **Then** it is refused with `conflict_immutable`.
5. **Given** an exchange referencing an event that is not stored, **When** it is saved, **Then** it is refused with `not_found`.

---

### User Story 5 - Voice token is bound to an active session (Priority: P2)

The voice client requests a short-lived voice token for a specific session. The backend confirms the session exists and is active, and echoes the session ID so WS3 can pass it into the agent. Without a session ID the existing behaviour is unchanged.

**Independent Test**: Request a token for a missing, a created and an active session.

**Acceptance Scenarios**:

1. **Given** an unknown session ID, **When** a token is requested, **Then** it is refused with `not_found`.
2. **Given** a session not in `active`, **When** a token is requested, **Then** it is refused with `invalid_transition`.
3. **Given** any request, **Then** the provider API key never appears in the response.

---

### User Story 6 - Operators can trace failures without exposing content (Priority: P2)

Every route writes a diagnostics line containing component, operation, IDs, outcome, duration and error code — never expert words or images.

**Independent Test**: Log a record containing a content field; check it is dropped.

**Acceptance Scenarios**:

1. **Given** a diagnostics call with an unknown or content-bearing key, **Then** that key is not written.
2. **Given** any API request, **Then** one diagnostics line is appended to the day's log.

---

### User Story 7 - Integrator replays a fixture capture end-to-end (Priority: P2)

A script replays the fixture capture (session, assets, events, exchange) against a running server, then repeats every request to prove idempotency. All records are labelled as fixtures.

**Independent Test**: Run the script twice; the second run creates no new files.

### Edge Cases

- Upload declares dimensions that differ from the actual image → `validation_failed`.
- Upload exceeds the size cap or is not PNG/JPEG → `validation_failed`.
- Event `session_id`/`event_id` differ from the path → `validation_failed`.
- Event's asset belongs to another session, is deleted, or lacks the required highlighted image → `asset_not_available`.
- Writes to an `aborted` session → `invalid_transition`. Late events/exchanges to an `ended` session are accepted (late delivery).
- Asset upload crashes before the record file is written → the asset is not considered stored; a retry completes it.
- Two concurrent identical event PUTs → one record, one notification, identical acks.
- Reconnect with a sequence beyond the end, or garbage → treated as "nothing missed" / start live.
- Client disconnect → subscription is cleaned up.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST create expert sessions with server-issued IDs, `created` lifecycle, on-record, one open recording segment, and honour an optional idempotency key on create.
- **FR-002**: System MUST enforce lifecycle transitions `created→active→ended`, `created|active→aborted`; terminal states refuse transitions (`invalid_transition`); transitions carry the session revision (`stale_revision` if outdated); re-applying the already-applied action returns the current session.
- **FR-003**: System MUST record on/off-record changes as closed/opened recording segments and emit `record_state.changed`; same state is a no-op; changes to ended/aborted sessions are refused.
- **FR-004**: System MUST store evidence assets per ID with content-hash idempotency (same bytes → success, different → `conflict_immutable`), validate type (PNG/JPEG by content), size cap (default 15 MB, configurable) and declared dimensions, write image files before the record file, and refuse uploads while off-record (`off_record`).
- **FR-005**: System MUST serve asset records and image bytes by ID with correct content type and private caching; missing or deleted → `not_found`; reads resolve only inside the image directory.
- **FR-006**: System MUST store pointing events immutably and idempotently per ID, require path/body ID match, require every referenced asset to be stored for this session (`asset_not_available`, nothing stored), rewrite image references to the asset URLs, and acknowledge with `{event_id, status:"stored", seq}` where `seq` is stable across retries.
- **FR-007**: System MUST list a session's events ordered by capture time, then arrival, and return single events.
- **FR-008**: System MUST store exchanges as mutable records accepting only higher revisions (outdated → `stale_revision`, stored record unchanged), keep `event_id` immutable after the first write (`conflict_immutable`), and require a non-null `event_id` to reference a stored event (`not_found`).
- **FR-009**: System MUST refuse content writes (assets, events, exchanges) while the session is off-record (`off_record`) and to aborted sessions (`invalid_transition`).
- **FR-010**: System MUST persist every live notification to a per-session append-only log with a monotonic sequence before publishing it, and serve a live stream that replays from a given sequence (header or query), sends heartbeats about every 15 s and releases resources on disconnect. Notifications carry IDs only.
- **FR-011**: The voice-token endpoint MUST accept an optional session ID, require that session to exist and be active, echo it, and keep existing behaviour otherwise; it MUST never return the provider key.
- **FR-012**: System MUST append one diagnostics line per request with allow-listed keys only (component, op, ids, outcome, duration, error code); any other key is dropped.
- **FR-013**: A replay script MUST drive the full capture path with fixture data twice and the second run MUST create no new files.
- **FR-014**: Errors MUST use the S0 error envelope and never echo content.

### Key Entities

- **Session**: expert session with lifecycle, record state, recording segments, revision.
- **Recording segment**: one on- or off-record span.
- **Evidence asset**: immutable record for one captured frame with original and optional highlighted image, hashes, dimensions.
- **Pointing event**: immutable gesture record referencing an evidence asset; image references resolve to asset URLs.
- **Expert exchange**: mutable question/answer record, permanently linked to one event (or none).
- **Bus event**: ID-only notification with per-session sequence.
- **Diagnostics line**: component, operation, IDs, outcome, duration, error code.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Replaying the same capture twice produces zero additional stored files (file count identical after run 2).
- **SC-002**: 100% of retried identical writes return the same acknowledgement as the first write.
- **SC-003**: 0 events are ever stored referencing an asset that is not stored.
- **SC-004**: After a reconnect, a client receives exactly the missed notifications — none missing, none duplicated, in order.
- **SC-005**: 0 diagnostics lines contain keys outside the allow-list.
- **SC-006**: Every acceptance criterion in the sprint prompt has an automated test that passes.
- **SC-007**: A device on the local network can load a stored evidence image by its URL.

## Assumptions

- Single server process on one machine (S0 locks and in-memory subscribers).
- Stale exchange writes return `409 stale_revision` (api-v0 D7), off-record writes `403 off_record` (D8); both leave stored state unchanged as the prompt requires.
- Assets must include a highlighted image before an event may reference them (api-v0 WS2-Q3 default), because WS3's event requires a highlighted reference.
- Late events/exchanges to an `ended` session are accepted (api-v0 WS2-Q7 lean); writes to `aborted` sessions are refused.
- The WS3 store/snapshot route is not merged on any branch; delegation is deferred and documented.
- Full off-record propagation, deletion, access tokens, synthesis, knowledge, newcomer flows are out of scope.
