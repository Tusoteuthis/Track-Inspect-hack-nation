# Storage port to R2 + Durable Objects — status

Built on branch `ws-cf-storage` (from `voice` 811309f) and **merged into `voice` as `80b78ab`**. That branch and its
worktree are gone. Pushed with `voice`; the user merges `voice` → `main` by hand.
**Runtime impact today: none.** The default is `STORAGE_BACKEND=fs`, which writes the same files as before. The
Containers deploy (Terminal A) needs no config change. R2 only activates with `STORAGE_BACKEND=r2` plus a bucket
binding, and neither is wired yet.
Start-here overview for all deploy work: [HANDOFF.md](HANDOFF.md).
Inventory of what was ported: [storage-port-inventory.md](storage-port-inventory.md).

## Done

- **`web/lib/backend/blobstore.ts`** — `BlobStore` interface (`getBytes`, `getText`, `put` atomic replace, `append`,
  `list`, `stat`, `delete`, `deleteTree`, `realpath`, `checkWritable`) + `listNames` helper.
  - `FsBlobStore` (default): the old code moved in verbatim — `put` is the former `writeFileAtomic`
    (temp `.<name>.<hex>.tmp` + `wx` + fsync + rename + unlink on failure). Same files, same bytes.
  - `R2BlobStore`: takes an R2 bucket binding (local `R2BucketLike` type, no new deps). `put` = one object put
    (atomic per object). `append` = read-modify-write under the lock provider (see risks).
  - Selection: `STORAGE_BACKEND=fs|r2`, default `fs`. `r2` needs `setR2Bucket(env.BUCKET)` from the Workers entry.
  - **Security invariants**: modules still build paths with `paths.ts` (`safeJoin`, `servable`), unchanged. R2 keys
    come from `toKey(absPath)` → `knowledge/…`, `runtime/…`, `cases/…`; any path in `EVALUATOR_DIR`, outside the
    three roots, or escaping with `..` throws `not_found`. `realpath` on R2 = resolved path (no symlinks), so the
    existing containment checks in `assets.ts` / `cases.ts` still run and still pass/fail the same way.
  - Tests: `blobstore.test.ts` runs one contract suite against both `FsBlobStore` and `R2BlobStore` (in-memory fake
    bucket), plus `toKey` refusal cases and backend selection.
- **All 16 modules ported** (one commit each): store, bus, events, jobs, confirmations, review, learner-store,
  diagnostics, diag, knowledge, workmap, cascade, health, assets, cases, `lib/expert/store.ts`.
  `grep node:fs lib/backend lib/expert/store.ts` (non-test) → only `blobstore.ts` and `config.ts`
  (`existsSync` for the default `CASES_DIR` at startup; left as is).
  Error semantics kept: ENOENT → null/[] where the old code did that, catch-all `.catch(() => [])` kept where it was.
  - Only intended difference: `lib/expert/store.ts` used its own temp+rename (no fsync, temp `<file>.tmp-<pid>-<hex>`);
    it now uses the shared `put` (adds fsync, different temp name). Final files are identical.
  - `cases.test.ts` evaluator-separation allowlist gained `blobstore.ts` (it names the evaluator dir only to refuse it).
- **`LockProvider`** (`locks.ts`): interface + `InMemoryLockProvider` (old code, default) + `setLockProvider`.
  `withLock` export unchanged for callers.
- **`JobTracker`** (`synthesis.ts`): interface over the `globalThis.__ws6SynthesisJobs` Map (default) + `setJobTracker`.
- **`durable.ts`** (sketch, not imported): `LockDurableObject` + `DurableLockProvider` (lease lock with TTL alarm),
  `SessionDurableObject` outline.
- Verification at every commit: `npm test` (141 files / 2005 tests, baseline 140/1990 + new blobstore suite) and
  `npm run typecheck` green; `npm run build` (next build) also passes on the final branch.

## Decisions for Workers

### Synthesis: run it in a per-session Durable Object, triggered by a DO alarm
`requestSynthesis` saves a queued job and returns; the job keeps running afterwards and is polled.
- `ctx.waitUntil`: work after the response is capped at about 30 s, and isolates can't dedupe "one job per
  session". Synthesis calls an LLM and can take longer. Rejected.
- Queues: durable and retried, but it's another binding plus a consumer Worker, and it still needs the
  per-session lock and bus fan-out from somewhere. More moving parts than needed.
- **DO alarm (chosen)**: `SessionDurableObject` (`idFromName(sid)`) saves the job, calls
  `setAlarm(now)` and returns the job id. `alarm()` runs `runJob`. Alarms are retried, aren't tied to the
  request, and the DO is single-threaded and unique per session. That makes the in-memory `JobTracker` and
  the `synth:<sid>` lock correct inside it as they are now. The existing "queued/running left by a restart"
  recovery in `requestSynthesis` covers an eviction mid-run.

### Locks
- Per-session keys (`bus:<file>`, `synth:<sid>`, session/record paths): run that session's mutating routes
  inside its `SessionDurableObject`. The in-memory provider is then correct with no changes.
- Global keys (knowledge lock, confirmations, `asset:<aid>`, idempotency files): use `DurableLockProvider`.
  It's a lease per key held in `LockDurableObject`, with a 30 s TTL alarm so a crashed holder can't block
  forever. Cost: two DO round-trips per locked section.

