# WS6 Sprint Plan: Backend and Integration

**Derived from:** [06-backend-integration.md](06-backend-integration.md)
**Updated:** 3 October 2026
**Execution:** coding agents in the dedicated worktree `.claude/worktrees/ws06-backend` (base branch `worktree-ws06-backend`, dev port 3006), one spec-kit feature per sprint, parallel lanes in nested worktrees, a human gate between sprints. Partner work comes in by merging `voice`; WS6 reaches `voice` only through human merges. Paste-ready prompts: [`ws6-sprints/`](ws6-sprints/README.md).

## Verdict: split it into a small Sprint 0 and 4 vertical sprints

One build would not work, for these reasons:

1. **Partners are blocked until contracts exist.** The brief itself asks to "give WS7 a stable contract immediately". WS2, WS3, WS5 and WS7 all consume WS6. A single large build leaves them waiting until the end.
2. **The hard acceptance criteria are separate correctness problems.** Idempotent retries and reconnects, confirmation bound to the reviewed revision, server-side pre-save enforcement under double or pending requests, and off-record or deletion propagating into pending jobs each need their own tests. In one diff they can't be verified.
3. **Partner modules arrive at different times.** WS3 contracts come in their Sprint 0/1, WS5 synthesis in their S2 and tutor evaluation in their S3. Each WS6 sprint hosts a labelled stub behind an interface and swaps in the real module when it lands.
4. **Each sprint is a demoable slice of the 8-step flow.** That gives a natural integration checkpoint with the relevant partner.

## Decisions

- **Stack:** Next.js route handlers inside `web/`, one process. WS3/WS5 code runs as in-process modules, as the brief allows.
- **Storage:** local filesystem: `knowledge/` holds human-readable Markdown and images plus small JSON records, and `web/.runtime/` holds diagnostics, jobs and evaluator-only material (never served). No database, queue or object store.
- **Live updates:** SSE per session, with persistent `seq` and `Last-Event-ID` replay. Payloads carry IDs only.
- **Idempotency:** producers own stable IDs. `PUT` by ID; same body → no-op, different body → 409. Mutable records carry a monotonic `rev`.
- **Contracts:** `web/lib/contracts/` (zod, `ws6.v0`) re-exports or absorbs WS3's `web/lib/expert/contracts.ts` instead of forking it. WS3's snapshot persistence delegates to the WS6 store.

## Sprints

| Sprint | Flow steps | Scope | Done when (autonomously checkable) |
|---|---|---|---|
| **S0 — Foundation & contracts** (~1–1.5h) | — | vitest/zod; contracts for Session, EvidenceAsset, PointingEvent, ExpertExchange, KnowledgeRevision, Confirmation, LearnerDraft/Evaluation/Commit, Assessment, BusEvent; labelled fixtures; atomic store, locks, ID rules; `notes/ws6-api-v0.md` route map; health route; constitution | Fixtures validate, idempotency/atomicity tests pass, route map shared with partners |
| **S1 — Expert capture path** (~2–3h) | 1–3 | Session lifecycle + record state; multipart evidence upload/read; event PUT with "asset must exist"; exchange PUT with monotonic rev and immutable `event_id`; SSE with replay; session-scoped token; diag log; replay script | Duplicates → one record; missing asset → 409; late answer keeps its event; SSE reconnect replays the missed events |
| **S2 — Knowledge & confirmation** (~2–3h) | 4–5 | WS5 module host (+ stub); synthesis jobs with an input-rev check; immutable Markdown revisions; gaps/draft to WS3; confirmation bound to the reviewed revision; Work Map API with server-resolved links | Stale confirmation → 409; correction → new revision; every Work Map step resolves to an image + the expert's words |
| **S3 — Newcomer & pre-save** (~3h, highest risk) | 6–8 | Unseen case + pinned confirmed knowledge; evaluator material outside served paths; draft revs; evaluation bound to (draft_rev, knowledge revs); pure `canCommit` policy; locked, idempotent commit; assessment | Commit rejected when there is no evaluation, it is pending, it is stale, the outcome is intervene, knowledge changed, or on a double/concurrent submit; the wrong→fixed→commit path works once |
| **S4 — Trust, recovery, demo** (~2–3h) | all | Off-record = not stored; deletion/revocation cascade; generation tokens + tombstones; access token; diagnostics API/page; e2e script; README + failure/recovery notes | `npm run e2e` maps and passes every §10 acceptance criterion; fresh-clone startup from the README |

Strictly sequential: each sprint builds on the previous store and contracts, merged into `worktree-ws06-backend`. **Totals:** ~11–13 h agent wall-clock, ~2 h human gates.

## Mapping to brief §10 acceptance criteria

| Criterion | Sprint |
|---|---|
| One real pointing event traced to newcomer feedback via stable IDs | S1 IDs → S4 diagnostics + e2e |
| Images and evidence references resolve in the native/backend/browser setup | S1 (LAN asset read), S2 (Work Map links) |
| Repeated delivery, disconnect, delayed processing don't duplicate or misattach | S1 (idempotency, SSE replay), S2 (job input check), S4 (generation tokens) |
| Confirmation applies only to the reviewed revision | S2 |
| Wrong decision intercepted; pending/stale/changed drafts can't bypass review | S3 |
| Correction, deletion, off-record propagate to storage, pending work, retrieval | S4 (S1 rejects off-record uploads early) |
| Evaluator answers and provider secrets not accessible to runtime clients | S3 (evaluator dir), S1/S4 (token route, access boundary) |
| Team starts the app from docs and identifies a failed component | S4 |

## Risks

- **Parallel WS3/WS5 merges into `voice`** may conflict with WS6 files (contracts, the conversation-token route, persistence). Mitigation: every prompt checks what has been merged first, re-exports rather than forks, and records requests to partners in its handoff.
- **WS5 outcome semantics are undefined** (which evaluation outcomes block a commit). Mitigation: the policy is in a JSON table marked "pending WS5 agreement"; WS6 enforces it but does not judge.
- **iPhone ↔ laptop reachability** on the demo network (LAN, firewall, venue Wi-Fi client isolation). Mitigation: the S1 gate checks LAN asset access early; the S4 README documents the setup.
- **Parallel agents on one machine.** Mitigation: own worktree, own `node_modules`, own data dirs, own port (3006); the main checkout and other worktrees are read-only for WS6 agents.
- **Single-process assumption** for in-memory locks and the SSE bus. This holds for `next dev`/`next start` on one machine; document it and don't deploy to serverless without revisiting it.

## Open decisions (resolve with the team; prompts default as stated)

- Retention of off-record material: default is not persisted and not forwarded to modules, with transient in-memory handling allowed.
- Access boundary for the demo: default is LAN plus an optional shared bearer token.
- Commit outcome policy: default is `ok` allow, `intervene` block, `uncertain` allow with escalation (WS5 to confirm).
- Location of learner cases and evaluator keys (WS4): defaults are `cases/learner/` and `web/.runtime/evaluator/`.
- Hosted deployment: out of scope unless explicitly authorized.
