# Contract: `timing-report.md` (session folder)

Written on every save, derived only from `timing`, `exchanges`, `topics` in the snapshot.

```
# Timing report — <session_id>

Config: pause_ms … · nudge_after_ms … · stale_after_ms … · budget …/10 min

| exchange | event | kind | processing ms | intentional wait ms | release→tool ms | tool→speech ms | release→speech ms | notes |
```

- **processing ms** = `topic_queued` − `event_received` (primary event, first marks). Our own processing.
- **intentional wait ms** = `topic_released` − `topic_queued`. Deliberate waiting for a pause / for the previous topic.
- **release→tool / tool→speech / release→speech** = agent latency (`question_tool_called`, first `agent_speech_started` of the exchange after the tool call).
- Follow-up questions (not the first exchange of a topic) and questions on unreleased topics show `—` for release columns with a note.
- notes: `follow-up`, `stale`, `nudged`, `not released`, `FIXTURE`.

Then:

- `Interruptions (agent speech started while the expert was speaking): N` plus the times if N > 0.
- Counters: live questions, guardrail questions, deferred topics, unlinked agent questions, duplicate questions.
- Topics table: id, primary event, aliases, state, stale, deferred reason.
- Limitation note: speech detection ≠ end of thinking.
