# Plan: WS5 Sprint 3

Modules in `web/lib/knowledge/`:
- `evaluation-types.ts` — `LearnerDraftInput`, `LearnerCaseView`, `Judge`, `JudgeVerdict`, `TutorEvaluation`, `Citation`.
- `case-view.ts` — `assertLearnerCaseView` (evaluator-field rejection, allowlist).
- `judge-input.ts` — builds what the judge sees (no case id/title; eligible retrieved entries only).
- `evaluate.ts` — pipeline: input guard → retrieve → judge → output guard → feedback composition.
- `output-guard.ts` — citation/quote/feedback/escalation rules (pure).
- `judge-anthropic.ts` — Anthropic `claude-opus-5-5`, `output_config.format` json_schema, `fallbacks: "default"`; throws on refusal/parse failure (WS6 marks the evaluation `failed`, which never permits a commit).
- `timeline.ts` — `buildTimeline`.
- `adapters/ws6-tutor-evaluator.ts` — WS6 `TutorEvaluator` (structural types; WS6 S3 not merged).

Fixtures: `web/fixtures/ws5/drafts/*.json` (labelled, `source: "fixture"`), harness `web/fixtures/ws5/drafts/run-eval.mts` (`npm run eval:ws5`). Labels live outside `lib/knowledge/`; the grep test enforces it.

Shared-file edits: `web/package.json` (+ lock): `@anthropic-ai/sdk` dependency and `eval:ws5` script (required by D1).
