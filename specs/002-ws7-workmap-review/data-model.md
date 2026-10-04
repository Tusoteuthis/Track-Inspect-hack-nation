# Data model: WS7 Sprint 1 (additive to `ws7.ui.v0`)

## WorkMapView (extended)
| Field | Type | Note |
|---|---|---|
| `revision_label` | string | NEW. Human-readable, e.g. "Revision 2". Shown instead of the id. |
| `parent_revision_id` | `DraftRevision["parent_revision_id"]` | NEW. null for the first revision. |
| `change_reason` | `DraftRevision["change_reason"]` | NEW. Shown as non-verbatim text. |
| existing | — | `session_id`, `revision_id`, `steps`, `source` unchanged |

## ReviewView (new)
| Field | Type |
|---|---|
| `session_id` | string |
| `current` | WorkMapView — the revision under review |
| `previous` | WorkMapView \| null — its parent, for change marking |
| `open_questions` | WS3 `OpenQuestion[]`; answered ⇔ `answered_by_exchange_id !== null` |
| `confirmations` | WS3 `ExpertConfirmation[]` for the session |
| `source` | DataOrigin |

## ReviewMark (new)
`{ session_id, entry_id, revision_id, kind: "correction_requested" | "flag_unresolved" }` → `Ack<{ received_at_utc: string }>`.

## SourceUpdate (extended)
`| { type: "review"; review: ReviewView }`

## Derived (UI-only, pure)
- **StatusPresentation** per `KnowledgeStatus`: icon, label, `teachable` (false for revoked/missing). Only confirmed → "Confirmed".
- **RevisionDiff**: `{ hasPrevious, changed: Record<entry_id, FieldChange[]>, added: entry_id[], removed: {entry_id, title}[], anyChange }`; FieldChange `{ field, label, before, after }` with text values.
- **ReviewState**: `{ review, notice: null | {kind: "new_revision", label} | {kind: "confirmation", label} | {kind: "updated"} }`. Updates for other sessions ignored.
- **MarkState**: map key `rev|entry|kind` → `idle | pending | acknowledged | failed(error)`; submit ignored while pending.
- **DeepLink**: `{ selectedId, notice: null | "unknown_entry" | "other_revision" }`.

## Fixture script stages
| # | Name | current | previous | confirmations | open questions answered |
|---|---|---|---|---|---|
| 0 | Revision 1 under review | rev-1 | null | — | q3 |
| 1 | Expert correction | rev-1 | null | rev-1 corrected | q1, q3 |
| 2 | Revision 2 delivered | rev-2 (draft) | rev-1 | rev-1 corrected | q1, q3 |
| 3 | Revision 2 confirmed | rev-2 (steps confirmed) | rev-1 | + rev-2 confirmed | q1, q3 |
