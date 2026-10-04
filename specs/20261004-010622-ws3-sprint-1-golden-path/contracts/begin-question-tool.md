# Client tool `begin_question`

Declared in `agents/expert/tools.json` and pushed as a standalone ElevenLabs client tool.

The agent calls it immediately before speaking a question.

| Param | Type | Notes |
|---|---|---|
| `event_id` | string | A known pointing event id, or `"none"` when the question is not about an event. `"none"` becomes `null`. |
| `kind` | enum | `explain`, `reasoning`, `distinction`, `context`, `guardrail`, `exception`, `clarify_reference` or `gap` |
| `question` | string | The planned question. It is stored as `question_planned`, not as evidence. |

Results returned to the LLM (plain strings):
- `ok exchange_id=ex-003`
- `error unknown event_id evt-009, known: evt-001, evt-002`
- `error invalid kind "foo"` / `error missing question`
