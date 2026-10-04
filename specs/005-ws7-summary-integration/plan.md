# Plan: WS7 Sprint 4

## Contracts (additive, `web/lib/ui/contracts.ts`, `web/lib/data/source.ts`)
- `DataOrigin` gains `"stub"` (WS6 records can come from stub modules; WS7-Q7). The banner shows for `fixture` and `stub`.
- `AssessmentItem.interventions?: string[]`, `AssessmentView.limitations?: string[]`.
- `SourceUpdate` gains `{ type: "knowledge"; entry_id; revision_id; status: KnowledgeStatus }`.
- `DataSource` gains `revokeEntry(entryId, revisionId)` → `Ack<{entry_id, revision_id}>` and `deleteEvidence(sessionId, eventId)` → `Ack<{event_id, revoked_entry_ids}>`.

## Modules
| Lane | Files |
|---|---|
| A | `lib/summary/assessmentMapper.ts` (+test, WS5 `decisions[]` → `AssessmentView`), `lib/summary/groups.ts` (+test, display guard), `components/summary/SummaryScreen.tsx` (+test), `app/summary/page.tsx`, `fixtures/ui/assessment.json` (populated, labelled) |
| B | `lib/data/fixtureKnowledge.ts` (+test, shared revoke/delete store), `lib/trust/trustState.ts` (+test, pending/ack reducer per action key), `components/trust/TrustControls.tsx` (+test), `components/shell/ConnectionStatus.tsx` (+test) + `useConnectionState`, practice revocation (`reviewMachine` `KNOWLEDGE_REVOKED`, loop), `components/shell/routeErrors.test.tsx` |
| C | `lib/data/ws6Wire.ts` (WS6 wire subset), `lib/data/ws6Mappers.ts` (+test), `lib/data/apiSource.ts` (+test, mocked fetch + fake EventSource), `lib/data/screenSources.ts` (+test), `components/shell/ScreenSource.tsx` |
| D | `notes/ws7-demo-navigation.md`, `web/README.md` section, `e2e/journey.spec.ts` (1920×1080 screenshots → `test-results/journey/`) |

## Key decisions
1. Fixture trust state is a module-level store shared by all fixture sources so cross-route propagation works in one tab, with `reset()` for tests.
2. Revoke pushes `knowledge` + an updated `workmap`/`review` view; WS6 equivalent: `entry.revoked` → re-fetch.
3. `/practice` treats a revoked cited entry like a knowledge change: citations dropped, review back to "not yet reviewed" (WS6 marks dependent evaluations stale).
4. Pages choose a source with `useScreenSource(screen)`; fixture URL settings still apply only to fixture sources.
5. `apiSource` methods whose WS6 route does not exist return a rejected promise / failed Ack with "Not available from the backend yet" — screens configured live would show their error state, so config must keep them on fixture.
6. Session ids: `/review`, `/map`, `/summary` accept `?session=`; fixture ids are the default only for fixture sources.
