# Contract: what the expert agent receives, and when

## 1. Pointing-event release (contextual update, `contextId = primary_event_id`)

Sent only when the release planner says `release`. Format (one line, no label, no region, no interpretation):

```
[POINTING_EVENT] event_id=<id> mapping_status=<s> channel=<c|unknown> trace=<t|unknown> record_state=on_record source=<live|fixture>. <instruction>[ <stale sentence>][ <guardrail sentence>]
```

- instruction (resolved): `The expert is pointing at this region. Do not interpret it. When there is a natural pause, ask about it.`
- instruction (ambiguous/unresolved): `The pointed region is not clear. When there is a natural pause, first ask which region they mean.`
- stale sentence (when `stale_at_release`): `stale=yes: the expert pointed at this a while ago and may have moved on. Refer to it explicitly, for example "the region you pointed at a moment ago on <channel|the trace>".`
- guardrail sentence (when no guardrail exchange exists yet): `No guardrail question yet: once the expert has explained what they see here, ask when they would stop, escalate or not trust it.`

Off-record topics are never released.

## 2. Nudge (user message, at most once per topic)

```
[CONTROL] The expert has paused. If it is still open, ask your one question about event_id=<id> now; otherwise call skip_turn.
```

Any user transcript line starting with `[CONTROL]` is dropped from the expert record.

## 3. Budget state (contextual update, `contextId = "ws3-state"`)

- used up: `[STATE] live_question_budget=used_up. Do not ask more live questions now; call skip_turn instead. Remaining topics are kept for the debrief.`
- available again: `[STATE] live_question_budget=available.`

## 4. `begin_question` results (client tool, unchanged shape)

- `ok exchange_id=<id>`
- `error <reason>` — new reason: `event <id> is ambiguous: your first question about it must have kind clarify_reference (which region do they mean)`.
- An alias event id is accepted and attributed to the topic's primary event.
