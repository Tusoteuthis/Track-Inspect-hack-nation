# Data Model: WS6 contracts `ws6.v0`

## Conventions

- **Field names** are snake_case and match the JSON written to disk.
- **Null vs optional.** `null` means unknown or not applicable, and the field is still present. A field marked "optional" (`?`) may be absent. Optional fields are used only for additions on top of WS3 shapes and for forward-compatible WS5 extras.
- **`Id`**: a string matching `^[a-z0-9][a-z0-9-]{0,63}$`.
- **`Utc`**: an ISO-8601 string that `Date.parse` accepts.
- **`Source`**:
  - WS6 records: `"live" | "stub" | "fixture"`.
  - WS3 mirror records: `"live" | "fixture"`.
- **`RecordState`**: `"on_record" | "off_record"`.
- **Strictness.** Objects are strict (unknown keys rejected) only for `BusEvent`, which must carry IDs only. Other records strip nothing and reject nothing extra. Zod's default is to strip unknown keys, so parse helpers use `z.object` for those. WS6 stores the parsed value.

## Shared shapes (from WS3)

- **`Region`**: `{x, y, width, height}`, each in [0,1].
  - `width > 0`, `height > 0`, `x + width ≤ 1`, `y + height ≤ 1`.
  - `coordinate_space: "original_frame_normalized"`.
  - `frame_width_px` and `frame_height_px` are positive integers.
- **`SignalInterval`**: `{start, end, unit}`.
  - `start` and `end` are finite with `start ≤ end`.
  - `unit` is a non-empty string.

## WS3 mirror (`expert.ts`): identical to ws3.v0

| Record | Fields |
|---|---|
| PointingEvent | `schema_version: "ws3.v0"`, `session_id`, `event_id`, `source`, `captured_at_utc`, `session_time_ms` (≥0), `frame_id`, `image_ref`, `highlighted_image_ref`, `region`, `mapping_status: resolved\|ambiguous\|unresolved`, `trace_id: string\|null`, `channel_id: string\|null`, `signal_interval: SignalInterval\|null` (key required), `record_state`, `label?`; **WS6 add:** `asset_id?: Id` |
| AnswerLine | `text`, `at_utc`, `transcript_line_id` |
| ExpertExchange | `exchange_id`, `session_id`, `event_id\|null`, `phase: live\|debrief\|teach_back`, `kind: explain\|reasoning\|distinction\|context\|guardrail\|exception\|clarify_reference\|gap`, `question`, `answer_lines[]`, `asked_at_utc`, `answer_started_at_utc\|null`, `answer_ended_at_utc\|null`, `audio_offset_secs\|null`, `record_state`, `source`; **WS6 add:** `rev?: int ≥1` |
| CoverageItem | `dimension: decision\|reason\|cues\|alternatives\|guardrails\|unresolved`, `event_id\|null`, `status: missing\|partial\|covered`, `supporting_exchange_ids[]`, `note\|null` |
| OpenQuestion | `open_question_id`, `missing_fact`, `why_it_matters`, `related_event_ids[]`, `related_exchange_ids[]`, `answered_by_exchange_id\|null` |
| DraftStep | `step_id`, `text`, `kind: step\|decision\|guardrail\|exception`, `supporting_event_ids[]`, `supporting_exchange_ids[]` |
| DraftRevision | `revision_id`, `session_id`, `created_at_utc`, `parent_revision_id\|null`, `steps[]`, `change_reason\|null` |
| ExpertConfirmation | `confirmation_id`, `revision_id`, `status: confirmed\|corrected\|unresolved`, `step_ids_reviewed[]`, `expert_response_exchange_id`, `at_utc` |
| TimingMark | `session_id`, `event_id\|null`, `exchange_id\|null`, `mark: event_received\|topic_queued\|topic_released\|question_tool_called\|agent_speech_started\|answer_started\|answer_ended`, `at_utc`, `at_perf_ms` |
| RecordingSegment | `segment_id`, `state: RecordState`, `started_at_utc`, `ended_at_utc\|null` |

The ID-like fields in the mirror (`session_id`, `event_id`, `exchange_id`, `frame_id`, …) use `Id`, so path-traversal IDs are rejected. WS3 only requires non-empty strings, so this rule is stricter than theirs. It is listed as a request to WS3 (their ID regex `^[a-z0-9-]{1,64}$` is close). The free-text `image_ref` and `highlighted_image_ref` remain non-empty strings.

**Asset mapping:**
1. WS2 uploads the asset first and sends `asset_id` on the event.
2. On ingestion (S1), WS6 sets `image_ref = /api/assets/<asset_id>/original` and `highlighted_image_ref = /api/assets/<asset_id>/highlighted`.
3. The asset must have `status: "stored"`; otherwise the result is `409 asset_not_available`.

## WS6 records

### Session (mutable, `rev`)
- **Identity:** `session_id: Id`, `role: "expert"|"newcomer"`.
- **State:**
  - `lifecycle: "created"|"active"|"ended"|"aborted"`
  - `record_state: RecordState`
  - `recording_segments: RecordingSegment[]`
- **References:**
  - `case_id: Id|null`, `trace_ref: string|null`
  - `pinned_knowledge: {entry_id: Id, revision_id: Id}[] | null`, which is newcomer-only and `null` for expert sessions
