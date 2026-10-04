# Feature Specification: WS6 Foundation & Contracts (Sprint 0)

**Feature Branch**: `001-ws6-foundation-contracts`

**Created**: 2026-10-04

**Status**: Draft

**Input**: WS6 Sprint 0 prompt (`notes/ws6-sprints/sprint-0-foundation-contracts.md`). Covers:
- versioned transport contracts with runtime validation
- one labelled fixture per resource
- storage layout and atomic write primitives
- ID and idempotency conventions
- a published route map partners can build against
- a health check

## User Scenarios & Testing *(mandatory)*

The "users" of this sprint are the partner workstreams. WS2 (capture), WS3 (expert voice), WS5 (knowledge/tutor) and WS7 (web UI) consume the shared backend. The human integrator gates each sprint.

### User Story 1 - Partners build against agreed record shapes (Priority: P1)

A partner developer needs to know the exact shape of every record the backend stores or exchanges. This covers sessions, evidence assets, pointing events, expert exchanges, knowledge revisions, confirmations, learner drafts, evaluations, commits, assessments, live-update envelopes and errors. For each one they need a valid sample they can load today.

**Why this priority**: Every partner is blocked until these shapes exist. Wrong shapes cost the most to fix later.

**Independent Test**: Load every sample record and check it validates. Feed deliberately broken records and check each is rejected with a typed, explainable error.

**Acceptance Scenarios**:

1. **Given** the sample set, **When** each sample is validated against its record definition, **Then** every sample is accepted.
2. **Given** a record missing its ID, **When** validated, **Then** it is rejected with a `validation_failed` error naming the field.
3. **Given** a record with an unknown enum value, a region outside the unit square, or an ID containing path characters (`../`, `/`, uppercase), **When** validated, **Then** it is rejected.
4. **Given** a WS3-shaped pointing event, exchange, draft revision or confirmation, **When** validated, **Then** it is accepted unchanged. The shapes are identical to WS3's v0 contracts.

---

### User Story 2 - Retried writes never duplicate or corrupt records (Priority: P1)

A producer may resend a record because of retries, reconnects or delayed delivery. The backend's storage layer must then return the stored record and must not create a second copy. If an immutable record is sent again with different content, the backend refuses with a conflict. A mutable record is accepted only with a higher revision. A crash or failure partway through a write never leaves a half-written file.

**Why this priority**: Idempotency and atomicity underpin every later sprint's acceptance criteria.

**Independent Test**: Exercise the storage primitives directly against a fresh temporary data directory.

**Acceptance Scenarios**:

1. **Given** an immutable record already stored, **When** the identical record is written again, **Then** the stored record is returned and nothing changes.
2. **Given** an immutable record already stored, **When** a different body is written under the same ID, **Then** a `conflict_immutable` error is raised and the stored record is unchanged.
3. **Given** a mutable record at rev N, **When** a write arrives at rev < N, or at rev N with a different body, **Then** a `stale_revision` error is raised.
4. **Given** a mutable record at rev N, **When** a write arrives at rev N+1, **Then** it replaces the stored record.
5. **Given** a write that fails before completion, **When** the directory is inspected, **Then** the target is either absent or still holds its previous content, and no temporary file remains.
6. **Given** several concurrent operations on the same key, **When** they run, **Then** they execute one after another, never interleaved.

---

### User Story 3 - Integrator can check the backend is up (Priority: P2)

The integrator starts the app on the WS6 port and asks the health endpoint for status. They see the contract version and whether both data directories are writable.

**Why this priority**: It is the first runtime signal and the template for every later route.

**Independent Test**: Start the dev server on port 3006 and request `/api/health`.

**Acceptance Scenarios**:

1. **Given** the dev server is running, **When** `/api/health` is requested, **Then** it returns 200 with `ok`, `schema_version: "ws6.v0"`, `knowledge_dir_writable`, `runtime_dir_writable` and an empty `modules` map.

---

### User Story 4 - Partners review a published route map (Priority: P2)

Each partner reads one document. It lists:
- every planned route: method, path, request/response record, idempotency, error codes, live-update events and owning sprint
- the on-disk storage layout
- a section per partner with what they call and the open questions for them

**Why this priority**: Partners can start building against routes before those routes exist, and objections surface early.

**Independent Test**: Read `notes/ws6-api-v0.md`. Every resource and route group from the WS6 brief §4 appears, and there are sections for WS2, WS3, WS5 and WS7.

**Acceptance Scenarios**:

1. **Given** the route map, **When** checked against the brief §4 resource table and API coverage list, **Then** nothing is missing.

---

### Edge Cases

