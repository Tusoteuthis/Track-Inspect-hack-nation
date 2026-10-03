# WS6 Sprint 2 — Knowledge revisions & confirmation

> Paste this whole file as the first message to a fresh coding agent **started inside the WS6 worktree**:
> `cd /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend && claude`

> **STOP CHECK, before doing anything else.** Run `git rev-parse --show-toplevel`. If it does not print `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws06-backend`, **stop immediately** and tell the human to restart you from that directory. Do not `cd` there as a workaround, because your shell's working directory may reset between commands. Other agents work in parallel in the main checkout and in other worktrees. Never write, install, check out branches or run servers outside this worktree. Use absolute paths under this worktree for every file you edit. The git stash stack is shared with all worktrees, so never use `git stash`. Set work aside with a WIP commit instead.

## Your role

You are the implementing agent for **Sprint 2** of workstream WS6. Implement flow steps 4–5 of the brief:

> invoke WS5 synthesis on a session's events and exchanges → persist draft knowledge revisions as Markdown with linked images → route drafts and gaps to WS3 for the debrief → persist the expert's confirmation **against the exact revision they reviewed** → expose the Work Map to WS7.

Revision integrity is the point of this sprint: a confirmation can never verify content that changed after the expert reviewed it. Context sections A1–A8 below apply in full.

## Read first

- `notes/ws6-sprints/handoff-sprint-1.md`, `notes/ws6-api-v0.md`, `web/lib/contracts/`, `web/lib/backend/`
- `notes/06-backend-integration.md` §3 (steps 4–5), §5, §6
- WS5: `notes/05-knowledge-newcomer-tutor.md` §3–5, `notes/05-sprint-plan.md` (S1 knowledge contract, S2 synthesis/gaps/confirmation), and any WS5 code merged on `voice` (look for a synthesis module, entry schema and Work Map payload type)
- WS3: `DraftRevision` / `ExpertConfirmation` in their contracts, and how their debrief consumes gaps (`notes/ws3-sprints/sprint-3-debrief-confirmation.md`)

## Prerequisites

Sprint 1 merged into `worktree-ws06-backend`. If not, stop and tell the human.

## Design you must implement

**Module host** `web/lib/backend/modules.ts`: typed interfaces plus a registry selected by env `WS5_MODULES=real|stub` (default: `real` if the WS5 module is importable, otherwise `stub`). Report the active implementation in `/api/health.modules`.
```ts
interface SynthesisModule {
  id: string; version: string;
  synthesize(input: { session: Session; events: PointingEvent[]; exchanges: ExpertExchange[]; prior: KnowledgeRevision[] }):
    Promise<{ revisions: DraftKnowledgeOut[]; workflow_markdown: string; gaps: Gap[]; teach_back: string | null }>;
}
```
Adapt the shapes to what WS5 actually exports if it exists. WS5 defines the semantics; we only map them. The **stub** must be obviously fake: it echoes the exchange IDs and verbatim answer lines into a draft with the heading "STUB SYNTHESIS — not expert knowledge", with `produced_by.source = "stub"` and no invented interpretation.

**Synthesis jobs.** `POST /api/sessions/:sid/synthesis` → `202 { job_id }`. It runs in-process (`web/lib/backend/jobs.ts`: a small job record in `RUNTIME_DIR/jobs/`, with status `queued | running | done | failed | discarded`). Each job snapshots its **inputs' revs** when it starts. When it finishes, it persists only if no included exchange or event changed or was deleted meanwhile; otherwise it marks itself `discarded` and emits `synthesis.discarded`. This is the hook Sprint 4 extends with generation tokens. Only one running job per session (lock), and a second request returns the running `job_id`. `GET /api/jobs/:job_id`.

**Revision store** `web/lib/backend/knowledge.ts`:
- Each draft becomes `knowledge/entries/<entry_id>/rev-<n>.md`: immutable, frontmatter = KnowledgeRevision, body = the module's Markdown. Image links are relative paths to `knowledge/images/<asset_id>/…` so the files can be read on disk and in a Markdown viewer. Write the revision file first, then update `current.json` (`{ entry_id, current_revision_id, status }`) under a lock.
- Stable `entry_id`: the module may return an existing `entry_id` to revise it, which creates `rev-(n+1)` with `parent_revision_id`. Re-running synthesis on unchanged inputs must not create a duplicate entry: dedupe by `(entry_id, content sha256)`.
- `knowledge/workflow.md` is regenerated from the module output and records which revision IDs it links.
- Gaps are stored in `knowledge/sessions/<sid>/gaps.json`; `GET /api/sessions/:sid/gaps`, plus SSE `draft.updated` / `gaps.updated` so WS3 can fetch them for the debrief.

