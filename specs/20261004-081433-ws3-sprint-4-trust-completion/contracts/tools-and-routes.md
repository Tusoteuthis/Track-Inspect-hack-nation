# Contracts — tools and routes (Sprint 4)

## Client tool `set_record_state`
Params: `{ state: "off_record" | "on_record" }`. Result (idempotent):
- off: `ok record_state=off_record. Say only a brief acknowledgement such as "Okay, off the record." Then ask nothing and call skip_turn on every turn until the expert goes back on the record. Never mention or ask about anything said while off the record.`
- on: `ok record_state=on_record. Acknowledge briefly ("Okay, back on the record.") and continue where you left off. Never mention or ask about anything said while off the record.`

## Client tool `strike_last_answer`
Params: `{ reason?: string }`. Result: `ok struck ex-NNN …` plus, if a confirmation was invalidated, the instruction to re-teach / re-propose; `error nothing to strike …` otherwise.

## While off record, every other tool returns
`error the expert is off the record: ask nothing and record nothing; call skip_turn until they go back on the record.`

## POST `/api/expert-sessions/{sessionId}/elevenlabs-deletion`
- 400 invalid id · 404 no saved session · 409 session not ended / no off-record segment / no conversation ids · 500 missing API key.
- 200 `ElevenLabsDeletionReport`; also written to `elevenlabs-deletion.json` in the session folder.

## POST `/api/expert-sessions/{sessionId}/demo-evidence`
Re-reads the saved session from disk, renders and writes `demo-evidence.md`, returns `{ markdown, checklist }`.

## Context updates
- `[RECORD_STATE] off_record …` / `[RECORD_STATE] on_record …` (contextId `ws3-record`).
- `[RESUME] …` (contextId `ws3-resume`).
