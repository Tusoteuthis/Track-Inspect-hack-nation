# WS6 API v0 — pending agreement

**Schema version:** `ws6.v0` · **Owner:** WS6 (shared backend) · **Date:** 2026-10-04 · **Sprint:** S0 (foundation & contracts), S1 (expert capture path — implemented), S2 (knowledge revisions & confirmation — implemented), S3 (newcomer session & pre-save enforcement — implemented), S4 (trust, recovery, diagnostics & demo — implemented), integration routes for WS7 (I2/I4 — implemented, §5.15)
**Code:** contracts `web/lib/contracts/` (zod; `SCHEMA_VERSION = "ws6.v0"`), server lib `web/lib/backend/`, routes `web/app/api/`, fixtures `web/fixtures/ws6/`.
**Record fields:** [`specs/001-ws6-foundation-contracts/data-model.md`](../specs/001-ws6-foundation-contracts/data-model.md). This doc names schemas; it does not repeat every field.
**Dev server:** `npm run dev -- -p 3006` (add `-H 0.0.0.0` for LAN/iPhone).

## 1. Status and feedback

- **v0, pending agreement.** Implemented: `GET /api/health` (S0), every route marked **S1** in §5.2–5.5 and §5.10 (notes §5.11), every route marked **S2** in §5.6–5.7 (notes §5.12), every route marked **S3** in §5.8 (notes §5.13), and every route marked **S4** in §5.1 and §5.9 (notes §5.14). All v0 routes are implemented, plus the integration additions in §5.15 (D53–D58).
- Route paths below are the ones already promised in `notes/ws6-sprints/sprint-1..4-*.md`. Where this doc deviates from a sprint prompt, the deviation is listed in §9.
- **How to object:** reply to the WS6 owner or add a note to `notes/ws6-sprints/handoff-sprint-0.md` → "Requests from partners". Objections are collected into the **next sprint's handoff** and the doc is updated there. Please answer the numbered questions in §8 by number (e.g. "WS3-Q2: …").
- Partner names (WS3 `ws3.v0`, WS5 `ws5.v0`, WS7 `ws7.ui.v0`) are cited from their notes. WS6 does not define their APIs.

## 2. Conventions

| Topic | Rule |
|---|---|
| Field names | snake_case, identical to the JSON on disk. |
| Unknown | `null` = unknown / not applicable. The key is still present. Values are never guessed (e.g. `trace_id: null`, never `""`). |
| Times | `*_utc` = ISO-8601 UTC string. `session_time_ms` = elapsed **recording** time; `signal_interval` = position on the **trace axis** (only when calibrated). Neither is derived from the other. |
| Coordinates | Always declare their frame: `coordinate_space: "original_frame_normalized"`, box in [0,1], origin top-left of the original saved frame, plus `frame_width_px`/`frame_height_px`. |
| IDs | `^[a-z0-9][a-z0-9-]{0,63}$`. The same rule sanitizes every path segment (no `/`, `..`, uppercase, leading `-`). Violations → `400 validation_failed`. |
| Server-generated IDs | `<prefix><yyyymmddhhmmss>-<rand6>` with prefixes `ses-` (session), `cnf-` (confirmation), `evl-` (evaluation), `cmt-` (commit), `rev-` (knowledge revision); `job-` added in S2. Example: `ses-20261004101500-a3f9k2`. |
| Producer-owned IDs | `asset_id`, `event_id` (WS2), `exchange_id` (WS3), `entry_id` (WS5 synthesis; stub uses `ent-…`). Any string matching the ID rule, e.g. a lowercase UUID. |
| Source | `source: "live" \| "stub" \| "fixture"` on WS6 records; WS3 mirror records keep `"live" \| "fixture"`. Fixtures/stubs are never silently used as expert knowledge. |
| Schema version | `ws6.v0` on WS6 records that carry it (KnowledgeRevision); WS3 records keep `ws3.v0`. |

### Idempotency

| Case | Result |
|---|---|
| Producers own their IDs; writes are `PUT …/:id` | — |
| First write | `201` + stored record |
| Same body again (canonical JSON, key order irrelevant) | `200` + stored record (no-op) |
| Different body, immutable record | `409 conflict_immutable` (stored record unchanged) |
| Mutable record (`rev`, or `draft_rev` for LearnerDraft), higher `rev` | `200`, replaced |
| Mutable, lower `rev` | `409 stale_revision` (`details.current_rev`) |
| Mutable, equal `rev` + identical body | `200` (idempotent retry) |
| Mutable, equal `rev` + different body | `409 stale_revision` |
| `POST /api/sessions` | Optional `Idempotency-Key` header: same key → same session (`200`). |
| `POST` confirmations / commit | Body `idempotency_key` (or producer-owned `confirmation_id`); replay → same record (`200`). |

### Integrity and trust rules

- **No dangling references.** A record referencing an asset/event/exchange is accepted only if the target is stored for this session → else `409 asset_not_available` (assets) / `404 not_found` (other refs), nothing stored.
- **Off-record = not stored.** S4: an asset/event/exchange that is labelled off-record, arrives while the session is off-record, or was captured (`captured_at_utc` / `asked_at_utc`) inside an off-record segment is answered `202 { status: "dropped_off_record", kind, id }`; only a content-free tombstone is written, so retries get the same answer. Answer lines spoken inside an off-record segment are cut before storage. `since_utc` on the record-state route purges what was stored since then (§5.14). Learner drafts while off-record still get `403 off_record` (S1). Nothing off-record reaches a job or module.
- **Revision-bound decisions.** Confirmations, evaluations and commits name exact revision IDs; stale work never overwrites newer state.
- **Backend is authoritative.** Clients display state from responses/SSE; a disabled button is never enforcement.
- **Logs/diagnostics** (`web/.runtime/diag/*.ndjson`, `GET /api/diagnostics`) contain IDs, timings, outcomes and error codes only — never expert words, images, or off-record material.
- **Evaluator directory** (`EVALUATOR_DIR`, default `web/.runtime/evaluator/`) is never served, never a module input, never in SSE.
- **Single process.** Locks (`withLock`) and the SSE bus are in-memory; this holds for one `next dev`/`next start` process on one machine. Not valid for serverless or multiple instances without revisiting.

### Error envelope

`{ "error": { "code": ErrorCode, "message": string, "details"?: object } }` (schema `ApiErrorBody`). `message` is for humans and contains no content; `details` carries IDs/revs (e.g. `current_rev`, `current_revision_ids`, `reason`).

| Code | HTTP | Meaning |
|---|---|---|
| `validation_failed` | 400 | Body/params fail the schema or ID rule (`details.issues[{path,message}]`) |
| `unauthorized` | 401 | Access token missing/wrong (S4, only when `BACKEND_ACCESS_TOKEN` is set) |
| `off_record` | 403 | Content write while the session is off-record; nothing stored |
| `not_found` | 404 | Unknown ID (or deleted asset) |
| `conflict_immutable` | 409 | Same ID, different body for an immutable record or immutable field (e.g. exchange `event_id`) |
| `asset_not_available` | 409 | Referenced asset not stored for this session (or `highlighted` missing, see WS2-Q3) |
| `stale_revision` | 409 | `rev`/`draft_rev`/reviewed revision is not current |
| `evaluation_required` | 409 | Commit without any evaluation for the current draft |
| `evaluation_pending` | 409 | Commit while the matching evaluation is `pending` |
| `evaluation_stale` | 409 | Evaluation not bound to the current `draft_rev` and pinned knowledge (`details.policy_code`: `evaluation_stale` \| `knowledge_changed`) |
| `commit_blocked` | 409 | Outcome policy blocks (`details.policy_code: "blocked_by_outcome"`, `details.outcome`) or already committed with another key (`details.policy_code: "already_committed"`) |
| `invalid_transition` | 409 | Illegal lifecycle transition, or write to an ended/committed session |
| `internal` | 500 | Unexpected error; message never leaks internals |
| `no_confirmed_knowledge` | 409 | S3: newcomer session with nothing eligible (`details.excluded[]`) |
| `case_not_permitted` | 409 | S3: case shown to the expert, or no unseen case |
| `gone` | 410 | S4: the ID was deleted (tombstone); a late retry cannot recreate it |

### Live updates (SSE)

- `GET /api/sessions/:sid/stream` → `text/event-stream`. Each message: `id: <seq>`, `event: <type>`, `data: <BusEvent JSON>`. Heartbeat comment every ~15 s.
- `seq` is per-session, monotonic, persisted in `knowledge/sessions/<sid>/bus.ndjson` (append first, then publish).
- **Reconnect:** send `Last-Event-ID: <seq>` (or `?after=<seq>`) → the server replays exactly the missed events in order, then continues live. Without either, the stream starts live (clients first GET the current state, then subscribe).
- **Payload = `BusEvent`** `{seq, type, session_id, ids, at_utc}` — strict, IDs only, never content. Clients re-fetch the resource by ID. Numeric revs in `ids` are decimal strings (e.g. `"draft_rev": "3"`).

| BusEvent `type` | `ids` | Emitted by | Sprint |
|---|---|---|---|
| `session.updated` | `session_id` | lifecycle change, pinning | **S1** |
| `record_state.changed` | `segment_id` | record-state route (the **acknowledged** state) | **S1** |
| `asset.stored` | `asset_id` | asset PUT (first store) | **S1** |
| `event.stored` | `event_id`, `asset_id?` | event PUT (first store) | **S1** |
| `exchange.updated` | `exchange_id`, `event_id?` | exchange PUT (create or higher rev) | **S1** |
| `synthesis.started` / `.done` / `.failed` / `.discarded` | `job_id`, `revision_ids?` | synthesis job | **S2** |
| `revision.created` | `entry_id`, `revision_id` | revision store | **S2** |
| `draft.updated` | expert: `revision_ids`; newcomer: `draft_rev` | synthesis draft (S2) / learner draft PUT (S3) | S2/S3 |
| `gaps.updated` | — (re-fetch gaps) | synthesis | **S2** |
| `confirmation.stored` | `confirmation_ids`, `revision_ids` | confirmation POST | **S2** |
| `evaluation.updated` | `evaluation_id`, `draft_rev` | created (pending) and every status change: done \| failed \| stale | **S3** |
| `commit.stored` | `commit_id`, `evaluation_id`, `draft_rev` | commit POST | **S3** |
| `assessment.stored` | — (re-fetch) | assessment (on commit or newcomer `end`) | **S3** |
| `record.deleted` | one of `asset_id`/`event_id`/`exchange_id` | deletion cascade and off-record purge (on the owning session) | **S4** |
| `entry.revoked` | `entry_id`, `revision_id` | revoke route and every cascade/purge; on the originating expert session and on newcomer sessions that pinned it | **S4** |
| `review_mark.stored` | `mark_id`, `entry_id`, `revision_id` | review-mark POST (first store) | **I4** |

