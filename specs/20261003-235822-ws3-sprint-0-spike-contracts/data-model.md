# Data Model: WS3 v0 contracts (`SCHEMA_VERSION = "ws3.v0"`)

The canonical definition is `web/lib/expert/contracts.ts`; this is the design view.

## Conventions

- **Field names** are snake_case. Timestamps ending in `_utc` are ISO-8601 strings.
- **Nullability:** `null` means unknown or not applicable. Fields are never omitted when they're in the type, and values are never guessed.
- **Shared enums:**
  - `source`: `"live" | "fixture"`
  - `record_state`: `"on_record" | "off_record"`

## PointingEvent (WS2 → WS3, validated)

| Field | Type | Rule |
|---|---|---|
| schema_version | string | must equal `ws3.v0` |
| session_id, event_id, frame_id | string | non-empty |
| source | `live` \| `fixture` | required |
| captured_at_utc | ISO string | parseable date |
| session_time_ms | number | ≥ 0. **Recording time, not signal time** |
| image_ref, highlighted_image_ref | string | non-empty |
| region | object | x, y, width, height in [0,1]; width, height > 0; x+width ≤ 1; y+height ≤ 1; `coordinate_space = "original_frame_normalized"`; frame_width_px, frame_height_px are positive integers |
| mapping_status | `resolved` \| `ambiguous` \| `unresolved` | an ambiguous event is never treated as resolved |
| trace_id, channel_id | string \| null | null when not reliably known |
| signal_interval | `{start, end, unit}` \| null | start ≤ end; unit non-empty; only when calibrated |
| record_state | `on_record` \| `off_record` | required |
| label | string (optional) | dev UI hint only; **never sent to the agent** |

## ExpertExchange (WS3 → WS5)

- **Identity:** `exchange_id`, `session_id`.
- **Linked event:** `event_id: string | null`. Null only when the question isn't about a pointing event.
- **Phase:** `live | debrief | teach_back`.
- **Kind:** `explain | reasoning | distinction | context | guardrail | exception | clarify_reference | gap`.
- **Question:** `question`, the agent's spoken words, verbatim.
- **Answer lines:** `answer_lines: {text, at_utc, transcript_line_id}[]`, the expert's words, verbatim.
- **Timing:** `asked_at_utc`, `answer_started_at_utc | null`, `answer_ended_at_utc | null`, `audio_offset_secs | null`.
- **Recording:** `record_state`, `source`.
- **Invariant:** `event_id` is fixed when the exchange is created.

## CoverageItem

`dimension (decision|reason|cues|alternatives|guardrails|unresolved)`, `event_id | null`, `status (missing|partial|covered)`, `supporting_exchange_ids[]`, `note | null`. The `note` is AI synthesis and is never treated as expert words.

## OpenQuestion

`open_question_id`, `missing_fact`, `why_it_matters`, `related_event_ids[]`, `related_exchange_ids[]`, `answered_by_exchange_id | null`.

## DraftRevision (immutable)

- **Fields:** `revision_id` (`rev-<n>`), `session_id`, `created_at_utc`, `parent_revision_id | null`, `change_reason | null`.
- **Steps:** `steps[]: {step_id, text, kind (step|decision|guardrail|exception), supporting_event_ids[], supporting_exchange_ids[]}`.
- **Transition:** a correction creates `rev-(n+1)` with `parent_revision_id = rev-n`.

## ExpertConfirmation

`confirmation_id`, `revision_id`, `status (confirmed|corrected|unresolved)`, `step_ids_reviewed[]`, `expert_response_exchange_id`, `at_utc`. It requires an explicit expert response exchange; silence never produces a confirmation.

## SessionCompletion

- **Fields:** `session_id`, `ended_at_utc`, `end_reason (completed|incomplete|aborted)`, `confirmed_revision_id | null`, `coverage: CoverageItem[]`, `unresolved_open_question_ids[]`.
- **Exclusions:** `excluded: {off_record_segments: number, excluded_exchange_ids: string[]}`.
- **Counts:** `counts: {live_questions, live_guardrail_questions, debrief_questions}`.

## TimingMark

`session_id`, `event_id | null`, `exchange_id | null`, `mark`, `at_utc`, `at_perf_ms`.

The `mark` values are: `event_received`, `topic_queued`, `topic_released`, `question_tool_called`, `agent_speech_started`, `answer_started`, `answer_ended`.

## RecordingSegment

`segment_id`, `state (on_record|off_record)`, `started_at_utc`, `ended_at_utc | null`.