### SSE
`sse.ts` subscribes to the in-memory subscribers in `bus.ts`, replays `readBusAfter` from the log, then goes
live. `appendBus` appends to the log and then publishes in-process. On Workers an append in isolate A never
reaches a stream held by isolate B, and the `lastSeq` cache goes stale. Fix: `SessionDurableObject` owns the
session. Every `appendBus` for a session and every `GET /api/sessions/:sid/stream` runs in that DO. The
Worker forwards the request and the DO returns the streaming `Response` from `sessionStream` unchanged.
The bus's `globalThis` state is then per-DO, which is exactly per-session. A later improvement is
hibernatable WebSockets, so idle streams don't keep the DO billed.

## How to use / extend (for the next agent)

- **New persistence code** must go through `getBlobStore()` (or `readJson` / `writeJsonAtomic` / `putImmutable` /
  `putMutable` in `store.ts`), never `node:fs` directly. Otherwise it silently won't work on R2.
- **Paths**: keep building them with `paths.ts`. For R2, a path is only valid under `KNOWLEDGE_DIR`, `RUNTIME_DIR` or
  `CASES_DIR`, and never inside `EVALUATOR_DIR`.
- **Tests**: `lib/backend/blobstore.test.ts` runs one contract suite against both backends. Add a case there when
  you add a `BlobStore` method.
- **Locks / jobs**: `setLockProvider()` (`locks.ts`) and `setJobTracker()` (`synthesis.ts`) are the swap points.
  The defaults are the old in-memory behavior.

## Open points (not done)

- [ ] **Not exercised against real R2 or Durable Objects.** Only an in-memory fake bucket is tested.
- [ ] `durable.ts` is an unwired sketch: `LockDurableObject` / `DurableLockProvider` / `SessionDurableObject`.
- [ ] Workers deploy path: OpenNext adapter, R2 + DO bindings, entry wiring (steps 1–7 below).
- [ ] Diag log on R2: each `diag()` call would rewrite the day file. Route it to Workers Logs first.
- [ ] fs → R2 data migration script.
- [ ] `config.ts` still calls `existsSync` at startup (needs `nodejs_compat`, or make it lazy).
- [ ] Optional: redeploy the Containers app from `voice` so the live build includes this refactor. It should
      behave the same; see HANDOFF open point 1.

## Left for an actual Workers deploy

1. **Adapter**: `@opennextjs/cloudflare` build of `web/`, plus `wrangler.jsonc` with `nodejs_compat`, the R2
   binding (`KNOWLEDGE_BUCKET`) and DO bindings (`SESSION_DO`, `LOCK_DO`) with migrations. Terminal A owns the
   current wrangler/Docker files, so this would be a separate config.
2. **Entry wiring**: on each request, `setR2Bucket(env.KNOWLEDGE_BUCKET)` and
   `setLockProvider(new DurableLockProvider(env.LOCK_DO))` (via `getCloudflareContext()`). Set
   `STORAGE_BACKEND=r2`.
3. **Implement `SessionDurableObject`**: dispatch `/api/sessions/:sid/*` (stream, synthesis, events,
   exchanges, review-marks, learner routes) into it. Move synthesis start to the alarm path.
   `/api/jobs/:id` needs a `job → sid` lookup, which it gets from the job record.
4. **Config on Workers**: `process.cwd()` is virtual there. Set `KNOWLEDGE_DIR`, `RUNTIME_DIR`,
   `EVALUATOR_DIR` and `CASES_DIR` explicitly so `toKey` roots are stable. `config.ts`'s `existsSync` needs
   `nodejs_compat`'s fs stub, or should become lazy.
5. **Data migration**: a one-off script that walks the fs roots and does `put(toKey(p))` per file
   (skipping `EVALUATOR_DIR`), or `rclone` with the same prefix mapping. Seed cases go to `cases/`.
6. **Diag log**: an R2 read-modify-write on every request is wasteful. Under `r2`, send `diag()` to Workers
   Logs / Analytics Engine and adapt `readDiagLines` (health page) accordingly.
7. Run the existing route tests under Miniflare / `wrangler dev` with `STORAGE_BACKEND=r2`.

## Risks

- **R2 append**: read-modify-write is O(log size) per append and only safe under a cross-isolate lock (the
  in-memory lock inside `R2BlobStore.append` only covers one isolate). Fine for per-session bus/status logs
  inside the session DO. For long logs, segment them (`bus/000001.ndjson`, …, append = new segment).
- **No rename, no transactions**: multi-file updates (e.g. knowledge revision + `current.json` + status
  log, cascade deletes) aren't atomic on fs either, but on R2 a mid-way failure is more likely (network).
  Cascade is idempotent; revision commits rely on the knowledge lock.
- **List consistency / cost**: R2 list is strongly consistent now, but every `list*` is a paged API call.
  `cascade.loadCascadeGraph` / diagnostics walk every session and get slow at scale. Fine for demo-sized data.
- **Lease TTL**: a locked section longer than 30 s (e.g. a slow synthesis holding `synth:<sid>`) could be
  pre-empted. Keep synthesis inside the session DO, not under a lease.
- **Expert store root**: on R2, `createFileStore(root)` must use `KNOWLEDGE_DIR` (it does in the app),
  because other roots don't map to keys.
- **Untested against real R2/DOs**: the R2 backend is only exercised against a fake bucket. `durable.ts` is
  only a sketch and isn't run.

## Estimate

Roughly 2.5–3 dev-days to a working Workers deploy: adapter + bindings + entry wiring about 0.5 d,
`SessionDurableObject` routing + SSE about 1 d, synthesis on alarms + `DurableLockProvider` hardening about
0.5 d, migration script + diag sink + Miniflare test pass about 0.5–1 d.
