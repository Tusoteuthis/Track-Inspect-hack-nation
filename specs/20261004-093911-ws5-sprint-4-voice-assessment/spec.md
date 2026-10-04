# Feature Specification: WS5 Sprint 4 — Voice tutor, screen observation, assessment & trust

**Feature Branch**: `worktree-ws05-sprint-4`

**Created**: 2026-10-04

**Status**: Draft

**Input**: User description: "WS5 Sprint 4 — voice tutor, screen observation, assessment & trust" (full prompt: `notes/ws5-sprints/sprint-4-voice-assessment.md`; that prompt wins on conflicts).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The tutor speaks with the expert's words (Priority: P1)

A newcomer works on a trace the expert never showed. When they ask for a review of a wrong draft, the voice tutor first asks a guiding question about what is visible, then explains with the expert's own words (quoted exactly as delivered), and never adds a rule of its own. When the captured knowledge does not cover the case, the tutor says so and follows the expert's escalation rule or asks for context. It never tells the learner they have mastered something after one coached correction, and it does not talk over a learner who is still writing.

**Why this priority**: This is the visible half of the challenge's "catch a wrong decision before it is saved, explained with the expert's reasoning".

**Independent Test**: Text simulations of the tutor agent with scripted context (five probe cases, five runs each) without a microphone.

**Acceptance Scenarios**:

1. **Given** an `intervene` evaluation delivered as context, **When** the learner asks why they cannot save, **Then** the tutor's reply asks a question before quoting anything.
2. **Given** an evaluation citing one expert quote, **When** the learner asks what the expert said, **Then** every quoted span in the reply is part of a delivered quote.
3. **Given** a feature the knowledge never covers, **When** the learner asks what it means, **Then** the tutor says the knowledge does not cover it and points to escalation, and states no rule.
4. **Given** the learner is mid-draft, **When** they say they are still writing, **Then** the tutor stays silent or acknowledges briefly without a question.
5. **Given** one coached correction was saved, **When** the learner asks whether they have mastered it, **Then** the tutor does not agree and suggests further practice.

---

### User Story 2 - An honest learning assessment (Priority: P1)

After the learner saves (or ends the session), a written assessment says, per decision, whether it was correct without help, correct after help, or unresolved/escalated; which interventions happened and which expert entries they cited; what to practise next (derived from the entries that needed help); and limitations that always say one coached correction is not proof of independent mastery. A second, reduced-help case is reported separately as transfer.

**Why this priority**: The challenge's learning-outcome requirement; WS1 uses it in the pitch.

**Independent Test**: Pure function over a timeline, evaluations, commits and pinned knowledge; rendered Markdown.

**Acceptance Scenarios**:

1. **Given** a decision committed after one intervention, **When** the assessment is built, **Then** its class is `correct_after_help`, practice_next names the intervention's cited entry, and limitations contain the mastery disclaimer.
2. **Given** a decision committed with an `ok` and no guidance, **Then** the class is `correct_unassisted` and practice_next is empty.
3. **Given** no commit, or a commit with escalation, **Then** the class is `unresolved_or_escalated`.
4. **Given** an earlier session on a different case, **Then** transfer is reported separately; without one, limitations say transfer was not tested.

---

### User Story 3 - Screen observation contract (Priority: P2)

The evaluator and the tutor consume one documented description of what is on the learner's screen: the shared frame (if any), the region the learner marked, the visible case, the draft revision and capture time, and whether it came from screen sharing or app state. The tutor's question refers to that region.

**Independent Test**: Validation and mapping functions with unit tests; mapping to WS6 `visual_context` and from WS7 practice state.

**Acceptance Scenarios**:

1. **Given** a screen context for another draft revision or case, **Then** it is not used for the current evaluation.
2. **Given** a marked region, **Then** the text given to the evaluator/tutor describes its position on the frame without any case id and without reading values off the trace.

---

### User Story 4 - Trust holds on every path (Priority: P1)

Revoking an entry removes it from teaching at once; a session pinned to it learns that its knowledge changed. Entries that depend on revoked or deleted evidence are flagged. Off-record words never show up in synthesis, retrieval, evaluation citations, tutor context blocks or assessments. Assessments and evaluator notes are never usable as knowledge.

**Independent Test**: One test walks every output path with off-record markers; revocation and dependency tests.

**Acceptance Scenarios**:

