# External contract: PointingEvent v0 (WS2 → WS3)

This is the only record WS3 receives from outside in this sprint. Producers send JSON matching [data-model.md § PointingEvent](../data-model.md#pointingevent-ws2--ws3-validated). WS3 checks it with `validatePointingEvent(input)` from `web/lib/expert/contracts.ts`.

## Validation result

- `{ ok: true, value: PointingEvent }`
- `{ ok: false, errors: string[] }`: one human-readable message per violated rule, for example `region.x + region.width must be ≤ 1`.

## Example (fixture)

```json
{
  "schema_version": "ws3.v0",
  "session_id": "fixture-session-001",
  "event_id": "evt-001",
  "source": "fixture",
  "captured_at_utc": "2026-10-03T10:00:05.000Z",
  "session_time_ms": 5000,
  "frame_id": "frame-0001",
  "image_ref": "/fixtures/trace-a-full.svg",
  "highlighted_image_ref": "/fixtures/trace-a-evt-001-highlight.svg",
  "region": { "x": 0.2, "y": 0.15, "width": 0.15, "height": 0.25,
              "coordinate_space": "original_frame_normalized",
              "frame_width_px": 1600, "frame_height_px": 900 },
  "mapping_status": "resolved",
  "trace_id": "trace-A",
  "channel_id": "SYS1",
  "signal_interval": null,
  "record_state": "on_record"
}
```

## Rules for producers

- Never put an interpretation of the trace in any field.
- Use `null` for unknown trace, channel or signal interval.
- Send a new `event_id` for every gesture. Merging repeated gestures is WS3's job (Sprint 2).
