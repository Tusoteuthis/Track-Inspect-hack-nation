# WS6 Sprint 1 handoff — Expert capture path: session → evidence → event → exchange

**Branch:** `002-ws6-expert-capture`, based on `worktree-ws06-backend` at `8bf6c13` (Sprint 0 fast-forward-merged on 2026-10-04; `voice` already up to date)
**Spec:** `specs/002-ws6-expert-capture/`
**Date:** 2026-10-04

## Delivered

**Contracts** (`web/lib/contracts/`)
- `session.ts`: `CreateSessionRequest`, `LifecycleRequest`, `RecordStateRequest`.
- `asset.ts`: `AssetUploadMeta`.
- `expert.ts`: `EventAck`, `ExchangePut` (exchange + required `rev`).
- Tests: `requests.test.ts`.

**Backend lib** (`web/lib/backend/`)
- `session-lifecycle.ts`: a pure state machine (`applyLifecycle`, `applyRecordState`).
- `sessions.ts`: create (with `Idempotency-Key`), get, lifecycle, record-state, `withSessionLock`, `requireWritableSession` (the content-write guard) and `requireActiveSession`.
- `image-info.ts`: detects PNG/JPEG from content and reads the dimensions, with no new dependencies.
- `assets.ts`: `putAsset` (sha256 idempotency; image files written first, `meta.json` last), `getAsset`, `readAssetFile` (realpath confinement to `knowledge/images/`) and `assetFileResponse`.
- `events.ts`: `putEvent` (immutable, asset-availability check, image refs rewritten, ack seq stable and recovered after a crash), `listEvents` (ordered by `captured_at_utc`, then arrival) and `getEvent`.
- `exchanges.ts`: `putExchange` (rev-guarded; `event_id` is immutable; a referenced event must exist), `listExchanges`, `getExchange`.
- `bus.ts`: per-session `bus.ndjson` with a monotonic seq (appended first, published second) and in-memory subscribers on `globalThis`.
- `sse.ts`: `sessionStream` (replays the log then switches to live with no gaps or duplicates; heartbeat; cleanup) and `parseAfter`.
- `diag.ts`: the allow-list diagnostics log.
- `route.ts`: `handleRoute` (timing, diag line, error envelope) and `readJsonBody`.
- `paths.ts`: path helpers.
- `capture-test-helpers.ts`: test-only helpers.
- `config.ts`: adds `assetMaxBytes` (`ASSET_MAX_BYTES`).
- `ids.ts`: adds the `seg` prefix.

**Routes** (`web/app/api/`; every route writes a diag line)
- `sessions/route.ts`: `POST`.
- `sessions/[sid]/route.ts`: `GET`.
- `sessions/[sid]/lifecycle/route.ts` and `record-state/route.ts`: `POST`.
- `sessions/[sid]/assets/[aid]/route.ts`: `PUT` (multipart).
- `assets/[aid]/route.ts`, `assets/[aid]/original/route.ts`, `assets/[aid]/highlighted/route.ts`: `GET`.
- `sessions/[sid]/events/route.ts` and `events/[eid]/route.ts`: `GET` list; `PUT` and `GET` by id.
- `sessions/[sid]/exchanges/route.ts` and `exchanges/[xid]/route.ts`: `GET` list; `PUT` and `GET` by id.
- `sessions/[sid]/stream/route.ts`: `GET` (SSE).
- `conversation-token/route.ts`: adds `?session_id=`.
- `health/route.ts`: now writes a diag line.

**Script**
- `web/scripts/replay-capture.mts`, run with `npm run replay-capture -- --base http://localhost:3006`.

## Verification evidence

Run in `web/` at `9f0bab6`:

```
$ npm run typecheck
> track-inspect-web@0.1.0 typecheck
> tsc --noEmit
(exit 0, no output)

$ npx vitest run
 Test Files  29 passed (29)
      Tests  377 passed (377)
```

WS6 test files (number of tests):

| Area | Files |
|---|---|
| Routes | assets.routes 4, conversation-token 5, health 2, events.routes 3, stream route 3, sessions.routes 13 |
| Backend lib | assets 25, bus 11, config 5, diag 6, events 14, exchanges 10, ids 29, image-info 13, locks 3, route 5, session-lifecycle 20, sessions 18, sse 13, store 11 |
| Contracts | requests 20 |

**Acceptance criteria → tests**

