# WS6 API v0 — pending agreement

**Schema version:** `ws6.v0` · **Owner:** WS6 (shared backend) · **Date:** 2026-10-04 · **Sprint:** S0 (foundation & contracts)
**Code:** contracts `web/lib/contracts/` (zod; `SCHEMA_VERSION = "ws6.v0"`), server lib `web/lib/backend/`, routes `web/app/api/`, fixtures `web/fixtures/ws6/`.
**Record fields:** [`specs/001-ws6-foundation-contracts/data-model.md`](../specs/001-ws6-foundation-contracts/data-model.md). This doc names schemas; it does not repeat every field.
**Dev server:** `npm run dev -- -p 3006` (add `-H 0.0.0.0` for LAN/iPhone).

## 1. Status and feedback

- **v0, pending agreement.** Nothing here is final except `GET /api/health` (the only route implemented in S0). Every other route is a promise with its owning sprint (S1–S4).
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
- **Off-record = not stored.** While the session is `off_record`, content writes (assets, events, exchanges, learner drafts) are refused with `403 off_record` and nothing is written (S1). S4 extends this to jobs/outputs, retroactive purge and tombstones (see §8 WS2-Q5).
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
| `evaluation_stale` | 409 | Evaluation not bound to the current `draft_rev` and pinned knowledge (`details.reason`: `draft_changed` \| `knowledge_changed`) |
| `commit_blocked` | 409 | Outcome policy blocks (`details.reason: "blocked_by_outcome"`, `details.outcome`) or already committed with another key (`details.reason: "already_committed"`) |
| `invalid_transition` | 409 | Illegal lifecycle transition, or write to an ended/committed session |
| `internal` | 500 | Unexpected error; message never leaks internals |

Reserved, added to `ErrorCode` when their sprint lands: `no_confirmed_knowledge` 409 (S3, newcomer session with nothing eligible), `case_not_permitted` 409 (S3, case shown to the expert), `gone` 410 (S4, late retry of a deleted ID).

### Live updates (SSE)

- `GET /api/sessions/:sid/stream` → `text/event-stream`. Each message: `id: <seq>`, `event: <type>`, `data: <BusEvent JSON>`. Heartbeat comment every ~15 s.
- `seq` is per-session, monotonic, persisted in `knowledge/sessions/<sid>/bus.ndjson` (append first, then publish).
- **Reconnect:** send `Last-Event-ID: <seq>` (or `?after=<seq>`) → the server replays exactly the missed events in order, then continues live. Without either, the stream starts live (clients first GET the current state, then subscribe).
- **Payload = `BusEvent`** `{seq, type, session_id, ids, at_utc}` — strict, IDs only, never content. Clients re-fetch the resource by ID. Numeric revs in `ids` are decimal strings (e.g. `"draft_rev": "3"`).

| BusEvent `type` | `ids` | Emitted by | Sprint |
|---|---|---|---|
| `session.updated` | `session_id` | lifecycle change, pinning | S1 |
| `record_state.changed` | `segment_id` | record-state route (the **acknowledged** state) | S1 |
| `asset.stored` | `asset_id` | asset PUT (first store) | S1 |
| `event.stored` | `event_id`, `asset_id?` | event PUT (first store) | S1 |
| `exchange.updated` | `exchange_id`, `event_id?` | exchange PUT (create or higher rev) | S1 |
| `synthesis.started` / `.done` / `.failed` / `.discarded` | `job_id`, `revision_ids?` | synthesis job | S2 |
| `revision.created` | `entry_id`, `revision_id` | revision store | S2 |
| `draft.updated` | expert: `revision_ids`; newcomer: `draft_rev` | synthesis draft (S2) / learner draft PUT (S3) | S2/S3 |
| `gaps.updated` | — (re-fetch gaps) | synthesis | S2 |
| `confirmation.stored` | `confirmation_ids`, `revision_ids` | confirmation POST | S2 |
| `evaluation.updated` | `evaluation_id` | pending → done \| failed \| stale | S3 |
| `commit.stored` | `commit_id`, `evaluation_id` | commit POST | S3 |
| `assessment.stored` | — (re-fetch) | assessment module | S3 |
| `record.deleted` | one of `asset_id`/`event_id`/`exchange_id` | deletion cascade | S4 |
| `entry.revoked` | `entry_id`, `revision_id` | revoke route; also emitted on newcomer sessions that pinned it | S4 |

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
    draft.json                   LearnerDraft (mutable, draft_rev)
    evaluations/<evaluation_id>.json     Evaluation
    commit.json                  Commit (immutable)
  assessments/<session_id>.md (+ .json)  Assessment
