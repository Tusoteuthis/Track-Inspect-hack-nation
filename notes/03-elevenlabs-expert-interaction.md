# Workstream 3 Brief: ElevenLabs Expert Interaction

**Project:** AI Apprentice for Railway Sensor Traces — working name  
**Challenge:** “The AI Apprentice,” Challenge 1, 7th Global AI Hackathon, powered by ElevenLabs  
**Updated:** 3 October 2026  
**Concrete output:** A spoken expert conversation that captures reasoning and guardrails, closes knowledge gaps, and ends with expert confirmation.  
**Reference:** [Full project brief](../project-brief.md)

## 1. Project context you must preserve

An expert wears **Meta Ray-Ban smart glasses** while looking at **sensor traces on a screen**. The expert physically points with a finger to a trace region. A connected application detects the gesture in the camera feed, captures the region, and passes a visual reference to an **ElevenLabs voice agent**.

Your agent asks the expert to explain what they see, then asks about reasons, distinctions, exceptions, and guardrails. The expert is the source of domain knowledge; the agent should not invent the interpretation of a curve. After a spoken debrief and teach-back, confirmed knowledge is saved as Markdown plus linked images and used by a tutor to teach a newcomer on an unseen trace.

The MVP concerns **traces only** and **newcomer teaching**. Drawings, field maintenance, ground-truth dataset production, and classifier training are out of scope. Preserve the glasses-first, physical-pointing interaction.

The five workstreams cover business, glasses/vision, expert conversation, prototype examples, and knowledge/tutoring. You own the expert conversation. WS5 owns the newcomer tutor; share voice infrastructure where useful without leaving tutor behavior unowned.

## 2. Your mission

Turn a visual reference and an expert’s explanation into understandable, evidence-linked knowledge. Ask questions that reveal what the screen cannot explain: why the expert interprets a feature that way, what would change the decision, and when they would stop or ask for help.

Your output must preserve the connection between the expert’s words and the exact pointing event. A smooth conversation with mismatched evidence does not satisfy the task.

## 3. Required conversation outcomes

The challenge requires:

- At least **three live questions** during a real task, each at a natural pause and about visible evidence.
- At least **one live question about a guardrail**.
- At least **three debrief follow-up questions** on matters not already answered during the task.
- A final teach-back that the expert confirms or corrects.
- Evidence links from every workflow step and guardrail to the screen moment and the expert’s own words.

The challenge suggests three-to-five live questions per ten minutes, with other questions deferred. This is guidance on interruption restraint, not a reason to pad a short conversation or repeat answered questions. Coordinate a scenario with enough meaningful decisions and gaps to demonstrate the required behavior.

The agent also needs to support off-record handling and expert corrections consistently with capture and storage.

## 4. Inputs and outputs

### Inputs

From WS2, consume a proposed `PointingEvent` with `session_id`, `event_id`, timestamps, `image_ref`, `highlighted_image_ref`, `region`, `mapping_status`, optional `trace_id`/`channel_id`/`signal_interval`, and `record_state`. WS2 defines image geometry. Do not infer signal time from session time or treat an ambiguous event as resolved.

From the expert, receive spoken explanations, corrections, completion signals, and recording preferences through the supported audio path. Verify the glasses/iPhone microphone and playback route with WS2.

From WS5, receive draft workflow content and a gap list for the debrief. To avoid a circular dependency, WS3 can initially maintain a simple in-memory coverage record while WS5 develops synthesis; both must preserve the same evidence identifiers.

### Proposed output records

These are working handoffs, not existing APIs:

| Record | Minimum content |
|---|---|
| Expert exchange | `exchange_id`, `session_id`, linked `event_id`, question, original expert answer, transcript/audio offsets when available, recording state |
| Candidate knowledge | Observations, interpretation, reasoning, exceptions, guardrails, and the exchanges that support them |
| Open question | The missing fact, why it matters, related event/exchange IDs, whether it was answered later |
| Expert confirmation | Confirmation ID, exact draft revision or entries reviewed, confirmed/corrected/unresolved status, supporting expert response |
| Session completion | Final coverage, unresolved items, confirmed revision reference, and any excluded material |

Preserve the expert’s wording separately from AI summaries. Missing values remain missing; do not synthesize a quote or replace a qualified statement with an absolute rule.

## 5. Suggested interaction flow

The following states are a proposed implementation model:

1. **Observe/listen:** Receive pointing events and expert speech while preserving their association.
2. **Queue a topic:** Select a relevant unresolved point, deduplicate repeated gestures, and wait for an appropriate speaking opportunity.
3. **Ask briefly:** Ask one focused question grounded in the indicated trace region.
4. **Listen and clarify:** Capture the answer; ask a follow-up only when it adds missing reasoning or resolves ambiguity.
5. **Return to observing:** Let the expert continue without announcing every internal state.
6. **Debrief:** Review gaps after the expert signals that the task is complete.
7. **Teach back:** Explain the workflow, distinctions, and limits in plain language.
8. **Confirm/correct:** Apply corrections to the relevant draft and confirm the revised understanding before marking it verified.