Knowledge events (`revision.created`, `confirmation.stored`, `entry.revoked`) are emitted on the **originating expert session's** stream (and `entry.revoked` additionally on affected newcomer streams). A global stream is not in v0 (WS7-Q4).

## 3. Storage layout

`KNOWLEDGE_DIR` default `<repo>/knowledge`, `RUNTIME_DIR` default `web/.runtime`, `EVALUATOR_DIR` default `web/.runtime/evaluator`. All writes are atomic (temp file + fsync + rename in the same dir).

```
knowledge/
  sessions/<session_id>/
    session.json                 Session (mutable, rev)
    events/<event_id>.json       PointingEvent (immutable)
    exchanges/<exchange_id>.json ExpertExchange (mutable, rev; event_id immutable)
    bus.ndjson                   BusEvent log (append-only, SSE replay)
    gaps.json                    WS5 gaps (S2)
  images/<asset_id>/
    meta.json                    EvidenceAsset (written last)
    original.<png|jpg|webp>
    highlighted.<ext>            optional
  entries/<entry_id>/
    rev-<revision_no>.md         immutable; frontmatter = KnowledgeRevision, body = WS5 Markdown
    current.json                 KnowledgeEntry (mutable, rev)
  workflow.md                    regenerated from WS5 synthesis (S2)
  confirmations/<confirmation_id>.json   Confirmation (immutable)
  learner/<session_id>/
    draft.json                   LearnerDraft (current; mutable, draft_rev)
    drafts/<draft_rev>.json      LearnerDraft history (immutable, S3)
    evaluations/<evaluation_id>.json     Evaluation
    commit.json                  Commit (immutable)
  assessments/<session_id>.md (+ .json)  Assessment
web/.runtime/
  diag/<yyyy-mm-dd>.ndjson       IDs + timings only
  jobs/<job_id>.json             job state (S2)
  evaluator/                     WS4 evaluator-only material — NEVER served
cases/learner/<case_id>/         CASES_DIR (WS4): case.json + trace image; fallback web/fixtures/ws6/cases (S3)
```

**Git:** ignored = `knowledge/sessions/`, `knowledge/images/`, `knowledge/assessments/`, `web/.runtime/`. Committable (human decides) = `knowledge/workflow.md`, `knowledge/entries/`. Currently **not** ignored and probably should be (proposal for the S0 merge): `knowledge/learner/`, `knowledge/confirmations/`.

### Mapping WS3's planned files (`notes/ws3-sprints/docs/contracts-v0.md` "Planned on-disk layout", `sprint-1-golden-path.md` "Persistence")

| WS3 planned file / route | WS6 layout | Note |
|---|---|---|
| `PUT /api/expert-sessions/[sessionId]/snapshot` | per-record `PUT /api/sessions/:sid/events/:eid`, `…/exchanges/:xid` | **Open (WS3-Q1).** Option A: snapshot route stays as a thin compatibility wrapper that splits the snapshot into per-record puts. Option B: WS3 client calls per-record PUTs; snapshot route removed. |
| `web/lib/expert/store.ts` | delegates to `web/lib/backend/store.ts` | WS3 keeps the interface; WS6 provides the implementation (S1). |
| `session.json` (WS3 session state) | `session.json` = WS6 `Session` | **Same filename, different shape.** WS3 state not covered by `Session` goes to a WS3-owned file (e.g. `expert-state.json`) — WS3-Q2. |
| `events.json` (aggregate) | `events/<event_id>.json` | one file per record, immutable |
| `exchanges.json` (aggregate) | `exchanges/<exchange_id>.json` | one file per record, `rev` |
| `timing.json` | WS3-owned file in the session dir (TimingMark[]) | WS6 also logs IDs/timings to diag |
| `transcript.md`, `exchanges.md` | WS3-owned renders in the session dir, written via `writeFileAtomic` | must exclude off-record content |
| `revisions/rev-N.json\|md` (DraftRevision) | WS3-owned until WS5 synthesis lands; then superseded by `entries/<entry_id>/rev-<n>.md` | DraftRevision ≠ KnowledgeRevision (WS3-Q5) |
| `confirmations.json` | `knowledge/confirmations/<confirmation_id>.json` | via `POST /api/knowledge/confirmations` |
| `completion.json\|md`, `knowledge-draft.md` | WS3-owned in the session dir | not read by WS6 |

## 4. Resources

Schemas live in `web/lib/contracts` (each `XSchema`, `type X`, `parseX`). Fixtures in `web/fixtures/ws6/` all carry `source: "fixture"` and `session_id: "fixture-session-001"`.