1. **Given** a pinned session citing entry E, **When** E is revoked, **Then** E is excluded from eligibility, the pin reports `knowledge_changed`, and building a tutor context block that cites E is refused.
2. **Given** off-record exchanges with marker strings, **When** every output is produced, **Then** no output contains a marker.

---

### User Story 5 - End-to-end proof (Priority: P2)

One script runs the chain on the real modules: expert fixture → synthesis → confirmation → pin → unseen case → wrong draft → intervention with citation → revised draft → ok → commit → assessment, printing the ID chain from the expert's quote to the learner's feedback and labelling each step live, fixture or stand-in.

**Independent Test**: Run the script; output pasted in the handoff.

### Edge Cases

- Evaluation failed or pending: never counts as help or as a judgement.
- Guidance delivered on a draft that was later edited (stale evaluation): still counts as help received.
- An intervention discovered after save: reported, class `unresolved_or_escalated`.
- A cited entry revoked after the session: the assessment keeps the reference but shows no quote and marks it no longer taught.
- Screen context missing entirely: evaluation works from the draft text; the tutor block says no region was marked.
- Fixture inputs anywhere: the output is labelled fixture.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tutor agent prompt MUST make the tutor ask what the learner notices before explaining, one question at a time.
- **FR-002**: The tutor MUST quote only text delivered in the current evaluation context and MUST NOT state a domain rule that is not in the delivered citations.
- **FR-003**: The tutor MUST say plainly when the knowledge does not cover something and follow the delivered escalation or context request.
- **FR-004**: The tutor MUST NOT claim mastery after one coached correction, and MUST NOT interrupt a learner who is drafting.
- **FR-005**: Knowledge MUST reach the agent only as the cited, eligible snippets of the current evaluation (a context block), never as a bulk upload; evaluator notes never reach it.
- **FR-006**: A context-block builder MUST refuse citations that are not currently eligible or not verbatim.
- **FR-007**: `LearnerScreenContext` MUST be validated, mapped to WS6 `visual_context`, and described as text without case ids for the evaluator and tutor.
- **FR-008**: `buildAssessment` MUST classify each decision into exactly one of the three classes, list interventions and cited entries, derive practice_next from intervention citations, and always include the mastery disclaimer in limitations.
- **FR-009**: Transfer from an earlier, different case MUST be reported separately from the current decision.
- **FR-010**: `renderAssessmentMarkdown` MUST produce a readable record that never claims mastery.
- **FR-011**: A WS6 assessment adapter MUST fill WS6's minimal fields and put the WS5 structure in `content`.
- **FR-012**: Revocation MUST propagate: excluded from eligibility, pinned sessions report knowledge changed, dependents flagged.
- **FR-013**: Off-record material MUST NOT appear in any output path; assessments and evaluator notes MUST NOT be eligible.
- **FR-014**: The e2e script MUST print the ID chain and label every step live / fixture / stand-in.

### Key Entities

- **LearnerScreenContext**: frame asset id or null, region or null, visible case id, draft revision, capture time, source (screen_share | app_state).
- **TutorContextBlock**: text plus context id delivered to the voice agent for one evaluation.
- **Assessment**: session id, decisions (initial draft rev, outcome class, interventions, cited entries), skills demonstrated, needed help with, practice next, transfer, limitations, source.
- **DependentFlag**: an entry revision that shares evidence with revoked or deleted material.
- **PinCheck**: current vs knowledge_changed for a session's pinned revisions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Each of the five tutor behaviours holds in at least 4 of 5 simulated runs.
- **SC-002**: 100% of assessments contain the mastery disclaimer; no assessment text claims mastery.
- **SC-003**: 0 off-record marker strings in any output path in the walk-every-path test.
- **SC-004**: The e2e run shows an expert quote traced to the learner's feedback, a blocked save, a corrected save and an assessment of "correct after help".
- **SC-005**: Every brief §12 acceptance criterion is mapped to evidence or to "not met + why" in the handoff.

## Assumptions

- WS6 (commit guard, assessment and revoke routes) is not merged; the e2e uses a clearly labelled local stand-in for the commit policy, and WS6 swaps in our adapter later.
- No `ANTHROPIC_API_KEY` is available; the e2e uses the Anthropic judge when the key exists and otherwise a labelled scripted stand-in judge (the guards stay real).
- WS7's `/practice` screen is merged, so no WS5 dev harness is built.
- Dynamic variables are not used by the tutor prompt (WS7 does not pass them, and an unfilled placeholder would break session start); session facts arrive as context blocks.
- No client tools are added: WS7's Request review button triggers evaluation, and the save gate stays on the server.
