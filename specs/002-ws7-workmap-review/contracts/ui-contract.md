# UI contracts: WS7 Sprint 1

## DataSource additions (`web/lib/data/source.ts`)
```ts
getReview(sessionId: string): Promise<ReviewView>;           // rejects for unknown ids
submitReviewMark(mark: ReviewMark): Promise<Ack<{ received_at_utc: string }>>;
// subscribe may now push { type: "review", review } and { type: "workmap", workmap }
```

## Routes
- `/map?entry=<entry_id>&rev=<revision_id>`: both optional. Selection writes both back with `router.replace`.
- `/review`: the current revision of the fixture expert session.

## Component props
- `WorkMapList({ steps, selectedId, onSelect, markers?, label })` — `<ol>` of buttons; `markers[entry_id]` = "Changed" | "Added".
- `WorkMapDetail({ step })` — evidence selector, EvidenceViewer (`mode="focus"`), labelled regions "Expert's words", "Apprentice summary", "Reasoning", "Guardrails and exceptions", status notices.
- `WorkMapScreen({ sessionId, entryId, revisionId, onSelect })` — loads + subscribes; router-free.
- `ReviewScreen({ sessionId })` — loads + subscribes; header, list, detail with changes and marks, open questions, fixture playback.

## Test hooks
- `data-status` on every status badge; `data-kind` on list items; `data-marker` on change markers; `data-mark-state` on mark controls.
- Reused: `data-render-state`, `data-mode`, `region-outline`.
