# Implementation Plan: WS5 Sprint 4 — Voice tutor, screen observation, assessment & trust

**Branch**: `worktree-ws05-sprint-4` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

## Summary

Pure TypeScript modules in `web/lib/knowledge/` (observation, tutor context blocks, assessment, trust), a WS6 assessment adapter, the full tutor agent prompt in `agents/tutor/`, tutor probes in `agents/probes.json` with a small additive extension of the probe checker, and a dev e2e script. No routes, stores or UI (WS6/WS7 own them).

## Technical Context

- TypeScript strict, Next.js 16 app in `web/`, vitest. Path alias `@/*` → `web/*`.
- Partner types: WS3 `web/lib/expert/contracts.ts` (`Region`, `ExpertExchange`, `PointingEvent`); WS6 `ws6.v0` (not merged — mirrored structurally like Sprint 3's adapter); WS7 `web/lib/ui/contracts.ts` (`EvidenceRegion`, `ScreenFrameRef`, `LearnerDraft`).
- ElevenLabs: tutor agent `ELEVENLABS_AGENT_ID_TUTOR`; context via `sendContextualUpdate` (verified silent, used on next turn — WS3 capabilities doc (a)); probes via `simulateConversation` where context is injected as user-role turns.
- No `ANTHROPIC_API_KEY`: the LLM judge is unavailable; the e2e falls back to a labelled scripted judge.

## Constitution Check

- I/II Expert is source of truth, verbatim: context blocks carry only verified verbatim citations; assessment labels use pinned entries only, quotes verbatim.
- III Evidence linkage: citations keep entry/revision/exchange ids and the evidence event.
- IV Time discipline: screen context has capture time only; the region description gives frame position, never signal values.
- V Fixtures labelled: assessment/e2e carry `source`; e2e labels every step.
- VI Trust/off-record: walk-every-path test; revocation propagation; eligibility re-checked when building context blocks.
- VII Verifiable increments: TDD; probes 5×; outputs pasted.
- VIII Simplicity: no new dependencies.

## Design

### `observation.ts` (Lane B)
- `LearnerScreenContext { frame_asset_id | null, region: Region | null, visible_case_id, draft_rev, captured_at_utc, source: "screen_share" | "app_state" }`.
- `assertLearnerScreenContext(x)` validates (ids, region bounds, ISO UTC, source).
- `screenContextFor(contexts, { draft_rev, case_id })` → latest matching or null (stale ones dropped).
- `describeScreenContext(ctx | null)` → text for evaluator `visual_context` and tutor block: region position in words + frame reference + source; no case id, no values.
- `toWs6VisualContext(ctx)` / `fromWs6VisualContext(draft, case_id)`; `fromPracticeState({ draft, frame, case_id, frame_size })` maps WS7 state.

### `tutor-context.ts` (Lane A)
- `buildEvaluationContextBlock({ evaluation_id, draft_rev, evaluation, pinned, ctx, screen })` → `{ text, contextId }`. Format `[EVALUATION eid=… draft_rev=… outcome=…] … [/EVALUATION]` with `guiding_question:`, numbered `cite` lines (entry, revision, exchanges, kind, verbatim quote), `evidence`, `escalation`, `learner_screen`. Refuses (throws `TutorContextError`) when a citation's revision is not teachable now, the quote is not verbatim, or the feedback quotes uncited text. Explanation sentences that quote are not passed; only the guiding question, the citations and the uncertainty/escalation/missing-context text.
- `buildSessionContextBlock({ case_label, pinned_count, screen })` → `[SESSION …]` orientation block (no knowledge).

### `assessment.ts` (Lane C)
- `buildAssessment({ session_id, timeline, evaluations, commits, knowledge, drafts?, earlier?, source, created_at_utc })`.
- Decisions are segmented by commit (drafts up to and including a committed rev form one decision; the rest form an open decision).
- Classes: committed + final `ok` + no guidance → `correct_unassisted`; committed + final `ok` after guidance → `correct_after_help`; otherwise (no commit, escalated, final uncertain, intervene after save) → `unresolved_or_escalated`.
- Interventions = evaluations (done or stale) with outcome intervene/uncertain; with delivery times from the timeline.
- skills_demonstrated = entries cited in the decision's final `ok` evaluation that were not cited in its interventions; needed_help_with / practice_next = entries cited in interventions (+ escalation entry).
- Labels from pinned entries only (kind + first verbatim quote); unknown/revoked → "no longer taught", no quote.
- limitations: mastery disclaimer always; "correct = consistent with captured knowledge per evaluator, no answer key"; observed-n statement; transfer not tested (or transfer reported separately); fixture note.
- `transfer`: from `earlier` assessments of other sessions; compares classes per shared entry.
- `renderAssessmentMarkdown(a)`.

### `adapters/ws6-assessment-module.ts`
- `createWs6AssessmentModule()` → `{ id: "ws5-assessment", version, build({ session, drafts, evaluations, commits, pinned, deliveries?, earlier? }) → { assessment: Ws6Assessment, markdown } }`; minimal WS6 fields + `content`.
- Evaluator adapter: pass `describeScreenContext(fromWs6VisualContext(draft))` as the judge's visual context (was null).

### `trust.ts` (Lane D)
- `checkPinnedKnowledge(pinned refs, candidates, ctx)` → `{ status: "current" } | { status: "knowledge_changed", changed: […] }` (WS6 maps to `evaluation_stale` / `knowledge_changed`).
- `flagDependents({ candidates, revoked, deleted_exchange_ids, deleted_event_ids })` → `DependentFlag[]` (shares exchange / shares event / evidence deleted).

### Tutor agent (Lane A)
- `agents/tutor/system-prompt.md`, `first-message.md`; manifest gets `systemPrompt`, `firstMessage`, `settings` (llm, patient turn taking, skipTurn, client events); push `--agent tutor` only.
- Probes: five tutor cases; `probe-agents.mts` gains optional, additive expect fields (`requireQuestion`, `questionBeforeQuote`, `allowedQuotes`, `requireAnyPatterns`, `maxWords`).

### `dev/e2e-ws5.mts` (Lane D)
Chain on real modules; step labels LIVE / FIXTURE / STAND-IN; optional `--live-tutor` runs the tutor agent on the generated context block via simulateConversation.

## Project Structure

```
web/lib/knowledge/{observation,tutor-context,assessment,trust}.ts (+ __tests__)
web/lib/knowledge/adapters/ws6-assessment-module.ts
web/lib/knowledge/dev/{scenario.ts,e2e-ws5.mts}
web/fixtures/ws5/e2e/ (confirmation exchange, unseen case, drafts)
agents/tutor/*, agents/manifest.json, agents/probes.json, web/scripts/probe-agents.mts (additive)
notes/ws5-sprints/docs/knowledge-schema-v0.md §11, notes/ws5-sprints/handoff-sprint-4.md
```