- IDs with leading hyphen, length > 64, uppercase, `.`, `/` or `..` are rejected everywhere they would become a path segment.
- Reading a record that does not exist returns "absent", not an error. Reading a corrupt or invalid file raises `validation_failed`.
- Region with `x + width > 1` or zero width is rejected (inherited from WS3 rules).
- Live-update envelopes carrying content fields (anything other than IDs and metadata) are rejected.
- Unknown values (trace ID, channel, signal interval) must be explicit `null`, never empty strings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define a versioned record definition (version `ws6.v0`) with runtime validation for each of these records: Session, EvidenceAsset, PointingEvent, ExpertExchange, DraftRevision, ExpertConfirmation, KnowledgeEntry, KnowledgeRevision, Confirmation, LearnerDraft, Evaluation, Commit, Assessment, BusEvent and ApiError.
- **FR-002**: Validation MUST return a typed result: either the value, or a `validation_failed` error listing each failing field path and message.
- **FR-003**: Records shared with WS3 (PointingEvent, ExpertExchange, DraftRevision, ExpertConfirmation, TimingMark, RecordingSegment) MUST accept exactly WS3's v0 shapes. WS6 additions MUST be optional.
- **FR-004**: The system MUST provide one valid labelled sample per record, plus placeholder images labelled FIXTURE. Samples MUST use `source: "fixture"` and the shared session `fixture-session-001`, with neutral placeholder text only.
- **FR-005**: IDs MUST match `^[a-z0-9][a-z0-9-]{0,63}$`. Server-generated IDs MUST use the prefixes `ses-`, `cnf-`, `evl-`, `cmt-` and `rev-`, followed by time and randomness.
- **FR-006**: Storage writes MUST be atomic: a temporary file in the same directory, then a rename.
- **FR-007**: Immutable puts MUST be idempotent: the same body returns the stored record, and a different body raises `conflict_immutable`.
- **FR-008**: Mutable puts MUST enforce a monotonic `rev`. A lower rev, or an equal rev with a different body, raises `stale_revision`. An equal rev with an identical body is an idempotent retry.
- **FR-009**: Operations on the same key MUST be serialized. This assumes a single server process, which MUST be documented.
- **FR-010**: Data locations (knowledge, runtime and evaluator directories) MUST be configurable, have defaults inside the worktree, and be overridable in tests.
- **FR-011**: Runtime data directories MUST be excluded from version control. Curated knowledge (`knowledge/workflow.md`, `knowledge/entries/`) stays committable.
- **FR-012**: A health endpoint MUST report the contract version, writability of both data directories and a modules map.
- **FR-013**: A route map document marked "v0, pending agreement" MUST cover:
  - every resource and route group
  - the storage layout
  - the error codes
  - the idempotency rule
  - a section for each partner
- **FR-014**: The project constitution MUST gain a WS6 Backend Principles section without rewriting existing content.

### Key Entities

- **Session**: an expert or newcomer session. Lifecycle, record state, recording segments, case/trace reference, pinned knowledge revisions and rev.
- **EvidenceAsset**: an image with its original and optional highlighted derivative. Dimensions, hash, coordinate basis and stored/deleted status.
- **PointingEvent**: one gesture referencing an asset. Region in original-frame coordinates, mapping status, session time (not signal time).
- **ExpertExchange**: a question plus the expert's verbatim answer lines. Linked to an event, with a monotonic rev.
- **KnowledgeEntry / KnowledgeRevision**: a stable entry with immutable revisions (opaque Markdown body plus metadata), a status, and evidence references.
- **Confirmation**: the expert's result for one exact reviewed revision.
- **LearnerDraft / Evaluation / Commit**: a newcomer decision revision, the evaluation bound to (draft rev, knowledge revisions), and the commit bound to both.
- **Assessment**: the learning outcome summary.
- **BusEvent**: a live-update envelope carrying IDs only.
- **ApiError**: the uniform error envelope.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of sample records validate. Every listed invalid case (missing ID, bad enum, region out of range, path-traversal ID) is rejected.
- **SC-002**: Each storage guarantee in Story 2 has at least one automated check, and all checks pass.
- **SC-003**: The health endpoint answers successfully on the WS6 port on the first request after startup.
- **SC-004**: Each partner (WS2, WS3, WS5, WS7) can find its section and all routes it calls in the route map in under 15 minutes. This is the human gate.
- **SC-005**: Type checking and the full automated test suite pass with zero failures.

## Assumptions

- WS3's Sprint 0 contracts (`ws3.v0`) exist in an unmerged worktree. WS6 mirrors them field for field and switches to re-exports once WS3 merges into `voice`. The `voice` merge is skipped this sprint at the human's direction, because `voice` HEAD has a WIP commit with worktree gitlinks.
- Conflicts found across partner notes are resolved with documented defaults and listed as open questions:
  - confirmation field names
  - the revision ID scheme
  - WS5 assessment/evaluation extras
  - the WS3 route prefix
- Single Node process, local filesystem. No database, queue or cloud.
- Only the health endpoint is implemented. All other routes are documented, not built.
