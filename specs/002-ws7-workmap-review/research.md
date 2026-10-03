# Research: WS7 Sprint 1

No NEEDS CLARIFICATION items remained. Decisions:

1. **WS3 types are embedded, not redefined.** `ReviewView.open_questions: OpenQuestion[]` and `confirmations: ExpertConfirmation[]` use `web/lib/expert/contracts.ts` directly. Revision metadata on `WorkMapView` (`parent_revision_id`, `change_reason`) is typed as `DraftRevision[...]`. *Alternative:* WS7 copies of these types; rejected (prompt forbids duplication). `DraftRevision.steps` is not used because the Work Map needs evidence and quotes that only WS5 content provides.
2. **Human-readable revision label.** New `WorkMapView.revision_label` (e.g. "Revision 2"). The UI never derives a label from the id. *Alternative:* parse `rev-2` from the id; rejected (ids are opaque).
3. **Change detection is a pure UI diff** of the current revision against its parent (`previous`). It compares displayed fields (title, kind, status, summary, reasoning, guardrails, quotes, evidence, open question). It makes no domain judgement. *Alternative:* WS6 sends a change list; can replace the diff later in the mapping layer.
4. **Confirmation tied to revision.** The header shows the latest confirmation whose `revision_id` equals the current revision; a confirmation for the parent revision is shown only as history ("Revision 1 was corrected").
5. **Supplementary marks** are one `DataSource.submitReviewMark(mark)` returning `Ack<{ received_at_utc }>`. Acknowledgement means "received", not "corrected". Keyed by revision + entry + kind, so a new revision shows fresh controls.
6. **Fixture script** lives in `fixtureReviewScript.ts`, a small state machine over explicit JSON stages (no patch logic). Controls (`advance`, `reset`, `setFailMarks`) are exported for the fixture playback panel and tests; the panel renders only when the active source is `fixtureSource`. State is per browser tab; reload resets.
7. **Reasoning/guardrails are styled as non-verbatim.** Conservative B2 reading: only `expert_quotes` are the expert's words.
8. **Revoked/missing detail** shows title, kind, badge and a notice only. Missing expert words / visual evidence states are shown for teachable items (draft/confirmed/unresolved).
9. **Keyboard model**: `<ol>` of buttons with roving tabindex; arrows/Home/End move focus (no wrap); Enter/Space activates (native button). Selection updates the URL with `router.replace` (no history spam, no scroll).
10. **`useSearchParams` needs a Suspense boundary** in Next 16 for static prerender; the `/map` page wraps the bound screen in `<Suspense>`.
