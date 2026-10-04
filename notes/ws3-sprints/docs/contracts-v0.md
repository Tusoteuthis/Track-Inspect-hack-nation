# WS3 Data Contracts — v0 (pending agreement)

**Status:** v0 proposal from WS3, **pending agreement** with WS2, WS5 and WS6. Nothing here is a final API.

**Schema version:** `ws3.v0`

**Canonical source:** `web/lib/expert/contracts.ts`, with types and validators: `validatePointingEvent`, plus `validateBeginQuestionParams`, `validateExpertExchange`, `validateTimingMark`, `validateSessionSnapshot` and `isValidSessionId` (added in Sprint 1).

**Sample data:** `web/fixtures/pointing-events/*.json`. These are fixtures and carry `source: "fixture"`.

## Conventions

- Field names are snake_case. Timestamps ending in `_utc` are ISO-8601 strings in UTC.
- `null` means unknown or not applicable. Fields in a record are always present. Values are never guessed.
- **Session time ≠ signal time.**
  - `session_time_ms` is elapsed recording time ("the expert pointed 2:15 into the session").
  - `signal_interval` is a position on the trace's horizontal axis, set only when calibrated.
  - Neither may be derived from the other.
- **Expert words vs. AI synthesis.** Fields holding the expert's words (`answer_lines`) are verbatim and never edited. AI-written fields (`note`, `DraftStep.text`) are synthesis and never presented as quotes.
- `source: "live" | "fixture"` marks simulated data. `record_state: "on_record" | "off_record"` controls whether content may be persisted.

## Records

### PointingEvent — produced by WS2, consumed by WS3 (validated on arrival)

| Field | Type | Meaning | Null? |
|---|---|---|---|
| `schema_version` | `"ws3.v0"` | Contract version | no |
| `session_id` | string | Expert session this gesture belongs to | no |
| `event_id` | string | Unique per gesture, including repeated gestures at the same spot | no |
| `source` | `live` \| `fixture` | Whether this came from real capture | no |
| `captured_at_utc` | ISO string | Wall-clock capture time | no |
| `session_time_ms` | number ≥ 0 | Elapsed **recording** time since session start | no |
| `frame_id` | string | The captured frame the region refers to | no |
| `image_ref` | string | Original frame (resolvable URL/path) | no |
| `highlighted_image_ref` | string | Derivative with the region highlighted | no |
| `region` | object | `x, y, width, height` in [0,1], origin top-left of the **original saved frame**; `coordinate_space: "original_frame_normalized"`; `frame_width_px`, `frame_height_px` | no |
| `mapping_status` | `resolved` \| `ambiguous` \| `unresolved` | Whether the region could be mapped to one trace feature. Ambiguous events are clarified, never treated as resolved | no |
| `trace_id` | string | Displayed trace, if reliably known | **yes** |
| `channel_id` | string | Channel (e.g. SYS1), if reliably known | **yes** |
| `signal_interval` | `{start, end, unit}` | Position on the trace axis, only when calibrated (start ≤ end) | **yes** |
| `record_state` | `on_record` \| `off_record` | Whether this event may be recorded | no |
| `label` | string (optional) | Dev-UI hint only. **Never sent to the agent; never an interpretation** | optional |

Validation rejects: wrong schema version, missing ids, unknown enum values, regions outside the frame or overflowing it (`x+width>1`), an empty string instead of `null` for unknown ids, and malformed signal intervals.

### ExpertExchange — produced by WS3, consumed by WS5

| Field | Type | Meaning | Null? |
|---|---|---|---|
| `exchange_id`, `session_id` | string | Identity | no |
| `event_id` | string | The pointing event the question was about. **Fixed at creation**; it doesn't change if the expert moves on. *(Sprint 2)* Always the topic's **primary** event, even if the agent named a merged duplicate | yes, only for questions not about an event |
| `topic_id` | string | *(Sprint 2)* The topic the question belongs to | yes, when `event_id` is null |
| `related_event_ids` | string[] | *(Sprint 2)* Duplicate gestures merged into the topic at ask time (excludes `event_id`). Evidence, not separate questions | no (may be empty) |
| `phase` | `live` \| `debrief` \| `teach_back` | When it was asked (keeps challenge question counts separate) | no |
| `kind` | `explain` \| `reasoning` \| `distinction` \| `context` \| `guardrail` \| `exception` \| `clarify_reference` \| `gap` | Question type. A `clarify_reference` answer only says *which region*; it **never counts as an interpretation** (coverage/synthesis must ignore it as such) | no |
| `question` | string | The agent's spoken question, verbatim: the agent's first final line after `begin_question`. `""` until spoken | no |
| `question_planned` | string | *(Sprint 1)* The text the agent passed to `begin_question`. **AI plan, not evidence** | yes |
| `answer_lines` | `{text, at_utc, transcript_line_id}[]` | The expert's words, **verbatim** | no (may be empty) |
| `asked_at_utc` | ISO | When the question was asked | no |
| `answer_started_at_utc`, `answer_ended_at_utc` | ISO | Answer span | yes |
| `audio_offset_secs` | number | Offset into the conversation audio, if available | yes |
| `record_state`, `source` | enums | As above | no |

