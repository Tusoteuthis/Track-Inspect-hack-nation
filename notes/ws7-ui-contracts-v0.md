# WS7 UI contracts — v0, pending WS6/WS5 agreement

**Status:** proposal from WS7 Sprint 0 (3 October 2026). Nothing here is an agreed API.
**Code:** `web/lib/ui/contracts.ts` (types), `web/lib/data/source.ts` (`DataSource`), `web/lib/data/fixtureSource.ts`, `web/fixtures/ui/`.
**For:** WS6 (backend/API), WS5 (knowledge and tutor content), WS3 (expert conversation), WS2 (evidence geometry).

WS7 screens read data through one `DataSource` interface. Today a fixture implementation backs it, and every fixture view is visibly bannered "FIXTURE DATA". When WS6 ships, an `apiSource` replaces it. Any mismatch is fixed in that mapping layer, so WS6/WS5 records keep their own meaning. These types describe **what the UI renders**, not how WS6 stores it.

## 1. Views the UI renders

Field names are snake_case. Every top-level view carries `source: "live" | "fixture"`.

| View | Key fields | Supplied by |
|---|---|---|
| `SessionView` | `session_id`, `role`, `lifecycle` (not_started/active/paused/ended), `recording_state`, `connection {capture, agent, backend}`, `case_id`, `knowledge_revision_id` | WS6 (authoritative state), WS2 (capture status), WS3 (agent status) |
| `EvidenceAsset` | `asset_id`, `original_url`, `highlighted_url`, `frame_id`, `width_px`, `height_px` | WS6 storage of WS2 captures and WS4 assets |
| `EvidenceRegion` | `frame_id`, `coordinate_space: "original_frame_normalized"`, `x, y, width, height` in [0,1], `mapping_status` (resolved/ambiguous/unresolved) | WS2 (PointingEvent region) |
| `WorkMapView` / `WorkMapStep` | `revision_id`; per step `entry_id`, `revision_id`, `kind` (step/decision/guardrail/exception), `title`, `ai_summary`, `expert_quotes[{exchange_id, text}]`, `reasoning`, `guardrails[]`, `evidence[{event_id, asset, region}]`, `status`, `open_question` | WS5 content, WS3 exchanges, WS6 delivery |
| `PracticeCaseView` | `case_id`, `asset`, `visible_context[]`, `decision_options[] \| null`, `knowledge_revision_id` | WS4 learner-visible assets, WS6 delivery |
| `LearnerDraft` | `draft_id`, `draft_revision`, `decision`, `reason`, `region` | WS7 → WS6 |
| `LearnerEvaluation` | `draft_revision`, `knowledge_revision_id`, `outcome` (opaque WS5 string), `message`, `guiding_question`, `citations[]` | WS5 via WS6 |
| `AssessmentView` | `independent[]`, `assisted[]`, `unresolved[]`, `practice_next[]`, `evidence_used[]` | WS5 via WS6 |

Rules WS7 relies on:

- **Evidence geometry.** A region is drawn only when `region.frame_id === asset.frame_id` and its coordinates are a valid normalized box. Otherwise WS7 shows why, and draws no highlight.
- **Status display.** Only `status: "confirmed"` is presented as verified knowledge. `draft`, `unresolved`, `revoked` and `missing` are shown as exactly that.
- **Expert words.** `expert_quotes[].text` must be the expert's verbatim words. `ai_summary` is displayed separately as "Apprentice summary".
- **Evaluation matching.** An evaluation is only applied if its `draft_revision` and `knowledge_revision_id` match the learner's current ones. Otherwise WS7 treats it as stale.
- **No evaluator-only data.** Learner-facing views never contain evaluator-only data: expected decision, acceptable explanations, common wrong decision or scoring. WS7 has a test that fails if fixture files contain such fields.

## 2. `DataSource` methods (what WS6's API must make possible)

| Method | Returns | Needed by |
|---|---|---|
| `getSession(sessionId)` | `SessionView` | S3 expert companion |
| `getWorkMap(sessionId)` | `WorkMapView` (current revision) | S1 Work Map, review |
| `getPracticeCase(caseId)` | `PracticeCaseView` | S2 practice |
| `getAssessment(sessionId)` | `AssessmentView` | S4 summary |
| `requestOffRecord(sessionId, offRecord)` | `Ack<SessionView>` | S3 |
| `submitDraftForReview(draft)` | `Ack<LearnerEvaluation>` | S2 |
| `commitDraft(draft, evaluation)` | `Ack<{committed_at_utc}>` | S2 (WS6 enforces the review boundary server-side) |
| `subscribe(sessionId, onUpdate)` | unsubscribe fn; pushes `SourceUpdate` | S1 revisions, S3 events/acks |

`Ack<T>` = `{status: "acknowledged", value}` | `{status: "failed", error}`. The UI shows an action as done **only** after an acknowledgement. Getters reject for unknown IDs, and the screen then shows an error state.

## 3. UI states WS7 needs from WS6

Please confirm how each one is represented: a field, an event or an acknowledgement.

1. **Connection status per component** (capture device, agent, backend) as `connected / disconnected / reconnecting / unknown`. Unknown must be distinguishable from connected.
2. **Recording state with pending phases.** An off-record or on-record request is first `*_pending`, then acknowledged or failed. The acknowledgement should mean capture, audio and persistence have actually applied it.
3. **Session lifecycle**: not started, active, paused, ended (completed vs incomplete).
4. **Live updates** (push or poll) for:
   - new pointing events, including mapping status
   - new or changed knowledge revisions
   - confirmation results tied to a revision
   - evaluation results
   - commit results
   - off-record, stop and deletion acknowledgements
5. **Revision identity everywhere.** Each Work Map, evaluation, confirmation and commit names the exact revision it applies to.
6. **Learner review boundary.** Draft revision numbering, an evaluation pending state, a stale-evaluation rejection on commit, and a double-submit-safe commit (idempotency key or similar).
7. **Failure and reconnect.** Error payloads that can be shown to users, and resync after reconnect (the latest state per resource).
8. **Evidence access.** Image URLs the browser can load, with the frame ID and pixel dimensions.

## 4. Content WS7 needs from WS5

- For each Work Map step:
  - `kind`
  - a short `title`
  - verbatim quotes with `exchange_id`
  - a separate `ai_summary`
  - reasoning, guardrails and status
  - at least one evidence reference: event, asset and region
  - an `open_question` when unresolved
- The **evaluation outcome values** and which of them count as "review complete, save allowed". WS7 maps these in one adapter and doesn't judge correctness itself.
- The assessment split into independent, assisted and unresolved, with citations to entry and revision.

## 5. Open questions

- **WS6:** event transport (SSE, WebSocket or polling) and its reconnect semantics. Which IDs are globally unique?
- **WS3:** will `web/lib/expert/contracts.ts` (`PointingEvent`, `ExpertExchange`, `DraftRevision`, `ExpertConfirmation`) be the source for the Work Map, or will WS5 records be? Either way, WS7 maps from it rather than redefining it.
- **WS4/WS5:** the learner decision format: free text, choice list (`decision_options`) or region marking.
- **WS2:** will captures always have a stable `frame_id` and the original pixel dimensions?
