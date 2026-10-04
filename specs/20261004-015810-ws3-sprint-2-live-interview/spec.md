# Feature Specification: WS3 Sprint 2 — Live interview quality

**Feature Branch**: `worktree-ws03-sprint-2`

**Created**: 2026-10-04

**Status**: Draft

**Input**: Sprint prompt `notes/ws3-sprints/sprint-2-live-interview.md` — topic queue, dedup, ambiguity, pause-aware asking, timing. The sprint prompt wins on any conflict with this spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The apprentice never talks over the expert (Priority: P1)

The expert points at trace regions while explaining. Each pointing gesture becomes a *topic* the apprentice may ask about, but the apprentice only learns about a topic once the expert has actually paused: the agent is silent, the expert is not speaking, and the expert has been quiet for a configurable pause. Only one topic is open at a time.

**Why this priority**: interrupting an expert mid-explanation is the main failure the challenge judges ("never interrupt ongoing speech", "each question at a natural pause").

**Independent Test**: unit tests on the release gate (each blocking condition alone prevents a release) plus a live run where the timing report shows 0 agent turns started while the expert was speaking.

**Acceptance Scenarios**:

1. **Given** a queued topic and the expert speaking, **When** the gate is evaluated, **Then** nothing is released.
2. **Given** a queued topic, agent silent, expert quiet for less than the pause, **When** evaluated, **Then** nothing is released; once the pause is reached, exactly one topic is released.
3. **Given** a released topic whose question has not yet been answered, **When** another topic is queued, **Then** it waits until the first is answered or the expert has moved on.

---

### User Story 2 - No repeated questions; honest handling of unclear and outdated pointing (Priority: P1)

Pointing twice at the same spot within a short window does not produce a second question: the second gesture is kept as evidence (an alias of the first topic). Ambiguous or unresolved pointing is first clarified ("which part do you mean?") and that answer is never treated as an interpretation. If a topic is released after the expert has moved on, the question explicitly refers back to the earlier moment.

**Why this priority**: "no repeated questions" and "ambiguous pointing is never treated as resolved" are hard scope rules.

**Independent Test**: unit tests for dedup (IoU and time-window edges), ambiguity → clarify first, staleness flag/wording; probe cases for the agent's behaviour.

**Acceptance Scenarios**:

1. **Given** evt-001 and, 8 s later, evt-003 on the same channel and region, **When** both are received, **Then** one topic exists, evt-003 is stored as an alias, and no second question is asked.
2. **Given** an ambiguous event, **When** the agent tries to ask a non-clarifying question about it first, **Then** the attempt is rejected and the first stored exchange for it has kind `clarify_reference`.
3. **Given** a topic queued more than 30 s ago, or a newer event on another region, **When** it is released, **Then** the release text instructs the agent to refer explicitly to the earlier moment and the agent's question does so.

---

### User Story 3 - Restraint budget and good follow-ups (Priority: P2)

The apprentice asks about 3–5 live questions per 10 minutes; any further topics are deferred to the debrief (kept, never dropped). After the expert has given an interpretation, follow-ups go deeper (reasoning, distinction, guardrail, exceptions behind "usually") instead of repeating; at least one live question is a guardrail.

**Why this priority**: required challenge outcomes (≥ 3 live questions, ≥ 1 guardrail), but they build on Stories 1–2.

**Independent Test**: budget overflow unit test; probe cases; counters in the console derived from stored records.

**Acceptance Scenarios**:

1. **Given** the budget is used up, **When** another topic would be released, **Then** it is marked `deferred_to_debrief` and is visible as deferred.
2. **Given** the expert has already described a region, **When** the agent asks next, **Then** the question kind is reasoning, distinction, context, guardrail or exception.
3. **Given** the expert says "usually", **When** the agent asks next, **Then** it asks about the exceptions.

---

### User Story 4 - Timing evidence and a repeatable fixture scenario (Priority: P2)

For every exchange the session folder contains a timing report separating our processing latency, the deliberate wait for a pause, and agent latency, plus the number of agent turns started while the expert was speaking. A "Run fixture scenario" helper injects evt-001, evt-003, evt-002 and evt-004 at configurable offsets so the human can talk through a realistic 3–5 minute task.

**Why this priority**: proves the restraint is intentional rather than slowness; makes the human gate repeatable.

**Independent Test**: unit tests for the timing calculations and report rendering; a live fixture run producing the acceptance counts.

**Acceptance Scenarios**:

1. **Given** a saved session, **When** the folder is opened, **Then** `timing-report.md` shows per-exchange processing latency, intentional wait and agent latency in separate columns and an interruption count.
2. **Given** the fixture scenario is run, **When** the session ends, **Then** the records show ≥ 3 live questions, ≥ 1 guardrail, 0 duplicate questions for evt-001/evt-003 and a `clarify_reference` exchange for evt-004, all labelled as fixture.

### Edge Cases

