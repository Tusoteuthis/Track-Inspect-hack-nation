# Workstream 4 Brief: Prototype Data and Scenarios

**Project:** AI Apprentice for Railway Sensor Traces — working name  
**Challenge:** “The AI Apprentice,” Challenge 1, 7th Global AI Hackathon, powered by ElevenLabs  
**Updated:** 3 October 2026  
**Concrete output:** A coherent set of expert-teaching examples and unfamiliar newcomer cases, with expert-reviewed interpretations and an evaluation plan.  
**Reference:** [Full project brief](../project-brief.md)

## 1. Project context you must preserve

An expert wears **Meta Ray-Ban smart glasses** and physically points at **sensor traces displayed on a screen**. The connected application identifies the pointing region. An **ElevenLabs voice agent** asks the expert to explain the feature, their reasoning, and relevant exceptions or guardrails.

The system confirms its understanding in a debrief, saves Markdown knowledge with linked images, and uses it to teach a newcomer on an unseen trace. The product goal is knowledge transfer, not training a signal classifier.

The user has explicitly excluded technical drawings and field maintenance from this prototype. Ground-truth dataset generation was discussed earlier and then deferred. Your small scenario set supports a teaching demonstration and its evaluation; it is not a new model-training campaign.

The five workstreams cover business, glasses/vision, expert conversation, prototype examples, and knowledge/tutoring. You provide a consistent world for all of them to demonstrate and assess.

## 2. Your mission

Give the team examples that expose real reasoning and allow a fair test of whether that reasoning transfers. A visually impressive curve is insufficient if the expert cannot explain its meaning or if the newcomer example requires a rule that was never taught.

Use synthetic or sandbox material. Work with the team’s railway expert to validate interpretations before presenting them as engineering facts. If expert review is not yet available, mark cases as provisional demonstration fixtures.

## 3. Known domain context and source limitations

The team discussed distinguishing wheel-related events from magnetic track brake effects and noise. Descriptions such as narrower/deeper versus broader/shallower patterns are candidate observations from brainstorming, not established universal classifiers.

The supplied photograph shows two curves labeled SYS1 and SYS2, relative timing, and ON/OFF trigger levels. It names a Frauscher RSR180 sensor in the displayed video title. It is a visual reference, not a raw dataset, measured waveform, or vendor-validated specification.

Do not infer precise channel behavior, physical causation, threshold values, or timing from that photograph. Ask the expert to establish what is valid for the selected demonstration.

A teammate reports an existing signal viewer and annotation tool. Inspect it if made available; no implementation has been verified in this conversation.

## 4. Define the task before generating curves

Proposed task:

> Review a recorded sensor trace, identify relevant events, distinguish misleading patterns, and confirm or escalate the interpretation.

Agree with the expert and WS5 on what the newcomer actually submits: an event annotation, classification, explanation, escalation decision, or a small combination. The challenge requires a wrong decision to be caught before it is saved, so the task needs a visible draft decision and a save boundary.

For each case, specify what information is visible, what judgment is required, and what counts as a completed task. Do not create examples whose answer depends on hidden context unavailable to the learner.

## 5. Suggested minimal case set

This is a proposed starting set; case count and exact physics must be agreed with the expert.

| ID | Purpose | Required learning opportunity |
|---|---|---|
| `E01` | Clear expert example | A feature the expert can identify and explain through visible cues |
| `E02` | Confusable expert example | A similar-looking feature requiring a distinction beyond a simple threshold |
| `E03` | Exception or uncertainty example | A limit, missing context, or reason to stop and ask |
| `N01` | Unseen newcomer case | Apply a captured distinction to a genuinely different trace |
| `N02` | Unseen guardrail or reduced-help case | Recognize a limit or demonstrate the learned reasoning with less assistance |

One unseen case is required by the challenge. A second can provide a stronger learning check if time allows. Keep case IDs consistent across images, scenario notes, voice events, map entries, assessment, and pitch.

The expert examples must allow at least three relevant live questions, including one guardrail question, and leave at least three meaningful issues for a debrief. Plan opportunities; do not force a rigid script or tell the agent the answers in advance.

## 6. What each case should contain

