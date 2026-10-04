# Data model (additions to `web/lib/expert/contracts.ts`)

- `SessionPhase` = `live | debrief | teach_back | confirmed | incomplete`. An exchange's `phase` stays `live | debrief | teach_back`.
- `ExchangeKind`: adds `teach_back` and `correction`.
- `ExpertExchange`: adds `gap_id: string | null` and `revision_id: string | null`.
- `DeferredReason`: adds `task_complete`, for topics still queued or released when the task ends.
- `CoverageItem`: adds `resolution: "answered" | "unknown_escalate" | null`.
  - Row key: (`event_id`, `dimension`). `event_id = null` is the session row.
- `Gap` / `DebriefItem`: `gap_id`, `event_id`, `topic_id`, `dimension`, `open_question_id`, `description`, `status_at_start` (missing|partial).
  - `DebriefItem` adds `state` (`open | asked | partial | resolved | unknown`) and `exchange_ids`.
  - Gap ids: `gap-<event_id|session>-<dimension>`, or `gap-<open_question_id>`.
- `OpenQuestion`: unchanged. Ids are `oq-001…`. Sources: deferred or never-asked topics, and unsupported draft steps.
- `DraftStep`: adds `supported: boolean`. `DraftRevision`: adds `change_exchange_ids: string[]`.
- `ExpertConfirmation`: unchanged.
- `PhaseChange`: `{ phase, at_utc, trigger: "agent_tool" | "console" | "confirmation" | "session_end" }`.
- `SessionSnapshot` adds `phase`, `phase_log`, `coverage`, `open_questions`, `debrief_agenda`, `revisions` and `confirmations`. All are cross-validated.

## State transitions

```
live --signal_task_complete | console--> debrief --propose_draft | console--> teach_back
teach_back --confirm_revision(confirmed, latest)--> confirmed
teach_back --confirm_revision(corrected)--> teach_back (awaits propose_draft → rev-n+1)
any non-confirmed --session_ended--> incomplete
```

## Session folder additions

```
revisions/rev-n.json, revisions/rev-n.md
confirmations.json
knowledge-draft.md
```
