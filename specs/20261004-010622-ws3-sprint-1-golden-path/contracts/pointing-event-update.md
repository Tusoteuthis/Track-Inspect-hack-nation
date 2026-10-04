# Contextual update for a pointing event

The update is sent with `sendContextualUpdate(text, { contextId: event_id })`. It is a single line:

```
[POINTING_EVENT] event_id=evt-001 mapping_status=resolved channel=SYS1 trace=trace-A record_state=on_record source=fixture. The expert is pointing at this region. Do not interpret it. When there is a natural pause, ask about it.
```

- A null `channel_id` or `trace_id` is written as `unknown`.
- The text never contains `label`, `region` coordinates or any interpretation.
- For `record_state=off_record`, the tail is replaced by: `This is off the record. Do not ask about it.`
- For an `ambiguous` or `unresolved` mapping status, the tail says: `The pointed region is not clear. When there is a natural pause, first ask which region they mean.`
