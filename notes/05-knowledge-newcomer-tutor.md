# Workstream 5 Brief: Knowledge and Newcomer Tutor

**Project:** AI Apprentice for Railway Sensor Traces — working name  
**Challenge:** “The AI Apprentice,” Challenge 1, 7th Global AI Hackathon, powered by ElevenLabs  
**Updated:** 3 October 2026  
**Concrete output:** A newcomer interprets an unseen trace using captured expert knowledge, with a reasoned intervention before a wrong decision is saved.  
**Reference:** [Full project brief](../project-brief.md)

## 1. Project context you must preserve

An expert wears **Meta Ray-Ban smart glasses**, looks at **sensor traces on a screen**, and physically points at a feature. The connected application detects the gesture in the camera feed and captures the visual reference. An **ElevenLabs voice agent** asks the expert to explain what they see, why it means what they say, and what exceptions or guardrails apply.

After a spoken debrief and expert-confirmed teach-back, the system saves this knowledge and uses it to coach a newcomer through a trace the expert never showed.

The user narrowed the scope to **traces only** and **teaching newcomers**. Technical drawings, field maintenance, large-scale ground-truth production, and training a signal classifier are deferred. Markdown plus linked images in a simple filesystem is the preferred starting direction for persistence.

The five workstreams cover business, glasses/vision, expert conversation, prototype examples, and knowledge/tutoring. You own the connection between captured knowledge and demonstrated learning, including the Work Map and newcomer experience.

## 2. Your mission

Turn evidence-linked expert explanations into a verified, navigable workflow and an effective voice tutor. Demonstrate that the tutor can apply captured reasoning to a new case, explain its guidance, and distinguish learning with assistance from independent understanding.

You own knowledge synthesis and storage, evidence retrieval, Work Map presentation, newcomer task interaction, tutoring behavior, and assessment. WS3 owns the expert conversation and spoken debrief; coordinate the synthesis/confirmation loop and reuse ElevenLabs infrastructure where practical.

The newcomer’s hardware and interface are not decided. Do not assume that they also wear glasses. The challenge requires observing their own screen and catching a wrong decision before it is saved, so the chosen interface must make those behaviors possible.

## 3. Inputs and proposed handoffs

| Source | Input |
|---|---|
| WS2 | `session_id`, `event_id`, original/highlighted frame references, region geometry, timestamps, mapping status, optional trace/channel/signal interval, recording eligibility |
| WS3 | `exchange_id`, related `event_id`, original expert words, questions/answers, candidate interpretations, unresolved questions, corrections, explicit confirmation tied to a draft revision |
| WS4 | Expert-session display assets, stable case IDs, newcomer-visible cases, task definition, and a separate evaluator procedure |

Provide WS3 with the draft Work Map and unresolved questions for its debrief. Receive new expert answers and corrections, update the draft, and return the appropriate revision for confirmation.

Provide WS1 with the demonstrated learning flow and evidence for any claims. Keep evaluator-only answers from WS4 outside the tutor’s prompt, retrieval corpus, and runtime tools.

These handoffs are a proposed v0 contract. Agree field names with WS2/WS3 before implementation and preserve the stable identifiers throughout.

## 4. Knowledge representation

Start with human-readable Markdown and linked evidence files. Use structured metadata, such as frontmatter or a small index, if it makes reliable retrieval and revision handling easier. A vector database, model fine-tuning, or complex knowledge graph is not a prerequisite.

### Suggested entry structure

| Field | Meaning |
|---|---|
| Entry ID and revision | Stable identity plus the exact version being taught or confirmed |
| Verification status | Suggested states: `draft`, `confirmed`, `unresolved`, `revoked` |
| Workflow step/decision | What the learner needs to do or decide |
| Observation | The visible feature being discussed |
| Expert interpretation | Meaning supplied by the expert |
| Reasoning | Cues and distinctions that support the interpretation |
| Exceptions/guardrails | Conditions that change the decision, limit confidence, or require escalation |
| Visual evidence | Original frame, highlighted region, linked event, trace/channel references if known |
| Verbal evidence | Original expert words, exchange ID, transcript/audio offset when available |
| Confirmation evidence | What revision was confirmed or corrected, and the expert response supporting that status |

Every workflow step and guardrail must link to both a screen moment and the expert’s own words. Multiple entries may share evidence, and one entry may require more than one exchange. Do not fabricate a one-to-one match just to fill fields.

Separate observation, expert statement, and AI synthesis. Retain qualifications such as “usually” or “only if.” Do not silently promote speculation into a rule.

Keep session time and signal time distinct. Preserve a highlighted image region when precise signal alignment is unavailable; do not invent timestamps or numeric values from a photographed curve.

### Suggested filesystem

```text
knowledge/
  workflow.md
  sessions/
    session-001.md
  entries/
    observation-001.md
  images/
    observation-001-full.png
    observation-001-highlighted.png
  assessments/
    newcomer-session-001.md
```

This is a proposed starting layout. The runtime should index only eligible confirmed teaching material, not every file under an arbitrary parent directory. Assessment records and evaluator answers should not accidentally become new expert knowledge.

## 5. Synthesis, gaps, and expert confirmation

Construct a draft workflow from the captured events and exchanges. Identify where a decision lacks a reason, where a guardrail is unclear, or where statements conflict. Send those gaps to WS3 for the spoken debrief.

The challenge requires at least three debrief questions on matters not answered during the task. Supply useful gaps rather than manufacturing unknowns or requesting repeated answers.

After the debrief, prepare a concise process-level teach-back for WS3 to deliver. Expert confirmation must refer to the actual revision reviewed. If a correction changes a rule, update affected entries and evidence, then obtain confirmation of the revised understanding through WS3.