The implementation need not use these exact state names. It must distinguish task-time interviewing, debriefing, and confirmation so question counts and evidence can be evaluated accurately.

## 6. Question selection and timing

Pointing identifies a topic; it does not automatically authorize an interruption. The expert may point while explaining. Wait for the explanation, identify what remains unanswered, and ask at a natural pause.

Speech silence alone does not prove that someone has finished reading or thinking. Combine the available gesture, task, and conversation context, and document the prototype’s limitations. If the visual reference has become stale, refer explicitly to the preserved moment or clarify before asking about it.

Useful question patterns:

- “What do you recognize in this region?”
- “Which part of the shape makes you interpret it that way?”
- “What could look similar, and how would you distinguish it?”
- “What additional context do you need before deciding?”
- “When would you stop and ask someone else?”
- “You said ‘usually’—what are the exceptions?”

These are patterns, not a fixed script. Avoid leading questions that insert an unconfirmed physical interpretation. Do not keep asking “why?” if the expert has already supplied the reasoning.

When pointing is ambiguous, clarify the visual reference before interpreting the answer. Repeated gestures toward the same feature should not generate duplicate interviews.

## 7. Debrief and completion logic

Track whether the captured material explains the action or decision, its reason, relevant cues, possible alternatives, guardrails, and unresolved cases. Use that coverage to select debrief questions that were not answered live.

WS5 can synthesize the draft map and gap list; WS3 conducts the spoken debrief and sends the additional evidence back. Repeat only as needed to resolve material gaps.

The teach-back should describe the process as someone else could apply it, not merely summarize the transcript. If the expert corrects one part, update the affected entries and recheck that portion. Record exactly which revision was confirmed. Silence is not confirmation.

Do not declare complete understanding while material questions remain unresolved. It is acceptable to preserve an explicit uncertainty or escalation rule when the expert confirms that uncertainty is itself part of the workflow.

## 8. ElevenLabs integration

ElevenLabs is a confirmed part of the voice experience. The challenge names ElevenAgents, Expressive Mode, and Scribe v2 Realtime, but no precise API, SDK version, model, or orchestration path has been selected.

Verify current official capabilities when implementing. Work with WS2 on microphone/playback routing and with WS5 on reusable tutor voice infrastructure. Keep transport details separate from question selection and evidence linkage so the latter can be developed with fixture events.

Record processing delay separately from intentional waiting for a pause. A good interaction can deliberately delay a question; that should not hide slow or stale processing.

## 9. Deliverables

- Expert agent instructions and the chosen interaction flow.
- Working integration that receives pointing events and conducts spoken questions through ElevenLabs.
- Structured, evidence-linked exchange records plus original expert wording.
- Coverage/gap tracking, debrief behavior, teach-back, and recorded confirmation.
- A reusable voice integration component or documented interface for WS5 where practical.
- Demonstration transcript and timing evidence showing the required live and debrief behavior.
- Clear handling of ambiguous references, interruption, expert correction, off-record material, and incomplete sessions.

Simulated events may be used during development, but the integrated demo must identify what is live and what is a fixture.

## 10. Dependencies and handoffs

| Partner | Receive | Provide |
|---|---|---|
| WS2 | Pointing events, evidence, timestamps, hardware/audio constraints | Conversation timing signals, ambiguity clarification needs |
| WS4 | Scenario structure and expert-reviewed training cases | Missing cases needed to exercise reasoning, exceptions, and debrief |
| WS5 | Draft Work Map, unresolved questions, persisted revision IDs | Expert exchanges, corrections, confirmation tied to revisions |
| WS1 | Demo sequence and audience needs | Real conversation examples and verified capture claims |

Do not load WS4’s held-out answer key into the expert agent or tutor as if it were captured knowledge. Expert scenario notes support the human demonstration; the system should learn the reasoning through the actual expert session.

## 11. Acceptance criteria

- Three relevant live questions, including a guardrail question, are supported by identifiable visual events.
- Three distinct debrief questions address genuinely unanswered matters.
- Observed timing supports the claim that the agent waits appropriately rather than interrupting ongoing speech or issuing repetitive questions.
- Questions, answers, and later map entries refer to the correct event even if the expert moves on.
- The expert can correct a statement, and the resulting confirmed revision reflects that correction.
- Expert confirmation is explicit and auditable.
- Off-record content is excluded or removed consistently from the agreed recording and knowledge paths.
- The captured output is sufficient for WS5 to teach a new case without supplying an unrelated answer script.

## 12. Suggested first steps

Agree on one pointing-event fixture with WS2, one expert scenario with WS4, and the exchange/confirmation handoff with WS5. Make one complete “point → question → answer → saved evidence” interaction work, then add follow-ups, debrief, and confirmation. Keep model and voice choices provisional until the real audio path is verified.