**Reads.** `GET /api/knowledge/entries` (current revision per entry + status), `GET /api/knowledge/entries/:id`, `GET /api/knowledge/entries/:id/revisions/:rev` (frontmatter + Markdown body), `GET /api/sessions/:sid/draft` (the session's current draft revision IDs and teach-back text).

**Confirmation.** `POST /api/knowledge/confirmations` `{ reviewed_revision_ids: string[], result: "confirmed" | "corrected" | "unresolved", expert_response_exchange_id, idempotency_key }`:
- Under the knowledge lock: if any reviewed revision is no longer its entry's current revision, reject with `409 stale_revision` and list the current IDs. **The client cannot override this.**
- The expert response exchange must exist, belong to the same session and be on-record. Silence or a missing exchange cannot confirm.
- `confirmed` → those revisions get status `confirmed` (a new status transition record; the content stays immutable). `corrected` → status stays draft, the confirmation is recorded, and a new synthesis run (triggered by WS3 after the correction exchange) produces `rev-(n+1)`. `unresolved` → status `unresolved`.
- Store it at `knowledge/confirmations/<cnf-id>.json`, emit `knowledge.confirmed`. An idempotent replay returns the same confirmation.
- Status transitions follow a pure function `nextStatus(current, result)` that matches the WS5 states. Anything WS5 has not yet specified is listed in the handoff, not invented.

**Work Map.** `GET /api/workmap`: steps from the current `workflow.md` linkage. For each step, give the entry ID, revision ID, status, `{ asset_id, original_url, highlighted_url, region }` per evidence event, and `{ exchange_id, question, answer_lines }` per supporting exchange. **Resolve every link server-side**: a step with a missing asset or exchange is returned with `broken_links: [...]`, never silently dropped. By default only `confirmed` content is shown; `?include=draft` returns everything with its status. WS5's eligibility rules decide what counts as teachable; use their function if it exists.

## Lanes

- **Lane A:** module host + stub + jobs.
- **Lane B:** revision store + reads + workflow.md.
- **Lane C:** confirmation + Work Map + SSE events.

## Out of scope

Newcomer, evaluation and commit (Sprint 3). Revocation, deletion cascade and off-record job discard (Sprint 4; just keep the input-rev check in place).

## Acceptance criteria

- `npm run typecheck` and `npx vitest run` pass, with tests for:
  - synthesis on fixtures creates rev-1 files with valid frontmatter and resolvable image links;
  - re-running on unchanged inputs creates no new revision;
  - an exchange updated during a running job → the job is `discarded`;
  - confirming the current revision → `confirmed`;
  - confirming a revision superseded after review → `409 stale_revision` and no status change;
  - confirmation without a valid on-record expert exchange → 400/409;
  - replaying a confirmation is idempotent;
  - the Work Map links every step to an image URL that returns 200 and to verbatim exchange lines, and a broken link is reported.
- A full run on `npm run dev`: replay-capture → synthesis → confirm → `GET /api/workmap` (paste the JSON excerpt in the handoff).
- Handoff note `notes/ws6-sprints/handoff-sprint-2.md` written, naming which WS5 module (stub or real) was used.

## Human gate (for the human, ~20 min)

1. Run `npm run replay-capture`, then `curl -X POST …/api/sessions/<sid>/synthesis`. Open `knowledge/entries/*/rev-1.md` in a Markdown viewer. **Check:** the images render, the expert's words are verbatim, and STUB output is clearly marked.
2. Confirm rev-1 via curl → `GET /api/workmap` shows it as confirmed with working image links.
3. Trigger a correction (update an exchange + re-synthesize → rev-2), then try confirming rev-1 again. **Check:** 409 `stale_revision`.
4. If satisfied, merge the feature branch into `worktree-ws06-backend` (in the WS6 worktree), and into `voice` when partners should receive it.
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
