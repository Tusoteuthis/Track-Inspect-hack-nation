# Data Model: WS7 UI state v0

All field names are snake_case to match the briefs and the JSON on disk. Every top-level view carries `source: "live" | "fixture"`.

| Entity | Fields | Rules |
|---|---|---|
| `ConnectionState` | `"connected" \| "disconnected" \| "reconnecting" \| "unknown"` | Unknown is never rendered as connected |
| `SessionView` | `session_id`, `role: expert\|newcomer`, `lifecycle: not_started\|active\|paused\|ended`, `recording_state: on_record\|off_record\|off_record_pending\|on_record_pending`, `connection: {capture, agent, backend}`, `case_id\|null`, `knowledge_revision_id\|null`, `source` | `*_pending` until the backend acknowledges |
| `EvidenceAsset` | `asset_id`, `original_url`, `highlighted_url\|null`, `frame_id`, `width_px`, `height_px` | Dimensions > 0 |
| `EvidenceRegion` | `frame_id`, `coordinate_space: "original_frame_normalized"`, `x`, `y`, `width`, `height`, `mapping_status: resolved\|ambiguous\|unresolved` | Values in [0,1]; drawn only when `frame_id` equals the asset's |
| `EvidenceRef` | `event_id\|null`, `asset`, `region\|null` | |
| `KnowledgeStatus` | `draft\|confirmed\|unresolved\|revoked\|missing` | Only `confirmed` may be shown as verified |
| `ExpertQuote` | `exchange_id`, `text` (verbatim) | Never synthesized |
| `WorkMapStep` | `entry_id`, `revision_id`, `kind: step\|decision\|guardrail\|exception`, `title`, `ai_summary\|null`, `expert_quotes[]`, `reasoning\|null`, `guardrails[]`, `evidence[]`, `status`, `open_question\|null` | Quotes and summary kept separate |
| `WorkMapView` | `session_id`, `revision_id`, `steps[]`, `source` | |
| `PracticeCaseView` | `case_id`, `asset`, `visible_context[]`, `decision_options[]\|null`, `knowledge_revision_id`, `source` | Learner-visible only; no expected answer |
| `LearnerDraft` | `draft_id`, `draft_revision`, `decision`, `reason`, `region\|null` | |
| `Citation` | `entry_id`, `revision_id`, `quote\|null`, `evidence\|null` | |
| `LearnerEvaluation` | `draft_revision`, `knowledge_revision_id`, `outcome` (opaque WS5 string), `message`, `guiding_question\|null`, `citations[]` | Stale when the revisions don't match the current draft |
| `AssessmentItem` | `description`, `citations[]` | |
| `AssessmentView` | `session_id`, `independent[]`, `assisted[]`, `unresolved[]`, `practice_next[]`, `evidence_used[]`, `source` | Assisted is never merged into independent |
| `Ack<T>` | `{ status: "acknowledged", value: T } \| { status: "failed", error: string }` | UI shows done only on acknowledged |
| `SourceUpdate` | discriminated union: `session` \| `workmap` (extended in S1/S3) | |

Region render state (derived): `none` (no region) · `resolved` · `ambiguous` · `unresolved` · `frame_mismatch`.
