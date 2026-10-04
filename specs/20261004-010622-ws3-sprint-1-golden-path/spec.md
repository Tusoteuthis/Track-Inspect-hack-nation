# Feature Specification: WS3 Sprint 1 — Golden path (point → question → answer → saved evidence)

**Feature Branch**: `worktree-ws03-sprint-1`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "WS3 Sprint 1 — Golden path: point → question → answer → saved evidence" (source: `notes/ws3-sprints/sprint-1-golden-path.md`, sections "Design you must implement", "Out of scope", "Acceptance criteria"; the sprint prompt wins on conflicts).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A pointing event leads to one grounded, linked question (Priority: P1)

The expert is in a live voice session with the apprentice agent. A pointing event arrives; in this sprint it is a fixture the human clicks in the dev console. The agent learns about the event without being forced to speak. At a natural pause it asks one short, open, non-leading question about that event, and the system records which event the question is about.

**Why this priority**: The event ↔ question linkage is the riskiest design piece of WS3. Every later sprint depends on it.

**Independent Test**: Start a session, deliver evt-001, and stay silent. The agent records a question start tied to evt-001, and its spoken question is stored verbatim on an exchange with `event_id = evt-001`.

**Acceptance Scenarios**:

1. **Given** a running session, **When** fixture evt-001 is delivered, **Then** the event is stored with `source: "fixture"` and the live session id, an `event_received` timing mark is logged, and the agent receives an event notice that contains no dev label and no interpretation.
2. **Given** a delivered event, **When** the agent decides to ask, **Then** it first declares the question with the event id. The system creates a live exchange linked to that event and makes it the active exchange. The agent's next spoken line becomes the exchange's question, verbatim.
3. **Given** the agent declares a question about an unknown event id, **When** the system validates it, **Then** no exchange is created and the agent gets an error naming the known event ids.

---

### User Story 2 - The expert's answer stays linked to the right event (Priority: P1)

The expert answers by voice. Every final line the expert speaks is attached verbatim to the active exchange until the agent declares its next question. If the expert keeps talking while new pointing events arrive, the answer stays linked to the original event.

**Why this priority**: This is the key acceptance property (Constitution III). A smooth conversation with mismatched evidence counts as a failure.

**Independent Test**: Deliver evt-001, let the agent declare a question, have the user speak two lines, deliver evt-002 between them, and check that both lines sit on the evt-001 exchange.

**Acceptance Scenarios**:

1. **Given** an active exchange, **When** the expert speaks final lines, **Then** each line is appended verbatim. The first line sets the answer start time and each line updates the answer end time.
2. **Given** an active exchange that is collecting an answer, **When** a new event arrives, **Then** the active exchange keeps its original event id.
3. **Given** no question has been asked yet, **When** the expert speaks, **Then** the lines are kept in a preamble bucket and are not lost.
4. **Given** the agent speaks a line ending in a question without declaring it first, **Then** it is recorded as an unlinked agent question, counted in the session, and highlighted in the UI.

---

### User Story 3 - The session is saved as evidence on disk (Priority: P1)

After every change, and when the session ends, the full session state is saved to a per-session folder. That folder holds machine-readable records, a full transcript, and a human-readable exchanges file in which each exchange shows the event, an image link, the question verbatim and the expert's answer verbatim.

**Why this priority**: Saved evidence is the sprint's deliverable, and WS5 consumes it later.

**Independent Test**: Send a session snapshot to the save endpoint, then check that the six files exist and that `exchanges.md` reads correctly. Re-send the same snapshot and check that nothing is duplicated.

**Acceptance Scenarios**:

1. **Given** a valid snapshot, **When** it is saved, **Then** `session.json`, `events.json`, `exchanges.json`, `timing.json`, `transcript.md` and `exchanges.md` exist under `knowledge/sessions/<sessionId>/`.
2. **Given** a session id containing path characters, **When** a save is attempted, **Then** it is rejected.
3. **Given** an invalid snapshot, **When** a save is attempted, **Then** it is rejected and nothing is written.
4. **Given** the client is saving, **Then** the console shows a saving, saved or error state.

---

### User Story 4 - The expert agent is configured from the repo and verified by probes (Priority: P2)

The expert agent's persona, its rules for event notices, its question tool and its conversation settings live in the repo. They are pushed to ElevenLabs by one command. Simulated probe conversations check the five required behaviours, and each must pass in at least 4 of 5 runs.

**Why this priority**: Without the configured agent the golden path cannot run live. The probes are the autonomous check of agent behaviour (Constitution VII).

**Independent Test**: Run the sync command for the expert agent, read the config back, then run the probes 5× and report the per-case pass counts.

**Acceptance Scenarios**:

1. **Given** the repo config, **When** the sync runs, **Then** the expert agent has the system prompt, the first message and the question tool, and the read-back shows the effective settings.
2. **Given** probe cases 1–5 (silent expert; expert already described the feature; leading-question trap; two events; ambiguous event), **When** each is run 5×, **Then** each passes ≥ 4/5, or the shortfall is documented.