web/.runtime/
  diag/<yyyy-mm-dd>.ndjson       IDs + timings only
  jobs/<job_id>.json             job state (S2)
  evaluator/                     WS4 evaluator-only material — NEVER served
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
| GET | `/api/diagnostics?session_id=` | — | `Diagnostics` (ID chain event → exchanges → revisions → confirmation → newcomer session → evaluation → commit, timings, last error per component; no content) | safe | — | — | S4 |
| GET | `/api/access?token=` | — | sets same-site cookie for browsers when `BACKEND_ACCESS_TOKEN` is set | safe | `unauthorized` | — | S4 |

`modules` is filled from S2 (`{ synthesis: "ws5-synthesis@x" | "stub", tutor: …, … }`); S4 adds per-component status and `elevenlabs_configured: boolean`.

### 5.2 Session lifecycle & record state

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| POST | `/api/sessions` | `{ role: "expert", source?, trace_ref? }` or `{ role: "newcomer", case_id?, source? }`; header `Idempotency-Key?`; newcomer `?allow_fixture_knowledge=1` | `201 Session` (`200` on key replay) | key | `no_confirmed_knowledge`, `case_not_permitted` (newcomer, S3) | — | S1 (newcomer S3) |
| GET | `/api/sessions/:sid` | — | `Session` | safe | — | — | S1 |
| POST | `/api/sessions/:sid/lifecycle` | `{ action: "start" \| "end" \| "abort", rev }` | `200 Session` | rev; same action already applied → `200` | `stale_revision`, `invalid_transition` | `session.updated` | S1 |
| POST | `/api/sessions/:sid/record-state` | `{ state: "on_record" \| "off_record" }` | `200 Session` (new `RecordingSegment` appended; same state → no-op `200`) | idempotent by state | `invalid_transition` (ended session) | `record_state.changed` | S1 |

Lifecycle: `created → active → ended`; `created | active → aborted`; `ended`, `aborted` terminal.

### 5.3 Assets

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| PUT | `/api/sessions/:sid/assets/:aid` | `multipart/form-data`: `meta` (JSON, EvidenceAsset input: `kind`, `coordinate_space`, `captured_at_utc`, `record_state`, `source`, `event_id?`, declared `width_px`/`height_px`), `original` (png/jpeg, required), `highlighted` (optional); size cap ~15 MB | `201 EvidenceAsset` (server fills `path`, `mime`, `sha256`, `status: "stored"`) | PUT-id by content hash: same bytes → `200`; different → `409` | `conflict_immutable`, `off_record`, `invalid_transition` | `asset.stored` | S1 |
| GET | `/api/assets/:aid` | — | `EvidenceAsset` | safe | — (deleted → 404) | — | S1 |
| GET | `/api/assets/:aid/original` | — | image bytes, correct `Content-Type`, `Cache-Control: private` | safe | — | — | S1 |
| GET | `/api/assets/:aid/highlighted` | — | image bytes (404 if none) | safe | — | — | S1 |

Asset reads resolve only under `knowledge/images/` (and S3 case assets under `CASES_DIR`); `RUNTIME_DIR`/`EVALUATOR_DIR` are rejected by the path resolver.

