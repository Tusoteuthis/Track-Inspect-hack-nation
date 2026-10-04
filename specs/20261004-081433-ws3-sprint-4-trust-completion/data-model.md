# Data model — additions in ws3.v1

`SessionSnapshot` (+):
- `conversation_ids: string[]` — every ElevenLabs conversation of this session (resume appends).
- `recording_segments: RecordingSegment[]` — first segment `on_record` from session start; each change closes the current one and opens the next.
- `off_record_excluded: { transcript_lines, events, timing_marks, refused_tool_calls }` — counts only.
- `strikes: Strike[]`.
- `end_cause: "stop" | "disconnect" | "error" | null`.
- `elevenlabs_deletions: ElevenLabsDeletionReport[]`.

`RecordingSegment` = `{ segment_id, state, started_at_utc, ended_at_utc | null, trigger: "session_start" | "agent_tool" | "console" | "expert_phrase" | "capture_event" | "resume" }`.

`Strike` = `{ strike_id, exchange_id, at_utc, trigger: "agent_tool" | "console", removed_line_count, superseded_revision_ids, invalidated_confirmation_ids }`.

`SessionCompletion` = `{ schema_version, session_id, conversation_ids, started_at_utc, ended_at_utc, end_reason, end_cause, final_phase, confirmed_revision_id, latest_revision_id, coverage, unresolved_open_question_ids, open_gap_ids, unfinished: string[], excluded: { off_record_segments, segments: [{from,to}], excluded_exchange_ids (struck), transcript_lines, events, timing_marks, refused_tool_calls }, counts: { live_questions, live_guardrail_questions, debrief_questions, teach_backs, confirmations, strikes } }`.

`ElevenLabsDeletionReport` = `{ session_id, at_utc, results: [{ conversation_id, status: "deleted" | "not_found" | "failed", detail }] }`.

`PhaseTrigger` (+): `strike`, `resume`.

Rules:
- `end_reason = completed` ⇔ `final_phase = confirmed` ∧ `confirmed_revision_id ≠ null`; `aborted` when `end_cause = error`; otherwise `incomplete`.
- A confirmation listed in any `invalidated_confirmation_ids` never counts (step verification, completion, phase).
- Snapshot validator: no event/exchange with `record_state: off_record`; no transcript entry, answer line, preamble line or timing mark with `start ≤ at < end` of an off-record segment (open segment: end = ∞).
