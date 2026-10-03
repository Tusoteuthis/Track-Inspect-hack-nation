# WS6 Sprint 0 — Foundation & contracts

> Paste this whole file as the first message to a fresh coding agent **started inside the WS6 worktree**:
> `cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend && claude`

> **STOP CHECK, before doing anything else.** Run `git rev-parse --show-toplevel`. If it does not print `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend`, **stop immediately** and tell the human to restart you from that directory. Do not `cd` there as a workaround, because your shell's working directory may reset between commands. Other agents work in parallel in the main checkout and in other worktrees. Never write, install, check out branches or run servers outside this worktree. Use absolute paths under this worktree for every file you edit. The git stash stack is shared with all worktrees, so never use `git stash`. Set work aside with a WIP commit instead.

## Your role

You are the implementing agent for **Sprint 0** of workstream WS6 (shared backend). Lay the foundation every later sprint and every partner builds on:

> versioned transport contracts with runtime validation, one labelled fixture per resource, the storage layout and atomic write primitives, the ID and idempotency conventions, and a published route map that WS7 can start building against **today**.

No endpoints are implemented in this sprint except `GET /api/health`. Correct, agreed contracts matter more than code volume. Context sections A1–A8 below apply in full.

## Read first

- `notes/06-backend-integration.md` (all of it, our brief), `notes/06a-ws6-sprint-plan.md`
- `notes/02-glasses-iphone-visual-processing.md` §5 (PointingEvent fields)
- `notes/ws3-sprints/sprint-0-spike-contracts.md` "Lane C" (WS3's v0 types: PointingEvent, ExpertExchange, DraftRevision, ExpertConfirmation, TimingMark, RecordingSegment) and `notes/ws3-sprints/sprint-1-golden-path.md` "Persistence"
- `notes/05-knowledge-newcomer-tutor.md` §3–5 and `notes/05-sprint-plan.md` (entry/revision statuses `draft / confirmed / unresolved / revoked`, generic newcomer task "draft decision + reason → review → commit")
- `notes/04-prototype-data-scenarios.md` (learner-visible vs evaluator-only material), `notes/07-frontend-user-experience.md` §4 (UI state needs)
- Check whether these already exist on `voice`: `web/lib/expert/contracts.ts`, vitest config, `web/fixtures/`, `.specify/memory/constitution.md` (filled or template?)

## Prerequisites

None. If WS3 Sprint 0 has been merged, **reuse its vitest setup and contracts** (see Design).

## Design you must implement

**Test runner.** If vitest is missing, add it to `web/` (dev dependency, `"test": "vitest run"`, config resolving `@/*`). Add `zod` as a dependency.

**Config** `web/lib/backend/config.ts`: `KNOWLEDGE_DIR` (default `<web>/../knowledge`), `RUNTIME_DIR` (default `<web>/.runtime`), `EVALUATOR_DIR` (default `<RUNTIME_DIR>/evaluator`), resolved to absolute paths once and overridable in tests. Add `knowledge/sessions/`, `knowledge/images/`, `knowledge/assessments/` and `web/.runtime/` to `.gitignore`. Leave curated `knowledge/workflow.md` and `knowledge/entries/` committable; the human decides.

**Contracts** `web/lib/contracts/` with `SCHEMA_VERSION = "ws6.v0"`: snake_case fields matching the JSON on disk, a zod schema plus the inferred type for every resource, and `parseX(unknown)` helpers returning typed errors.
- If `web/lib/expert/contracts.ts` (WS3) exists: **import and re-export** its PointingEvent/ExpertExchange/DraftRevision/ExpertConfirmation shapes and wrap them in zod schemas that accept exactly those shapes. If you need a field WS3 lacks, add it as optional and list it under "Requests to partner workstreams". If it does not exist, define the types from the WS3 Sprint 0 prompt verbatim, so WS3 can adopt `web/lib/contracts` instead.
- Resources (minimum):
  - `Session`: `session_id`, `role: "expert" | "newcomer"`, `lifecycle: "created" | "active" | "ended" | "aborted"`, `record_state: "on_record" | "off_record"`, `recording_segments`, `case_id | null`, `trace_ref | null`, `pinned_knowledge: { entry_id, revision_id }[] | null` (newcomer), `source`, `created_at_utc`, `rev`.
  - `EvidenceAsset`: `asset_id`, `session_id`, `event_id | null`, `kind: "frame" | "case_trace"`, `original: { path, mime, width_px, height_px, sha256 }`, `highlighted: {…} | null`, `coordinate_space`, `captured_at_utc`, `record_state`, `source`, `status: "stored" | "deleted"`.
  - `PointingEvent`: as WS2 §5/WS3 (`image_ref` and `highlighted_image_ref` become `asset_id` references; document the mapping).
  - `ExpertExchange`: as WS3 plus `rev` (monotonic; answer lines grow over time).
  - `KnowledgeEntry` / `KnowledgeRevision`: `entry_id`, `revision_id`, `parent_revision_id | null`, `status: "draft" | "confirmed" | "unresolved" | "revoked"`, `content_path` (Markdown), `evidence: { event_ids, exchange_ids, asset_ids }`, `produced_by: { module, version, source: "live" | "stub" | "fixture" }`, `created_at_utc`. The content semantics belong to WS5; WS6 stores an opaque Markdown body plus frontmatter.
  - `Confirmation`: `confirmation_id`, `reviewed_revision_id`, `result: "confirmed" | "corrected" | "unresolved"`, `expert_response_exchange_id`, `at_utc`.
  - `LearnerDraft`: `session_id`, `draft_rev`, `decision`, `reason`, `visual_context` (asset/region refs), `updated_at_utc`. `Evaluation`: `evaluation_id`, `draft_rev`, `knowledge_revision_ids`, `status: "pending" | "done" | "failed" | "stale"`, `outcome: string | null` (WS5-defined values, e.g. `ok | intervene | uncertain`), `cited: { entry_id, revision_id, exchange_ids }[]`, `feedback_text | null`. `Commit`: `commit_id`, `draft_rev`, `evaluation_id`, `at_utc`.
  - `Assessment`: `session_id`, `initial_decision`, `assistance`, `final_outcome`, `evidence_used`, `practice_next`, `source`.
  - `BusEvent` (SSE envelope): `seq` (per-session monotonic), `type`, `session_id`, `ids`, `at_utc`. **IDs only, no content**; clients re-fetch the resource.
  - `ApiError`: `{ error: { code, message, details? } }` with codes such as `validation_failed`, `not_found`, `conflict_immutable`, `asset_not_available`, `stale_revision`, `evaluation_required`, `evaluation_pending`, `off_record`.

**IDs & idempotency** `web/lib/backend/ids.ts`: ID regex `^[a-z0-9][a-z0-9-]{0,63}$` (also used to sanitize paths); server-generated IDs with prefixes `ses-`, `cnf-`, `evl-`, `cmt-`, `rev-` + time + random. Document the rule: producers own their IDs, `PUT` by ID, same body → 200 with the stored record, different body for an immutable record → 409, and mutable records accept only a higher `rev`.

**Store primitives** `web/lib/backend/store.ts`: `writeJsonAtomic`, `writeFileAtomic` (temp file + rename, same directory), `readJson` (typed via schema), `putImmutable(path, record)` implementing the idempotency rule, `putMutable(path, record)` enforcing a monotonic `rev`, and a per-key async mutex `withLock(key, fn)` in `locks.ts`. Single-process assumption: document it.

**Storage layout** (write it in `notes/ws6-api-v0.md`; adopt WS3's `knowledge/sessions/<id>/` files where they overlap):
```
knowledge/sessions/<session_id>/session.json, events/<event_id>.json, exchanges/<exchange_id>.json, bus.ndjson
knowledge/images/<asset_id>/meta.json, original.<ext>, highlighted.<ext>
knowledge/entries/<entry_id>/rev-<n>.md (immutable, frontmatter = KnowledgeRevision), current.json
knowledge/workflow.md, knowledge/confirmations/<confirmation_id>.json
knowledge/learner/<session_id>/draft.json, evaluations/<evaluation_id>.json, commit.json
knowledge/assessments/<session_id>.md (+ .json)
web/.runtime/diag/*.ndjson, web/.runtime/evaluator/  (never served)
```

**Route map** `notes/ws6-api-v0.md`, marked "v0, pending agreement". For each route give method, path, request/response schema name, idempotency behavior, error codes, SSE events emitted and the owning sprint. Cover: session lifecycle and record-state; asset upload (multipart: `meta` JSON + `original` + optional `highlighted`) and reads; event and exchange `PUT`; session SSE stream; synthesis trigger and draft/gap reads; knowledge entries/revisions; confirmations; Work Map; newcomer session + learner case view; learner draft `PUT`; evaluation request; commit; assessment; correction, revocation and deletion; health and diagnostics. Add a section per partner (WS2, WS3, WS5, WS7) with what they call and the open questions for them.

**Health** `GET /api/health` → `{ ok, schema_version, knowledge_dir_writable, runtime_dir_writable, modules: {} }`.

**Fixtures** `web/fixtures/ws6/`: one valid JSON per resource (all `source: "fixture"`, shared `session_id: "fixture-session-001"`) plus 1–2 placeholder PNGs labelled FIXTURE. Don't put any trace interpretation into the fixture text: use neutral placeholders such as "FIXTURE expert answer line 1". Reuse WS3's pointing-event fixtures if they exist.

**Constitution.** If `.specify/memory/constitution.md` is still the template, fill it with project-wide principles that cover WS6 too (authoritative backend state, idempotent stable IDs, revision-bound decisions, off-record = not stored, labelled fixtures/stubs, evaluator key never served, session time ≠ signal time, simplicity). If WS3 already filled it, **append** WS6 principles as a minor version bump. Don't rewrite theirs. WS3 may be filling it in parallel in another worktree: put WS6 content under its own heading `## WS6 Backend Principles` and keep edits to the shared header and version lines minimal. A later merge then only conflicts on a few lines, which you note in the handoff.

## Lanes

- **Lane A:** vitest/zod setup, config, ids, store, locks, health route, tests.
- **Lane B:** contracts + fixtures + validation tests.
- **Lane C:** `notes/ws6-api-v0.md`, constitution.

## Out of scope

All other endpoints, SSE implementation, module adapters (Sprint 1+).

## Acceptance criteria

- `npm run typecheck` and `npx vitest run` pass. Tests cover: every fixture parses; invalid samples are rejected (missing ID, bad enum, region out of `[0,1]`, path-traversal ID); `putImmutable` same-body → no-op, different-body → conflict; `putMutable` rejects a lower or equal `rev`; atomic write leaves no partial file when it fails partway; `withLock` serializes concurrent calls.
- `GET /api/health` returns 200 under `npm run dev`.
- `notes/ws6-api-v0.md` covers every resource and route group in `notes/06-backend-integration.md` §4, with per-partner sections.
- Handoff note `notes/ws6-sprints/handoff-sprint-0.md` written.

## Human gate (for the human, ~15 min)

1. Read `notes/ws6-api-v0.md`. **Check:** route names and fields are acceptable, and nothing duplicates a WS3 route.
2. Share it with the WS2, WS3, WS5 and WS7 owners and collect objections into the next sprint's handoff.
3. If satisfied, merge: `cd .claude/worktrees/ws06-backend && git checkout worktree-ws06-backend && git merge --no-ff <feature-branch>`. Merge `worktree-ws06-backend` into `voice` (from the main checkout) when partners should receive it.
---

## A. Shared project context (identical in every WS6 sprint prompt)

### A1. The product in one paragraph

We are building an **AI Apprentice for railway sensor traces** for Challenge 1 ("The AI Apprentice") of the 7th Global AI Hackathon, powered by ElevenLabs. An experienced railway engineer (the **expert**) wears **Meta Ray-Ban smart glasses** and looks at **sensor traces on a screen**. They **physically point with a finger** at a trace region. A connected iPhone app (WS2) detects the gesture and emits a **PointingEvent** with image evidence. An **ElevenLabs voice agent** (WS3) asks the expert what they see, why, and when they would be unsure. After a spoken **debrief** and a **teach-back** that the expert **confirms or corrects**, the knowledge is saved as Markdown plus linked images (WS5 defines the content). A **newcomer** then works on an unseen trace. A voice tutor (WS5 logic) catches a wrong decision **before it is saved** and explains it using the expert's own reasoning. A web app (WS7) presents all of this.

**We are WS6, the shared backend.** We make these parts run as one application with stable IDs, durable evidence, consistent state, enforced commit rules and failures that can be inspected. We host the specialist modules. We do **not** implement their logic.

Core loop: *expert points → app identifies the visual reference → voice agent asks → expert explains → apprentice clarifies and confirms → knowledge is persisted → newcomer learns on an unseen trace.*

### A2. Non-negotiable rules

- **Sensor traces only.** No drawings, field maintenance, dataset labelling or classifier training.
- **No competing specialist logic.** WS6 never writes an interview agent, a synthesis pipeline, a tutor policy, domain categories or UI screens. Where a partner module is missing, host a **stub behind the agreed interface**. Mark it `source: "stub"` in every output, and make it trivially replaceable.
- **The backend is authoritative** for session, recording (off-record), confirmation and commit state. Clients display this state; they never invent it. A disabled button is never the enforcement.
- **Stable IDs and idempotency.** Producers send their own stable IDs (`event_id`, `exchange_id`, `asset_id`). Writes are `PUT` by ID: the same body again is a no-op that returns the stored record, and a different body for an immutable record gets `409`. Retries, reconnects and delayed delivery never duplicate or re-attach records.
- **No dangling references.** A record that references an asset is accepted only if that asset is stored (`409 asset_not_available` otherwise).
- **Old work never overwrites new state.** Mutable records carry a monotonic `rev`; a stale write is rejected or ignored, never applied. Confirmations, evaluations and commits name the exact revisions they refer to.
- **Session time ≠ signal time.** `session_time_ms` (recording) and `signal_interval` (trace axis) are separate fields, and one is never derived from the other. Image coordinates always declare their frame. Unknown values stay `null`.
- **Fixtures are labelled.** Everything created from a fixture carries `source: "fixture"`. Fixtures never silently stand in for captured expert knowledge in the demo.
- **The WS4 evaluator answer key is never served.** It lives outside every served, retrievable or tutor-accessible path.
- **No permanent secrets in clients.** The browser and iPhone only get short-lived, session-scoped access (for example the existing ElevenLabs conversation-token route).
- **Off-record means not stored.** It is not a label on stored content. It applies to assets, events, exchanges, jobs and outputs.
- **Logs and diagnostics contain IDs, timings and outcomes, never content** (no expert words, no images, no off-record material).
- **Simplicity.** One Next.js process, local filesystem, in-process modules, SSE. No database server, queue, object store, vector DB or cloud dependency.

### A3. Challenge requirements the backend must make possible

| Requirement | Backend responsibility |
|---|---|
| ≥3 live questions incl. 1 guardrail, ≥3 debrief questions | Persist every exchange, linked to its original event, with timings |
| Teach-back confirmed or corrected | Confirmation bound to the exact reviewed revision; corrections create new revisions |
| Every step/guardrail links to a screen moment and the expert's words | Work Map API resolves step → entry revision → event → asset image + exchange words |
| Newcomer handles an unseen case | Newcomer session gets a permitted case not shown to the expert, plus a pinned confirmed knowledge revision |
| Catch ≥1 wrong decision before it is saved | Server-side commit guard: no commit without a current, matching, permitting evaluation |
| Learning outcome | Assessment persisted and readable |
| Trust: off the record, personal data | Off-record propagation, deletion/correction cascade, evaluator-key separation, scoped access |

### A4. Workstream map (who owns what)

| WS | Owns | Relationship to WS6 |
|---|---|---|
| WS1 | Pitch, demo run sheet | We give them a working environment and known limits |
| WS2 | Glasses/iPhone capture, gesture detection, PointingEvent + images | **Produces** assets and events into our ingestion API |
| WS3 | Expert conversation, ElevenLabs adapter, exchanges, teach-back, confirmation semantics | **Produces** exchanges/confirmations; **consumes** events, drafts and gaps from us. Its Sprint 0/1 plan creates `web/lib/expert/contracts.ts` and a snapshot route writing `knowledge/sessions/<id>/` |
| WS4 | Trace scenarios, learner-visible cases, evaluator-only answer key | We load learner assets; we keep the answer key out of runtime |
| WS5 | Knowledge schema semantics, synthesis, eligibility/retrieval, tutor evaluation, assessment content | We **host and invoke** its modules and enforce its outcomes |
| WS6 (**us**) | APIs, storage, revisions, live updates, commit enforcement, off-record/deletion propagation, diagnostics, run setup | — |
| WS7 | Web UI (expert companion, Work Map, newcomer practice) | **Consumes** our API and SSE |

Full briefs: `notes/project-brief.md`, `notes/06-backend-integration.md` (**our brief**), `notes/02-glasses-iphone-visual-processing.md` §5 (PointingEvent), `notes/03-elevenlabs-expert-interaction.md`, `notes/ws3-sprints/` (WS3 contracts and persistence plan), `notes/05-knowledge-newcomer-tutor.md` and `notes/05-sprint-plan.md` (WS5 modules and statuses), `notes/04-prototype-data-scenarios.md`, `notes/07-frontend-user-experience.md`. Overall WS6 plan: `notes/06a-ws6-sprint-plan.md`.

### A5. Repository state you start from

**Several agents work on this repo in parallel, each in its own git worktree. You work ONLY in the WS6 worktree.**

| Location | Branch | Who | You may |
|---|---|---|---|
| `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation` (main checkout) | `voice` (shared integration branch) | human, WS3 | **read only**: never checkout, commit, install, run a dev server or write files here |
| `.claude/worktrees/ws06-backend` (**your workspace**) | `worktree-ws06-backend` (WS6 base) + your sprint feature branch | WS6 (you) | everything, within this directory |
| `.claude/worktrees/ws05-*`, `ws07-*`, other worktrees | their branches | other agents | **read only** |

Paths below are relative to your worktree root, `WT=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend`. Partners merge their work into `voice`; you pick it up by merging `voice` into your base (A6 step 2). **Check what partners have already merged** (`git log --oneline voice`, `ls web/lib`) before creating anything that may already exist. If a partner note referenced in this prompt is missing from your worktree (not merged yet), read it from the main checkout's `notes/` or from that partner's worktree `notes/`. Read only; never copy it into your branch.

```
agents/                       ElevenLabs agent config examples (WS3)
notes/                        Briefs and plans (read-only unless the sprint says otherwise)
web/                          Next.js 16 / React 19 / TypeScript strict (path alias "@/*" → web/*)
  app/api/conversation-token/route.ts   GET ?flow=expert|tutor → short-lived ElevenLabs WebRTC token; API key stays server-side
  app/page.tsx                          flow picker + <VoiceSession> dev page
  components/voice/VoiceSession.tsx     WS3 voice session component
  lib/voice/flows.ts                    FLOWS = { expert, tutor } → agent-id env vars
  lib/voice/transcript.ts               transcript line helpers
  scripts/*.mts                         WS3 tooling (sync-agents, probe, tts-roundtrip), run with tsx
  .env.example                          ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID_EXPERT, ELEVENLABS_AGENT_ID_TUTOR
.specify/ + .claude/skills/speckit-*   spec-kit (creates specs/NNN-name/ and a feature branch)
```

Packages: `next` ^16.1, `react` ^19.2, `@elevenlabs/react`, `@elevenlabs/elevenlabs-js`, `tsx`, `typescript`. At the start of this plan there is no test runner, no persistence and no backend code (WS3 Sprint 0 may since have added vitest and `web/lib/expert/contracts.ts`; reuse them if present).

**WS6 code layout (created in Sprint 0, extended afterwards):**
```
web/lib/contracts/        versioned transport types + zod schemas (SCHEMA_VERSION "ws6.v0"); re-export/absorb WS3 types, never fork them
web/lib/backend/          server-only: config, ids, store (atomic fs), locks, bus (SSE), diag, policy, modules (WS5/WS3 adapters + stubs)
web/app/api/...           thin route handlers: parse → validate → call lib/backend → map errors to HTTP
web/fixtures/ws6/         labelled fixtures (source: "fixture")
knowledge/                KNOWLEDGE_DIR (default ../knowledge from web/) — human-readable Markdown + images; gitignore runtime data
web/.runtime/             RUNTIME_DIR — diagnostics, job state, evaluator-only material (EVALUATOR_DIR); gitignored, never served
```

Route handlers declare `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`. Keep route files thin so tests can drive `lib/backend` directly, and call handlers with `new Request(...)` for route-level tests. Code style: small focused modules, comments only where the reason is not obvious, no `any`. Match `conversation-token/route.ts`.

**Never invent APIs** (Next.js, ElevenLabs, WS2/WS3/WS5 modules). Check installed typings, official docs and the partner's merged code. If something you need does not exist, say so and choose a documented fallback.

### A6. How every WS6 sprint is executed

1. Read this whole prompt, then the files under "Read first".
2. **Worktree setup.** All commands run inside the WS6 worktree:
   ```bash
   cd "$WT"                                   # if it does not exist: STOP and ask the human (do not create it from the main checkout yourself)
   git rev-parse --show-toplevel              # must print .../.claude/worktrees/ws06-backend
   git status --short                         # must be clean (or only untracked WS6 notes); otherwise stop and ask
   git checkout worktree-ws06-backend
   git merge --no-edit voice                  # pick up partner work; if it conflicts outside WS6-owned files, `git merge --abort` and ask the human
   [ -f web/.env ] || cp ../../../web/.env web/.env   # gitignored secrets from the main checkout; never print or commit it
   (cd web && npm install)                    # this worktree has its own node_modules
   ```
   Then confirm the previous sprint's handoff note exists (see "Prerequisites"). Never run `git checkout`, `git worktree add/remove`, `npm install` or any write in the main checkout or in another agent's worktree.
3. Use spec-kit: `/speckit-specify` with the sprint's Scope and Acceptance criteria as the feature description (prefix the short name with `ws6-` so it can't collide with other workstreams' spec numbers). Then `/speckit-clarify` only if something is truly ambiguous, then `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`. This prompt wins on conflicts.
   spec-kit creates the feature branch **inside this worktree**, branching from `worktree-ws06-backend`.
4. Lanes are independent once the contracts are fixed. You may dispatch subagents in parallel. Give each lane its own nested worktree branched from your feature branch (`git worktree add .claude/worktrees/ws06-sN-laneX -b ws06-sN-laneX`, run from `$WT`), merge the lanes back into your feature branch, then `git worktree remove` them. Never let two agents share one working directory.
5. Use test-driven development for all backend logic (vitest, each test against a fresh temp `KNOWLEDGE_DIR`/`RUNTIME_DIR`). Run the verification commands before claiming anything works, and paste the real output into the handoff note.
6. Make small logical commits on the feature branch, each message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not merge into `worktree-ws06-backend` or `voice`, do not push, do not modify another workstream's agent config or domain modules.** The human merges the feature branch into `worktree-ws06-backend` after the gate, and `worktree-ws06-backend` into `voice` when partners should receive it. If you need a change in partner code, write it as a request in the handoff note.
7. Write `notes/ws6-sprints/handoff-sprint-N.md` (template in A8), then stop and report to the human with the exact human-gate steps.

### A7. Standard verification commands

```bash
cd "$WT/web"
npm run typecheck
npx vitest run
npm run dev -- -p 3006            # WS6 always uses port 3006 so it never collides with other agents' dev servers (3000 etc.)
npm run dev -- -p 3006 -H 0.0.0.0 # when the iPhone must reach it over the LAN
curl -s localhost:3006/api/health | jq
```

`KNOWLEDGE_DIR` and `RUNTIME_DIR` default to paths inside your worktree, so your test data never touches other agents' data. Stop any dev server you started before you finish. Scripts (`replay-capture`, `e2e`) default to `--base http://localhost:3006`.

From Sprint 4 on: `npm run e2e` (integration script against a running dev server). If a step needs credentials or hardware you don't have (ElevenLabs key, iPhone), do everything else, list what is blocked, and ask the human. Never fake a result.

### A8. Handoff note template (`notes/ws6-sprints/handoff-sprint-N.md`)

```markdown
# WS6 Sprint N handoff — <title>
Branch: <feature branch>   Spec: specs/NNN-ws6-.../   Date: <date>
## Delivered (files + one line each)
## Verification evidence (pasted output: typecheck, vitest summary, curl/e2e runs)
## API/contract changes (routes, fields, error codes added/renamed; update notes/ws6-api-v0.md)
## Decisions made (and why), especially deviations from this prompt
## Stubs still in place (which partner module, how to swap in the real one)
## Known limitations / open issues
## Requests to partner workstreams
## Human gate checklist (exact steps, what to look for)
## Notes for the next sprint
```
