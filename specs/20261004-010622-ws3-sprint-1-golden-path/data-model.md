# Data model: WS3 Sprint 1

The base records are in `web/lib/expert/contracts.ts` (Sprint 0). This sprint makes the following changes.

## ExpertExchange (changed)
- Added `question_planned: string | null`: the text the agent passed to `begin_question`. This is the AI's plan, not evidence.
- `question` now starts as `""` and is filled by the first final agent line after the declaration (verbatim).
- `event_id` is set once at creation and never changes.
- `record_state` and `source` are copied from the linked event. When `event_id` is null they are `on_record`, and `source` is `live`.

## SessionSnapshot (new; what the client PUTs and the store writes)
```
schema_version: "ws3.v0"
session_id: string               ^[a-z0-9-]{1,64}$ (e.g. ses-20261004-011500-a1b2)
conversation_id: string | null   ElevenLabs conversation id
started_at_utc: string
ended_at_utc: string | null
events: PointingEvent[]          unique by event_id, injected with session_id
exchanges: ExpertExchange[]
active_exchange_id: string | null
awaiting_question_exchange_id: string | null   exchange whose question text is still pending
preamble: AnswerLine[]           user lines before any question
transcript: TranscriptEntry[]
timing: TimingMark[]
unlinked_agent_questions: UnlinkedQuestion[]
```
- `TranscriptEntry { line_id, role: "user"|"agent", text, at_utc, exchange_id: string|null }`
- `UnlinkedQuestion { line_id, text, at_utc }`

## Reducer actions (`session.ts`)
| Action | Effect |
|---|---|
| `session_started {session_id, at_utc, perf_ms}` | Resets to an empty state with this id. |
| `connected {conversation_id}` | Sets `conversation_id`. |
| `event_received {event, at_utc, perf_ms}` | Adds the event if its id is new, plus a timing mark `event_received`. Never touches exchanges. |
| `question_begun {params, at_utc, perf_ms}` | Validates the params. If invalid, `last_tool_result` holds the error and nothing else changes. If valid, creates exchange `ex-NNN`, makes it active and awaiting, adds timing `question_tool_called`, and sets `last_tool_result = "ok exchange_id=ex-NNN"`. |
| `agent_final_line {line_id, text, at_utc}` | Appends to the transcript. If an exchange is awaiting a question, this line fills its `question` and clears awaiting. Otherwise, if the text ends in `?`, records an unlinked question. |
| `user_final_line {line_id, text, at_utc, perf_ms}` | Appends to the transcript, tagged with the active exchange. If there is an active exchange, adds an answer line, sets `answer_started_at_utc` (and timing `answer_started`) the first time, and updates `answer_ended_at_utc` each time. Otherwise the line goes to the preamble. |
| `agent_speaking_changed {speaking, at_utc, perf_ms}` | When speaking becomes true, adds timing `agent_speech_started`, linked to the awaiting or active exchange. |
| `session_ended {at_utc, perf_ms}` | Sets `ended_at_utc`. If the active exchange has answer lines, adds timing `answer_ended` for it. Clears the active exchange. |

The `answer_ended` timing mark is also emitted for the previous active exchange when a new `question_begun` replaces it, and only if that exchange has answer lines.

## Files written per session (`knowledge/sessions/<id>/`)
| File | Content |
|---|---|
| `session.json` | Snapshot minus events, exchanges and timing, plus counts `{events, exchanges, unlinked_agent_questions, preamble_lines}` |
| `events.json` | `PointingEvent[]` |
| `exchanges.json` | `ExpertExchange[]` |
| `timing.json` | `TimingMark[]` |
| `transcript.md` | One line per entry: `- [HH:MM:SS.mmmZ] **role** (exchange_id\|—): text` |
| `exchanges.md` | Per exchange: heading, event id and source, image link, kind, the question verbatim, the answer as a blockquote, and timing |
