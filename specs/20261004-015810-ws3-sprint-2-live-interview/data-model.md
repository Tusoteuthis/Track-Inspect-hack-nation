# Data model — WS3 Sprint 2

All additions live in `web/lib/expert/contracts.ts` (snake_case, `null` = unknown).

## Topic (new)

| Field | Type | Notes |
|---|---|---|
| topic_id | string | `top-001`, sequential per session |
| session_id | string | |
| primary_event_id | string | first event; exchanges use this id |
| alias_event_ids | string[] | merged duplicates, in arrival order; still stored in `events` |
| state | TopicState | see transitions |
| requires_clarification | boolean | primary `mapping_status` ≠ `resolved` |
| record_state | RecordState | from the primary event |
| channel_id | string \| null | from the primary event (dedup key) |
| queued_at_utc / queued_at_perf_ms | string / number | topic ready |
| last_event_at_perf_ms | number | latest primary/alias receive time (dedup window, staleness) |
| released_at_utc / released_at_perf_ms | string \| null / number \| null | |
| stale_at_release | boolean \| null | |
| release_text | string \| null | exact contextual update sent |
| nudged_at_perf_ms | number \| null | `[CONTROL]` nudge sent |
| exchange_ids | string[] | |
| deferred_reason | "budget" \| "moved_on" \| "release_timeout" \| null | |

### State transitions

```
new resolved/ambiguous on-record event ─► queued
new off-record event                  ─► dropped_off_record (terminal)
queued    ─release─►  released
queued    ─budget used up at release─► deferred_to_debrief
released  ─begin_question on topic─►   asked
released  ─newer topic arrived / release_timeout─► deferred_to_debrief
asked     ─first answer line of its exchange─► answered
answered  ─follow-up begin_question─►  asked
queued | deferred_to_debrief ─agent asks anyway─► asked
```

A topic is **open** (blocks the next release) when `state = released`, or `state = asked` and no newer topic was queued after its release/ask.

## InterviewConfig (new, stored in snapshot)

| Field | Default |
|---|---|
| dedup_window_ms | 20000 |
| dedup_min_iou | 0.5 |
| stale_after_ms | 30000 |
| budget_max_questions | 5 |
| budget_window_ms | 600000 |
| pause_ms | 1200 |
| release_timeout_ms | 30000 |
| nudge_after_ms | 2500 (0 = off) |
| speech_hold_ms | 400 |
| vad_threshold | 0.5 |
| mic_threshold | 0.04 |

## ExpertExchange (changed)

- `topic_id: string | null` — topic the question belongs to (null when `event_id` is null).
- `related_event_ids: string[]` — alias events of the topic at ask time (excludes the primary).
- `kind = "clarify_reference"`: the answer identifies a region only; it MUST NOT be read as an interpretation (Sprint 3 coverage ignores it).

## TimingMarkName (added)

`user_speech_started`, `user_speech_ended`, `topic_nudged`. `topic_queued` is written for new topics and for merged aliases (with the alias's event id).

## SessionSnapshot (changed)

`topics: Topic[]`, `interview_config: InterviewConfig`. Validation: topic events must be known events; exchange `related_event_ids` must be known; exchange `topic_id` must be a known topic or null.

## Derived (timing.ts, not stored separately)

- **ExchangeTiming**: `processing_ms = topic_queued − event_received`, `intentional_wait_ms = topic_released − topic_queued`, `release_to_tool_ms`, `tool_to_speech_ms`, `release_to_speech_ms`, `follow_up`, `stale`, `nudged` (null when a mark is missing).
- **Interruptions**: `agent_speech_started` marks that fall inside a user speech interval.
- **Counters**: live_questions, guardrail_questions, deferred_topics, unlinked_agent_questions, interruptions, duplicate_questions (same topic + same kind asked twice).