### Edge Cases

- Question declared with `event_id` "none" (not about an event): accepted, with a null event id.
- A question declared about an off-record event: the agent is instructed not to ask about it. If it does anyway, the exchange is recorded with that event's `record_state` (full off-record handling is Sprint 4).
- Two question declarations without an agent line in between: the first exchange keeps an empty question. The second one becomes active.
- The same fixture is delivered twice: it is stored once. Events are keyed by event id, so a second delivery of the same fixture is a no-op apart from its timing mark.
- A save fails (network or validation): the error state is shown and the next state change retries. The snapshot model makes retries idempotent.
- The session ends while an answer is in progress: the answer end time is the last attached line, and the session end is recorded.
- The agent's spoken line arrives before the tool result is processed: the first final agent line *after* the declaration is used, and earlier lines are not.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST deliver each pointing event to the agent as a non-turn-forcing context notice, in a compact, stable, machine-readable format. The notice contains the event id, mapping status, channel, trace, record state and source, and never the fixture's dev label or any interpretation.
- **FR-002**: The system MUST store each delivered event in session state with the live session id, keep `source: "fixture"` for fixtures, and log an `event_received` timing mark.
- **FR-003**: The agent MUST declare each question immediately before asking it, giving the event id (or "none"), the kind of question and the planned question text.
- **FR-004**: The system MUST validate the declared event id against the known events. A valid declaration creates a live exchange that becomes the active exchange and logs `question_tool_called`. An invalid one returns an error listing the known ids and creates nothing.
- **FR-005**: The exchange's question MUST be the agent's next spoken final line, verbatim. The planned text is stored separately as `question_planned`.
- **FR-006**: Every final expert line MUST attach verbatim to the active exchange until the next declaration or session end. Lines before any question go to a preamble.
- **FR-007**: A newly arriving event MUST NOT change the active exchange's event id.
- **FR-008**: Agent lines ending in a question with no preceding declaration MUST be recorded as unlinked agent questions, counted, and highlighted.
- **FR-009**: The system MUST record timing marks for event_received, question_tool_called, agent_speech_started, answer_started and answer_ended, each with both a wall-clock time and a monotonic time.
- **FR-010**: The system MUST persist the full session state idempotently to six files per session, through a validated save endpoint. Writes are atomic, and session ids are sanitized to `^[a-z0-9-]{1,64}$`.
- **FR-011**: The client MUST save about 1 s after each state change and on session end, and display the save status.
- **FR-012**: The dev console MUST offer fixture event buttons with thumbnails labeled FIXTURE, and show the session id, events, exchanges (event ↔ question ↔ verbatim answer), timing marks and save status. The free-text context sender stays available behind a "raw" toggle.
- **FR-013**: The generic voice session component MUST stay reusable by the tutor flow, so only optional additions are allowed.
- **FR-014**: The expert agent's prompt, first message, question tool and settings MUST be versioned in the repo and pushed by the sync command, touching only the expert agent.
- **FR-015**: The system prompt MUST cover the apprentice persona, how to read event notices, declaring before asking, one short question at a time, no interpretation or leading questions, waiting for natural pauses, clarifying ambiguous or unresolved references first, the question patterns, brevity, and no questions about off-record events.
- **FR-016**: Captured session data MUST NOT be committed by default; the sessions folder is git-ignored.

### Key Entities

- **PointingEvent**: one gesture at a trace region (existing contract), injected with the live session id.
- **ExpertExchange**: one question and its verbatim answer lines, linked to exactly one event id or none. Gains `question_planned`.
- **TimingMark**: a named moment with a wall-clock and a monotonic time, linked to an event and/or exchange.
- **Session state/snapshot**: the session id, the conversation id, start and end times, events, exchanges, active exchange, preamble, the tagged transcript, timing marks and unlinked agent questions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the human gate, an answer given while a second event arrives is stored under the first event 100% of the time.
- **SC-002**: Every saved session contains all six files, and the question and answer in `exchanges.md` match the spoken words verbatim.
- **SC-003**: Each of the five probe behaviours passes in at least 4 of 5 simulated runs, and the counts are reported.
- **SC-004**: Re-saving the same session any number of times leaves exactly one record per exchange and per event.
- **SC-005**: No event notice sent to the agent contains a fixture's dev label, checked for all five fixtures.

## Assumptions

- Sprint 0 was not yet merged into `voice` when this sprint started, so this sprint branches from the Sprint 0 branch. The human merges both.
- No expert agent existed in ElevenLabs. The sync command is extended to create one from scratch, and the new id goes into the sprint worktree's `web/.env`.
- Contextual updates cannot be simulated in probes, so probes inject the event notice as a marked user turn. This is documented as a limitation.
- Restraint about when to ask comes from the prompt only. The topic queue and pause gating are Sprint 2. Debrief, teach-back and coverage are Sprint 3, and full off-record handling is Sprint 4.
- The local file store is a stand-in that WS6 will replace through a small interface.