### 5.4 Events & exchanges

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| PUT | `/api/sessions/:sid/events/:eid` | `PointingEvent` (`session_id`/`event_id` must match the path; `asset_id` recommended) | `201`/`200 EventAck { event_id, status: "stored", seq }` (`seq` of its `event.stored`, stable on retry) | PUT-id (immutable) | `conflict_immutable`, `asset_not_available`, `off_record`, `invalid_transition` | `event.stored` | S1 |
| GET | `/api/sessions/:sid/events` | — | `PointingEvent[]` ordered by `captured_at_utc`, then arrival | safe | — | — | S1 |
| GET | `/api/sessions/:sid/events/:eid` | — | `PointingEvent` (image refs rewritten, §7) | safe | — | — | S1 |
| PUT | `/api/sessions/:sid/exchanges/:xid` | `ExpertExchange` + `rev` (full record each time; answer lines grow) | `201`/`200 ExpertExchange` | PUT-id mutable `rev`; `event_id` immutable after first write | `stale_revision`, `conflict_immutable` (event_id changed), `not_found` (event_id not stored), `off_record` | `exchange.updated` | S1 |
| GET | `/api/sessions/:sid/exchanges` | — | `ExpertExchange[]` | safe | — | — | S1 |
| GET | `/api/sessions/:sid/exchanges/:xid` | — | `ExpertExchange` | safe | — | — | S1 |

### 5.5 Live stream

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/sessions/:sid/stream` | header `Last-Event-ID?` or `?after=<seq>` | `text/event-stream` of `BusEvent` | replay by seq | — | (all) | S1 |

### 5.6 Synthesis, draft & gaps (jobs)

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| POST | `/api/sessions/:sid/synthesis` | `{}` | `202 { job_id }` (a running job's `job_id` if one exists) | one running job per session | `invalid_transition` | `synthesis.started/done/failed/discarded`, `revision.created`, `draft.updated`, `gaps.updated` | S2 |
| GET | `/api/jobs/:job_id` | — | `Job { job_id, session_id, status: queued\|running\|done\|failed\|discarded, input_revs, … }` | safe | — | — | S2 |
| GET | `/api/sessions/:sid/gaps` | — | `Gap[]` (WS5 shape, stored as `gaps.json`) | safe | — | — | S2 |
| GET | `/api/sessions/:sid/draft` | — | expert session: `SessionDraftView { revision_ids, teach_back }`; newcomer session: `LearnerDraft` (5.8) | safe | — | — | S2 / S3 |

Jobs snapshot their input revs at start and persist only if no input changed meanwhile, else `discarded` (S4 adds generation tokens).

### 5.7 Knowledge entries/revisions, confirmations, Work Map

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/knowledge/entries` | — | `KnowledgeEntry[]` (current revision + status per entry) | safe | — | — | S2 |
| GET | `/api/knowledge/entries/:id` | — | `KnowledgeEntry` | safe | — | — | S2 |
| GET | `/api/knowledge/entries/:id/revisions/:revision_id` | — | `{ revision: KnowledgeRevision, markdown: string }` | safe | — | — | S2 |
| POST | `/api/knowledge/confirmations` | WS6 form `{ reviewed_revision_ids: Id[], result: "confirmed"\|"corrected"\|"unresolved", expert_response_exchange_id, idempotency_key }` **or** a WS3 `ExpertConfirmation` (producer-owned `confirmation_id`, mapped by `toConfirmation`) | `201 { confirmations: Confirmation[] }` — one record per reviewed revision; replay → `200` same records | key / confirmation_id | `stale_revision` (`details.current_revision_ids`; never overridable), `not_found`/`validation_failed` (exchange missing, other session, off-record) | `confirmation.stored`, `session.updated` | S2 |
| GET | `/api/workmap[?include=draft]` | — | `WorkMapView`: steps with entry/revision/status, per evidence `{asset_id, original_url, highlighted_url, region}`, per exchange `{exchange_id, question, answer_lines}`, `broken_links[]`; default only `confirmed` | safe | — | — | S2 |