Use `confirmed` for material actually verified by the expert. Conflicting or incomplete material remains unresolved; a transcript summary is not equivalent to confirmation. A confirmed instruction to escalate an uncertain case is valid knowledge, even though the underlying interpretation remains unknown.

## 6. Work Map experience

The Work Map must be clickable and show the process, not merely a gallery of signal images. At minimum, each step should reveal:

- The step or decision in the interpretation workflow.
- The relevant trace moment and highlighted region.
- The expert’s reason in their own words, plus a clearly distinguishable synthesis if useful.
- Applicable exceptions, guardrails, and what to do when they are triggered.
- Confirmation status and links back to the evidence.

Preserve the expert session timeline where it helps navigation, while allowing the learner to understand the logical decision sequence. Do not force the teaching order to mirror every incidental action during recording.

## 7. Newcomer tutor flow

Suggested minimal flow:

1. Display an unfamiliar trace and the permitted task context from WS4.
2. Observe the learner’s screen and relevant draft actions, preserving visual context for feedback.
3. Ask what they notice or what decision they would make next.
4. Retrieve relevant **confirmed** reasoning and examples from the expert session.
5. Evaluate the proposed decision against that reasoning and its limits.
6. If a wrong decision is imminent, intervene before it is saved, ask the learner to reconsider, and explain with the expert’s evidence.
7. Let the learner correct the decision and finish the task.
8. Show which skills they demonstrated, which required help, and what to practice next.

Tutor explanations should reference what the expert actually said. When the captured knowledge is insufficient, ask for missing context or follow a confirmed escalation rule. Do not invent domain rules to complete a case.

Prefer questions that let the newcomer reason before revealing an answer. The interaction should still be responsive and useful; do not make every step a quiz or withhold a needed guardrail explanation.

## 8. Intervening before save

A proposed implementation is a learner trace-review interface with a **draft decision** and a **commit/save boundary**. Evaluate the draft before committing it. If evaluation is asynchronous, prevent the save from racing ahead of the pending review.

The implementation should distinguish learner correction after a timely intervention from discovering an error after it was already saved. Keep evidence of when the decision was proposed, when guidance was delivered, and when the corrected result was committed.

This must work from captured knowledge and the new visible case. Do not hardcode “if case N01, say this answer,” and do not rely on a concealed answer key. A structured interface can provide draft-action context, but it should not replace the challenge’s requirement to observe the learner’s screen.

No newcomer interface has been selected. Coordinate with WS2 if its observation components can be reused, and with WS3 on the ElevenLabs voice adapter. Exact transport and model choices remain open.

## 9. Assessing learning honestly

Record the learner’s initial decision, reasoning if elicited, hints/interventions, corrected decision, cited expert entry/revision, and completion outcome. Distinguish:

- Correct without assistance.
- Correct after a prompt or explanation.
- Still unresolved or requiring escalation.

A single coached correction demonstrates useful assistance; it does not by itself prove independent mastery. If time permits, use another distinct case or a later reduced-help decision to test transfer. At minimum, accurately report what was observed and avoid presenting a tiny demo as a validated learning benchmark.

The challenge requires at least one unseen case and one pre-save catch. WS4 owns separate evaluation notes; the runtime tutor should receive the case’s permitted observations and captured expert knowledge, not those notes.

## 10. Trust, correction, and evidence lifecycle

Coordinate off-record controls with WS2 and WS3. Excluded frames or speech must not reappear through synthesized entries, cached retrieval results, or derived teaching material.

When an expert corrects or removes knowledge, ensure the tutor retrieves the current eligible revision. Preserve enough status information to avoid teaching revoked material while respecting the agreed deletion behavior. Define what happens to dependent entries and images when their source is removed.

These controls address the challenge’s trust requirement. Retention duration, storage location, and supported deletion semantics still need an explicit implementation decision; do not claim protections that are not implemented.

## 11. Deliverables

- A documented Markdown-based knowledge schema and evidence layout.
- Synthesis and gap output for the WS3 debrief, with explicit revision/confirmation handling.
- A clickable Work Map linking decisions and guardrails to visual and verbal evidence.
- Retrieval of eligible confirmed knowledge for the tutor.
- An ElevenLabs-powered newcomer interaction integrated with the chosen task interface and screen observation.
- A working pre-save review/intervention path.
- A learning summary and assessment record that distinguish independent and assisted performance.
- An end-to-end demonstration showing a captured expert statement used on an unseen case.

## 12. Acceptance criteria

- Every map step and guardrail resolves to the correct image region and original expert words.
- The tutor uses confirmed material and responds appropriately to unresolved or revoked entries.
- An expert correction changes the knowledge revision and subsequent tutor guidance consistently.
- The newcomer processes at least one case not demonstrated by the expert.
- At least one wrong decision is caught before it is saved, and feedback cites reasoning actually captured from the expert.
- A case-specific answer key or hardcoded response is not the source of the tutor’s success.
- The learner can inspect the relevant expert example and correct their decision.
- The final assessment states what happened, what required help, and what to practice next.
- Off-record and deletion behavior is consistent across evidence, synthesis, and retrieval.

## 13. Suggested first steps and open decisions

Agree on one example event/exchange pair with WS2 and WS3. Persist it as a draft entry, run the confirmation handoff, and display it in a clickable map. Then choose one unfamiliar case with WS4 and build the smallest learner decision-and-save flow that can use that entry.

Develop against explicitly labeled fixtures until live capture is ready. The final integration must demonstrate the real source-to-tutor chain. Coordinate a named demo owner across the team rather than assuming an individual component owner will integrate everything.

Open decisions include the newcomer interface/hardware, exact task and save boundary, retrieval implementation, confirmation granularity, retention behavior, and how reduced-help learning will be checked. None requires expanding the project into classifier training.
