# Terminal B — Storage port to R2 + Durable Objects (parallel, NOT on the demo critical path)

Paste everything below the line into a fresh Claude Code session started in the repo root.

---

You are Terminal B of three parallel agents. Terminal A is deploying the app unchanged on Cloudflare Containers for today's demo. **Your job is the follow-up**: make the backend able to run on **plain Cloudflare Workers with persistent data**, by putting storage behind an abstraction with an R2 implementation. Nothing you do may block or break the demo.

## Context
- The repo is `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`, and `voice` is the integration branch.
- Next.js 16 app in `web/`. The backend lives in `web/lib/backend/*`, plus `web/lib/expert/store.ts`.
- Today the backend uses `node:fs` directly in these files: `store.ts`, `events.ts`, `bus.ts`, `jobs.ts`, `assets.ts`, `knowledge.ts`, `learner-store.ts`, `review.ts`, `cases.ts`, `confirmations.ts`, `diagnostics.ts`, `diag.ts`, `cascade.ts`, `workmap.ts`, `health.ts`, `config.ts`, `lib/expert/store.ts`. That's about 40 calls: readdir, readFile, mkdir, appendFile, rename, rm, stat, realpath, open, unlink, access.
- In-process state that won't survive on Workers: per-session write locks (`locks.ts`, a `Map` of promise tails), synthesis job tracking (`synthesis.ts` ~line 55, global `Map`), and work that continues after the response is sent (synthesis start + polling).
- `paths.ts` has security invariants (`safeJoin`, `servable`, the evaluator dir must never be reachable). **Preserve them** in any key-based scheme.

## Parallel agents — do not collide
- **Work in a new git worktree** at `.claude/worktrees/ws-cf-storage` on branch `ws-cf-storage` branched from `voice`. Run `cd web && npm ci` there.
- Don't touch the main checkout or `.claude/worktrees/deploy-cf`. Don't edit `next.config.ts`, the Dockerfile or the wrangler files (Terminal A owns those).
- **Don't merge into voice, don't push, don't deploy.**

## Steps
1. Inventory every fs use (file, function, operation, path pattern). Write the result to `notes/deploy/storage-port-inventory.md` in your worktree.
2. Design a minimal `BlobStore` interface in `web/lib/backend/blobstore.ts` covering what's actually used: `get`, `put` (atomic replace), `list(prefix)`, `delete`, `deletePrefix`, `append` (for the event logs; on R2 that means read-modify-write or segmenting, so document the trade-off), `stat/exists`. Keys are POSIX-style relative paths under the existing roots.
3. `FsBlobStore` is the default and must keep current behavior byte-for-byte (same files on disk, same atomic-write semantics as `writeJsonAtomic`). `R2BlobStore` takes an R2 bucket binding. Choose the implementation by env (`STORAGE_BACKEND=fs|r2`, default fs).
4. Refactor the modules to go through `BlobStore` one at a time. **Run `npm test` after each module** and keep it green. Commit per module.
5. Locks and jobs: introduce small interfaces (`LockProvider`, `JobTracker`) with the current in-memory implementations as default, and a sketch or stub of a Durable Object implementation. Describe how synthesis should run on Workers (`ctx.waitUntil` vs a DO alarm vs Queues) and pick one with justification.
6. SSE: check how `bus.ts`/`events.ts` feed the stream and describe what's needed on Workers (e.g. the DO holds the subscribers).
7. Finish with `notes/deploy/storage-port-status.md`: what's done, what's left for an actual Workers deploy (OpenNext adapter, bindings, migration), risks, and an estimate. Report a short summary.

## Rules
- `npm test` and `npm run typecheck` must pass at every commit.
- No behavior change with the default `fs` backend.
- Timebox: stop after ~60 minutes even if incomplete. Leave a clean branch and an up-to-date status doc.
