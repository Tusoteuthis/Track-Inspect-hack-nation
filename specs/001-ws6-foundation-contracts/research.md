# Research: WS6 Sprint 0

## R1 Validation library
- **Decision:** zod ^4 (4.6.x).
- **Rationale:** The prompt requires zod. Types are inferred from the schemas, and refinements cover the region rules.
- **Alternatives:** Hand-written validators like WS3's. These duplicate the type definitions and give less structured issues.

## R2 Test runner
- **Decision:** vitest ^4.1.11, with a `web/vitest.config.mts` identical to WS3's (alias `@` → web dir, `**/*.test.ts`).
- **Rationale:** WS3's unmerged branch adds exactly this. Matching it keeps the later merge conflict to identical lines.
- **Alternatives:** vitest 5.0.3 (latest), which would conflict with WS3's pin.

## R3 Relationship to WS3 contracts
- **Decision:** Mirror `web/lib/expert/contracts.ts` (ws03-sprint-0 @ 00e9ef3) field for field in `web/lib/contracts/expert.ts` as zod schemas. WS6 additions are optional only: `asset_id?` on PointingEvent, `rev?` on ExpertExchange.
- **Rationale:** WS3 is not merged, so we cannot import it. The human chose to mirror it rather than wait.
- **After WS3 merges:** replace the mirror's types with `import type` from `@/lib/expert/contracts`. Keep the zod schemas, plus `satisfies z.ZodType<WS3Type>` checks.

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

## R10 voice merge skipped
`voice` HEAD (44f5489, "WIP") only adds `.DS_Store` and gitlinks for `.claude/worktrees/*`. The human chose to skip the merge, and the handoff records it.