| Criterion | Test |
|---|---|
| Same event PUT twice → one file, same ack | `events.test.ts` "the same event PUT twice…"; also 5 concurrent PUTs → one 201 and identical acks |
| Same `event_id`, different body → 409 | `events.test.ts` "…different body → 409 conflict_immutable, stored record unchanged" |
| Event with a missing asset → `409 asset_not_available`, nothing stored | `events.test.ts` (no file and no bus line); also another session's asset, a deleted asset, and an asset with no highlighted image |
| Stale exchange rev → stored record unchanged | `exchanges.test.ts` (file bytes compared; returns `409 stale_revision` with `current_rev`, see D7) |
| Exchange changing `event_id` → 409 | `exchanges.test.ts` (also with a higher rev, and when changed to `null`) |
| Late answer after newer events keeps its `event_id` | `exchanges.test.ts` "a late answer appended after newer events…" |
| Illegal lifecycle transition → 409 | `session-lifecycle.test.ts` (every table cell), `sessions.test.ts`, `sessions.routes.test.ts` |
| Asset path traversal impossible | `assets.test.ts` (`../etc`, `..`, `a/b`, a symlink into `RUNTIME_DIR`, a tampered `original.path`), `events.routes.test.ts` (`..%2Fetc` → 400) |
| SSE replay after `Last-Event-ID` gives exactly the missed events, in order | `bus.test.ts` (`readBusAfter`), `sse.test.ts` (replay, then live with concurrent appends), `stream/route.test.ts` (reads the first chunks with `Last-Event-ID: 1`) |
| Diag rejects content fields | `diag.test.ts` (top-level content keys, content in `ids`, invalid values) |

**Replay script against `npm run dev -- -p 3006 -H 0.0.0.0`**

Run 1, pass 1:

```
PASS  POST sessions                         201  sid=ses-20261003232151-lzuwjj
PASS  POST lifecycle start                  200
-- pass 1
PASS  PUT assets/fx-lzuwjj-a1               201
PASS  PUT events/evt-001                    201  seq=3
PASS  PUT exchanges/fx-exchange-001 rev 1   201
PASS  PUT assets/fx-lzuwjj-a2               201
PASS  PUT events/evt-002                    201  seq=6
...
PASS  PUT events/evt-004                    201  seq=10
PASS  PUT exchanges/fx-exchange-001 rev 2   200
PASS  GET exchanges                         200  count=1 event_id=evt-001 rev=2
```

Run 1, pass 2 (identical retries):

```
PASS  PUT assets/fx-lzuwjj-a1               200
PASS  PUT events/evt-001                    200  seq=3
PASS  PUT exchanges/fx-exchange-001 rev 1   409 stale_revision
...
OK  session ses-20261003232151-lzuwjj
    events  evt-001@3, evt-002@6, evt-003@8, evt-004@10
```

Run 2 (`POST sessions` → 200, same session):

```
before run2: sessions=7 images=12 bus_lines=11
after run2:  sessions=7 images=12 bus_lines=11
(mtimes of every file under knowledge/sessions and knowledge/images unchanged: "no file created or modified")
```

`find knowledge/sessions -type f` lists:
- `session.json`
- `bus.ndjson`
- `events/evt-001.json`, `evt-002.json`, `evt-003.json`, `evt-004.json`
- `exchanges/fx-exchange-001.json`

That is 7 files.

**SSE replay**

```
$ curl -sN --max-time 2 -H 'Last-Event-ID: 8' localhost:3006/api/sessions/<sid>/stream
id: 9   event: asset.stored     data: {"seq":9,...,"ids":{"asset_id":"fx-lzuwjj-a4"},...}
id: 10  event: event.stored     data: {"seq":10,...,"ids":{"event_id":"evt-004","asset_id":"fx-lzuwjj-a4"},...}
id: 11  event: exchange.updated data: {"seq":11,...,"ids":{"exchange_id":"fx-exchange-001","event_id":"evt-001"},...}
```

**Live stream with off-record**

With a stream open (no `after`), I sent:
1. `record-state off` → 200
2. an asset PUT → `403 {"error":{"code":"off_record",...}}`, and no `fx-offrec-*` directory was created
3. `record-state on` → 200

The stream showed:

```
id: 12  event: record_state.changed  ids {"segment_id":"seg-…o21vql"}
id: 13  event: record_state.changed  ids {"segment_id":"seg-…ff4afp"}
```

**LAN asset read**

```
$ curl -D - http://172.20.10.2:3006/api/assets/fx-lzuwjj-a1/original
HTTP/1.1 200 OK
cache-control: private, no-cache
content-length: 936
content-type: image/png
x-content-type-options: nosniff
```