| Brief §4 resource | Schema(s) | Mutability | Producer → stored by | Fixture |
|---|---|---|---|---|
| Session | `Session`, `RecordingSegment` | mutable `rev`; segments appended by server | WS6 (created via API by WS7/WS3 client) | `session.json`, `session-newcomer.json`, `recording-segment.json` |
| Evidence asset | `EvidenceAsset` (+`AssetFile`) | immutable; `status` → `deleted` only by cascade (S4) | WS2 (frames), WS4 (case traces) | `evidence-asset.json`, `fixture-frame.png`, `fixture-frame-highlighted.png` |
| Pointing event | `PointingEvent` (WS3 `ws3.v0` + optional `asset_id`) | immutable | WS2 | `pointing-event.json` (+ WS3's `web/fixtures/pointing-events/`) |
| Expert exchange | `ExpertExchange` (WS3 + optional `rev`), `AnswerLine` | mutable `rev`; `event_id` immutable | WS3 | `expert-exchange.json` |
| (WS3 session draft) | `DraftRevision`, `DraftStep`, `CoverageItem`, `OpenQuestion`, `TimingMark` | immutable / WS3-owned | WS3 (until WS5 synthesis) | `draft-revision.json`, `coverage-item.json`, `open-question.json`, `timing-mark.json` |
| Knowledge entry | `KnowledgeEntry` (`current.json`) | mutable `rev`, server-managed | WS6 from WS5 synthesis | `knowledge-entry.json` |
| Knowledge revision | `KnowledgeRevision` (frontmatter) + opaque WS5 Markdown body | immutable | WS5 module, persisted by WS6 | `knowledge-revision.json`, `knowledge-revision.md` |
| Confirmation | `Confirmation`; WS3 `ExpertConfirmation` accepted and mapped by `toConfirmation()` | immutable | WS3 (expert response) → WS6 | `confirmation.json`, `expert-confirmation.json` |
| Learner draft | `LearnerDraft` | mutable `draft_rev` (server assigns) | WS7 | `learner-draft.json` |
| Evaluation | `Evaluation` | server-managed: `pending → done \| failed`, `done → stale` | WS5 module, run by WS6 | `evaluation.json` |
| Commit | `Commit` | immutable | WS6 (after policy check) | `commit.json` |
| Assessment | `Assessment` (+ opaque `content`) | written once per commit/end | WS5 module, persisted by WS6 | `assessment.json` |
| Live update | `BusEvent` (strict, IDs only) | append-only | WS6 | `bus-event.json` |
| Error | `ApiErrorBody` | — | WS6 | `api-error.json` |

Defined in later sprints (not in `ws6.v0` contracts yet): `EventAck` (S1), `Job`, `Gap`, `SessionDraftView`, `WorkMapView` (S2), `LearnerCase` (S3), `Diagnostics` (S4).

## 5. Routes

Legend — **Idem.**: `PUT-id` = idempotency table in §2; `key` = Idempotency-Key header / `idempotency_key` body; `safe` = read. **S** = sprint that implements it. `:sid` session, `:aid` asset, `:eid` event, `:xid` exchange. All routes may also return `400 validation_failed`, `404 not_found`, `500 internal` (and `401 unauthorized` from S4 when the token is enabled); only additional codes are listed.

### 5.1 Health & diagnostics

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/health` | — | `{ ok, schema_version, knowledge_dir_writable, runtime_dir_writable, modules: {} }` · `200`, or `503` with `ok:false` when a dir is unwritable | safe | — | — | **S0** |
| GET | `/api/diagnostics[?session_id=]` | — | with `session_id`: `{ session_id, role, lifecycle, record_state, generation, chain, components, failing_components, timeline }` (expert chain: `events[{ event_id, asset_id, exchanges, revisions, confirmations, newcomer_sessions[{ evaluations, commit }] }]`, `jobs`; newcomer chain: `pinned`, `evaluations`, `commit`); without: `{ sessions, components, failing_components }`. IDs/statuses/timings only | safe | — | — | **S4** |
| GET | `/api/access?token=[&next=/path]` | — | sets the `ws6_access` cookie (HttpOnly, SameSite=Strict, the token's hash) and `303` to `next` (relative only) or `200 { ok }` | safe | `unauthorized` | — | **S4** |

`modules` = `{ synthesis, tutor, assessment }` → `{ id, version, source }` (§5.12, §5.13). S4 adds `elevenlabs: { api_key_configured, expert_agent_configured, tutor_agent_configured }` (booleans only), `access_token_required`, `components: { <component>: { requests, errors, last_ok_at_utc, last_error: { at_utc, op, error_code, ids } | null } }` from the diag log, and `failing_components` (latest outcome a server or module failure).

### 5.2 Session lifecycle & record state

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| POST | `/api/sessions` | `{ role: "expert", source?, trace_ref? \| case_id? }` (I4: `case_id` names a case marked `shown_to_expert`; its trace becomes `trace_ref`; not both) or `{ role: "newcomer", case_id?, source? }`; header `Idempotency-Key?`; newcomer `?allow_fixture_knowledge=1` | `201 Session` (`200` on key replay) | key | `no_confirmed_knowledge`, `case_not_permitted` (newcomer S3; expert `case_id` not shown to the expert, I4) | — | **S1** (newcomer S3, expert `case_id` I4) |
| GET | `/api/sessions/:sid` | — | `Session` | safe | — | — | **S1** |
| POST | `/api/sessions/:sid/lifecycle` | `{ action: "start" \| "pause" \| "resume" \| "end" \| "abort", rev }` (`pause`/`resume` I4) | `200 Session` | rev; same action already applied → `200` | `stale_revision`, `invalid_transition` | `session.updated` | **S1** |
| POST | `/api/sessions/:sid/record-state` | `{ state: "on_record" \| "off_record" }` | `200 Session` (new `RecordingSegment` appended; same state → no-op `200`) | idempotent by state | `invalid_transition` (ended session) | `record_state.changed` | **S1** |

Lifecycle: `created → active → ended`; `created | active | paused → aborted`; `active ⇄ paused` (I4, D53); `paused → ended`; `ended`, `aborted` terminal. `paused` is not a privacy state: content writes are still stored (off-record is the privacy control); voice tokens need `active`.

### 5.3 Assets

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| PUT | `/api/sessions/:sid/assets/:aid` | `multipart/form-data`: `meta` (JSON `AssetUploadMeta`: `kind`, `captured_at_utc`, `source`, `event_id?`, `record_state?`, `coordinate_space?`, `original: {width_px,height_px}`, `highlighted?: {width_px,height_px} \| null`), `original` (png/jpeg by content sniffing, required), `highlighted` (required iff `meta.highlighted`); per-file cap `ASSET_MAX_BYTES` (default 15 MiB); declared dims must match the image | `201 EvidenceAsset` (server fills `path`, `mime`, `sha256`, `status: "stored"`) | PUT-id by content hash: same bytes → `200`; different → `409` | `conflict_immutable`, `invalid_transition`, `gone` (S4); off-record → `202 dropped_off_record` (S4) | `asset.stored` | **S1** |
| GET | `/api/assets/:aid` | — | `EvidenceAsset` | safe | — (deleted → 404) | — | **S1** |
| GET | `/api/assets/:aid/original` | — | image bytes, correct `Content-Type`, `Cache-Control: private` | safe | — | — | **S1** |
| GET | `/api/assets/:aid/highlighted` | — | image bytes (404 if none) | safe | — | — | **S1** |

Asset reads resolve only under `knowledge/images/` (and S3 case assets under `CASES_DIR`); `RUNTIME_DIR`/`EVALUATOR_DIR` are rejected by the path resolver.

### 5.4 Events & exchanges

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| PUT | `/api/sessions/:sid/events/:eid` | `PointingEvent` (`session_id`/`event_id` must match the path; **`asset_id` required** — S1) | `201`/`200 EventAck { event_id, status: "stored", seq }` (`seq` of its `event.stored`, stable on retry) | PUT-id (immutable) | `conflict_immutable`, `asset_not_available`, `invalid_transition`, `gone` (S4); off-record → `202 dropped_off_record` (S4) | `event.stored` | **S1** |
| GET | `/api/sessions/:sid/events` | — | `PointingEvent[]` ordered by `captured_at_utc`, then arrival | safe | — | — | **S1** |
| GET | `/api/sessions/:sid/events/:eid` | — | `PointingEvent` (image refs rewritten, §7) | safe | — | — | **S1** |
| PUT | `/api/sessions/:sid/exchanges/:xid` | `ExpertExchange` + `rev` (full record each time; answer lines grow) | `201`/`200 ExpertExchange` | PUT-id mutable `rev`; `event_id` immutable after first write | `stale_revision`, `conflict_immutable` (event_id changed), `not_found` (event_id not stored), `gone` (S4); off-record → `202 dropped_off_record`, off-record lines cut (S4) | `exchange.updated` | **S1** |
| GET | `/api/sessions/:sid/exchanges` | — | `ExpertExchange[]` | safe | — | — | **S1** |
| GET | `/api/sessions/:sid/exchanges/:xid` | — | `ExpertExchange` | safe | — | — | **S1** |

### 5.5 Live stream

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/sessions/:sid/stream` | header `Last-Event-ID?` or `?after=<seq>` | `text/event-stream` of `BusEvent` | replay by seq | — | (all) | **S1** |

### 5.11 S1 implementation notes

- **Write guard (all content writes: assets, events, exchanges):** unknown session `404`; `aborted` → `409 invalid_transition`; session `off_record` **or** the record's own `record_state: "off_record"` → `403 off_record`, nothing written. `created`/`active`/`ended` accept writes (late delivery after `end` is accepted, WS2-Q7).
- **Identical retries are always answered.** A byte-identical retry of a stored asset/event/exchange returns `200` with the stored record (events: the original ack `seq`) even if the session went off-record or was aborted since — it stores nothing new. Only *new* content is refused.
- **Event acks:** `seq` is the seq of the event's `event.stored` bus entry. Seqs are shared with all bus types of the session, so they are not 1..N per event. If the bus line was lost (crash between write and publish), the retry re-announces the event and acks with the new seq.
- **Asset checks for events:** `409 asset_not_available` with `details.asset_id` when the asset is missing, deleted, or belongs to another session; `details.missing: "highlighted"` when it has no highlighted image (WS2-Q3 default).
- **Exchanges:** check order is identical-retry → write guard → `event_id` change (`409 conflict_immutable`, `details.field: "event_id"`, even with a higher rev) → stale rev (`409 stale_revision`, `details.current_rev`/`received_rev`) → referenced event stored (`404 not_found`, `details.missing: "event"`). `exchange.updated` is emitted on create and on a higher rev only; `ids.event_id` is omitted when `event_id` is null. Lists are ordered by `asked_at_utc`.
- **Lifecycle:** an action whose target state is already reached returns `200` with the current session regardless of `rev` (safe retries); otherwise `rev` must equal the current rev. `end`/`abort` close the open recording segment. Record-state on ended/aborted → `409 invalid_transition`. `record_state.changed.ids = { segment_id }` of the new segment.
- **Session create:** `Idempotency-Key` = 1–200 printable ASCII chars (else `400`); the key → session mapping lives in `RUNTIME_DIR/idempotency/sessions/`.
- **Asset reads:** `Cache-Control: private, no-cache` (not immutable, so S4 deletion takes effect), `X-Content-Type-Options: nosniff`, `ETag: "<sha256>"`. A corrupt/tampered `meta.json`, a missing file, or a resolved path outside `knowledge/images/` (symlinks resolved; never inside `RUNTIME_DIR`/`EVALUATOR_DIR`) → `404`. Invalid IDs → `400`.
- **SSE:** `Last-Event-ID` (non-empty) wins over `?after=`; invalid values → live only. Replay then live with no gaps or duplicates; heartbeat `: hb` every 15 s.
- **Voice token:** `?session_id=` failures use the WS6 envelope (`400`/`404`/`409`); ElevenLabs/config failures keep the route's original `{ error: string }` shape on both paths. Success with `session_id` → `{ token, session_id }`.
- **Diagnostics:** every route appends `{at_utc, component, op, ids, outcome, duration_ms, error_code?}` to `RUNTIME_DIR/diag/<yyyy-mm-dd>.ndjson`; keys outside this allow-list and non-ID `ids` values are dropped.

### 5.6 Synthesis, draft & gaps (jobs)

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| POST | `/api/sessions/:sid/synthesis` | `{}` | `202 { job_id }` (a running job's `job_id` if one exists) | one running job per session | `invalid_transition` | `synthesis.started/done/failed/discarded`, `revision.created`, `draft.updated`, `gaps.updated` | **S2** |
| GET | `/api/jobs/:job_id` | — | `Job { job_id, session_id, status: queued\|running\|done\|failed\|discarded, input_revs, … }` | safe | — | — | **S2** |
| GET | `/api/sessions/:sid/gaps` | — | `GapsView { session_id, job_id, produced_by, gaps: Gap[], updated_at_utc }` (WS5 `Gap` shape, stored as `gaps.json`; §5.12) | safe | — | — | **S2** |
| GET | `/api/sessions/:sid/draft` | — | expert session: `SessionDraftView { revision_ids, reviewed, teach_back, … }` (§5.12); newcomer session: `LearnerDraft` (5.8) | safe | — | — | **S2** / S3 |

Jobs snapshot their input revs at start and persist only if no input changed meanwhile, else `discarded` (S4 adds generation tokens).

### 5.7 Knowledge entries/revisions, confirmations, Work Map

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/knowledge/entries` | — | `KnowledgeEntry[]` (current revision + status per entry) | safe | — | — | **S2** |
| GET | `/api/knowledge/entries/:id` | — | `KnowledgeEntry` | safe | — | — | **S2** |
| GET | `/api/knowledge/entries/:id/revisions/:revision_id` | — | `{ revision: KnowledgeRevision, status, markdown: string }` | safe | — | — | **S2** |
| POST | `/api/knowledge/confirmations` | WS6 form `{ reviewed_revision_ids: Id[], result: "confirmed"\|"corrected"\|"unresolved", expert_response_exchange_id, idempotency_key }` **or** a WS3 `ExpertConfirmation` (producer-owned `confirmation_id`, mapped by `toConfirmation`) | `201 { confirmations: Confirmation[] }` — one record per reviewed revision; replay → `200` same records | key / confirmation_id | `stale_revision` (`details.stale_revision_ids`, `details.current_revision_ids`; never overridable), `not_found` (unknown revision), `validation_failed` (`details.reason`), `invalid_transition`, `conflict_immutable` (key reused with another body) | `confirmation.stored` | **S2** |
| GET | `/api/workmap[?include=draft]` | — | `WorkMapView`: steps with entry/revision/status, per evidence `{asset_id, original_url, highlighted_url, region}`, per exchange `{exchange_id, question, answer_lines}`, `broken_links[]`; default only `confirmed` | safe | — | — | **S2** |

`result` effects (via WS5 `nextStatus`): `confirmed` → entry status `confirmed`; `corrected` → stays `draft`, a later synthesis run produces `rev-(n+1)` with `parent_revision_id` = the reviewed revision (this **is** the correction path); `unresolved` → `unresolved`.

### 5.12 S2 implementation notes

Spec: `specs/004-ws6-knowledge-confirmation/` (decisions D16–D28 in §9). Schemas: `Job`, `Gap`, `GapsView`, `SessionDraftView`, `ConfirmationRequest`/`ConfirmationPost`, `WorkMapView` (`web/lib/contracts/synthesis.ts`, `workmap.ts`); `KnowledgeRevision` gains optional `session_id`, `content_sha256`, `change_reason`; `Confirmation` gains optional `session_id`, `entry_id`; new `StatusTransition`.

- **Module host** `web/lib/backend/modules.ts`: `WS5_MODULES=stub` → `ws6-stub-synthesis@0.1.0` (`source: "stub"`), otherwise the real `ws5-synthesis@0.2.0` (`createWs6SynthesisModule`). `GET /api/health` → `modules: { synthesis: { id, version, source } }`.
- **POST `/api/sessions/:sid/synthesis`** → `202 { job_id }`; a queued/running job for the session is returned instead of a new one. Unknown session `404`; newcomer or aborted session `409 invalid_transition`. The job runs in-process; poll `GET /api/jobs/:job_id` or watch SSE.
- **Job** (`RUNTIME_DIR/jobs/<job_id>.json`): `status` `queued → running → done | failed | discarded`; `input_revs` = `{ event_ids, exchanges: {id: rev}, entries: {entry_id: current_revision_id}, confirmation_ids }` taken when it starts; `revision_ids` = revisions it created (empty when nothing changed); `error.code` ∈ `module_error`, `invalid_output`, `dangling_reference`, `revision_conflict`, `interrupted`, `internal` (messages never carry content); `discard_reason` e.g. `exchange_changed:<id>`, `event_deleted:<id>`, `entry_changed:<id>`, `confirmations_changed`. Records added during a run do not discard it.
- **Module input** = the session's stored events and exchanges, every stored revision (`prior`), and the session's confirmations in WS3 `ExpertConfirmation` shape (`revision_id` = WS6 ID). `gap_answers` not passed yet.
- **Revision file** `knowledge/entries/<entry_id>/rev-<n>.md`: WS6 frontmatter (`key: <JSON>` per line) + `<!-- ws6:module-frontmatter "<json>" -->` (the module's own frontmatter, kept verbatim) + the module body. `GET …/revisions/:revision_id` returns `{ revision, status, markdown }` where `markdown` is the module Markdown byte-for-byte. Image links are relative (`../../images/<asset_id>/<file>`).
- **Numbering/dedupe:** WS6 assigns `revision_no` = latest + 1 and `parent_revision_id` = current; a module value that disagrees fails the job (`revision_conflict`). Content equal (sha256) to the entry's **latest** revision → no revision.
- **Status** is never edited in a revision file: `entries/<entry_id>/status.ndjson` holds `StatusTransition`s; `current.json.status` mirrors the current revision. `GET /api/knowledge/entries/:id` → `KnowledgeEntry & { revisions: [{ revision_id, revision_no, status, created_at_utc }] }`.
- **`knowledge/workflow.md`**: linkage frontmatter (`produced_by`, `session_id`, `job_id`, `generated_at_utc`, `links: [{ position, entry_id, revision_no, revision_id | null, title }]`) + the module's workflow Markdown. Links are the ordered `entries/<id>/rev-<n>.md` links in that Markdown. Reflects the latest synthesis run.
- **`GET /api/sessions/:sid/gaps`** → `GapsView { session_id, job_id, produced_by, gaps: Gap[], updated_at_utc }` (empty list before the first run). `Gap` is WS5's shape; `gap_id` is not path-safe (`gap-missing_reason-…`), so it is a plain string.
- **`GET /api/sessions/:sid/draft`** (expert) → `SessionDraftView { session_id, job_id, produced_by, revision_ids, reviewed: [{entry_id, revision_id}], teach_back, flagged_for_reconfirmation, updated_at_utc }`. `revision_ids` = WS5 `teach_back_reviewed` (mapped to WS6 IDs) or, for the stub, every linked revision — send exactly these as `reviewed_revision_ids`. Newcomer → `404` until S3.
- **Confirmation checks** (under the knowledge lock, in order): key replay (same body → `200` same records, completing any interrupted write; other body → `409 conflict_immutable`) → each revision exists (`404`) → each is its entry's current revision (`409 stale_revision`) → all from one session (`400 reason: revision_sessions`) → response exchange stored in that session (`400 exchange_not_found`), on-record (`exchange_off_record`), with a non-blank answer line (`exchange_no_answer`) → `step_ids_reviewed` ⊆ reviewed entries (`step_not_reviewed`; default all) → WS5 `nextStatus` (`409 invalid_transition`). One `Confirmation` per revision (`knowledge/confirmations/<cnf-id>.json`, `source` = the exchange's source); the plan is recorded in `RUNTIME_DIR/idempotency/confirmations/` before the files. Status: WS5 `nextStatus` (`confirmed` → confirmed; `unresolved` → unresolved; `corrected` → draft stays draft, confirmed drops to unresolved). The next synthesis run uses the confirmation to produce rev-(n+1).
- **`GET /api/workmap[?include=draft]`** → `WorkMapView { include, produced_by, session_id, job_id, generated_at_utc, steps, excluded }`. Step: `{ position, entry_id, revision_id, revision_no, status, is_current, source, title, evidence: [{event_id, asset_id, original_url, highlighted_url, region}], exchanges: [{exchange_id, question, answer_lines}], content, broken_links }`. `content` = WS5 `WorkMapStep` (verbatim quotes, tagged synthesis, guardrails) for WS5 revisions, else `null`. Default shows confirmed + current + WS5 `isTeachable` (fixtures allowed, labelled by `source`); `include=draft` everything except revoked. A missing revision, event, asset/image file, exchange or unresolved image link is listed in `broken_links`; the step stays.
- **SSE** (on the originating session): `synthesis.started|done|failed|discarded {job_id, revision_ids?}`, `revision.created {entry_id, revision_id}`, `draft.updated {revision_ids}`, `gaps.updated {}`, `confirmation.stored {confirmation_ids, revision_ids}`. No `session.updated` on confirmation (the session does not change).

### 5.8 Newcomer: case view, session, learner draft, evaluation, commit, assessment

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/cases[?for=expert\|newcomer]` | — | `LearnerCase[]`, every usable case (unusable files skipped); `for` filters by `shown_to_expert` | safe | `validation_failed` (bad `for`) | — | **I4** |
| GET | `/api/cases/:case_id` | — | `LearnerCase` (learner-visible view only; never evaluator fields) | safe | — | — | **S3** |
| GET | `/api/cases/:case_id/trace` | — | trace image bytes (`image/png` \| `image/jpeg`) | safe | — | — | **S3** |
| POST | `/api/sessions` (role newcomer) | `{ role: "newcomer", case_id?, source? }`, `?allow_fixture_knowledge=1` | `201 Session` with `case_id`, `trace_ref`, `pinned_knowledge`, `knowledge_fixture_allowed` | key | `no_confirmed_knowledge`, `case_not_permitted` | — | **S3** |
| POST | `/api/sessions/:sid/pin` | — | `200 Session` re-pinned to the knowledge eligible now | idempotent (same pins → unchanged) | `no_confirmed_knowledge`, `invalid_transition` | `session.updated`, `evaluation.updated` (→ stale) | **S3** |
| GET | `/api/sessions/:sid/draft` | — | newcomer: `LearnerDraft` (`404` before the first PUT); expert: S2 draft view | safe | — | — | **S3** |
| PUT | `/api/sessions/:sid/draft` | `{ base_draft_rev, decision, reason, visual_context? }` (`base_draft_rev: 0` for the first) | `201` first / `200` later `LearnerDraft` (server sets `draft_rev = base + 1`) | retry with same base + same body → `200` current | `stale_revision`, `invalid_transition` (committed/ended/expert), `off_record`, `asset_not_available` | `draft.updated`, `evaluation.updated` (earlier evals → `stale`) | **S3** |
| POST | `/api/sessions/:sid/evaluations` | `{ draft_rev }` | `202 Evaluation` (`status: "pending"`, `knowledge_revision_ids` = pinned); a pending/done one for that `draft_rev` → `200` existing | one live per (session, draft_rev) | `stale_revision`, `evaluation_stale` (`policy_code: knowledge_changed`), `invalid_transition` | `evaluation.updated` | **S3** |
| GET | `/api/sessions/:sid/evaluations` | — | `{ evaluations: Evaluation[] }` oldest first | safe | — | — | **S3** |
| GET | `/api/sessions/:sid/evaluations/:evaluation_id` | — | `Evaluation` | safe | — | — | **S3** |
| POST | `/api/sessions/:sid/commit` | `{ draft_rev, evaluation_id, escalated?: boolean, idempotency_key }` | `201 Commit` (replay with same key → `200`) | key, under session lock | `evaluation_required`, `evaluation_pending`, `evaluation_stale`, `commit_blocked` (all with `details.policy_code`), `invalid_transition` | `commit.stored`, `assessment.stored` | **S3** |
| GET | `/api/sessions/:sid/commit` | — | `Commit` (`404` before commit) | safe | — | — | **S3** |
| GET | `/api/sessions/:sid/assessment` | — | `Assessment` (`404` before commit/end) | safe | — | — | **S3** |

### 5.13 S3 implementation notes

Spec/plan: `specs/005-ws6-newcomer-presave/plan.md` (decisions D29–D41 in §9). Code: `web/lib/backend/{cases,newcomer,learner,learner-store,commit-policy,assessment,tutor-stub,ws5-content}.ts`, `outcome-policy.json`.

- **Cases** (`CASES_DIR`; default `<repo>/cases/learner` if it exists, else the labelled fixtures `web/fixtures/ws6/cases`: `fx-n01`, `fx-n02` unseen, `fx-e01` shown to the expert). `case.json` = strict `{ case_id, title, trace_asset, shown_to_expert, source, visible_context?, decision_options? }`; any other key (incl. WS5's forbidden evaluator names) → the case is unusable (`404 reason: invalid | evaluator_material`). `LearnerCase` = `{ case_id, title, shown_to_expert, source, visible_context, decision_options, trace: { url, mime, width_px, height_px } }`.
- **Evaluator separation:** `imagesRoot/assetDir/casesRoot/caseDir` refuse any directory inside (or containing) `EVALUATOR_DIR`; a test greps every route handler and `lib/backend` module for the evaluator dir (only `config.ts`, `paths.ts`, `assets.ts` guards may name it). The tutor receives the learner case view only (WS5 also rejects evaluator keys).
- **Pinning:** WS5 `selectEligible` over every entry's current revision, with WS6 status, confirmation and revocation injected; `allow_fixture` = `?allow_fixture_knowledge=1`. Stub-synthesis revisions are never WS5 content and count as fixture material (pinned only with the flag, confirmed and current). Revisions in their session's `flagged_for_reconfirmation` are excluded. Empty → `409 no_confirmed_knowledge` with `details.excluded[{ entry_id, revision_id, reason }]` (reason codes only). An `Idempotency-Key` replay returns the stored session without re-pinning.
- **Pinned knowledge is current** while every pinned revision is still its entry's `current_revision_id` and its status is `confirmed`. When it is not, evaluations are refused (`evaluation_stale`, `policy_code: knowledge_changed`) and commits too, until `POST …/pin` re-pins (all earlier evaluations become `stale`, `stale_reason: knowledge_changed`).
- **Learner draft:** generic task, `decision`/`reason` are opaque strings (≤4000/≤8000 chars); `visual_context[].asset_id` must be an asset stored for this newcomer session (upload with the S1 asset PUT). Every edit marks pending/done evaluations `stale` (`stale_reason: draft_changed`). Refused when the session is committed, `ended`/`aborted` (`invalid_transition`) or off the record (`off_record`).
- **Evaluation:** runs in-process after `202`. On finish (under the session lock) it is stored as `done` only if the draft rev and the pinned knowledge are unchanged; otherwise `stale` with the result kept for audit. A module error → `failed` (`error_code: module_error`, no content; never turned into `uncertain`); a pending evaluation found after a restart → `failed` (`interrupted`) and a new one starts. Citations or an escalation naming non-pinned knowledge fail the evaluation. New optional fields: `completed_at_utc`, `stale_reason`, `error_code`, `uncertainty`, `evidence`, `guard_notes` (WS5-Q4 answered).
- **Tutor module:** stub by default (`ws6-stub-tutor@0.1.0`, `source: "stub"`; decision `FIXTURE_WRONG` → `intervene`, `FIXTURE_UNCERTAIN` → `uncertain`, `FIXTURE_FAIL` → module error, else `ok`; cites the first pinned revision's exchanges with the first verbatim answer line). `WS5_MODULES=real` → WS5 `createWs6TutorEvaluator` (`ws5-tutor@0.3.0`, Anthropic judge, needs `ANTHROPIC_API_KEY`). `GET /api/health.modules` = `{ synthesis, tutor, assessment }`.
- **Commit:** `canCommit` (pure, `commit-policy.ts`) returns `evaluation_required | evaluation_pending | evaluation_stale | knowledge_changed | blocked_by_outcome | already_committed`; they travel as `error.details.policy_code` under the S0 codes (D10): `knowledge_changed` → `evaluation_stale`, `blocked_by_outcome`/`already_committed` → `commit_blocked`. Details also carry `evaluation_id`, `outcome`, `consequence`, `requires: "escalated"`, rev numbers. `allow_with_escalation` needs `escalated: true` in the request. `commit.json` = `Commit` + `outcome`, `escalated`, `knowledge_revision_ids`, `idempotency_key_sha256` (the raw key is never stored).
- **Assessment:** stub `ws6-stub-assessment@0.1.0` written once, on commit or newcomer `end`: `initial_decision`, `assistance` (`"<outcome> on draft_rev <n> (<evaluation_id>)"` for intervene/uncertain), `final_outcome`, `evidence_used` (cited refs), `practice_next: null`, `content: { note, interventions, evaluations, committed, commit_id, escalated, timeline }` with WS5 `buildTimeline` (`proposed → evaluated → guidance_delivered → revised → … → committed`, `intervention: caught_before_save`). `knowledge/assessments/<sid>.json` + `.md`.
- **Voice:** the tutor voice client reads `feedback_text` from `GET …/evaluations/:id` after `evaluation.updated`; tokens via `GET /api/conversation-token?flow=tutor&session_id=<sid>` (the newcomer session must be `active`).

### 5.14 S4 implementation notes

Code: `web/lib/backend/{off-record,tombstones,cascade,access,diagnostics}.ts`, `web/proxy.ts`, `web/app/diagnostics/page.tsx`, `web/scripts/e2e-integration.mts` (`npm run e2e`). Run docs: `web/README.md`; failures: `notes/ws6-failure-recovery.md`. Decisions D42–D52 in §9.

- **Off-record decision** per write: own label `off_record`, or session `record_state` off now, or capture time (`captured_at_utc` for assets/events, `asked_at_utc` for a new exchange) inside an off-record segment. → `202 { status: "dropped_off_record", kind, id }` + a `dropped` tombstone; no bytes, no record, no SSE. An exchange that is already stored keeps getting on-record updates; its lines spoken inside off-record segments are cut. An identical retry of something stored before the toggle still gets `200` (D13).
- **Retroactive purge** (`since_utc`): the new off-record segment starts at `since_utc` (it must lie in the current on-record segment). Everything of that session captured since then is removed with `dropped` tombstones; longer exchanges lose the lines spoken since then (`trimmed_exchange_ids`); revisions citing any of it are revoked **and redacted**; derived `draft.json`/`gaps.json` are removed (synthesis rebuilds them).
- **Deletion** = files removed + `deleted` tombstones (`410 gone` on reuse). Revisions citing deleted evidence are `revoked` (`StatusTransition.reason`) and their body is replaced by a `REDACTED — evidence deleted` marker: frontmatter (IDs, hashes) stays, the expert's words go. Evaluations quoting them lose `quote`/`feedback_text`. **Revocation** (route) keeps the text (it is withdrawn, not private).
- **Generation tokens:** `Session.generation` is bumped (under the session lock, before the cascade reads anything) for every session a cascade or purge touches. Synthesis jobs record it in `input_revs.generation` and are discarded (`discard_reason: generation_changed:a->b`) if it moved; evaluations become `stale` if their newcomer session's generation moved. A deleted session can never be recreated by a late job: `appendBus` and every session read return `410 gone`.
- **Access boundary:** `BACKEND_ACCESS_TOKEN` set → `web/proxy.ts` requires `Authorization: Bearer <token>` or the `ws6_access` cookie on `/api/*` except `/api/health`, `/api/access`. Limits: README §5.
- **Diagnostics:** every route logs one diag line (`component`, `op`, IDs, outcome, duration, error code); jobs and SSE `close` too. `failing_components` = components whose latest outcome is a server failure (`internal`) or a module failure (`synthesis`, `evaluations`); client errors (4xx) do not count.

### 5.15 Integration additions for WS7 (I2/I4)

Plan: `notes/ws6-ws7-integration-plan.md` (gaps G7–G10, G14). Code: `web/lib/backend/{review,cases,session-lifecycle,workmap}.ts`, `web/lib/contracts/review.ts`. Decisions D53–D58 in §9.

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/cases[?for=expert\|newcomer]` | — | `LearnerCase[]` | safe | `validation_failed` | — | **I4** |
| GET | `/api/sessions/:sid/review` | — | `SessionReviewView` (expert sessions) | safe | `not_found` (newcomer/unknown), `gone` | — | **I4** |
| POST | `/api/sessions/:sid/review-marks` | `{ entry_id, revision_id, kind: "correction_requested" \| "flag_unresolved", idempotency_key }` | `201 ReviewMark` (same key + body → `200`) | key (per session) | `validation_failed` (`details.reason`: `not_expert_session`, `entry_mismatch`, `revision_not_in_session`), `not_found` (revision), `conflict_immutable` (key reused), `invalid_transition` (aborted) | `review_mark.stored` | **I4** |
| GET | `/api/sessions/:sid/review-marks` | — | `ReviewMark[]` oldest first | safe | — | — | **I4** |

- **`SessionReviewView`**: `{ session_id, job_id, produced_by, updated_at_utc, revision_ids, current: WorkMapViewStep[], previous: WorkMapViewStep[], excluded, teach_back, flagged_for_reconfirmation, gaps: Gap[], confirmations: Confirmation[], review_marks: ReviewMark[] }`.
  - `current` has one step per revision in the expert draft's `revision_ids`, built like `include=draft` Work Map steps. Position and title come from the workflow when the entry is linked there.
  - `previous` has the stored parent of every current revision that has one, so a client can show what changed. Revoked current revisions are listed in `excluded`.
  - It is in WS6 vocabulary (gaps, `Confirmation`). WS7 maps it to `ReviewView` (`open_questions` ← gaps, `ExpertConfirmation` via the `reviewed_revision_id → revision_id` rename).
- **Review marks** are requests only. They never change knowledge status (D56). They live in `knowledge/sessions/<sid>/review-marks/`, so deleting the session deletes them.
- **Wire recordings (I2):** `npm run e2e -- --record fixtures/ws6/wire` writes one real response per WS7 touch point, plus SSE transcripts, but only when all checks pass. `web/lib/contracts/wire-recordings.test.ts` parses each one with its schema and fails on any field the schema does not declare. Re-record in the same commit as any route or schema change (D58). The e2e now has a criterion C9 for the routes above (52 checks).

### 5.9 Correction, revocation & deletion

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| POST | `/api/knowledge/confirmations` with `result: "corrected"` | see 5.7 | Confirmation; new `KnowledgeRevision` follows from synthesis | key | as 5.7 | as 5.7 | S2 |
| POST | `/api/knowledge/entries/:id/revoke` | `{ reason, revision_id? }` (default: the current revision) | `200 { entry, revoked_revision_id, cascade: CascadeSummary }`; newcomer evaluations using it → `stale` | idempotent (revoked is terminal) | `not_found` | `entry.revoked` (origin + pinning sessions), `evaluation.updated`, `session.updated` | **S4** |
| POST | `/api/sessions/:sid/record-state` | `{ state: "off_record", since_utc }` | `200 Session & { purge: CascadeSummary }` | — | `validation_failed` (since outside the current on-record segment) | `record_state.changed`, `record.deleted`, `entry.revoked` | **S4** |
| DELETE | `/api/sessions/:sid/events/:eid` | — | `200 CascadeSummary` (the event, its asset, exchanges about it, citing revisions) | idempotent; late re-PUT → `410 gone` | `not_found` | `record.deleted`, `entry.revoked` | **S4** |
| DELETE | `/api/sessions/:sid/exchanges/:xid` | — | `200 CascadeSummary` | idempotent | `not_found` | `record.deleted`, `entry.revoked` | **S4** |
| DELETE | `/api/assets/:aid` | — | `200 CascadeSummary` (the events showing it follow) | idempotent | `not_found` | `record.deleted` | **S4** |
| DELETE | `/api/sessions/:sid` | — | `200 CascadeSummary` (whole session; newcomer: learner records and assessment too) | idempotent; afterwards every route on it → `410 gone` | `not_found` | — (the stream is gone) | **S4** |

`CascadeSummary` = `{ deleted: { session_ids, asset_ids, event_ids, exchange_ids }, trimmed_exchange_ids, revoked_revision_ids, stale_evaluation_ids, affected_session_ids }`. Cascade order (pure `computeCascade` over stored links): session → its records; asset ↔ events showing it → exchanges about those events; deleted/trimmed evidence → revisions citing it (or confirmed by a deleted answer) → newcomer sessions pinning them → their evaluations. Tombstones `{ kind, id, session_id, dropped, record_state?, deleted_at_utc, reason }` keep late retries from recreating data.

### 5.10 Provider tokens

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/conversation-token?flow=expert\|tutor[&session_id=]` | — | existing response (short-lived ElevenLabs token); with `session_id`: session must exist and be `active`, and the session id is echoed for WS3 to pass as a dynamic variable. API key never returned. | safe | `not_found`, `invalid_transition` (session not active) | — | exists; `session_id` **S1** |

## 6. Commit rule (enforced S3; policy table pending WS5)

`POST /api/sessions/:sid/commit` re-reads everything from disk under the session lock, then:

| Check (in order) | Failure (`error.code` / `details.policy_code`) |
|---|---|
| Session is a newcomer session | `invalid_transition` |
| A commit exists with the same `idempotency_key` | `200` + that commit (double submit is idempotent; concurrent submits → exactly one commit) |
| A commit exists with another key | `commit_blocked` / `already_committed` |
| Session not `ended`/`aborted` | `invalid_transition` |
| A draft exists and the named evaluation exists for this session | `evaluation_required` / `evaluation_required` (`reason: no_draft \| no_evaluation`) |
| The evaluation is not `failed` | `evaluation_required` (`reason: evaluation_failed`) |
| It is not `pending` | `evaluation_pending` |
| It was not made stale by changed knowledge | `evaluation_stale` / `knowledge_changed` |
| It is `done` for the current `draft_rev`, and the request names that `draft_rev` | `evaluation_stale` / `evaluation_stale` |
| The pinned revisions are still current + confirmed, and equal the evaluation's `knowledge_revision_ids` | `evaluation_stale` / `knowledge_changed` |
| The policy for its `outcome` is `allow`, or `allow_with_escalation` with `escalated: true` (unknown outcomes block) | `commit_blocked` / `blocked_by_outcome` |

Policy (`web/lib/backend/outcome-policy.json`, **default pending WS5 agreement**): `ok → allow`, `intervene → block`, `uncertain → allow_with_escalation` (commit records `escalated: true`). After `intervene` the learner must edit the draft (new `draft_rev`) and get a new evaluation. WS6 enforces the policy; WS5 defines outcomes.

## 7. Asset mapping

1. WS2 uploads the asset first: `PUT /api/sessions/:sid/assets/:aid` → `201`.
2. WS2 sends the event with `asset_id: <aid>`. `image_ref`/`highlighted_image_ref` may carry any non-empty placeholder (WS3's type requires strings).
3. On ingestion WS6 checks the asset is `stored` for this session (else `409 asset_not_available`, nothing stored) and **rewrites** `image_ref = /api/assets/<aid>/original`, `highlighted_image_ref = /api/assets/<aid>/highlighted`. The stored event and every read return the rewritten refs (relative URLs; clients prefix their base URL).
4. Idempotency compares the body **after** rewriting, so a retry with the same placeholders is still a no-op.
5. In Markdown revisions, image links are relative file paths (`../../images/<aid>/original.png`) so files render on disk; the Work Map returns HTTP URLs.

## 8. Partners

### WS2 — glasses/iPhone capture

**Calls, in order:**
1. Obtain `session_id` (created by the web companion via `POST /api/sessions`; hand-over mechanism is WS2-Q1).
2. Per gesture: `PUT /api/sessions/:sid/assets/:aid` (multipart) → wait for `201`/`200`.
3. `PUT /api/sessions/:sid/events/:eid` with `asset_id` → `EventAck`.
4. Optional: `GET /api/sessions/:sid/stream` for `record_state.changed` (the acknowledged off-record state).

**Rules:** the **ack is the HTTP `200`/`201` response**; anything without one is retried with the **same IDs and same bytes** (no duplicates possible). On reconnect, re-send every un-acked asset then event, in that order. A `409 asset_not_available` means "upload the asset first", not "give up". While off-record, uploads get `403 off_record` (S1–S3) — do not queue them for later. LAN: `http://<laptop-LAN-IP>:3006` (server started with `-H 0.0.0.0`); from S4 optionally `Authorization: Bearer <BACKEND_ACCESS_TOKEN>`.

**Open questions:**
1. How does the iPhone get `session_id` and the base URL (QR code on the web companion, manual entry, a fixed "current session" endpoint)?
2. Can you generate `asset_id`/`event_id` that match `^[a-z0-9][a-z0-9-]{0,63}$` (e.g. lowercase UUID)? `frame_id` too?
3. Will every event's asset have a `highlighted` derivative? WS3's `PointingEvent` requires a non-null `highlighted_image_ref`; v0 default rejects an event whose asset lacks it (`409 asset_not_available`, `details.missing: "highlighted"`). Should we allow a null instead?
4. Image formats and sizes (png/jpeg ≤ 15 MB? webp?) and whether you can declare `width_px`/`height_px` reliably.
5. Off-record: S1 answers `403 off_record`; S4's plan is `202 { status: "dropped_off_record" }` with no bytes written (so retries look successful). Which do you prefer to handle? Will you stop capturing locally (preferred) or rely on the server dropping?
6. Is the session-time origin (`session_time_ms = 0`) the lifecycle `start` time from WS6, or your own capture start?
7. Events captured while the session was active but delivered after `end`: accept (current lean) or reject?

### WS3 — expert conversation

**Calls, in order:** `GET /api/conversation-token?flow=expert&session_id=` → subscribe `GET /api/sessions/:sid/stream` → on `event.stored` `GET …/events/:eid` and send the contextual update → `PUT …/exchanges/:xid` with increasing `rev` as answer lines arrive → `POST …/synthesis` (or WS6 triggers it on `end`, WS3-Q7) → `GET …/gaps`, `GET …/draft` for the debrief and teach-back → `POST /api/knowledge/confirmations` with the expert's response exchange → after a correction exchange, `POST …/synthesis` again → confirm the new revision.

**Open questions:**
1. **Route prefix conflict:** your planned `PUT /api/expert-sessions/[sessionId]/snapshot` vs WS6 `/api/sessions/:sid/...`. Keep the snapshot route as a thin compatibility wrapper over per-record puts (Option A), or switch the client to per-record PUTs and drop it (Option B)? WS6 prefers B; A is acceptable for S1.
2. **Aggregate vs per-record files:** `events.json`/`exchanges.json` become `events/<id>.json`/`exchanges/<id>.json`. And `session.json` is taken by WS6's `Session` — where should your extra session state go (proposal: `expert-state.json`)?
3. **ID regex:** yours is `^[a-z0-9-]{1,64}$` (sanitizer), ours `^[a-z0-9][a-z0-9-]{0,63}$` (no leading hyphen) and applied to all ID fields, not only `sessionId`. Can you adopt ours? Your planned `ses-<yyyymmdd-hhmmss>-<rand4>` passes; WS6 generates `ses-<yyyymmddhhmmss>-<rand6>` — OK if WS6 issues session IDs?
4. **Confirmation naming:** WS3 `ExpertConfirmation { revision_id, status }` vs WS6 `Confirmation { reviewed_revision_id, result }`. WS6 accepts yours as is and maps via `toConfirmation()`. Converge on one naming in v1?
5. **Revision IDs:** your `DraftRevision.revision_id` is `rev-1`, `rev-2` per session; WS6 `KnowledgeRevision.revision_id` is global `rev-<yyyymmddhhmmss>-<rand6>` with `revision_no` for the filename. These are different records — confirmations from the teach-back must name **KnowledgeRevision** IDs once WS5 synthesis is live. Agreed? (Your local `rev-1` could collide in shape with ours; consider `drv-1`.)
6. **`Source` lacks `"stub"`:** WS3 `Source = "live" | "fixture"`; WS6 records add `"stub"`. Mirror records stay as yours; should WS3's type gain `"stub"` for stub synthesis output?
7. Who triggers synthesis — WS3 after the live phase / after a correction, or WS6 automatically on lifecycle `end`?
8. Stale exchange writes: WS6 answers `409 stale_revision` with `details.current_rev` (the S1 prompt's `200 ignored_stale` was dropped for consistency). OK for your debounced save loop?
9. Planned fields `question_planned` (S1) and `related_event_ids` (S2) on `ExpertExchange`: WS6 re-exports your type, so they flow through automatically — please add them as optional or bump `ws3.v0`.
10. Off-record authority: WS6 `Session.record_state` + `RecordingSegment` is authoritative (your contracts-v0 WS6-Q4). Your client mutes and calls `POST …/record-state`; OK?

### WS5 — knowledge and tutor modules

**WS6 calls (in-process, from `web/lib/knowledge/`):** `adapters/ws6-synthesis-module.ts` (`id: "ws5-synthesis"`) in synthesis jobs; `nextStatus` on confirmations; `selectEligible`/`isTeachable` when pinning newcomer knowledge; `adapters/ws6-tutor-evaluator.ts` (`id: "ws5-tutor"`) for evaluations; `buildTimeline` + `buildAssessment` + `renderAssessmentMarkdown` on commit/end. Stubs (`source: "stub"`) stand in until each is merged; `/api/health.modules` shows which is active.

**Open questions:**
1. **Frontmatter `source`:** WS5 `ws5.v0` has top-level `source: "live" | "fixture"` + `produced_by: { module, version }`; WS6 has `produced_by: { module, version, source: "live" | "stub" | "fixture" }`. Proposal: one frontmatter block = WS6 `KnowledgeRevision` keys + your extra keys (`kind`, `workflow_position`, …); `source` lives in `produced_by.source`. OK?
2. **Entry kind `"escalation"`:** WS6 is kind-agnostic (opaque body), but WS3 `DraftStep.kind` and WS7 `WorkMapStep.kind` lack `escalation`. Please align with them.
3. **Status on immutable revisions:** revision files never change, so the authoritative status is `current.json` (`KnowledgeEntry.status` for `current_revision_id`). Your invariant "confirmed requires confirmation evidence in the entry" and `revoked_at_utc`/`revoked_reason` cannot be written into an immutable revision — can they be computed from `knowledge/confirmations/` + `current.json` at read time?
4. **Evaluation extras:** `cited[].quote`, `guiding_question`, `escalation` are accepted as optional. Your `uncertainty: string | null` is **not** in `Evaluation` yet — add it as optional in S3?
5. **Assessment shape:** WS6 keeps minimal fields (`initial_decision`, `assistance`, `final_outcome`, `evidence_used`, `practice_next`) plus optional opaque `content` for your `decisions[]` / `outcome_class` / `skills_demonstrated` / `needed_help_with` / `limitations`. Will your adapter fill both, or should WS6 derive the minimal fields from `content`?
6. **Outcome policy table:** confirm `ok: allow`, `intervene: block`, `uncertain: allow_with_escalation` (WS5 S3 Lane A.4), and how "correct decision, bad reason" maps.
7. **Visual context:** WS6 `LearnerDraft.visual_context = { asset_id, region | null }[]`; your planned `LearnerScreenContext { frame_asset_id, region, visible_case_id, draft_rev, captured_at_utc, source }`. Map `frame_asset_id → asset_id`, store the rest where?
8. **Confirmation of multiple revisions:** `buildTeachBack` lists several `{entry_id, revision_id}`; WS6 stores one `Confirmation` per reviewed revision from one request. OK?
9. **Gap shape:** WS6 stores your `Gap[]` verbatim in `gaps.json` — confirm the shape is stable for WS3.

### WS7 — web UI

**DataSource → WS6 routes:**

| `DataSource` method | WS6 route(s) | Mapping notes |
|---|---|---|
| `getSession(sid)` | `GET /api/sessions/:sid` | `lifecycle`: `created → not_started`, `active → active`, `paused → paused` (I4), `ended → ended` (completed), `aborted → ended` (incomplete); `record_state → recording_state`; `pinned_knowledge[0].revision_id → knowledge_revision_id` (it is a list) |
| `getWorkMap(sid)` | `GET /api/workmap` (+ `?include=draft`) | Work Map is global, not per session (WS7-Q3) |
| `getPracticeCase(case_id)` | `GET /api/cases/:case_id` + `GET /api/assets/:aid` | learner view only |
| `getAssessment(sid)` | `GET /api/sessions/:sid/assessment` | `independent/assisted/unresolved` from `content.decisions[].outcome_class` (WS5) |
| `requestOffRecord(sid, b)` | `POST /api/sessions/:sid/record-state` | ack = `200 Session` |
| `submitDraftForReview(draft)` | `PUT /api/sessions/:sid/draft` then `POST /api/sessions/:sid/evaluations` | evaluation completes asynchronously → `evaluation.updated` → `GET …/evaluations/:id`; `draft_id → session_id`, `draft_revision → draft_rev`, `region → visual_context[0].region` |
| `commitDraft(draft, eval)` | `POST /api/sessions/:sid/commit` | send a stable `idempotency_key` per click-intent; `committed_at_utc ← Commit.at_utc` |
| `subscribe(sid, cb)` | `GET /api/sessions/:sid/stream` (EventSource) | `BusEvent` → re-fetch by ID → `SourceUpdate` |
| `listCases()` | `GET /api/cases?for=expert` (I4) | `CaseSummary.asset` ← `trace` (`url`, `width_px`, `height_px`) |
| `startSession(case_id)` | `POST /api/sessions {role:"expert", case_id}` + `Idempotency-Key`, then lifecycle `start` (I4) | send `case_id`, not `trace_ref` |
| `requestPause(sid, paused)` | `POST /api/sessions/:sid/lifecycle {action: paused ? "pause" : "resume", rev}` (I4) | ack = `200 Session` |
| `getReview(sid)` | `GET /api/sessions/:sid/review` (I4) | see §5.15 |
| `submitReviewMark(mark)` | `POST /api/sessions/:sid/review-marks` (I4) | stable `idempotency_key` per click-intent |

**Answers to `notes/ws7-ui-contracts-v0.md` §3:**

| # | UI state | WS6 v0 answer |
|---|---|---|
| 1 | Connection per component | `backend`: derived by the client from the EventSource state (open → connected, error/retrying → reconnecting, closed → disconnected). `capture` and `agent`: **no authoritative signal in v0 → show `unknown`** (WS7-Q1). |
| 2 | Recording state with pending | Client shows `*_pending` from the POST until the `200 Session` response or `record_state.changed`. The ack means **WS6 persistence** applied it (content writes refused). Whether capture/audio stopped is WS2/WS3's responsibility and is not vouched for by WS6. |
| 3 | Lifecycle | `created/active/paused/ended/aborted` (mapping above). `paused` added in I4 (WS7-Q2 answered: D53). |
| 4 | Live updates | SSE per session (§2 table): `event.stored` (then GET for `mapping_status`), `revision.created`, `confirmation.stored`, `evaluation.updated`, `commit.stored`, `record_state.changed`, `record.deleted`, `session.updated`. |
| 5 | Revision identity | Confirmations name `reviewed_revision_id`; evaluations name `draft_rev` + `knowledge_revision_ids`; commits name `draft_rev` + `evaluation_id`; Work Map steps name `entry_id` + `revision_id`. |
| 6 | Learner review boundary | `draft_rev` (server-assigned), evaluation `status: pending`, commit errors `evaluation_required/pending/stale`, `commit_blocked`; double submit safe via `idempotency_key`. |
| 7 | Failure & reconnect | `ApiErrorBody` (`message` displayable, `code` for mapping). Reconnect with `Last-Event-ID`; after a long gap, re-GET the resources. |
| 8 | Evidence access | `/api/assets/:aid/original` and `/highlighted` (same origin, LAN-reachable) + `GET /api/assets/:aid` for `width_px`/`height_px`. |

**Open questions:**
1. Connection status for `capture`/`agent`: is `unknown` acceptable for the demo, or should WS6 add a presence endpoint WS2/WS3 post heartbeats to (S1/S4)?
2. `paused`: drop it from `SessionView`, or does WS7 need it (WS6 would add a `pause`/`resume` action)?
3. Work Map scope: global (`GET /api/workmap`) vs per expert session — does WS7 need `?session_id=` filtering? And is a global SSE stream needed for a Work Map page not tied to a session?
4. **`frame_id` on assets:** your geometry rule needs `asset.frame_id`; WS6 `EvidenceAsset` has no `frame_id` (it lives on `PointingEvent`). Map it in `apiSource` from the linked event, or should WS6 add `frame_id` to `EvidenceAsset` in S1?
5. `LearnerEvaluation.knowledge_revision_id` (singular) vs WS6 `knowledge_revision_ids[]` — please make it a list.
6. `GET /api/sessions/:sid/draft` returns the synthesis draft view for expert sessions and the `LearnerDraft` for newcomer sessions. Acceptable, or prefer separate paths?
7. Every WS6 record has `source` (`live|stub|fixture`); your `DataOrigin` lacks `stub` — show stub output distinctly?

### WS4 — scenarios (short)

- Learner-visible cases are read from `CASES_DIR` (default `cases/learner/<case_id>/case.json` + images; `shown_to_expert: boolean`); only `GET /api/cases/:case_id` serves them.
- Evaluator-only material goes to `EVALUATOR_DIR` (`web/.runtime/evaluator/`, gitignored, never served, never a module input).
- **Q1:** case IDs `E01–E03`, `N01–N02` (`notes/04-prototype-data-scenarios.md` §5) violate the lowercase ID rule — use `e01`…`n02` in files/APIs (display labels may stay uppercase)?
- **Q2:** how is the evaluator package delivered to the demo machine without committing it (copy step in the README)?

## 9. Decisions log (S0)

Full rationale: [`specs/001-ws6-foundation-contracts/research.md`](../specs/001-ws6-foundation-contracts/research.md) (R1–R10).

| # | Decision | Why |
|---|---|---|
| D1 | zod ^4 for runtime validation; reuse WS3/WS7 vitest | R1, R2 |
| D2 | `web/lib/contracts/expert.ts` re-exports WS3 types and wraps them in zod; WS6 additions optional (`asset_id?`, `rev?`) | R3, never fork WS3 |
| D3 | Global `rev-<time>-<rand6>` revision IDs + `revision_no` filename | R4 |
| D4 | `Confirmation { reviewed_revision_id, result }`; WS3 `ExpertConfirmation` accepted via `toConfirmation()` | R5 |
| D5 | Equal `rev` + same body = idempotent `200`; otherwise `409 stale_revision` | R6 |
| D6 | Atomic write = temp + fsync + rename; canonical JSON equality | R7, R8 |
| D7 | Stale exchange writes → `409 stale_revision` (S1 prompt said `200 ignored_stale`) | one rule for all mutable records (WS3-Q8) |
| D8 | Off-record content writes → `403 off_record` (S1 prompt said `409`) | matches the `ErrorCode → HTTP` table; S4 may switch to `202 dropped_off_record` (WS2-Q5) |
| D9 | SSE type names unified: `confirmation.stored` (S2 prompt: `knowledge.confirmed`), `evaluation.updated` (S3: `evaluation.done/stale`), `commit.stored` (S3: `draft.committed`) | one `<resource>.<verb>` scheme; clients re-fetch status anyway |
| D10 | `canCommit` codes map onto the S0 `ErrorCode` set: `knowledge_changed` → `evaluation_stale`, `blocked_by_outcome`/`already_committed` → `commit_blocked` with `details.reason` | keep the S0 union stable; reasons stay visible |
| D11 | One `Confirmation` record per reviewed revision for a multi-revision POST | data model has a single `reviewed_revision_id` |
| D12 | Codes `no_confirmed_knowledge`, `case_not_permitted`, `gone` reserved, added in S3/S4 | not needed by S0 code |
| D13 (S1) | Identical retries are answered `200` even after off-record/abort; only new content is refused | a lost ack must never turn into a client-side failure; nothing new is stored |
| D14 (S1) | Event `asset_id` is required (was "recommended") | an event without a stored asset would dangle (no-dangling-references rule) |
| D15 (S1) | Late content writes to `ended` sessions are accepted; `aborted` sessions refuse them | WS2-Q7 lean; late answers must still persist |
| D16 (S2) | Revision file = WS6 frontmatter + module frontmatter kept verbatim in one HTML comment + module body | one frontmatter block for Markdown viewers; module Markdown round-trips for WS5 `load_content` (WS5-Q1) |
| D17 (S2) | Status lives in `status.ndjson` + `current.json`, never in the immutable file | answers WS5-Q3 |
| D18 (S2) | `KnowledgeRevision` + optional `session_id`, `content_sha256`, `change_reason`; `Confirmation` + optional `session_id`, `entry_id` | same-session check, SSE routing, dedupe, WS5 `change_reason` |
| D19 (S2) | WS6 owns numbering; module numbering that disagrees fails the job; dedupe against the latest revision only | a workflow link must always point at a stored file |
| D20 (S2) | Job snapshot = event IDs, exchange revs, every entry's current revision, session confirmation IDs; verify under session → knowledge lock | prompt rule; one lock order everywhere |
| D21 (S2) | Workflow linkage = ordered `entries/<id>/rev-<n>.md` links in the module's workflow Markdown, stored as `workflow.md` frontmatter | module-agnostic (stub and WS5) |
| D22 (S2) | Draft `revision_ids` = WS5 `teach_back_reviewed` (else every linked revision) | WS3 confirms exactly what was read back |
| D23 (S2) | Module input adds `confirmations` (WS5 request); `gap_answers` not yet | corrections need it; no WS3 producer for gap answers |
| D24 (S2) | Confirmation error mapping (§5.12); idempotency plan written before the files | prompt asked 400/409; crash-safe replay |
| D25 (S2) | Optional `step_ids_reviewed` in the WS6 form, default = all reviewed entries | WS5 ties a gesture-less correction to a single reviewed entry |
| D26 (S2) | Work Map default = confirmed ∧ current ∧ WS5 `isTeachable` (fixtures allowed, labelled); broken links never exclude | prompt + WS5 eligibility; Work Map is a view, not teaching |
| D27 (S2) | `confirmation.stored` instead of the prompt's `knowledge.confirmed` | D9 naming |
| D28 (S2) | WS5 Sprint 2 merged into the S2 branch (human decision); lanes implemented sequentially | WS5 was not on `voice`; lanes share the store and lock order |
| D29 (S3) | `CASES_DIR` → `<repo>/cases/learner` if present → labelled fixture cases; strict `case.json`, trace served only by `/api/cases/:id/trace` | WS4 cases not merged yet; fixtures must say `fixture` |
| D30 (S3) | Served-path resolvers refuse `EVALUATOR_DIR` (inside or containing); grep test over routes + backend modules | prompt: no route/module may reach the answer key |
| D31 (S3) | Pinning = WS5 `selectEligible` on current revisions with WS6 status/confirmation/revocation injected; stub revisions = fixture material; flagged revisions excluded | WS5 owns eligibility; stub output is not expert knowledge |
| D32 (S3) | `POST /api/sessions/:sid/pin` re-pins; earlier evaluations → `stale` | otherwise a session whose knowledge changed is stuck forever |
| D33 (S3) | Draft history `drafts/<rev>.json`; `visual_context` assets must be stored for this session | assessment needs the initial draft; no dangling references |
| D34 (S3) | One live evaluation per `(session, draft_rev)`; failed/stale may be retried; restart → `interrupted` | prompt + no stuck pending |
| D35 (S3) | SSE keeps D9: `evaluation.updated` / `commit.stored` (prompt: `evaluation.done/stale`, `draft.committed`) | published v0 names; clients re-fetch status |
| D36 (S3) | `canCommit` codes → `details.policy_code` under the S0 codes (D10) | published v0 error union stays stable |
| D37 (S3) | `allow_with_escalation` needs `escalated: true`; unknown outcomes block | explicit learner choice; fail closed |
| D38 (S3) | `Commit` + `outcome`, `escalated`, `knowledge_revision_ids`, `idempotency_key_sha256` | audit without storing the raw key |
| D39 (S3) | Stub assessment from facts + WS5 `buildTimeline`; `practice_next: null` (schema now nullable); written once on commit or `end` | WS5 has no assessment module yet |
| D40 (S3) | Tutor: stub by default, `WS5_MODULES=real` → WS5 evaluator (merged from `worktree-ws05-sprint-3`, human decision) | deterministic tests/e2e without an API key |
| D41 (S3) | Newcomer drafts/evaluations allowed in `created`/`active`; `ended`/`aborted`/committed refuse; off-record refuses drafts | prompt + off-record = not stored |
| D42 (S4) | Off-record writes → `202 dropped_off_record` + tombstone (S1's `403 off_record` kept for learner drafts only) | prompt; a retry must not look like a failure (D8 anticipated it) |
| D43 (S4) | Off-record by label, current state, or capture time inside an off-record segment; lines cut per `at_utc` | prompt ("based on the server's segment timeline") |
| D44 (S4) | `since_utc` on record-state = retroactive purge; only inside the current on-record segment | "that last part was off the record" |
| D45 (S4) | Transient processing: "not persisted, not forwarded to modules"; on-device transient use is WS2/WS3's call | open team decision, documented |
| D46 (S4) | Cascade: event ↔ its asset ↔ events showing it; exchanges about a deleted event go too; deleting a teach-back answer revokes what it confirmed | no dangling references; WS5: words about an off-record/deleted gesture are not teachable |
| D47 (S4) | Deletion/purge revokes **and redacts** citing revisions (deletion beats immutability); revocation only revokes | a deleted quote must not survive in a revision file |
| D48 (S4) | Tombstones under `knowledge/tombstones/` (gitignored); `dropped` → 202, deleted → 410 | survive session deletion; late retries are final |
| D49 (S4) | `Session.generation` bumped before the cascade loads its graph; jobs and evaluations compare it | closes the job-persists-during-cascade race found by the e2e run |
| D50 (S4) | No automatic re-pin after revocation: evaluations go stale, the client calls `POST …/pin` | the learner should see that the knowledge changed |
| D51 (S4) | Access boundary = one shared token via `proxy.ts` (Next 16), cookie holds a SHA-256 of the token | LAN demo; documented limits |
| D52 (S4) | `failing_components` counts server/module failures only | 4xx are client mistakes, not a failed component |
| D53 (I4) | `paused` lifecycle via `pause`/`resume`: `active ⇄ paused`, `paused → end/abort`; writes still stored; voice tokens need `active` | human decision 2026-10-04 (integration plan §6 Q2); pausing is not off-record |
| D54 (I4) | `GET /api/cases` returns `LearnerCase[]`, skips unusable case files, `?for=expert\|newcomer` filters by `shown_to_expert` | WS7 expert setup needs the case list; one bad file must not hide the rest |
| D55 (I4) | Expert sessions take `case_id`, only for cases marked `shown_to_expert`; `trace_ref` is then the case trace; `case_id` and `trace_ref` are exclusive | every other case is reserved for newcomers (unseen-case rule) |
| D56 (I4) | Review marks are stored requests (`review_mark.stored`) and never change knowledge status | only the expert's spoken teach-back confirms or corrects (S2 rule) |
| D57 (I4) | `GET …/review` is one WS6-vocabulary composite (draft revisions + parents, gaps, confirmations, marks); WS7 maps it | human decision 2026-10-04 (plan §6 Q3); the adapter seam stays in WS7 |
| D58 (I2) | Wire recordings in `fixtures/ws6/wire` are re-recorded in the same commit as any contract change; the schema test fails on undeclared fields | the two sides cannot drift unnoticed |
| D59 (merge) | WS3 `ws3.v1` adopted:
- Pointing events stay `ws3.v0` (`EVENT_SCHEMA_VERSION`).
- Exchanges gain `topic_id`, `related_event_ids`, `gap_id`, `revision_id` and the kinds `teach_back`/`correction`.
- Draft steps gain `supported`, revisions `change_exchange_ids`, coverage `resolution`, plus three new timing marks.
- `RecordingSegment.trigger`: WS6 writes `session_start` for the first segment; record-state takes an optional `trigger` (default `console`); stored segments without one read as `console`.

All new fields are optional on input with WS3's defaults. | merging WS3 S2–S4 into `voice`; older producers and stored data keep parsing; the drift checks stay exact |