- **Metadata:** `source`, `created_at_utc`, `rev: int ≥1`.
- **Lifecycle transitions** (enforced in S1): created→active→ended; created|active→aborted. `ended` and `aborted` are terminal.

### EvidenceAsset (immutable once stored, except `status` → deleted in S4)
- **Identity and linkage:** `asset_id: Id`, `session_id: Id`, `event_id: Id|null`.
- **Kind:** `kind: "frame"|"case_trace"`.
- **Images:**
  - `original: AssetFile`, `highlighted: AssetFile|null`.
  - `AssetFile` = `{path: string (relative to the asset dir, e.g. "original.png"), mime: "image/png"|"image/jpeg"|"image/webp", width_px: int>0, height_px: int>0, sha256: 64 lowercase hex}`.
  - `path` is a bare filename with no `/` or `..`.
- **Metadata:**
  - `coordinate_space: "original_frame_normalized"`
  - `captured_at_utc`, `record_state`, `source`
  - `status: "stored"|"deleted"`

### KnowledgeEntry (`current.json`, mutable `rev`)
`entry_id: Id`, `current_revision_id: Id`, `current_revision_no: int ≥1`, `status: EntryStatus`, `updated_at_utc`, `rev: int ≥1`.

### KnowledgeRevision (immutable; it is the frontmatter of `rev-<n>.md`)
- **Identity:** `schema_version: "ws6.v0"`, `entry_id`, `revision_id` (globally unique `rev-…`), `revision_no: int ≥1`, `parent_revision_id: Id|null`.
- **Status:** `status: "draft"|"confirmed"|"unresolved"|"revoked"`.
- **Content:** `content_path` (relative, e.g. `entries/<entry_id>/rev-<n>.md`).
- **Evidence:** `evidence: {event_ids: Id[], exchange_ids: Id[], asset_ids: Id[]}`.
- **Provenance:** `produced_by: {module: string, version: string, source: Source}`, `created_at_utc`.
- **Body:** opaque Markdown owned by WS5. WS6 validates only the frontmatter.

### Confirmation (immutable)
- **Fields:** `confirmation_id: Id`, `reviewed_revision_id: Id`, `result: "confirmed"|"corrected"|"unresolved"`, `expert_response_exchange_id: Id`, `at_utc`, `step_ids_reviewed?: Id[]`, `source`.
- **Mapping from WS3:** `toConfirmation(ExpertConfirmation, source)` maps `revision_id`→`reviewed_revision_id` and `status`→`result`.

### LearnerDraft (mutable; `draft_rev` is the monotonic rev)
- **Fields:** `session_id`, `draft_rev: int ≥1`, `decision: string`, `reason: string`, `visual_context`, `updated_at_utc`, `source`.
- **`visual_context`:** `{asset_id: Id, region: Region|null}[]`.

### Evaluation (immutable per `evaluation_id`; `status` progresses pending→done|failed and done→stale is written by the server)
- **Identity and bindings:** `evaluation_id: Id`, `session_id`, `draft_rev: int ≥1`, `knowledge_revision_ids: Id[]`.
- **Result:**
  - `status: "pending"|"done"|"failed"|"stale"`
  - `outcome: string|null`, whose values (`ok|intervene|uncertain`) are WS5-defined and not enumerated by WS6
  - `cited: {entry_id, revision_id, exchange_ids: Id[], quote?: string}[]`
  - `feedback_text: string|null`
- **Optional WS5 extras:** `guiding_question?: string|null`, `escalation?: {entry_id, revision_id}|null`.
- **Metadata:** `created_at_utc`, `updated_at_utc`, `produced_by`.

### Commit (immutable)
`commit_id: Id`, `session_id`, `draft_rev: int ≥1`, `evaluation_id: Id`, `at_utc`.

### Assessment
- **Fields:** `session_id`, `initial_decision: string|null`, `assistance: string[]`, `final_outcome: string|null`, `evidence_used: {entry_id, revision_id}[]`, `practice_next: string[]`, `source`, `created_at_utc`, `content?: Record<string, unknown>`.
- **`content`:** reserved for WS5's richer structure.

### BusEvent (SSE envelope, strict)
- **Fields:** `seq: int ≥1` (per session, monotonic), `type: string` (dotted, e.g. `event.stored`), `session_id: Id`, `ids: Record<string, Id | Id[]>`, `at_utc`.
- **Strictness:** no other keys are allowed. Content is never carried.

### ApiError
- **Body:** `{error: {code: ErrorCode, message: string, details?: Record<string, unknown>}}`.
- **ErrorCode → HTTP status:**

| HTTP status | ErrorCode |
|---|---|
| 400 | `validation_failed` |
| 401 | `unauthorized` |
| 403 | `off_record` |
| 404 | `not_found` |
| 409 | `conflict_immutable`, `asset_not_available`, `stale_revision`, `evaluation_required`, `evaluation_pending`, `evaluation_stale`, `commit_blocked`, `invalid_transition` |
| 500 | `internal` |

## Parse helpers
- **Helpers:** each record `X` exports `XSchema`, `type X`, and `parseX(input: unknown): ParseResult<X>`.
- **`ParseResult<T>`:** `{ok: true, value: T} | {ok: false, error: {code: "validation_failed", message: string, issues: {path: string, message: string}[]}}`.