`GET /api/assets/..%2F..%2Fweb%2F.env/original` → 400 `validation_failed`.

**Diag log:** 60 lines. The set of keys across all lines is exactly `at_utc, component, duration_ms, error_code, ids, op, outcome`, and 0 lines contain "FIXTURE", "answer" or "question".

**Not verified live:** a session-scoped voice token. `ELEVENLABS_AGENT_ID_EXPERT` is empty in this worktree's `web/.env`, so the route correctly returns 500 "Missing ELEVENLABS_AGENT_ID_EXPERT". The `session_id` logic is covered by mocked tests: 404, 409 when not active, `{token, session_id}` on success, and the API key never in the body.

I stopped the dev server afterwards, and `git status` was clean.

## API/contract changes

`notes/ws6-api-v0.md` is updated: S1 rows are marked **S1**, a new §5.11 has the implementation notes, and D13–D15 are added.

- **New request/response schemas:** `CreateSessionRequest`, `LifecycleRequest`, `RecordStateRequest`, `AssetUploadMeta`, `EventAck`, `ExchangePut`.
- **Event `asset_id` is now required** (it was "recommended"; D14).
- **Error details added:**
  - `asset_not_available`: `{asset_id, missing?: "highlighted"}`
  - `stale_revision`: `{current_rev, received_rev}`
  - `conflict_immutable`: `{field: "event_id"}`
  - exchange → unknown event `not_found`: `{missing: "event", event_id}`
  - `invalid_transition`: `{from, action}`
- **New env var:** `ASSET_MAX_BYTES` (default 15 MiB).
- **New runtime data:** `web/.runtime/idempotency/sessions/` and `web/.runtime/diag/`, both already gitignored.

## Decisions made

1. **The route map wins where it differs from the S1 prompt (D7/D8, per the S0 handoff).**
   - A stale exchange returns `409 stale_revision` with `current_rev`, not `200 {status:"ignored_stale"}`.
   - An off-record write returns `403 off_record`, not 409.
   - The prompt's actual requirements still hold: the stored record is unchanged, and the write is rejected while off-record.
   - **Check this at the gate.** If you want the prompt's exact codes, change the throws in `exchanges.ts` and the `off_record` entry in `ERROR_STATUS`.
2. **Identical retries are always answered with 200, even after off-record or abort (D13).** Nothing new is stored in that case. Only new content is refused.
3. **Late writes to an ended session are accepted; an aborted session refuses them (D15, WS2-Q7).**
4. **Lifecycle no-op:** an action whose target state is already reached returns 200 with the current session regardless of rev, so a retried `start` is safe. Otherwise `rev` must equal the current rev.
5. **Event ack seq** is looked up from the bus log, so no sidecar file is needed (research R6). If the event was written but its bus line was lost, the retry re-announces it and acks with the new seq.
6. **Image refs on stored events are always rewritten** to `/api/assets/<aid>/{original,highlighted}`. Idempotency compares bodies after the rewrite, so client placeholders don't matter.
7. **Assets take a second lock, `asset:<aid>`, inside the session lock.** This stops two sessions from racing on the same `aid`. The lock order is fixed (session, then asset), so it can't deadlock.
8. **Diag `component` names:** `sessions`, `assets`, `events`, `exchanges`, `stream`, `voice`, `health`.
9. **Lanes:**
   - The lead built the foundation and `events`/`exchanges`.
   - Lane A built the session routes and the token change.
   - Lane B built image-info, assets and the asset routes.
   - Lane C built SSE and the replay script.
   - Each lane ran in its own nested worktree. All were merged with `--no-ff` and the lane worktrees and branches were removed.
10. **WS3 store delegation was not done.** Neither `voice` nor `worktree-ws03-sprint-1` has `web/lib/expert/store.ts` or the snapshot route (checked 2026-10-04). See "Requests to partner workstreams".

## Stubs still in place

None. No partner modules are involved in S1.

## Known limitations / open issues

- **Single process.** The bus subscribers, seq cache and locks are in memory (constitution W8).
- **The upload size check trusts `Content-Length`.** A chunked upload without that header is fully parsed before the per-file cap applies. This is acceptable at demo scale.
- **`event.stored` seqs share the session counter** with `asset.stored` and `session.updated`, so event acks are not 1..N.
- **Region frame size is not checked against the asset.** `region.frame_width_px`/`frame_height_px` are not compared with the asset's dimensions, because WS2 may downscale (an open WS2 question).
- **The stream's diag `duration_ms`** covers only opening the stream.
- **The voice-token error shape:** ElevenLabs/config failures keep the route's original `{error: string}` shape even with `session_id`.
- **Live voice token not tested:** the expert agent ID is missing in `web/.env` (see Verification).
- **`npm audit`:** the existing findings (from S0) have not been investigated.

