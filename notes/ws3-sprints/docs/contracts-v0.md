# WS3 Data Contracts — v0 (pending agreement)

**Status:** v0 proposal from WS3, **pending agreement** with WS2, WS5 and WS6. Nothing here is a final API.

**Schema version:** `ws3.v0`

**Canonical source:** `web/lib/expert/contracts.ts`, with types and the `validatePointingEvent` validator.

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
| `event_id` | string | The pointing event the question was about. **Fixed at creation**; it doesn't change if the expert moves on | yes, only for questions not about an event |
| `phase` | `live` \| `debrief` \| `teach_back` | When it was asked (keeps challenge question counts separate) | no |
| `kind` | `explain` \| `reasoning` \| `distinction` \| `context` \| `guardrail` \| `exception` \| `clarify_reference` \| `gap` | Question type | no |
| `question` | string | The agent's spoken question, verbatim | no |
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

The `mark` values are `event_received`, `topic_queued`, `topic_released`, `question_tool_called`, `agent_speech_started`, `answer_started` and `answer_ended`. They let us separate processing latency from intentional waiting for a pause.

### RecordingSegment

`segment_id`, `state` (`on_record` \| `off_record`), `started_at_utc`, `ended_at_utc` (nullable while open).

## Planned on-disk layout (Sprint 1+, local files, WS6 may take over)

```text
knowledge/sessions/<session_id>/
  session.json  events.json  exchanges.json  timing.json
  transcript.md  exchanges.md
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