- Duplicate arrives exactly at the window edge (20 s): inclusive; just over: new topic.
- IoU exactly 0.5: duplicate; just below: new topic. Different channel with identical region: new topic. Both channels unknown (null): may merge.
- Off-record event: becomes a `dropped_off_record` topic, never released; never merges with on-record topics.
- Duplicate of a topic that has already been asked/answered: merged as alias; no new question.
- Agent asks about an alias id: the exchange is attributed to the topic's primary event with the alias in `related_event_ids`.
- Released topic the agent never asks about: after the expert moves on (newer topic) or a release timeout, it is deferred to the debrief, never dropped.
- Agent asks follow-ups on its own: counted against the budget; when the budget is exhausted the agent is told to stop asking live questions.
- VAD events not delivered over WebRTC: local mic level and tentative transcripts still drive "user speaking".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every received pointing event MUST become a topic candidate and MUST be stored as evidence, including merged duplicates.
- **FR-002**: An event MUST merge into an existing topic when: same `channel_id` (or both null), same record state, region IoU ≥ 0.5 (configurable) and received within 20 s (configurable, inclusive) of that topic's latest event. A merge records a `topic_queued` timing mark for the alias and creates no question.
- **FR-003**: Topics MUST have exactly one of the states queued, released, asked, answered, deferred_to_debrief, dropped_off_record.
- **FR-004**: An exchange MUST keep the topic's primary `event_id` and list merged aliases in `related_event_ids`.
- **FR-005**: For a topic whose event mapping is ambiguous/unresolved, the first question MUST be `clarify_reference`; other kinds MUST be rejected until one exists. Clarification answers MUST be marked as never counting as an interpretation.
- **FR-006**: A topic MUST be flagged stale at release when it waited longer than 30 s (configurable) or a newer non-duplicate event exists; the release text MUST then ask the agent to refer explicitly to the earlier moment, naming the channel when known.
- **FR-007**: A live question budget (default 5 per rolling 10 minutes, configurable) MUST be enforced at release; topics that cannot be released within budget MUST become `deferred_to_debrief`. Nothing is dropped silently.
- **FR-008**: Pointing events MUST NOT reach the agent on arrival; a topic is released only when the agent is not speaking, the expert is not speaking, the expert has been quiet ≥ `pause_ms` (default 1200 ms, configurable), no other topic is open, and budget remains. Off-record topics MUST never be released.
- **FR-009**: Only one topic MAY be open at a time; it closes when its exchange has an answer, when the expert moves on (a newer topic arrives), or when a release timeout passes without a question.
- **FR-010**: The agent's instructions MUST tell it to stay silent (skip turn) mid-explanation, skip or deepen instead of repeating, refer to stale moments explicitly, ask about exceptions to "usually", and ask at least one guardrail question after an interpretation.
- **FR-011**: Turn-taking settings of the expert agent MUST be set reproducibly (script) and documented.
- **FR-012**: The system MUST compute per exchange: processing latency (event received → topic ready), intentional wait (ready → released), agent latency (released → question tool → agent speech); and the number of agent turns started while the expert was speaking. It MUST write `timing-report.md` to the session folder and show a compact table in the console.
- **FR-013**: Each exchange MUST keep `phase: "live"` and a kind. Console counters (live questions, guardrail questions, deferred topics, unlinked agent questions, interruptions, duplicate questions) MUST be derived from stored records.
- **FR-014**: The console MUST offer "Run fixture scenario" injecting evt-001, evt-003, evt-002, evt-004 at configurable offsets; fixture records stay `source: "fixture"`.
- **FR-015**: Five new probe cases (duplicate, ambiguous-first, deeper-after-interpretation, "usually"→exception, stale reference) MUST each pass ≥ 4/5 runs, with counts reported.
- **FR-016**: `pause_ms` MUST be adjustable from the console for tuning during the human gate, and the values used MUST be stored with the session.

### Key Entities

- **Topic**: something the expert pointed at that the apprentice may ask about. Primary event, alias events, state, whether clarification is required, queued/released times, staleness at release, release text, linked exchanges.
- **Interview config**: dedup window, IoU threshold, staleness threshold, budget, pause, release timeout. Stored with the session.
- **Timing row**: per exchange, the derived latencies; plus session-level interruption count.
- **Existing**: PointingEvent, ExpertExchange (+ `related_event_ids`), TimingMark (+ user speech start/end marks), SessionSnapshot (+ topics, config).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the scripted fixture scenario, stored records show ≥ 3 live questions, ≥ 1 guardrail, 0 duplicate questions for evt-001/evt-003, and a clarify-first exchange for evt-004.
- **SC-002**: The timing report of the gate session shows 0 agent turns started while the expert was speaking.
- **SC-003**: Each of the 5 new probe cases passes in ≥ 4 of 5 runs; Sprint 1 probe cases do not regress below 4/5.
- **SC-004**: The timing report shows processing latency and intentional wait in separate columns for every released exchange.
- **SC-005**: The human judges in the gate that questions come at natural pauses and are never repeated.

## Assumptions

- Dedup time uses the client's receive time of each event (one consistent clock for fixtures and live); WS2 transport delay is assumed small.
- Topic "ready" equals the `topic_queued` mark; processing is in-process, so processing latency will be near zero for fixtures.
- "User speaking" combines server VAD score, tentative user transcripts and local microphone level; none is proof the expert has finished thinking (documented limitation).
- The Sprint 1 `begin_question` tool and session reducer are the base; Sprint 1 is not yet merged into `voice` (its live gate is pending).
- Out of scope: debrief, coverage, teach-back (Sprint 3); off-record beyond never releasing off-record topics (Sprint 4).
