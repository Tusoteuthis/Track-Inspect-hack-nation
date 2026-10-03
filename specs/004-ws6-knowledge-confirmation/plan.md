# Implementation Plan: WS6 Knowledge Revisions & Confirmation (Sprint 2)

**Branch**: `004-ws6-knowledge-confirmation` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

## Summary

Host WS5's synthesis module (merged from `worktree-ws05-sprint-2`) behind `web/lib/backend/modules.ts` with a clearly marked stub; run it as an in-process job with an input-rev snapshot; persist drafts as immutable Markdown revisions; store gaps, teach-back and workflow linkage; bind confirmations to the exact current revision under a knowledge lock; serve a Work Map with every link resolved server-side.

## Technical Context

TypeScript strict, Next.js 16 route handlers (`runtime = "nodejs"`), zod 4, vitest 4. Storage: local filesystem via `store.ts` (atomic temp+fsync+rename). Locks: in-memory `withLock`. Single process (constitution W8). No new dependencies.

## Constitution Check

- I/II (expert is source, verbatim): the stub emits only exchange IDs and verbatim answer lines; the real module is WS5's. The Work Map returns answer lines verbatim. ✅
- III (evidence linkage, confirmation binds exact revision, silence ≠ confirmation): FR-010/011. ✅
- V (fixtures labelled): `produced_by.source` and each Work Map step's `source`. ✅
- VI (off-record): inputs are only stored (on-record) records; S4 adds the retroactive purge. ✅
- W-principles (thin routes, IDs-only bus/diag, single process): ✅

## Design decisions (numbered after S1's D15)

- **D16 Revision file layout.** `rev-<n>.md` = WS6 frontmatter (`key: <JSON>` per line, the WS5 convention) + the module Markdown. If the module Markdown starts with its own frontmatter (WS5 does), that block is kept verbatim in one HTML comment `<!-- ws6:module-frontmatter "<json string>" -->` so a Markdown viewer renders cleanly and the module's Markdown is reconstructed byte-for-byte for `load_content` and for reads. `content_sha256` = sha256 of the module Markdown.
- **D17 Status is not in the immutable file.** Frontmatter `status` is the status at creation (`draft`). Later changes are appended to `entries/<id>/status.ndjson` (`{revision_id, from, to, at_utc, confirmation_id}`); a revision's status = last transition, else frontmatter. `current.json.status` mirrors the current revision. (Answers WS5-Q3 / WS5 §9 WS6-Q3.)
- **D18 KnowledgeRevision gains optional `session_id`, `content_sha256`, `change_reason`.** `session_id` is the originating expert session: confirmations check "same session" against it and knowledge bus events go to its stream.
- **D19 WS6 owns numbering.** `revision_no` = latest + 1; a module-provided `revision_no` or `parent_revision_id` that disagrees fails the job (`revision_conflict`) before anything is written. Dedupe compares against the entry's **latest** revision's sha256 (reverting to an older content still creates a new revision, so the workflow link stays valid).
- **D20 Snapshot.** At start (under the session lock): event IDs, exchange revs, every entry's current revision ID, the session's confirmation IDs. At finish, under session lock → knowledge lock (fixed order everywhere), the snapshot is re-read; any change/deletion → `discarded` (`details: input_changed`). New records added meanwhile don't discard (they're picked up by the next run).
- **D21 Workflow linkage** = ordered `entries/<entry_id>/rev-<n>.md` links found in the module's `workflow_markdown`, mapped to WS6 revision IDs and written as frontmatter (`links`, `produced_by`, `session_id`, `job_id`, `generated_at_utc`) of `knowledge/workflow.md`. A link to an unknown revision is kept with `revision_id: null` and reported by the Work Map.
- **D22 Draft view** `revision_ids` = the module's `teach_back_reviewed` (mapped to WS6 IDs) when given, else every linked revision. These are exactly what WS3 must send as `reviewed_revision_ids`.
- **D23 Module input extensions** (requested by WS5): `confirmations` (the session's stored confirmations in WS3 `ExpertConfirmation` shape, `revision_id` = WS6 ID) are passed; `gap_answers` is not yet (no WS3 producer).
- **D24 Confirmation errors.** Unknown revision → `404 not_found`; not current → `409 stale_revision` (`details.stale_revision_ids`, `details.current_revision_ids`); exchange missing / other session / off-record / no answer lines / revisions from several or no sessions → `400 validation_failed` with `details.reason`; WS5 `nextStatus` refusal → `409 invalid_transition`; key replay with a different body → `409 conflict_immutable`. The idempotency record (full planned confirmations) is written **before** the confirmation files, so a crash mid-write is completed by the replay instead of duplicating.
- **D25 `step_ids_reviewed`.** Optional in the WS6 form; default = entry IDs of all reviewed revisions (WS5 ties a gesture-less correction to a single reviewed entry, otherwise reports a `conflict` gap — WS3 should send the one corrected step).
- **D26 Work Map filter.** Default: status `confirmed` **and** current **and**, for WS5-format revisions, `isTeachable` (with injected confirmation evidence; `allow_fixture: true` because the Work Map is a labelled view, not teaching). `?include=draft`: everything except revoked (WS5 rule). WS5's `buildWorkMap` step is attached as `content` (expert quotes, tagged synthesis, guardrails) when the revision is WS5-format; its `broken_links` are merged.
- **D27 SSE names** per D9: `confirmation.stored` (prompt: `knowledge.confirmed`).
- **D28 Lanes not parallelized.** Lanes B → A → C share the store and lock order; one implementer did them sequentially in this worktree (no nested lane worktrees).

## Project Structure

```
web/lib/contracts/knowledge.ts     + optional revision fields, StatusTransition
web/lib/contracts/synthesis.ts     Job, Gap, GapsView, SessionDraftView, ConfirmationRequest(s)
web/lib/contracts/workmap.ts       WorkMapView
web/lib/backend/knowledge.ts       revision store, status log, entry reads, workflow linkage, knowledge lock
web/lib/backend/modules.ts         SynthesisModule interface, registry (WS5_MODULES), real adapter wiring
web/lib/backend/synthesis-stub.ts  stub module
web/lib/backend/jobs.ts            job records + one-active-per-session
web/lib/backend/synthesis.ts       start/run job: snapshot, invoke, verify, persist, gaps/draft
web/lib/backend/confirmations.ts   confirmation POST logic
web/lib/backend/workmap.ts         Work Map view
web/app/api/sessions/[sid]/synthesis|gaps|draft/route.ts
web/app/api/jobs/[job_id]/route.ts
web/app/api/knowledge/entries/route.ts, [id]/route.ts, [id]/revisions/[rev]/route.ts
web/app/api/knowledge/confirmations/route.ts
web/app/api/workmap/route.ts
```
