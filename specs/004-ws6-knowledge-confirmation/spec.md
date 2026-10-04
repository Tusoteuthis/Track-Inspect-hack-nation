# Feature Specification: WS6 Knowledge Revisions & Confirmation (Sprint 2)

**Feature Branch**: `004-ws6-knowledge-confirmation`

**Created**: 2026-10-04

**Status**: Draft

**Input**: WS6 Sprint 2 prompt (`notes/ws6-sprints/sprint-2-knowledge-confirmation.md`), brief flow steps 4–5: invoke WS5 synthesis on a session's events and exchanges → persist draft knowledge revisions as Markdown with linked images → route drafts and gaps to WS3 for the debrief → persist the expert's confirmation against the exact revision reviewed → expose the Work Map to WS7. Where the prompt and `notes/ws6-api-v0.md` (route map, decisions D9/D11) differ, the route map wins. The WS5 Sprint 2 modules (`web/lib/knowledge/`) were merged into this branch at the human's request.

## User Scenarios & Testing *(mandatory)*

The "users" are partner workstreams: WS3 (voice agent: triggers synthesis, reads drafts and gaps, posts confirmations), WS5 (provides synthesis, status and eligibility logic), WS7 (renders drafts and the Work Map). The human integrator gates the sprint.

### User Story 1 - Synthesis turns a captured session into draft knowledge (Priority: P1)

After the live phase, WS3 asks the backend to synthesize a session. The backend runs the hosted WS5 synthesis module (or a clearly marked stub) in the background, persists each draft as an immutable Markdown revision with relative image links, regenerates the workflow overview, and stores the gaps and teach-back text for the debrief.

**Why this priority**: Without drafts there is nothing to confirm or show.

**Independent Test**: Replay a capture, request synthesis, poll the job until done, open the revision files and the workflow file.

**Acceptance Scenarios**:

1. **Given** a session with stored events and exchanges, **When** synthesis is requested, **Then** a job ID is returned immediately and the job ends `done`, creating revision 1 of each new entry with valid frontmatter and image links that resolve to stored image files.
2. **Given** a job already queued or running for the session, **When** synthesis is requested again, **Then** the same job ID is returned and no second job starts.
3. **Given** unchanged inputs, **When** synthesis runs again, **Then** no new revision is written.
4. **Given** a running job, **When** one of its input exchanges is updated or an input record disappears before it finishes, **Then** the job ends `discarded`, persists nothing and a `synthesis.discarded` update is emitted.
5. **Given** the stub module is active, **When** synthesis runs, **Then** the draft is headed "STUB SYNTHESIS — not expert knowledge", carries `source: "stub"`, and contains only the exchange IDs and the verbatim answer lines.
6. **Given** a finished job, **When** WS3 reads the session's gaps and draft, **Then** it gets the gaps, the teach-back text and the exact revision IDs the teach-back covers.

---

### User Story 2 - The expert's confirmation binds to the exact reviewed revision (Priority: P1)

WS3 posts the expert's teach-back response: which revisions were reviewed, whether they were confirmed, corrected or left unresolved, and which on-record exchange holds the expert's response. A confirmation can never verify content that changed after the review.

**Why this priority**: Revision integrity is the point of the sprint.

**Independent Test**: Confirm the current revision; supersede a revision and confirm the old one; confirm with a missing/off-record/foreign exchange; replay with the same key.

**Acceptance Scenarios**:

1. **Given** a current draft revision and an on-record answered response exchange of the same session, **When** it is confirmed, **Then** a confirmation record is stored, the revision's status becomes `confirmed` (through a status transition record; the revision file is unchanged) and a `confirmation.stored` update is emitted.
2. **Given** a revision superseded after the expert reviewed it, **When** a confirmation names it, **Then** the request is refused with `409 stale_revision` listing the current revision IDs, and no status changes.
3. **Given** a response exchange that does not exist, belongs to another session, is off-record, or has no answer, **When** a confirmation names it, **Then** the request is refused and nothing is stored.
4. **Given** a stored confirmation, **When** the same request (same idempotency key) is replayed, **Then** the same confirmation records are returned and nothing new is stored.
5. **Given** a `corrected` result, **When** stored, **Then** the status follows WS5's transition rule and the next synthesis run (with the stored confirmations as input) produces revision n+1 whose parent is the reviewed revision.
6. **Given** an `unresolved` result, **When** stored, **Then** the revision's status becomes `unresolved`.

---

### User Story 3 - The Work Map shows confirmed knowledge with resolved evidence (Priority: P2)

WS7 reads the Work Map: the workflow steps with their entry, revision and status, the screen moments (image URLs and region) and the expert's verbatim words with the question asked.

**Why this priority**: It is the visible proof that every step links to a screen moment and the expert's words.

**Independent Test**: After confirmation, GET the Work Map; fetch every image URL; delete an asset file and check the step reports a broken link.

**Acceptance Scenarios**:

1. **Given** a confirmed current revision, **When** the Work Map is read, **Then** its step lists each evidence event with an original and highlighted image URL that return images, the region, and each supporting exchange with its question and verbatim answer lines.
2. **Given** a step whose asset, event, exchange or revision is missing, **When** the Work Map is read, **Then** the step is still returned with `broken_links` naming each missing link.
3. **Given** draft and unresolved revisions, **When** the default Work Map is read, **Then** they are left out (listed in `excluded` with the reason); **When** read with `include=draft`, **Then** they appear with their status.

