# WS3 Data Contracts — v1 (final WS3 field set; pending partner agreement)

**Status:** final WS3 field set after Sprint 4, still **pending agreement** with WS2, WS5 and WS6. The file keeps its `-v0` name so existing links work.

**Schema versions:**
- Session records (snapshot, `session.json`, `completion.json`): **`ws3.v1`** (`SCHEMA_VERSION`).
- `PointingEvent` (WS2 → WS3): **`ws3.v0`**, unchanged (`EVENT_SCHEMA_VERSION`). WS2 keeps sending `ws3.v0`.

## Changes in ws3.v1 (Sprint 4)

| Where | Change |
|---|---|
| `SessionSnapshot` | + `conversation_ids[]` (all ElevenLabs conversations of the session; a resume adds one; `conversation_id` = the latest), + `end_cause` (`stop`\|`disconnect`\|`error`\|null), + `recording_segments[]`, + `off_record_excluded` (counts), + `strikes[]`, + `elevenlabs_deletions[]`; `schema_version` `ws3.v1` |
| `RecordingSegment` | + `trigger` (`session_start`\|`agent_tool`\|`console`\|`expert_phrase`\|`capture_event`\|`resume`); now actually written |
| `SessionCompletion` | final shape (see below), written as `completion.json` / `completion.md` |
| New | `Strike`, `OffRecordExcluded`, `ElevenLabsDeletionReport`, `SetRecordStateParams` |
| `PhaseTrigger` | + `strike`, + `resume` |
| Validation | `validateSessionSnapshot` refuses any event or exchange with `record_state: off_record`, and any transcript line, answer line, preamble line or timing mark inside an off-record segment (server-side leak guard); checks segments alternate and are closed, and strikes link to known records. New `validateSessionCompletion` (never `completed` without a confirmed revision), `validateSetRecordStateParams`, `validateDeletionReport` |
| Behaviour | Off-record pointing events are no longer stored at all (Sprint 2 kept them as `dropped_off_record` topics). `Topic.state = dropped_off_record` and `ExpertExchange.record_state = off_record` therefore never appear in saved data; the fields stay for compatibility |

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

`dimension` (`decision` \| `reason` \| `cues` \| `alternatives` \| `guardrails` \| `unresolved`), `event_id` (nullable: session-level), `status` (`missing` \| `partial` \| `covered`), `supporting_exchange_ids[]`, `note` (nullable, **AI synthesis**), *(Sprint 3)* `resolution` (`answered` \| `unknown_escalate` \| null).

*(Sprint 3)* Filled by the agent's `record_coverage` tool after an answer. Row key (`event_id` = topic primary event, `dimension`). Status only goes up. `unknown_escalate` stores `covered` and also covers the row's `guardrails`. Code: `web/lib/expert/coverage.ts` behind `web/lib/expert/synthesis.ts` (`getGaps`, `buildDraft`), the WS5 swap point.

### Gap / DebriefItem — Sprint 3

**Gap:**
- `gap_id`: `gap-<event_id|session>-<dimension>` or `gap-<open_question_id>`
- `event_id`, `topic_id`, `dimension`, `open_question_id`
- `description`: a template, never an interpretation
- `status_at_start` (`missing` \| `partial`)

**DebriefItem** = Gap + `state` (`open` → `asked` → `partial` \| `resolved` \| `unknown`) + `exchange_ids[]`.

The agenda is the top 5 gaps, frozen when the debrief starts (`debrief_agenda` in the snapshot). The selector:
- excludes covered cells;
- excludes dimensions already asked and answered on the same region (explain→decision, reasoning→reason, context→cues, distinction→alternatives, guardrail→guardrails);
- orders: deferred topics' open questions first, then guardrails, alternatives and missing reasons, with topic rows before the session row.

### OpenQuestion

`open_question_id`, `missing_fact`, `why_it_matters`, `related_event_ids[]`, `related_exchange_ids[]`, `answered_by_exchange_id` (nullable until answered).

### DraftRevision — immutable

