# Data model — WS6 Sprint 1

All record shapes are the S0 contracts in `web/lib/contracts` (see `specs/001-ws6-foundation-contracts/data-model.md`). This sprint adds the request/response shapes below and the storage rules.

## New contract shapes (`web/lib/contracts`)

| Schema | Fields | Notes |
|---|---|---|
| `CreateSessionRequest` | `role: "expert"`, `source?: Source` (default `live`), `trace_ref?: string \| null` | newcomer → `400` until S3 |
| `LifecycleRequest` | `action: "start" \| "end" \| "abort"`, `rev: int ≥ 1` | |
| `RecordStateRequest` | `state: RecordState` | |
| `AssetUploadMeta` | `kind`, `captured_at_utc`, `source`, `event_id?: Id \| null`, `record_state?: RecordState`, `coordinate_space?: "original_frame_normalized"`, `original: {width_px, height_px}`, `highlighted?: {width_px, height_px} \| null` | strict; server fills the rest |
| `EventAck` | `event_id`, `status: "stored"`, `seq` | |
| `ExchangePut` | `ExpertExchangeIngest` with `rev` required | |
| `IdIssuePrefix` | adds `seg` to `IdPrefix` | recording segments |

## Session state machine

| From \ action | start | end | abort |
|---|---|---|---|
| created | active | ✗ | aborted |
| active | no-op | ended | aborted |
| ended | ✗ | no-op | ✗ |
| aborted | ✗ | ✗ | no-op |

"no-op": the session is already in the action's target state → `200` current session, no rev bump, no event. ✗ → `409 invalid_transition`. `end`/`abort` set `ended_at_utc` on the open recording segment.

Record state: `on_record ⇄ off_record`; each change closes the open segment and appends `{segment_id: seg-…, state, started_at_utc: now, ended_at_utc: null}`; rev + 1.

## Storage (new files)

```
knowledge/sessions/<sid>/session.json            Session (putMutable)
knowledge/sessions/<sid>/events/<eid>.json       PointingEventIngest, refs rewritten (putImmutable)
knowledge/sessions/<sid>/exchanges/<xid>.json    ExpertExchangeIngest with rev (putMutable)
knowledge/sessions/<sid>/bus.ndjson              BusEvent lines (append-only)
knowledge/images/<aid>/original.<png|jpg>        bytes (written first)
knowledge/images/<aid>/highlighted.<png|jpg>     bytes (optional)
knowledge/images/<aid>/meta.json                 EvidenceAsset (written last)
web/.runtime/idempotency/sessions/<sha256>.json  {session_id}
web/.runtime/diag/<yyyy-mm-dd>.ndjson            diag lines
```

## Validation rules

- Path IDs (`sid`, `aid`, `eid`, `xid`) must match `ID_RE`, else `400`.
- Event/exchange body `session_id`, `event_id`/`exchange_id` must equal the path, else `400`.
- Event `asset_id` required; asset must be `stored`, belong to `sid`, have `highlighted` → else `409 asset_not_available` (`details.asset_id`, `details.missing?`).
- Exchange `event_id` immutable after first write; non-null must be a stored event of `sid`.
- Bus `ids` values are IDs; numeric revs as decimal strings.