## Requests to partner workstreams

- **WS3**
  - When you add `store.ts` or the snapshot route, have them call `putEvent` / `putExchange` / `listEvents` / `listExchanges` from `web/lib/backend/{events,exchanges}.ts`, or call the per-record HTTP routes directly (preferred, Option B in WS3-Q1).
  - Send `rev` on every exchange PUT, increasing as answer lines grow.
  - Treat `409 stale_revision` as "the newer state is already stored".
  - Get voice tokens with `?session_id=` and pass the echoed id to the agent as a dynamic variable.
- **WS2**
  - Upload the asset first: multipart `meta`/`original`/`highlighted`, PNG or JPEG, with declared dimensions that are correct.
  - Then send the event with `asset_id`.
  - Retry with the same IDs and the same bytes; identical retries always get 200 with the original ack.
  - `403 off_record` means drop the record, not queue it.
  - Mirror `web/scripts/replay-capture.mts`.
- **WS7**
  - Subscribe to `GET /api/sessions/:sid/stream` with `Last-Event-ID` on reconnect, and re-fetch records by the IDs in each event.
  - Show the session's `record_state` and `lifecycle` from the server; they are authoritative.
- **Still open in §8 of the API doc:** WS2-Q1/Q3/Q5/Q6 and WS3-Q1/Q2/Q8.

## Human gate checklist

Set `WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend` first.

1. **Start the server and replay a capture.**
   1. In terminal 1:
      ```
      cd "$WT/web" && npm run typecheck && npx vitest run && npm run dev -- -p 3006 -H 0.0.0.0
      ```
   2. In terminal 2, run `npm run replay-capture`. It prints `sid=…`.
   3. Open the stream with `?after=0`, which replays everything stored so far and then stays live:
      ```
      curl -N "localhost:3006/api/sessions/<sid>/stream?after=0"
      ```
      Check that it shows `asset.stored`, `event.stored` and `exchange.updated` messages with IDs only.
2. **Check that a second run creates nothing new.**
   1. Kill the curl.
   2. Run `find "$WT/knowledge/sessions" "$WT/knowledge/images" -type f | wc -l`.
   3. Run `npm run replay-capture` again.
   4. Run the same `find` again. The count must be unchanged, and the event acks must show the same seqs.
3. **Check reconnect replay.** Toggle the record state so there is something to miss:
   ```
   curl -X POST -H 'content-type: application/json' -d '{"state":"off_record"}' localhost:3006/api/sessions/<sid>/record-state
   ```
   Then send it again with `on_record`, and reconnect with:
   ```
   curl -N -H 'Last-Event-ID: <last seq you saw>' localhost:3006/api/sessions/<sid>/stream
   ```
   You should get only the missed `record_state.changed` events.
4. **Check the LAN path WS2 will use.** From the iPhone, open `http://<laptop-LAN-IP>:3006/api/assets/<aid>/original` (asset ids are printed by the script). The image should load.
5. **Decide on D7/D8/D13–D15**, the deviations from the prompt.
6. **Optional:** set `ELEVENLABS_AGENT_ID_EXPERT` in `$WT/web/.env`, start the session (`POST …/lifecycle {"action":"start","rev":1}`), then call:
   ```
   curl "localhost:3006/api/conversation-token?flow=expert&session_id=<sid>"
   ```
   The response should be `{token, session_id}`.
7. **If satisfied, merge:** `cd "$WT" && git checkout worktree-ws06-backend && git merge --no-ff 002-ws6-expert-capture`. Merge `worktree-ws06-backend` into `voice` when partners should receive it.

## Notes for the next sprint (S2: knowledge & confirmation)

- **Writes:** reuse `withSessionLock` + `requireWritableSession` for every content write, and `handleRoute` for every route.
- **Bus events:** emit them with `appendBus` (IDs only; numeric revs as decimal strings).
- **Synthesis input:** read it from `listEvents` / `listExchanges`. Off-record content is never stored, so there is nothing to filter yet. S4 adds a retroactive purge.
- **Job ids:** add `job` to `IdPrefix` for synthesis jobs.
- **Knowledge events:** emit them on the originating expert session's stream (API doc §2).