### Edge Cases

- A synthesis request for an unknown, aborted or newcomer session is refused.
- The module throws → the job ends `failed` with an error code, nothing is persisted, `synthesis.failed` is emitted; no expert content appears in the job record or diagnostics.
- Two sessions synthesize the same entry concurrently → the store lock serializes them; the later job sees a changed prior revision and is discarded.
- A module returns a revision number that does not follow the stored latest → the job fails (WS6 owns numbering), nothing persisted.
- A revision with no session (e.g. a fixture entry) → the Work Map reports its events/exchanges as broken links.
- A confirmation that lists revisions from two different sessions → refused (`validation_failed`).
- A revoked revision cannot be confirmed (`invalid_transition`, WS5 rule).
- A replayed idempotency key with a different body → `conflict_immutable`.
- The server restarts during a job → the job record is marked `failed` (`interrupted`) on the next request for that session.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The backend MUST host the synthesis module behind a typed interface and select the implementation from `WS5_MODULES=real|stub` (default `real` when the WS5 module is importable). `/api/health.modules` MUST report the active implementation.
- **FR-002**: The stub MUST be obviously fake: heading "STUB SYNTHESIS — not expert knowledge", `produced_by.source = "stub"`, only exchange IDs, verbatim answer lines and evidence images; no interpretation.
- **FR-003**: Synthesis MUST run as an in-process job (`queued | running | done | failed | discarded`) persisted under the runtime directory, with at most one queued/running job per session.
- **FR-004**: A job MUST snapshot its input revisions at start (events, exchange revs, prior revisions of touched entries) and persist only if none changed or disappeared; otherwise it ends `discarded`.
- **FR-005**: Each draft MUST be written as an immutable `knowledge/entries/<entry_id>/rev-<n>.md` whose frontmatter is a valid `KnowledgeRevision` and whose body is the module's Markdown; image links MUST be relative paths into `knowledge/images/`. `current.json` MUST be updated only after the revision file is written, under the knowledge lock.
- **FR-006**: A module output whose content equals the entry's latest revision (by sha256) MUST NOT create a revision. Revising an existing entry MUST create `rev-(n+1)` with `parent_revision_id` = the previous current revision.
- **FR-007**: `knowledge/workflow.md` MUST be regenerated from the module output and record which revision IDs it links.
- **FR-008**: Gaps MUST be stored per session and readable; the draft view MUST list the reviewed revision IDs and the teach-back text. `draft.updated` and `gaps.updated` MUST be emitted.
- **FR-009**: Entries, current revisions and individual revisions (frontmatter + Markdown) MUST be readable by ID.
- **FR-010**: A confirmation MUST be rejected with `409 stale_revision` (listing current IDs, not overridable) if any reviewed revision is not its entry's current revision at the moment of storing (checked under the knowledge lock).
- **FR-011**: A confirmation MUST name an existing, on-record, answered exchange of the same session as the reviewed revisions; otherwise it is rejected and nothing is stored.
- **FR-012**: Status changes MUST follow WS5's `nextStatus`; they are stored as transition records, never by editing a revision file. Replaying an idempotency key MUST return the same confirmations.
- **FR-013**: The Work Map MUST derive steps from the current workflow linkage and resolve every link server-side; unresolved links MUST be reported in `broken_links`, never dropped. By default only confirmed, current content that WS5 eligibility accepts is shown; `?include=draft` shows drafts and unresolved entries with their status.
- **FR-014**: All live updates MUST carry IDs only; diagnostics MUST carry IDs, timings and outcomes only.

### Key Entities

- **Job**: a synthesis run for one session: status, module, input snapshot, created revision IDs, error code or discard reason.
- **Knowledge revision**: immutable Markdown file; frontmatter `KnowledgeRevision` (+ originating `session_id`, `content_sha256`, `change_reason`).
- **Knowledge entry**: `current.json` pointer (current revision, status, rev).
- **Status transition**: append-only record of a revision's status change and its cause (confirmation ID).
- **Session draft**: per-session view: reviewed revision IDs, teach-back text, flagged revisions, producing job.
- **Gaps**: per-session WS5 gap list with producing module.
- **Confirmation**: immutable, one per reviewed revision, bound to an exchange and an idempotency key.
- **Work Map view**: steps with resolved evidence, exchanges, status and broken links.

## Success Criteria *(mandatory)*

- **SC-001**: 100% of acceptance tests listed in the sprint prompt pass, together with the full existing test suite and the type check.
- **SC-002**: A full live run (replay capture → synthesis → confirm → Work Map) completes on the dev server, and every image URL in the Work Map returns an image.
- **SC-003**: Zero confirmations can be stored against a revision that is not current at storage time (verified by test).
- **SC-004**: Re-running synthesis on unchanged inputs creates zero new files under `knowledge/entries/`.
- **SC-005**: No job record, live update or diagnostics line contains expert words.

## Assumptions

- The WS5 Sprint 2 module (`createWs6SynthesisModule`) is the real implementation; its revision numbers follow WS6's (`rev-<n>` ↔ `revision_no`).
- Workflow linkage is the ordered set of `entries/<entry_id>/rev-<n>.md` links in the module's workflow Markdown; the workflow reflects the latest synthesis run.
- The Work Map shows fixture-sourced content labelled with its source (it is a view, not teaching); teaching eligibility for newcomers (S3) stays strict.
- Revocation, deletion cascade and off-record job discard are Sprint 4; newcomer flow is Sprint 3.
