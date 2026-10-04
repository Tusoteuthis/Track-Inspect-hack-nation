# Agent client tools (all `expectsResponse: true`; results are plain strings starting with `ok` or `error`)

| Tool | Params | Allowed phase | Result |
|---|---|---|---|
| `begin_question` | `event_id`, `kind`, `question`, optional `phase`, optional `gap_id` | live: no `gap_id`. debrief: `kind=gap` and a `gap_id` on the agenda (event taken from the gap). teach_back: `kind=correction` | `ok exchange_id=ex-NNN` |
| `record_coverage` | `exchange_id`, `dimensions[{dimension, status: partial\|covered\|unknown_escalate, note}]` | any | `ok …`, or an error for an unknown or unanswered exchange or a clarify_reference exchange |
| `signal_task_complete` | none (optional `reason`) | live | `ok phase=debrief` + the `[PHASE debrief]` agenda block |
| `propose_draft` | `steps[{kind, text, event_ids[], exchange_ids[]}]`, optional `change_reason` | debrief (→ rev-1), or teach_back after a `corrected` confirmation (→ rev-n+1) | `ok revision_id=rev-n` + the `[TEACH_BACK rev-n]` block, or the errors (unknown ids, non-verbatim quotes) |
| `confirm_revision` | `revision_id`, `status: confirmed\|corrected\|unresolved`, optional `step_ids_reviewed[]` | teach_back | `ok confirmation_id=conf-NNN …`, or an error for a stale revision or no explicit response |

Context blocks (`contextId: ws3-phase`):

- `[PHASE debrief] …`: the agenda as `gap_id: description` lines.
- `[TEACH_BACK rev-n] …`: the steps to teach, plus the open items not to state as fact.
- `[CONTROL]` nudges for the console path.
