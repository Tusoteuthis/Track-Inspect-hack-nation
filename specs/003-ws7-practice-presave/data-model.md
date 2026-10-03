# Data model: WS7 S2

## ReviewStatus
`editing_unreviewed | review_pending | guidance_needed | review_complete | saving | saved | save_failed`

## ReviewMachineState
| field | type | note |
|---|---|---|
| status | ReviewStatus | |
| draft_revision | number | starts at 1, bumped by EDIT |
| knowledge_revision_id | string | from the case |
| requested_revision | number \| null | the revision under review |
| evaluation | LearnerEvaluation \| null | the current, non-stale evaluation |
| idempotency_key | string \| null | set by SAVE_REQUESTED |
| error | string \| null | review or save failure |

## Events
`EDIT`, `REQUEST_REVIEW`, `EVALUATION_RECEIVED{evaluation}`, `REVIEW_FAILED{error}`, `KNOWLEDGE_REVISION_CHANGED{knowledge_revision_id}`, `SAVE_REQUESTED{idempotency_key}`, `SAVE_ACKED`, `SAVE_FAILED{error}`, `RESET`

`REVIEW_FAILED` is an addition. It turns an evaluation error into `editing_unreviewed` with the error kept, so review can be requested again.

## Transitions
| from \ event | EDIT | REQUEST_REVIEW | EVAL (match) | EVAL (stale) | KNOW_CHANGED | SAVE_REQ | SAVE_ACKED | SAVE_FAILED |
|---|---|---|---|---|---|---|---|---|
| editing_unreviewed | rev+1 | review_pending | ignore | ignore | id update | ignore | ignore | ignore |
| review_pending | rev+1 → editing | ignore | mapped | ignore | → editing | ignore | ignore | ignore |
| guidance_needed | rev+1 → editing | ignore | ignore | ignore | → editing | ignore | ignore | ignore |
| review_complete | rev+1 → editing | ignore | ignore | ignore | → editing | saving | ignore | ignore |
| saving | ignore | ignore | ignore | ignore | → editing | ignore | saved | save_failed |
| saved | ignore | ignore | ignore | ignore | ignore | ignore | ignore | ignore |
| save_failed | rev+1 → editing | ignore | ignore | ignore | → editing | saving (retry) | ignore | ignore |

Notes:
- `guidance_needed` → REQUEST_REVIEW is ignored: the learner must edit first. A forced re-review of an unchanged draft would only reproduce the same result.
- `RESET` returns to the initial state with a new draft from revision 1.

## PracticeTimelineEntry
`{ kind: "proposed"|"guidance"|"corrected"|"saved"; at_utc: string; draft_revision: number }`

## ScreenFrameRef
`{ frame_id: string; captured_at_utc: string; draft_revision: number; source: DataOrigin }`

## ScreenCaptureState
`unsupported | idle | requesting | active | denied | stopped | error`