### CoverageItem — WS3 stand-in, to be replaced by WS5 synthesis

`dimension` (`decision` \| `reason` \| `cues` \| `alternatives` \| `guardrails` \| `unresolved`), `event_id` (nullable: session-level), `status` (`missing` \| `partial` \| `covered`), `supporting_exchange_ids[]`, `note` (nullable, **AI synthesis**).

### OpenQuestion

`open_question_id`, `missing_fact`, `why_it_matters`, `related_event_ids[]`, `related_exchange_ids[]`, `answered_by_exchange_id` (nullable until answered).

### DraftRevision — immutable

- **Fields:** `revision_id` (`rev-1`, `rev-2`, …), `session_id`, `created_at_utc`, `parent_revision_id` (nullable for the first revision), `change_reason` (nullable; references the correction).
- **Steps:** `steps[]` = `{step_id, text (AI synthesis; any quote must be verbatim from a linked answer), kind (step|decision|guardrail|exception), supporting_event_ids[], supporting_exchange_ids[]}`. A step with no supporting event **and** exchange is unsupported and is not taught as fact.

### ExpertConfirmation

`confirmation_id`, `revision_id` (the **exact** revision reviewed), `status` (`confirmed` \| `corrected` \| `unresolved`), `step_ids_reviewed[]`, `expert_response_exchange_id` (the explicit spoken response; silence never creates a confirmation), `at_utc`.

### SessionCompletion

- **Fields:** `session_id`, `ended_at_utc`, `end_reason` (`completed` \| `incomplete` \| `aborted`), `confirmed_revision_id` (nullable; null unless the latest revision was explicitly confirmed), `coverage[]`, `unresolved_open_question_ids[]`.
- **Exclusions:** `excluded` = `{off_record_segments, excluded_exchange_ids[]}`.
- **Counts:** `counts` = `{live_questions, live_guardrail_questions, debrief_questions}`, derived from stored exchanges.

### TimingMark

`session_id`, `event_id` (nullable), `exchange_id` (nullable), `mark`, `at_utc`, `at_perf_ms`.

The `mark` values are `event_received`, `topic_queued`, `topic_released`, `question_tool_called`, `agent_speech_started`, `answer_started` and `answer_ended`, plus *(Sprint 2)* `user_speech_started`, `user_speech_ended` (expert speech intervals from VAD / tentative transcript / mic, the end stamped at the last speech signal) and `topic_nudged`. They let us separate processing latency from intentional waiting for a pause.

- `topic_queued` = "topic ready". It is also written for a merged duplicate, with the duplicate's `event_id`.
- Derived in `web/lib/expert/timing.ts`: **processing** = `topic_queued − event_received`; **intentional wait** = `topic_released − topic_queued`; **agent latency** = `topic_released → question_tool_called → agent_speech_started`; **interruptions** = `agent_speech_started` inside an expert speech interval.

### Topic — Sprint 2, WS3-internal (in `session.json`)

Something the expert pointed at that the apprentice may ask about.

| Field | Meaning |
|---|---|
| `topic_id` | `top-NNN` |
| `primary_event_id`, `alias_event_ids[]` | First gesture and merged duplicates. A duplicate = same `channel_id` (null = null) and `record_state`, region IoU ≥ 0.5 with the primary, received ≤ 20 s after the topic's newest event. All events stay in `events` |
| `state` | `queued` → `released` → `asked` → `answered`; or `deferred_to_debrief` (budget / expert moved on / release timeout; **for Sprint 3**); `dropped_off_record` (never released) |
| `requires_clarification` | Primary event not `resolved`: the first question must be `clarify_reference` (the tool rejects anything else) |
| `record_state`, `channel_id` | From the primary event |
| `queued_at_utc/_perf_ms`, `last_event_at_perf_ms`, `released_at_utc/_perf_ms`, `asked_at_perf_ms`, `nudged_at_perf_ms` | Lifecycle times (client clock) |
| `stale_at_release`, `release_text` | Whether the release asked the agent to refer to the earlier moment; the exact text sent |
| `exchange_ids[]`, `deferred_reason` | Questions on this topic; why it went to the debrief |

### InterviewConfig — Sprint 2 (`interview_config` in `session.json`)

`dedup_window_ms` 20000, `dedup_min_iou` 0.5, `stale_after_ms` 30000, `budget_max_questions` 5 per `budget_window_ms` 600000, `pause_ms` 1200, `release_timeout_ms` 30000, `nudge_after_ms` 2500 (0 = off), `speech_hold_ms` 400, `vad_threshold` 0.5, `mic_threshold` 0.04. The values used are stored with each session.

### RecordingSegment