- **Fields:** `revision_id` (`rev-1`, `rev-2`, …), `session_id`, `created_at_utc`, `parent_revision_id` (nullable for the first revision), `change_reason` (nullable; references the correction).
- **Steps:** `steps[]` = `{step_id, text (AI synthesis; any quote must be verbatim from a linked answer), kind (step|decision|guardrail|exception), supporting_event_ids[], supporting_exchange_ids[]}`. A step with no supporting event **and** exchange is unsupported and is not taught as fact.
- *(Sprint 3)* **New fields:**
  - `steps[].supported` (boolean);
  - `change_exchange_ids[]` (the expert's correction exchanges).
- *(Sprint 3)* **Step ids** are `s-N` and stay stable across revisions: an unchanged step (same kind and text) keeps its id.
- *(Sprint 3)* **Evidence:**
  - an exchange's own event (and its merged duplicates) counts as event evidence;
  - `clarify_reference` answers never count;
  - quotes (`"…"`, `“…”`, `‘…’`, `'…'`) must appear verbatim (case, spacing and edge punctuation aside) in the step's linked answers, or the proposal is rejected.

### ExpertConfirmation

`confirmation_id`, `revision_id` (the **exact** revision reviewed), `status` (`confirmed` \| `corrected` \| `unresolved`), `step_ids_reviewed[]`, `expert_response_exchange_id` (the explicit spoken response; silence never creates a confirmation), `at_utc`.

*(Sprint 3)* **Step verification** in `knowledge-draft.md` is either `confirmed` or `unresolved`. A step is `confirmed` only when:
- the latest revision has a `confirmed` confirmation, **and**
- some confirmation in its parent chain reviewed that step id.

### Phases — Sprint 3

- `SessionSnapshot.phase`: `live` → `debrief` → `teach_back` → `confirmed`, or `incomplete` if the session ends without confirming the latest revision.
- `phase_log[]` = `{phase, at_utc, trigger: agent_tool|console|confirmation|session_end}`.
- `ExpertExchange.phase` stays `live|debrief|teach_back`.
- New exchange kinds:
  - `teach_back`: opened by the client when a revision is created. Its `question` is the spoken teach-back, verbatim.
  - `correction`: a question asked during the teach-back.
- New exchange fields: `gap_id` (debrief) and `revision_id` (teach-back).
- `DeferredReason` adds `task_complete`.

### SessionCompletion — Sprint 4 (`completion.json`, derived by `web/lib/expert/completion.ts`)

Derived only from the stored records when the session has ended (`ended_at_utc` set); removed again if the session is resumed.

| Field | Meaning |
|---|---|
| `schema_version`, `session_id`, `conversation_ids[]`, `started_at_utc`, `ended_at_utc` | |
| `end_reason` | `completed` only if the final phase is `confirmed` and the latest revision has an explicit, still-valid (not struck) `confirmed` confirmation; `aborted` when `end_cause = error`; otherwise `incomplete` |
| `end_cause` | `stop` (Stop pressed), `disconnect` (connection dropped), `error` |
| `final_phase`, `confirmed_revision_id` (null unless completed), `latest_revision_id` | |
| `coverage[]` | Final grid, missing cells included |
| `unresolved_open_question_ids[]`, `open_gap_ids[]` | Unanswered open questions; agenda gaps still `open`/`asked`/`partial` |
| `unfinished[]` | Plain statements ("teach-back not confirmed (rev-1)", "2 debrief gap(s) unresolved: …", "debrief not started", "the session ended while off the record"). Never empty for an unfinished session |
| `excluded` | `{off_record_segments, segments[{from_utc,to_utc}], excluded_exchange_ids[] (struck), transcript_lines, events, timing_marks, refused_tool_calls}` — counts and times only |
| `counts` | `{live_questions, live_guardrail_questions, debrief_questions, teach_backs, confirmations (valid only), strikes}`, derived from the stored exchanges via `liveCounters` |

### Strike — Sprint 4

`{strike_id: str-NNN, exchange_id, at_utc, trigger: agent_tool|console, removed_line_count, superseded_revision_ids[], invalidated_confirmation_ids[]}`.
- The struck exchange keeps its id (links stay valid) with `answer_lines: []`; its transcript lines and any strike-request lines said since are removed.
- Coverage cells supported only by it are removed (others lose their AI note); its agenda gap reopens; an open question it answered reopens.
- Revisions citing it are **superseded**: the citing steps' text becomes "(step removed: …)" with `supported: false`, a `change_reason` based on it is redacted, and the teach-back text of that revision is redacted. The store may rewrite exactly these revision files.
- Confirmations of superseded revisions, or whose response was the struck exchange, are **invalidated**: they no longer count anywhere (step verification, completion, `confirmed` phase → back to `teach_back`, trigger `strike`).

### ElevenLabsDeletionReport — Sprint 4

`{session_id, at_utc, results: [{conversation_id, status: deleted|not_found|failed, detail}]}`. Appended to `elevenlabs-deletion.json` by the deletion route and to `SessionSnapshot.elevenlabs_deletions[]` by the client.

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

### RecordingSegment — written since Sprint 4

`segment_id` (`seg-NNN`), `state` (`on_record` \| `off_record`), `started_at_utc`, `ended_at_utc` (null while open), `trigger`.
- The first segment is `on_record` from the session start (`session_start`). Each change closes the current segment and opens the next; consecutive segments alternate. The last segment is the **acknowledged** current state (what the console shows; WS7 should show this, not a local toggle).
- Going off the record by the agent tool or an expert phrase starts the segment at the expert utterance that asked for it (searched ≤ 30 s back), so "off the record, X" never stores X.
- An off-record capture event switches off (`capture_event`); only a later on-record capture event, or the expert, ends such a segment. Only the expert (voice or console) ends any other segment.
- `off_record_excluded` = `{transcript_lines, events, timing_marks, refused_tool_calls}` counts what was dropped. Content is never stored.

### SessionSnapshot — Sprint 1, written by `PUT /api/expert-sessions/<id>/snapshot`

The full state of one expert session, validated by `validateSessionSnapshot` and saved idempotently.

- **Fields:** `schema_version`, `session_id` (`^[a-z0-9-]{1,64}$`, e.g. `ses-20261004-011500-a1b2`), `conversation_id` (nullable), *(v1)* `conversation_ids[]`, `end_cause`, `started_at_utc`, `ended_at_utc` (nullable), `events[]`, `exchanges[]`, `active_exchange_id`, `awaiting_question_exchange_id`, `preamble[]` (AnswerLine: expert words before any question), `transcript[]`, `timing[]`, `unlinked_agent_questions[]`, *(Sprint 2)* `topics[]`, `interview_config`, *(Sprint 3)* `phase`, `phase_log[]`, `coverage[]`, `open_questions[]`, `debrief_agenda[]`, `revisions[]`, `confirmations[]`, *(Sprint 4)* `recording_segments[]`, `off_record_excluded`, `strikes[]`, `elevenlabs_deletions[]`.
- **TranscriptEntry:** `{line_id, role: user|agent, text, at_utc, exchange_id}`. `exchange_id` is the exchange that was active when the line arrived.
- **UnlinkedQuestion:** `{line_id, text, at_utc}`. Agent speech ending in `?` with no preceding `begin_question`. It is a prompt-tuning defect signal.
- **Validation also checks** that every record carries the snapshot's `session_id`, that each exchange's `event_id` is a known event, and that ids are unique. *(Sprint 2)* Topic primary/alias events and exchange `related_event_ids` must be known events; exchange `topic_id` must be a known topic.

### Client tool `begin_question` — Sprint 1

Params: `{event_id: string ("none" → null), kind: ExchangeKind, question: string}`, *(Sprint 3)* optional `phase` (`live|debrief|teach_back`, must match the current phase) and `gap_id` ("none" → null).
- **Debrief:** a question needs an open agenda gap. Its event comes from the gap, and its kind is stored as `gap`.
- **Teach-back:** the question is stored as `correction`. It returns `ok exchange_id=ex-NNN` or `error …` to the LLM. Validator: `validateBeginQuestionParams`. *(Sprint 2)* A duplicate's id is accepted and attributed to the primary event; a non-`clarify_reference` first question on an ambiguous topic returns `error event <id> is ambiguous: …`.

### Client tools — Sprint 3

Full table: `specs/20261004-003657-ws3-sprint-3-debrief-confirmation/contracts/agent-tools.md`.

- **`record_coverage({exchange_id, dimensions:[{dimension, status: partial|covered|unknown_escalate, note}]})`**: rejects unknown or unanswered exchanges and `clarify_reference`.
- **`signal_task_complete({reason})`**: moves live → debrief and returns the `[PHASE debrief]` agenda.
- **`propose_draft({steps:[{kind, text, event_ids[], exchange_ids[]}], change_reason})`**:
  - in the debrief, it creates rev-1, but only after ≥ 3 answered debrief questions (or the whole agenda, if shorter);
  - in the teach-back, it is allowed only after a `corrected` confirmation and creates rev-n+1;
  - it returns the `[TEACH_BACK rev-n]` block;
  - the client assigns all ids.
- **`confirm_revision({revision_id, status, step_ids_reviewed})`**:
  - only in the teach-back;
  - rejects a stale `revision_id`;
  - needs an unused teach-back-phase exchange for the latest revision, with a spoken teach-back and expert answer lines. Otherwise: "silence is not confirmation", and nothing is stored;
  - `step_ids_reviewed` defaults to the steps taught.
- **Phase blocks** go out as a contextual update with `contextId` `ws3-phase`, whenever they change. For the console path, a `[CONTROL]` nudge follows.

### Client tools — Sprint 4

Contract: `specs/20261004-081433-ws3-sprint-4-trust-completion/contracts/tools-and-routes.md`.

- **`set_record_state({state: off_record|on_record})`** (also accepts `off`/`on`): idempotent; returns the acknowledgement instruction. While off the record every recording tool (`begin_question`, `record_coverage`, `signal_task_complete`, `propose_draft`, `confirm_revision`, `strike_last_answer`) returns `error the expert is off the record: …` and nothing is stored.
- **`strike_last_answer({reason})`**: strikes the latest exchange holding expert words other than a strike request. `reason` is ignored and never stored (the agent tends to paraphrase the struck words into it). After a strike that supersedes the latest revision, `propose_draft` is allowed in the teach-back and the new revision is taught back in full.
- Context updates: `[RECORD_STATE] off_record|on_record …` (`contextId` `ws3-record`), `[RESUME] …` (`ws3-resume`), `[TEACH_BACK rev-n superseded] …` (phase block after a strike).

### Routes — Sprint 4

- `POST /api/expert-sessions/<id>/elevenlabs-deletion`: deletes the ElevenLabs conversations listed in that session's saved `session.json` (`conversation_ids`), only if the session has ended and had an off-record segment (else 409). Never lists or bulk-deletes. Returns and appends the report.
- `POST /api/expert-sessions/<id>/demo-evidence`: re-derives `demo-evidence.md` from the saved files, writes it, returns `{markdown, checklist, file}`.

### What the agent receives — Sprint 2

Pointing events are **not** sent on arrival. A topic is released (contextual update, `contextId` = event id) only when the agent is silent, the expert is not speaking and has been quiet ≥ `pause_ms`, no other topic is open, and the budget allows it. If the agent stays silent for `nudge_after_ms`, one `[CONTROL]` user message gives it a turn; `[CONTROL]` lines are never stored as expert words. Budget state goes out as `[STATE] live_question_budget=…` (`contextId` `ws3-state`). Exact wording: `specs/20261004-015810-ws3-sprint-2-live-interview/contracts/release-protocol.md`.

## On-disk layout (Sprint 1+, local files, WS6 may take over)

Sprint 1 writes the first six files; Sprint 2 adds `timing-report.md`. The root is `KNOWLEDGE_DIR`, default `<repo>/knowledge`, and `knowledge/sessions/` is git-ignored. `session.json` holds the snapshot minus events, exchanges and timing (so it includes `topics` and `interview_config`), plus `counts` (Sprint 2: `topics`, `live_questions`, `guardrail_questions`, `deferred_topics`, `unlinked_agent_questions`, `interruptions`, `duplicate_questions`, all derived from the records).

```text
knowledge/sessions/<session_id>/
  session.json  events.json  exchanges.json  timing.json
  transcript.md  exchanges.md  timing-report.md
  revisions/rev-N.json|md  confirmations.json  knowledge-draft.md
  completion.json  completion.md  demo-evidence.md      (Sprint 4, once the session has ended)
  elevenlabs-deletion.json                              (Sprint 4, after a conversation deletion)
```

*(Sprint 3)* The following are written:
- `revisions/rev-N.json|md`: never overwritten with different content (the store refuses).
- `confirmations.json`.
- `knowledge-draft.md`: the latest revision for WS5. Each step lists its verification, its event images (highlighted + full frame, FIXTURE-labeled) and the verbatim answers of its exchanges, followed by guardrails, open questions, the diff to the parent revision and the confirmations.

`session.json.counts` adds `debrief_questions`, `debrief_gap_questions` and `teach_backs`.

*(Sprint 4)* Off-record content is absent from every file by construction (dropped in memory, refused by the validator). `transcript.md`, `exchanges.md`, `knowledge-draft.md` and `completion.md` show a neutral marker per off-record segment ("off-record segment from T1 to T2 (content excluded)") and the struck exchanges. `completion.*` and `demo-evidence.md` are written when the session has ended and removed if it is resumed.

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