| Component | Contents |
|---|---|
| Manifest | Case ID, role (`expert`, `newcomer`, or development fixture), source type, revision, review status |
| Display asset | Legible trace rendering with enough axis and channel context for the agreed task |
| Data, if available | Numeric arrays or parameters, units, generation seed/configuration, and exact relation to the rendering |
| Regions | Known relevant visual regions and signal intervals only where the mapping is defined |
| Visible context | Facts the expert or newcomer is allowed to see |
| Expert notes | Interpretation, reasoning, alternatives, caveats, and guardrails reviewed by the domain expert |
| Evaluation notes | Expected decision, acceptable explanations, common wrong decision, and evidence that should justify feedback |
| Review record | Who reviewed the case or its pending status, plus unresolved limitations |

Prefer reproducible numerical generation and plotting for synthetic curves when exact values or timestamps matter. Make units explicit; normalized illustrative values should be labeled as such. A mathematically reproducible curve is not automatically a validated physical simulation.

Use stable assets and revisions so a recorded pointing region does not later refer to a different image. WS2 needs cases legible through the actual glasses/monitor setup, not only as high-resolution source files.

## 7. Separate teaching material from evaluation answers

Maintain distinct packages or paths for:

1. **Expert-session display assets:** the trace and visible context shown to the expert.
2. **Human expert preparation notes:** a reviewed interpretation to support a consistent demonstration.
3. **Newcomer display assets:** unfamiliar traces and permitted task context.
4. **Evaluator-only notes:** expected newcomer answers and scoring guidance.

Do not place evaluator-only notes in the knowledge directory that WS5 indexes, the tutor’s prompt, the visual UI, hidden case metadata available to the tutor, or a runtime tool that simply reveals the correct answer. Case names and labels should not give away the intended decision.

The tutor may inspect the newcomer’s current trace and use knowledge captured and confirmed during the expert session. It should not succeed because it received a prewritten case-specific answer key.

“Unseen” means the expert did not demonstrate that case. Use a meaningful variation that still permits the captured reasoning to apply. Renaming or recoloring the same trace is weak evidence of transfer. A case that needs an entirely untaught rule should test uncertainty/escalation, not demand an unsupported confident answer.

## 8. Deliverables

- A versioned case manifest and a small set of trace display assets.
- Reproducible source data or generation instructions where relevant.
- Expert-session scenario notes with reasoning, exceptions, and planned opportunities for live/debrief questions.
- Held-out newcomer cases and a separate evaluator-only answer/rubric package.
- At least one plausible wrong decision tied to a guardrail or distinction that can be captured from the expert.
- Domain review status for every case and explicit limits on physical realism.
- A simple way for the other workstreams to display the agreed cases consistently.

These are expected outputs of the workstream; the brief does not claim that any have already been generated or validated.

## 9. Handoffs

| Partner | Provide | Receive |
|---|---|---|
| WS2: glasses and vision | Stable display assets, case IDs, known geometry where available, realistic pointing scenes | Visibility constraints and capture failures to account for |
| WS3: expert voice | Scenario goals and opportunities for questions; preparation notes for the human expert | Gaps that the scenario does not yet let the agent investigate |
| WS5: knowledge/tutor | Task definition, learner-visible cases, separate evaluation procedure | Required save boundary, assessment format, evidence of which rules were captured |
| WS1: pitch | A simple scenario explanation and verified expected learning outcome | Narrative constraints and presentation needs |

Coordinate with WS3 and WS5 before treating an expected rule as learned. If the expert session never captured a necessary rule, either capture it or choose a case that tests existing knowledge.

## 10. Acceptance criteria

- All cases fit the traces-only scope and have stable IDs and source/review status.
- The expert can explain the demonstration cases, their distinctions, and at least one meaningful guardrail.
- The scenario supports the challenge’s live-question and debrief requirements without repetitive filler.
- At least one genuinely distinct newcomer case tests a captured rule and supports a visible pre-save correction.
- Expected answers and reasoning are reserved for evaluation and do not leak into the runtime tutor’s knowledge.
- Labels, regions, axes, units, and any numeric data agree with one another.
- Assets remain readable through the intended glasses/monitor setup.
- Synthetic examples and provisional interpretations are labeled accurately; no measured real-world performance or physical fidelity is invented.

## 11. Suggested first steps and open decisions

Ask the domain expert to define one clear event, one confusable case, and one escalation condition. Build the smallest reproducible display set around those decisions, then create a new case that uses the same reasoning. Agree on the learner’s submitted action and evaluation rubric with WS5 before expanding the dataset.

Open decisions include the exact sensor context, units, permitted realism, required context, case count, newcomer task, and availability of expert review. Continue with clearly labeled fixtures where those choices do not block useful work.
