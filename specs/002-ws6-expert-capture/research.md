# Research — WS6 Sprint 1 (expert capture path)

## R1. Prompt vs approved route map (D7, D8)
- **Decision**: Follow `notes/ws6-api-v0.md`: stale exchange → `409 stale_revision` (`details.current_rev`); off-record content write → `403 off_record`.
- **Rationale**: S0 handoff instructs S1 to follow the route map; one rule for all mutable records; error code → HTTP table is fixed in `ERROR_STATUS`. Both still satisfy the prompt's acceptance ("stored record unchanged", "reject while off-record").
- **Alternatives**: `200 {status:"ignored_stale"}` (prompt) — would make a single resource family special. Flagged at the human gate.

## R2. Multipart parsing
- **Decision**: `await request.formData()` (Web standard, supported by Next route handlers on the Node runtime). Reject before parsing when `Content-Length` exceeds `2 × cap + 64 KB`; check each `File.size` ≤ cap (`ASSET_MAX_BYTES`, default 15 MiB).
- **Alternatives**: busboy streaming — extra dependency, unnecessary at demo scale.

## R3. Image type and dimensions
- **Decision**: Sniff magic bytes (PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`) and read dimensions ourselves: PNG IHDR (bytes 16–23), JPEG first SOF0–SOF15 marker (excluding DHT/JPG/DAC `C4/C8/CC`). Declared `width_px`/`height_px` must match, else `400 validation_failed`. The client-declared MIME is ignored.
- **Alternatives**: `sharp`/`image-size` — native/extra deps for ~40 lines of code.

## R4. Asset atomicity and idempotency
- **Decision**: Under lock `sess:<sid>`: compute sha256 per file; if `meta.json` exists, compare the would-be record (canonical JSON) → equal `200`, else `409 conflict_immutable` (also covers another session reusing the `asset_id`). If absent, write image files atomically, then `meta.json` last. A crash leaves files without `meta.json` → "not stored"; a retry overwrites them.
- **Server-owned fields**: `path`, `mime`, `sha256`, `status: "stored"`, `session_id` (path), `coordinate_space`, `record_state` (from the session: always `on_record` when accepted).

## R5. Safe asset reads
- **Decision**: `safeJoin(imagesRoot, aid)` (ID regex) → read `meta.json` → file name from the validated `AssetFile.path` (bare filename) → `fs.realpath` of the file must start with `realpath(imagesRoot) + sep` and must not start with `realpath(runtimeDir)`. Any failure → `404 not_found` (no path information leaks). Headers: `Content-Type` from meta, `Cache-Control: private, no-cache` (not `immutable`, because S4 deletion must take effect immediately), `X-Content-Type-Options: nosniff`.

## R6. Event ack `seq` stable across retries
- **Decision**: The event file stays a pure `PointingEventIngest` (with rewritten refs and `asset_id`). Its ack `seq` is the seq of its `event.stored` bus entry, looked up from the session bus log. Under lock `sess:<sid>`: `putImmutable` → if `201`, append `event.stored`; if `200`, look up the seq; if missing (crash between write and append), append it now. This doubles as crash recovery.
- **Arrival order** for `GET events` = that same seq.
- **Alternatives**: a sidecar ack file per event — one more file per record, more crash states.

## R7. Exchange writes
- **Decision**: Under lock `sess:<sid>`: validate body (`ExpertExchangeIngestSchema` with `rev` required), path/body IDs match, read stored → event_id changed → `409 conflict_immutable` (`details.field: "event_id"`); `rev ≤ stored.rev` and not identical → `409 stale_revision` (`details.current_rev`); non-null `event_id` must have a stored event file → `404 not_found` (`details.missing: "event"`); then `putMutable`. Emit `exchange.updated` on create or higher rev, not on identical retry.
- Nested `withLock` with the **same** key deadlocks; `sess:<sid>` is a different key from `putMutable`'s file-path key, so nesting is safe.

## R8. Content-write guard
- **Decision**: `requireWritableSession(sid)` (in `sessions.ts`), called inside `sess:<sid>`: missing → `404`; `aborted` → `409 invalid_transition`; `record_state === "off_record"` → `403 off_record`; body `record_state: "off_record"` → `403 off_record` as well. `ended` sessions accept late events/exchanges/assets (WS2-Q7 lean). Record-state changes take the same lock, so no write races an off-record toggle.

## R9. Sessions
- **Decision**: `POST /api/sessions` creates `{lifecycle:"created", record_state:"on_record", recording_segments:[open on_record segment], case_id:null, pinned_knowledge:null, rev:1}`. `Idempotency-Key` header (1–200 printable chars) → `RUNTIME_DIR/idempotency/sessions/<sha256(key)>.json {session_id}` under lock `idem:<hash>`; replay → `200` + current session. Newcomer role → `400 validation_failed` until S3.
- **Lifecycle**: pure `applyLifecycle(session, action, now)` in `session-lifecycle.ts`. Already in the target state → `200` unchanged (idempotent retry, no event). Otherwise `rev` must equal the current rev (`409 stale_revision`), then the transition table (`409 invalid_transition`). `end`/`abort` close the open recording segment. Emits `session.updated`.
- **Record state**: same state → `200` no-op; ended/aborted → `409 invalid_transition`; else close the open segment and append a new one (`seg-` ID). Emits `record_state.changed {segment_id}` and bumps `rev`.

## R10. SSE bus
- **Decision**: `bus.ts` — `appendBus(sid, type, ids)` under lock `bus:<sid>`: next seq = cached last seq (initialised by scanning `bus.ndjson`, keyed by file path so tests with fresh dirs don't collide) + 1; validate via `BusEventSchema`; `fs.appendFile` line; then publish to in-memory subscribers. `readBusAfter(sid, after)` parses lines, skipping a torn final line. `subscribe(sid, fn) → unsubscribe`.
- **Stream** (`sse.ts`): subscribe first (buffer), replay `readBusAfter(after)`, then flush buffered events with `seq > lastSent` → no gaps, no duplicates. Messages `id: <seq>\nevent: <type>\ndata: <json>\n\n`; heartbeat `: hb\n\n` every 15 s (injectable for tests); cleanup on `request.signal` abort and stream `cancel()`. `after` from `Last-Event-ID` header, else `?after=`; absent/invalid → live only.
- Bus subscribers are a module-level `Map` on `globalThis` so Next dev's module reloading in the same process still shares one bus.

## R11. Diagnostics
- **Decision**: `diag(entry)` builds a new object from allow-listed keys only: `component`, `op` (slug `^[a-z][a-z0-9_.-]{0,63}$`), `ids` (keys slug, values must match the ID regex or are dropped), `outcome` (`ok | error`), `duration_ms` (finite ≥ 0), `error_code` (an `ErrorCode`), plus server-set `at_utc`. Anything else is dropped; returns the sanitised line. Appends to `RUNTIME_DIR/diag/<yyyy-mm-dd>.ndjson` and never throws.
- `route.ts` helper `handleRoute({component, op, ids}, fn)` times the call, maps errors via `toErrorResponse`, calls `diag`.

## R12. Voice token scoping
- **Decision**: In `conversation-token/route.ts`, after flow validation and before the ElevenLabs call: if `session_id` present → `assertSafeId` → load session → missing `404 not_found`, not `active` → `409 invalid_transition` (WS6 error envelope). Success body gains `session_id`. Without the param the response is byte-identical to before.

## R13. WS3 store delegation
- **Decision**: Not possible this sprint — neither `voice` nor `worktree-ws03-sprint-1` contains `web/lib/expert/store.ts` or the snapshot route (checked 2026-10-04). Documented in the handoff with the per-record functions WS3 should call (`putEvent`, `putExchange`, `listEvents`, `listExchanges`).

## R14. Replay script
- **Decision**: `web/scripts/replay-capture.mts` (tsx). `--base` default `http://localhost:3006`. Creates the session with `Idempotency-Key: replay-capture-fixture-v1` and `source:"fixture"`, starts it, uploads one asset per WS3 fixture event (asset ID `<sid-suffix>-a<n>`, so assets never collide across sessions), PUTs WS3 fixtures `evt-001…evt-004` (session_id replaced, `asset_id` added; `evt-005` is off-record and skipped), PUTs an exchange rev 1 for `evt-001`, then events 2–4, then rev 2 with more answer lines (late answer). Pass 2 repeats every request and asserts identical acks. Exits non-zero on any unexpected status.
