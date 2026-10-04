# Data model: WS7 Sprint 3

## CaseSummary (new, `lib/ui/contracts.ts`)
| field | type | note |
|---|---|---|
| case_id | string | never rendered as text |
| title | string | human label |
| asset | EvidenceAsset | trace picture used for display mode/thumbnail |
| source | DataOrigin | fixture → banner |

No answers or evaluator fields (B2).

## SessionView (extended)
- `rev?: number`. It increases monotonically per acknowledged change. Updates with a lower `rev` are ignored.

## CompanionEvent (new, UI view of WS3 `PointingEvent`)
| field | from |
|---|---|
| event_id | event.event_id |
| captured_at_utc | event.captured_at_utc |
| session_time_ms | event.session_time_ms (shown as session time) |
| asset | `{asset_id: event_id, original_url: image_ref, highlighted_url: highlighted_image_ref, frame_id, width_px: region.frame_width_px, height_px: region.frame_height_px}` |
| region | `{frame_id, coordinate_space, x, y, width, height, mapping_status}` |
| record_state | event.record_state |
| channel_label | channel_id ?? null (rendered "unknown") |

## CompanionState (`lib/companion/companionMachine.ts`)
```
{ session: SessionView | null,
  events: CompanionEvent[]            // newest first, max 6, unique event_id
  pending: Partial<Record<"off_record"|"pause"|"stop", Target>>
  errors: Partial<Record<kind, string>>
  connection: ConnectionState }
```
Targets:
- `off_record` → `{recording: "on_record" | "off_record"}`
- `pause` → `{lifecycle: "paused" | "active"}`
- `stop` → `{lifecycle: "ended"}`

### Transitions
| event | effect |
|---|---|
| SESSION_LOADED(s) | session = s |
| SOURCE_SESSION(s) / ACKED(kind, s) | ignored if `s.rev < session.rev`. Otherwise session = s, and each pending item whose target is now reached is cleared (its error is cleared too). |
| POINTING_EVENT(e) | prepend if the event_id is new; cap at 6 |
| REQUESTED(kind, target) | ignored if that kind is already pending, the session has ended, or the target is already reached. Otherwise pending[kind] = target and errors[kind] is cleared. |
| ACK_FAILED(kind, msg) | pending[kind] is removed; errors[kind] = msg; the session is unchanged |
| (any) session reaches `ended` | all pending cleared; later ACKED/ACK_FAILED ignored |
| CONNECTION(state) | connection = state |
| RESYNCED(s, events) | session = s (rev rule), events replaced (mapped, deduplicated, capped), connection = connected, reached pending items cleared |

Derived `displayRecording(state)`:
- `off_record_pending` when the pending target is off;
- `on_record_pending` when the pending target is on;
- otherwise `session.recording_state`.