`result` effects (via WS5 `nextStatus`): `confirmed` → entry status `confirmed`; `corrected` → stays `draft`, a later synthesis run produces `rev-(n+1)` with `parent_revision_id` = the reviewed revision (this **is** the correction path); `unresolved` → `unresolved`.

### 5.8 Newcomer: case view, session, learner draft, evaluation, commit, assessment

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/cases/:case_id` | — | `LearnerCase` (learner-visible view only; never evaluator fields) | safe | — | — | S3 |
| POST | `/api/sessions` (role newcomer) | see 5.2 | `Session` with `case_id`, `pinned_knowledge` | key | `no_confirmed_knowledge`, `case_not_permitted` | — | S3 |
| PUT | `/api/sessions/:sid/draft` | `{ base_draft_rev, decision, reason, visual_context }` (`base_draft_rev: 0` for the first) | `200`/`201 LearnerDraft` (server sets `draft_rev = base + 1`) | rev (retry with same base + same body → `200`) | `stale_revision`, `invalid_transition` (committed/ended), `off_record` | `draft.updated`, `evaluation.updated` (earlier evals → `stale`) | S3 |
| POST | `/api/sessions/:sid/evaluations` | `{ draft_rev }` | `202 Evaluation` (`status: "pending"`, `knowledge_revision_ids` = pinned); same `draft_rev` while one exists → `200` existing | one per (session, draft_rev) | `stale_revision` | `evaluation.updated` | S3 |
| GET | `/api/sessions/:sid/evaluations/:evaluation_id` | — | `Evaluation` | safe | — | — | S3 |
| POST | `/api/sessions/:sid/commit` | `{ draft_rev, evaluation_id, escalated?: boolean, idempotency_key }` | `201 Commit` (replay with same key → `200`) | key, under session lock | `evaluation_required`, `evaluation_pending`, `evaluation_stale`, `commit_blocked`, `invalid_transition` | `commit.stored`, `assessment.stored` | S3 |
| GET | `/api/sessions/:sid/assessment` | — | `Assessment` | safe | — | — | S3 |

### 5.9 Correction, revocation & deletion

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| POST | `/api/knowledge/confirmations` with `result: "corrected"` | see 5.7 | Confirmation; new `KnowledgeRevision` follows from synthesis | key | as 5.7 | as 5.7 | S2 |
| POST | `/api/knowledge/entries/:id/revoke` | `{ reason }` | `200 KnowledgeEntry` (`status: "revoked"`); dependent evaluations → `stale` | idempotent (already revoked → `200`) | — | `entry.revoked`, `evaluation.updated` | S4 |
| DELETE | `/api/sessions/:sid/events/:eid` | — | `200 { deleted: { event_ids, asset_ids, … } }` (cascade) | idempotent; late re-PUT → `410 gone` | — | `record.deleted` (+ `entry.revoked` for revisions citing it) | S4 |
| DELETE | `/api/sessions/:sid/exchanges/:xid` | — | `200` cascade summary | idempotent | — | `record.deleted` | S4 |
| DELETE | `/api/assets/:aid` | — | `200` cascade summary | idempotent | — | `record.deleted` | S4 |
| DELETE | `/api/sessions/:sid` | — | `200` cascade summary (whole session) | idempotent | — | `record.deleted` | S4 |

Cascade order (pure function over stored links): event → assets; exchange → revisions citing it → workflow steps → newcomer sessions pinning them → evaluations (→ `stale`). Tombstones `{ id, deleted_at_utc, reason }` keep late retries from recreating data.

### 5.10 Provider tokens

| Method | Path | Request | Response | Idem. | Errors | SSE | S |
|---|---|---|---|---|---|---|---|
| GET | `/api/conversation-token?flow=expert\|tutor[&session_id=]` | — | existing response (short-lived ElevenLabs token); with `session_id`: session must exist and be `active`, and the session id is echoed for WS3 to pass as a dynamic variable. API key never returned. | safe | `not_found`, `invalid_transition` (session not active) | — | exists; `session_id` S1 |

## 6. Commit rule (enforced S3; policy table pending WS5)

`POST /api/sessions/:sid/commit` succeeds only if, re-read from disk under the session lock:

| Check (in order) | Failure |
|---|---|
| Session is newcomer, not ended, not already committed with a different key | `invalid_transition` / `commit_blocked` (`already_committed`) |
| Same `idempotency_key` as an existing commit | `200` + that commit (double submit is idempotent; concurrent submits → exactly one commit) |
| An evaluation exists for the current `draft_rev` | `evaluation_required` |
| It is not `pending` | `evaluation_pending` |
| It is bound to the current `draft_rev` **and** the session's pinned knowledge revisions are still current/non-revoked, `status: "done"` | `evaluation_stale` (`reason: draft_changed \| knowledge_changed`) |
| Its `outcome` is permitted by the policy | `commit_blocked` (`blocked_by_outcome`) |

Policy (`web/lib/backend/outcome-policy.json`, **default pending WS5 agreement**): `ok → allow`, `intervene → block`, `uncertain → allow_with_escalation` (commit records `escalated: true`). After `intervene` the learner must edit the draft (new `draft_rev`) and get a new evaluation. `failed` evaluations never permit a commit. WS6 enforces the policy; WS5 defines outcomes.

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
| `getSession(sid)` | `GET /api/sessions/:sid` | `lifecycle`: `created → not_started`, `active → active`, `ended → ended` (completed), `aborted → ended` (incomplete); `record_state → recording_state`; `pinned_knowledge[0].revision_id → knowledge_revision_id` (it is a list) |
| `getWorkMap(sid)` | `GET /api/workmap` (+ `?include=draft`) | Work Map is global, not per session (WS7-Q3) |
| `getPracticeCase(case_id)` | `GET /api/cases/:case_id` + `GET /api/assets/:aid` | learner view only |
| `getAssessment(sid)` | `GET /api/sessions/:sid/assessment` | `independent/assisted/unresolved` from `content.decisions[].outcome_class` (WS5) |
| `requestOffRecord(sid, b)` | `POST /api/sessions/:sid/record-state` | ack = `200 Session` |
| `submitDraftForReview(draft)` | `PUT /api/sessions/:sid/draft` then `POST /api/sessions/:sid/evaluations` | evaluation completes asynchronously → `evaluation.updated` → `GET …/evaluations/:id`; `draft_id → session_id`, `draft_revision → draft_rev`, `region → visual_context[0].region` |
| `commitDraft(draft, eval)` | `POST /api/sessions/:sid/commit` | send a stable `idempotency_key` per click-intent; `committed_at_utc ← Commit.at_utc` |
| `subscribe(sid, cb)` | `GET /api/sessions/:sid/stream` (EventSource) | `BusEvent` → re-fetch by ID → `SourceUpdate` |

**Answers to `notes/ws7-ui-contracts-v0.md` §3:**

| # | UI state | WS6 v0 answer |
|---|---|---|
| 1 | Connection per component | `backend`: derived by the client from the EventSource state (open → connected, error/retrying → reconnecting, closed → disconnected). `capture` and `agent`: **no authoritative signal in v0 → show `unknown`** (WS7-Q1). |
| 2 | Recording state with pending | Client shows `*_pending` from the POST until the `200 Session` response or `record_state.changed`. The ack means **WS6 persistence** applied it (content writes refused). Whether capture/audio stopped is WS2/WS3's responsibility and is not vouched for by WS6. |
| 3 | Lifecycle | `created/active/ended/aborted` (mapping above). **No `paused`** in v0 (WS7-Q2). |
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
