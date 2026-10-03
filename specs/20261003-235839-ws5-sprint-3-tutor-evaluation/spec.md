# Spec: WS5 Sprint 3 — Tutor evaluation & pre-save intervention

Source prompt: `notes/ws5-sprints/sprint-3-tutor-evaluation.md` (it wins on conflicts). D1 = (a) server-side Anthropic LLM judge.

## User stories
- **US1 (WS6 commit guard):** given a learner draft, the learner-visible case and the pinned eligible knowledge, get `ok | intervene | uncertain` so the server can block a wrong decision before it is saved.
- **US2 (newcomer):** when intervened, first get a guiding question, then the expert's own words (verbatim, with a pointer to the evidence image). A needed guardrail is never withheld.
- **US3 (newcomer, uncovered case):** when the knowledge does not cover the case, get `uncertain` with a confirmed escalation rule or a request for missing context — never an invented rule.
- **US4 (assessment, Sprint 4):** an ordered timeline of proposed / evaluated / guidance_delivered / revised / committed that separates "caught before save" from "discovered after save".

## Functional requirements
- FR-001 Input guard: every knowledge revision passes `isTeachable` (else throw); `case_view` carrying evaluator/answer-key fields is rejected.
- FR-002 Retrieval via `retrieve()` (guardrails/escalations always included); the judge sees only retrieved eligible entries, the visible case (no case id) and the draft.
- FR-003 Judge behind an interface; Anthropic implementation with structured output; deterministic tests mock it.
- FR-004 Output guard: citations must reference pinned revisions; quotes verbatim in that revision's expert words; `intervene` (and `ok`) without a valid citation → `uncertain`; feedback/question may not contain uncited quoted text; escalation must reference a pinned escalation rule.
- FR-005 Feedback: guiding question first, then expert reasoning with quote + evidence pointer; cited guardrails always shown.
- FR-006 WS6 `TutorEvaluator` adapter (`id: "ws5-tutor"`).
- FR-007 Labelled draft fixtures (5+ classes), anti-cheating tests (grep, case-id rename, guardrail removal).
- FR-008 LLM harness: each class 5×, ≥ 4/5 required, counts in the handoff.
- FR-009 `buildTimeline` pure + tested.

## Out of scope
Voice delivery, tutor agent prompt (S4), routes/commit guard (WS6), UI (WS7), domain categories.
