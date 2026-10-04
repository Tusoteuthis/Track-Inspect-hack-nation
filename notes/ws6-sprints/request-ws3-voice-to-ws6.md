# Request to WS3: expert voice session writes to WS6 (G19)

From: WS6 · 2026-10-04 · Decided by the human: raise now. Context: `notes/ws6-ws7-integration-plan.md` G19.

## Problem

`web/components/expert/useExpertSession.ts` (as of `worktree-ws03-sprint-4@e8e2fcf`) saves the expert session through WS3-only routes:
- `PUT /api/expert-sessions/:id/snapshot`
- `POST /api/expert-sessions/:id/elevenlabs-deletion`
- `POST /api/expert-sessions/:id/demo-evidence`

None of these reach the WS6 record. As a result:

- Exchanges and confirmations from a live expert conversation never become WS6 `ExpertExchange` / `Confirmation` records.
- So no synthesis job runs, no knowledge revision is confirmed, and the Work Map, `/review` and newcomer practice cannot use what the expert said. The demo path only works from WS6 replay/fixtures.
- WS6 `/api/sessions/:sid/stream` does not see the voice session, so the WS7 expert companion shows no live updates from it.

## What WS6 offers (all implemented on `006-ws6-trust-demo`, api-v0 §5)

| WS3 action | WS6 call |
|---|---|
| Start the expert session | `POST /api/sessions {role:"expert", case_id?}` + `Idempotency-Key`, then `POST …/lifecycle {action:"start", rev}`. WS6 adds `case_id` for experts (G8) |
| Each exchange (question + answer lines), and each update to it | `PUT /api/sessions/:sid/exchanges/:exchange_id` with body `ExchangePut` (the WS3 `ExpertExchange` + `rev`). A higher `rev` replaces; an equal `rev` with the same body is idempotent |
| Pointing event | `PUT /api/sessions/:sid/events/:event_id` (`PointingEventIngest`; `asset_id` required, upload the asset first with `PUT …/assets/:aid`) |
| Teach-back confirmation | `POST /api/knowledge/confirmations`. It accepts the WS3 `ExpertConfirmation` as-is (mapped by `toConfirmation`) |
| Off-record / back on record | `POST /api/sessions/:sid/record-state {state, since_utc?}`. `since_utc` purges from that time; this covers strike-last |
| Delete / ElevenLabs deletion | `DELETE /api/sessions/:sid/exchanges/:xid` or `DELETE /api/sessions/:sid` (cascade). Whether the ElevenLabs-side deletion stays WS3-only is your call |
| End | `POST …/lifecycle {action:"end", rev}`. then `POST …/synthesis`; WS6 does not start synthesis on its own |

## Asks

1. **Write path.** Change `useExpertSession` (or a small WS3 adapter) to write through the WS6 routes above. The snapshot route can stay as a local backup during the transition.
2. **Contract drift (ws3.v1).** WS6 re-exports the WS3 types from `web/lib/expert/contracts.ts` with compile-time drift checks (`web/lib/contracts/expert.ts:204`). `ws3.v1` changed that file by +759 lines. Please list the breaking changes to the 10 re-exported types: `AnswerLine`, `CoverageItem`, `DraftRevision`, `DraftStep`, `ExpertConfirmation`, `ExpertExchange`, `OpenQuestion`, `PointingEvent`, `RecordingSegment`, `TimingMark`. WS6 will adapt in the integration branch.
3. **Merge order.** A trial merge of WS3 S4 with WS6 `006` conflicts only on `.gitignore`. We propose merging WS3 S4 into `integration-ws6-ws7` after its gate, so all three meet on one branch before `voice`.

Reply in your handoff under "WS6 requests", or tell the human.
