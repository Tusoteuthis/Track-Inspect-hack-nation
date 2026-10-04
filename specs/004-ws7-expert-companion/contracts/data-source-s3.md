# DataSource additions — Sprint 3 (all additive)

```ts
type SourceUpdate =
  | …existing
  | { type: "pointing_event"; event: PointingEvent }      // WS3 type, imported
  | { type: "connection"; state: ConnectionState };

interface DataSource {
  listCases(): Promise<CaseSummary[]>;                               // WS4 manifest (fixture now)
  startSession(caseId: string): Promise<Ack<SessionView>>;           // WS6 POST /sessions + lifecycle start
  requestPause(sessionId: string, paused: boolean): Promise<Ack<SessionView>>; // WS6: not yet (WS7-Q2)
  requestStop(sessionId: string): Promise<Ack<SessionView>>;         // WS6 lifecycle end
  getRecentEvents(sessionId: string): Promise<PointingEvent[]>;      // resync; WS6 GET /sessions/:sid/events
  // existing: requestOffRecord(sessionId, offRecord) → WS6 POST /record-state
}
```

## WS6 mapping (for apiSource)
| UI | WS6 |
|---|---|
| `session` push | SSE `session.updated` / `record_state.changed` → GET session (carry `rev`) |
| `pointing_event` push | SSE `event.stored {event_id}` → GET event |
| `connection` push | EventSource readyState: open → connected, error/CONNECTING → reconnecting |
| resync | `Last-Event-ID` replay, or GET session + events after a long gap |

## Fixture behaviour (`fixtureExpertScript`)
- `subscribe(expertSession)`: after `replayMs`, `2×replayMs` and `3×replayMs` it emits evt-001 (resolved), evt-003 (repeat) and evt-004 (ambiguous).
- Actions resolve after `latencyMs`. On success, a `session` push with `rev+1` is emitted first, and then the Ack is returned. `fail*` options return `failed(...)`.
- `controls.dropConnection()` / `controls.restore()` emit `connection` updates. While dropped, events are queued instead of pushed, and they show up through `getRecentEvents` on resync.
