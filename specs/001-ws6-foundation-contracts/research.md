# Research: WS6 Sprint 0

## R1 Validation library
- **Decision:** zod ^4 (4.6.x).
- **Rationale:** The prompt requires zod. Types are inferred from the schemas, and refinements cover the region rules.
- **Alternatives:** Hand-written validators like WS3's. These duplicate the type definitions and give less structured issues.

## R2 Test runner
- **Decision:** reuse the vitest ^4.1.11 setup now on `voice` (WS3 and WS7 merged it). WS6 adds only `zod`.
- **Note:** `web/` has both `vitest.config.mts` (WS3) and `vitest.config.ts` (WS7, which is the one that gets used). The duplicate is logged as a request to WS3/WS7.

## R3 Relationship to WS3 contracts
- **Decision:**
  - `web/lib/contracts/expert.ts` imports the WS3 types from `@/lib/expert/contracts` (merged via `voice`) and re-exports them.
  - It wraps each one in a zod schema. A compile-time check proves the schema output equals the WS3 type, so a WS3 change breaks typecheck.
  - WS6 additions are optional and live in extension schemas: `asset_id?` on PointingEvent, `rev?` on ExpertExchange.
- **Rationale:** this is the prompt's primary path. It re-exports WS3's contracts rather than forking them.

## R4 Knowledge revision IDs
- **Decision:** `revision_id` is globally unique and server-generated as `rev-<yyyymmddhhmmss>-<rand6>`. A separate integer `revision_no` (from 1) names the file `entries/<entry_id>/rev-<revision_no>.md`.
- **Rationale:** Confirmations, pins and citations can refer to a revision by ID alone.
- **Note:** WS3's `DraftRevision.revision_id` (`rev-1` per session) is a different record, namely session draft steps.
- **Status:** open question for WS3 and WS5.

## R5 Confirmation naming
- **Decision:** The WS6 `Confirmation` record uses `reviewed_revision_id` and `result`, as the prompt specifies, plus an optional `step_ids_reviewed` and `source`. The WS3 `ExpertConfirmation` (`revision_id`, `status`) is accepted as is and mapped by `toConfirmation()`.
- **Status:** open question to WS3/WS5 to converge on one naming.

## R6 putMutable equal rev
- **Decision:**
  - A lower rev raises `stale_revision`.
  - An equal rev with an identical body is an idempotent retry and returns 200 with the stored record.
  - An equal rev with a different body raises `stale_revision`.
- **Rationale:** This matches the global idempotency rule ("same body again is a no-op"). It still satisfies "rejects lower or equal rev" for any write that would change state.

## R7 Atomic write
- **Decision:**
  1. Write `.<basename>.<rand>.tmp` in the same directory.
  2. `fsync` the file handle, close it, then `rename`.
  3. On any error, `unlink` the temp file (ignoring errors) and rethrow.
- **Rationale:** `rename` is atomic within one filesystem on POSIX.

## R8 Equality for idempotency
- **Decision:** Compare canonical JSON (keys sorted recursively).
- **Rationale:** Key order is not meaningful in JSON.

## R9 Config resolution
- **Decision:**
  - `webDir = process.cwd()`; both `next dev` and vitest run from `web/`.
  - Env vars `KNOWLEDGE_DIR`, `RUNTIME_DIR` and `EVALUATOR_DIR` are resolved with `path.resolve(webDir, value)`.
  - Values are cached on first use. Tests override them via `setConfigForTests()`.
- **Alternatives:** `import.meta.url`, which is unreliable inside the Next bundle.

## R10 voice merge
- **First check:** `voice` was at 44f5489, a WIP commit containing gitlinks, so the merge was skipped.
- **Next check:** `voice` had moved to 4aaa20c. That commit untracks the gitlinks and merges WS3 S0 and WS7 S0.
- **Outcome:** with the human's approval, `voice` was merged into `worktree-ws06-backend`, and this feature branch was recreated on top of it.