`segment_id`, `state` (`on_record` \| `off_record`), `started_at_utc`, `ended_at_utc` (nullable while open).

### SessionSnapshot — Sprint 1, written by `PUT /api/expert-sessions/<id>/snapshot`

The full state of one expert session, validated by `validateSessionSnapshot` and saved idempotently.

- **Fields:** `schema_version`, `session_id` (`^[a-z0-9-]{1,64}$`, e.g. `ses-20261004-011500-a1b2`), `conversation_id` (nullable), `started_at_utc`, `ended_at_utc` (nullable), `events[]`, `exchanges[]`, `active_exchange_id`, `awaiting_question_exchange_id`, `preamble[]` (AnswerLine: expert words before any question), `transcript[]`, `timing[]`, `unlinked_agent_questions[]`, *(Sprint 2)* `topics[]`, `interview_config`.
- **TranscriptEntry:** `{line_id, role: user|agent, text, at_utc, exchange_id}`. `exchange_id` is the exchange that was active when the line arrived.
- **UnlinkedQuestion:** `{line_id, text, at_utc}`. Agent speech ending in `?` with no preceding `begin_question`. It is a prompt-tuning defect signal.
- **Validation also checks** that every record carries the snapshot's `session_id`, that each exchange's `event_id` is a known event, and that ids are unique. *(Sprint 2)* Topic primary/alias events and exchange `related_event_ids` must be known events; exchange `topic_id` must be a known topic.

### Client tool `begin_question` — Sprint 1

Params: `{event_id: string ("none" → null), kind: ExchangeKind, question: string}`. It returns `ok exchange_id=ex-NNN` or `error …` to the LLM. Validator: `validateBeginQuestionParams`. *(Sprint 2)* A duplicate's id is accepted and attributed to the primary event; a non-`clarify_reference` first question on an ambiguous topic returns `error event <id> is ambiguous: …`.

### What the agent receives — Sprint 2

Pointing events are **not** sent on arrival. A topic is released (contextual update, `contextId` = event id) only when the agent is silent, the expert is not speaking and has been quiet ≥ `pause_ms`, no other topic is open, and the budget allows it. If the agent stays silent for `nudge_after_ms`, one `[CONTROL]` user message gives it a turn; `[CONTROL]` lines are never stored as expert words. Budget state goes out as `[STATE] live_question_budget=…` (`contextId` `ws3-state`). Exact wording: `specs/20261004-015810-ws3-sprint-2-live-interview/contracts/release-protocol.md`.

## On-disk layout (Sprint 1+, local files, WS6 may take over)

Sprint 1 writes the first six files; Sprint 2 adds `timing-report.md`. The root is `KNOWLEDGE_DIR`, default `<repo>/knowledge`, and `knowledge/sessions/` is git-ignored. `session.json` holds the snapshot minus events, exchanges and timing (so it includes `topics` and `interview_config`), plus `counts` (Sprint 2: `topics`, `live_questions`, `guardrail_questions`, `deferred_topics`, `unlinked_agent_questions`, `interruptions`, `duplicate_questions`, all derived from the records).

```text
knowledge/sessions/<session_id>/
  session.json  events.json  exchanges.json  timing.json
  transcript.md  exchanges.md  timing-report.md
  revisions/rev-N.json|md  confirmations.json  completion.json|md  knowledge-draft.md
```

## Open questions per partner

**WS2 (capture):**
1. Can you emit `region` in original-frame normalized coordinates, plus frame pixel size? If you rectify the screen, which coordinate space and transform will you declare?
2. Is a new `event_id` per gesture acceptable, with WS3 merging repeats? Or will you debounce sustained poses yourself? What time window do you use?
3. How do events reach the browser session: push (WebSocket/SSE) or polling? Who defines the session origin for `session_time_ms`?
4. When will `trace_id`/`channel_id` be reliable, and can you ever supply a calibrated `signal_interval`?
5. Off-record: will you stop capturing frames, or only tag them `off_record`?

**WS5 (knowledge/tutor):**
1. Are `ExpertExchange` and `DraftRevision` sufficient inputs for your synthesis, or do you need extra fields (e.g. `related_event_ids` for merged gestures, added in Sprint 2)?
2. Will you replace our coverage tracker and draft builder through the `synthesis.ts` interface (Sprint 3), and when?
3. Is "only `confirmed` steps of the latest explicitly confirmed revision are teaching material" your eligibility rule too?
4. Image references: are `/fixtures/...` public paths acceptable for dev, and what will live evidence refs look like?

**WS6 (backend):**
1. Are the snake_case JSON records and the `knowledge/sessions/<id>/` layout acceptable as a starting point for your storage?
2. Which component issues session ids, and how are they shared with WS2 and the browser?
3. Do you want versioned endpoints from the start, or will you wrap our idempotent snapshot write (Sprint 1) later?
4. Off-record propagation: which component is authoritative for the recording state?
