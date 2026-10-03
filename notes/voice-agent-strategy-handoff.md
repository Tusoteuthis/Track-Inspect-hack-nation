# Voice Agent Strategy: Context and Handoff

**Project:** AI Apprentice for Railway Sensor Traces — working name  
**Updated:** 4 October 2026, Europe/Vienna  
**Purpose:** Give another agent the project context, conversation-design proposals, and the user's latest correction so it can continue developing the expert voice-agent strategy without reading the original chat.  
**Current stage:** Strategy development. No agent configuration, prompt, SDK integration, or interaction policy has been implemented or tested in this discussion.

## 1. Read this first: the user's latest correction

The user objected to this proposed governing question:

> “What would a newcomer still need to know to make this decision correctly?”

**Do not use that as a continuous optimization objective for the agent.** The user considers it dangerous because it has no natural stopping condition: the agent could keep finding gaps, asking more questions, repeating itself, and boring the expert.

The strategy must prioritize **bounded questioning, expert control, non-repetition, and permission to leave uncertainty unresolved**. Exhaustive knowledge extraction is not the interaction goal.

The assistant proposed this replacement:

> Let the expert lead. Ask a small number of questions that capture important reasoning, then move on—even if some uncertainty remains.

And this bounded decision rule:

> Is there one important, unanswered question worth asking now, within the remaining budget?

**Status:** The objection and need to avoid endless questioning are explicit user feedback. The replacement wording, exact budgets, and enforcement mechanisms below are proposals for further development, not settings the user has individually approved.

Some older briefs say to close gaps or keep clarifying until material gaps are resolved. Interpret those passages in light of this correction. Do not make a session continue until a coverage checklist is completely filled. Expert confirmation verifies the captured scope; it does not prove universal completeness.

## 2. Project and use case

The team is participating in **Challenge 1, “The AI Apprentice,” at the 7th Global AI Hackathon, powered by ElevenLabs**. The challenge concerns capturing experienced workers' unwritten judgment and teaching it to newcomers.

The agreed application is interpreting **railway sensor traces** displayed on a screen. An experienced engineer can recognize meaningful events, distinguish confusing patterns, identify irrelevant effects, and know when the available evidence is insufficient.

### Confirmed interaction

1. The expert wears **Meta Ray-Ban smart glasses**, the primary capture and interaction device.
2. They look at a sensor trace on a screen and **physically point with a finger** at a feature or region.
3. The connected application detects the gesture in the glasses' camera feed and identifies the indicated region.
4. An **ElevenLabs voice agent** invites the expert to explain what they see, when a question is appropriate.
5. The expert answers aloud. The agent selectively asks about reasoning, distinctions, exceptions, and guardrails.
6. The application links the explanation to the relevant visual evidence.
7. A bounded debrief and teach-back let the expert correct and confirm the captured knowledge.
8. A newcomer tutor uses that knowledge to guide someone through an unfamiliar trace.

The expert supplies the domain interpretation. The agent should not assume that it already knows the physical meaning of a curve.

### Scope decisions to preserve

- **Traces only.** Technical drawings, plans, and field maintenance were considered earlier and then excluded.
- **Glasses and physical pointing are central.** Do not replace them with mouse interaction or a conventional screen-sharing assistant.
- **Teaching newcomers is the immediate goal.** Ground-truth dataset creation and signal-classifier training were discussed earlier and then deferred.
- **Markdown plus linked images in a simple filesystem** is the preferred initial persistence direction.
- The user is using **ElevenLabs as the voice-agent backend**. The application still needs shared state, evidence storage, event handling, and tutoring integration.
- Exact Meta hardware generation, SDK, audio route, local-versus-remote processing, model choices, and the newcomer's hardware are unresolved.

## 3. Domain context and limits

The transcripts discuss distinguishing wheel-related events from magnetic track brake effects and noise. They mention candidate visual differences such as narrower/deeper versus broader/shallower patterns. These are brainstorming statements, not universal engineering rules to encode without expert confirmation.

The user supplied a photograph of a screen showing two traces labeled **SYS1** and **SYS2**, dips, relative timing, and marked **ON/OFF trigger levels**. The visible video title names the Frauscher Wheel Sensor RSR180.

This image is a visual reference. It does not supply raw numeric data, prove a physical interpretation, or establish a vendor partnership. Ask the expert about meaning, relevant units, context, and limitations rather than inventing them.

A teammate reported prior glasses-to-phone streaming and signal-annotation prototypes. Their code and capabilities have not been inspected here. Reported prior classifier accuracies are not evidence of this apprentice's performance.

## 4. What the user wants help developing

The immediate task is the **expert-facing interaction strategy**:

- How to guide the expert through the session.
- Which events trigger a possible question.
- Which deliberate interaction touchpoints the session needs.
- Useful questions and meaningful question sequences.
- Which questions depend on the stage, visual pattern, or expert wording.
- What must be captured versus what is optional.
- How to avoid interruptions, repetition, and endless clarification.
- How to know when to move on or finish.
- How to implement the strategy using ElevenLabs and the shared application backend.

Newcomer tutoring provides the purpose and downstream constraints. Do not expand this handoff into designing the whole tutor unless assigned.

## 5. Proposed session structure

Use one expert-facing agent with phases managed explicitly by the application. The phases are a working proposal, not a requirement to deploy multiple agents.

| Phase/touchpoint | Purpose | Example question or behavior |
|---|---|---|
| Orient | Establish task and essential context | “What decision are you trying to make from this trace?” |
| First reference | Identify what the expert is discussing | “What are you identifying here?” |
| Observe and selectively ask | Capture the explanation and one valuable missing point | Listen first; ask only if justified |
| Compare, when useful | Capture a distinction from another example | “What changes your interpretation between these two?” |
| Repair | Correct a reference or misunderstanding | “Are you referring to SYS1 or the relationship between both traces?” |
| Move on | Respect the expert's transition | Close the topic and discard stale prompts |
| Debrief | Address a small, prioritized set of unanswered matters | Return to a particular saved trace moment |
| Teach back and confirm | Verify the captured process and its limits | “What have I misunderstood or made too general?” |

### Opening

A possible introduction:

> Show me how you interpret these traces as if you were introducing a new colleague. Point to the features that matter and explain what you notice. I'll ask a few short questions when clarification would help, and we'll review what I captured at the end.

Establish the task and only the context that is needed. Possible orientation questions, asked individually and skipped if already answered:

- “What decision are you trying to make from this trace?”
- “What do I need to know about the channels and axes before we start?”
- “Where do you normally look first?”

Do not turn orientation into an unlimited questionnaire. Introduce supported commands such as “wait,” “just listen,” “skip that,” “next example,” “correct that,” “off record,” and “finish.” Only promise controls that actually work.

## 6. Bounded questioning policy

### Proposed starting defaults

| Situation | Default behavior |
|---|---|
| Expert points and starts explaining | Listen; no automatic opening question |
| Expert points silently | Ask one opening question at an appropriate pause |
| A consequential ambiguity remains | Allow one focused follow-up if budget remains |
| Meaning and main recognition cue are captured | Usually move on without more questions |
| Expert moves on or says “next” | Close the topic; do not pursue it automatically |
| Expert says “just listen” | Stop unsolicited questions until they explicitly resume questions |
| Expert says “skip that” | Drop the question rather than paraphrasing it |
| Information is still incomplete | Preserve it as unresolved without continuing indefinitely |

The **latest assistant proposal is at most one follow-up per topic**, replacing the earlier, looser suggestion of one or two. A proposed live-session budget is **three to five questions** across the demonstration, consistent with the challenge's guidance. The exact cap and session duration remain to be chosen.

All agent questions impose a burden, including clarifications. Track them rather than treating them as free exceptions to a cap. Repeated pointing at the same topic must not reset its allowance. A compound question should not be used to smuggle several questions into one turn.

Orientation, debrief, and confirmation also need finite limits. Three priority debrief questions and one concise teach-back with a bounded correction pass are a proposed starting design. Do not silently expand the limits whenever a new gap appears. If the expert explicitly wants to explore more, additional discussion can be handled deliberately.

### What is “sufficient” for a region?

For an ordinary example, a useful minimum is:

- A reliable visual reference.
- What the expert identifies or decides.
- The principal cue or reason they use.

Not every region needs every exception, physical mechanism, numerical boundary, and hypothetical variation. Important guardrails and contrastive examples can be captured at the session level. A consequential unresolved limitation should prevent overconfident teaching, but it need not force more questions now.

### Stop conditions

Stay silent or close the topic when the expert has answered sufficiently for its current purpose, declines, changes topic, asks to move on, or the relevant budget is exhausted. A backlog of open questions is not an obligation to ask them all.

Completion follows the agreed session structure, the expert's desire to stop, and confirmation of the material actually reviewed. If confirmation is not obtained, save an accurately labeled draft or partial result. Never manufacture confirmation or claim complete understanding.

## 7. Triggers and the decision to speak

**Pointing establishes the topic. It does not always mean “speak now.”** A trigger produces a candidate question, not an unconditional spoken response.

| Trigger | Candidate behavior |
|---|---|
| New, clearly indicated region | Invite an explanation only if the expert has not started one |
| Label without a reason | Ask for the main distinguishing evidence |
| “Usually,” “except,” “unless,” “only when” | Consider asking about the condition or exception |
| “Ignore this,” “just noise” | Consider asking how the expert knows it is irrelevant |
| Two regions are compared | Ask which difference changes the decision, if not explained |
| “Maybe,” uncertainty, hesitation | Consider asking what information would resolve uncertainty |
| Apparent contradiction with prior explanation | Check whether context or an exception explains the difference |
| Ambiguous finger target | Clarify the reference if worthwhile within budget; otherwise leave it unresolved |
| New trace or region | Close or explicitly defer the previous topic; preserve evidence identity |
| “Finish” | Offer the bounded closing flow; do not force continued questioning if the expert wants to end |

Before speaking, check that:

1. The expert has not requested silence or stopped the session.
2. They are not speaking or apparently in the middle of an ongoing task action.
3. The question refers to usable, current or explicitly recalled visual evidence.
4. Its meaning has not already been answered, asked, or declined.
5. Its answer would resolve a specific, material gap in the current capture objective.
6. The topic and session budgets permit it.
7. Asking now is worth the interruption compared with deferring or dropping it.

Silence does not prove readiness: the expert may be reading or thinking. Never use quiet periods as an automatic reason to generate another question. Detector uncertainty and expert uncertainty are different; do not interpret a poor camera view as the expert being unsure.

Prioritize reference repair and consequential contradictions, then decision-critical reasoning or guardrails, then a useful contrast. General curiosity is insufficient.

## 8. Question sequence and conditional bank

The proposed conceptual sequence is:

**Reference → interpretation → evidence → distinction → limits → action.**

This is a menu for choosing the next useful question, not a six-question script or a checklist that must be completed for every region. Apply the limits in Section 6.

| Purpose | Potential question | Ask only when |
|---|---|---|
| Reference | “Are you referring to the dip in SYS1 or to both traces?” | The target is ambiguous |
| Interpretation | “What does this feature tell you?” | Meaning has not been stated |
| Evidence | “What makes you interpret it that way?” | The main supporting reason is missing |
| Distinction | “What could look similar but mean something different?” | A contrast would materially improve the captured rule |
| Limits | “When would that interpretation no longer be reliable?” | A relevant boundary is missing |
| Action | “What do you do once you've identified that?” | The resulting decision or next step is unclear |

If the expert already explains an interpretation, reason, condition, and action in one answer, capture all four. Do not ask redundant questions just because they appear separately in the bank.

### Conditional questions

| Context | Question option | Intended knowledge |
|---|---|---|
| Shape-based explanation | “Which part of the shape matters most?” | Main recognition cue |
| Width or depth mentioned | “Are you judging that relative to another feature or against a measured value?” | Relative versus numeric judgment |
| Threshold crossing mentioned | “Is crossing that level enough to make the decision?” | Whether more evidence is required |
| SYS1/SYS2 comparison | “What relationship between the channels matters?” | Cross-channel interpretation |
| Timing or order mentioned | “What does the order tell you?” | The meaning the expert assigns to sequence |
| Noise dismissed | “What tells you this can be ignored?” | Evidence for excluding a feature |
| Exception identified | “What should a newcomer do differently in this case?” | Changed action |
| Intuitive explanation | “Can you point to what first caught your attention?” | Concrete cues behind intuition |
| Expert uncertainty | “What would you check next?” | Information gathering or escalation |
| Physical cause asserted | “How do you establish that cause?” | Basis for a causal interpretation |
| Scale or display context changes | “Does that change how you judge this feature?” | Scope of a visual rule |
| Precise value stated | “What are the units and conditions for that value?” | Meaning of a numeric rule |
| A useful counterexample is available | “What changes your interpretation between these two?” | Discriminating features |

These questions do not assert engineering facts. Avoid leading wording that supplies an unverified answer. Prefer “What would need to change for you to decide differently?” over inventing an implausible physical signal variation.

## 9. Example selection and guidance

A proposed useful sequence is a **clear example**, a **confusable example**, and a **boundary or uncertainty case**. These support interpretation, discrimination, and limits without requiring exhaustive discussion of each trace.

The expert should keep control of the workflow. Asking for another example consumes the question budget and may be deferred or omitted. Do not force a demonstration into an artificial long interview.

If requesting a contrast is worthwhile, options include:

- “Can you show a case a newcomer might confuse with this?”
- “Can you show where that distinction becomes difficult?”
- “What would you want the newcomer to do instead of guessing?”

A hypothetical explanation must remain identified as hypothetical. Do not turn it into evidence of an observed trace.

## 10. Memory, evidence, and repetition prevention

Maintain a compact record for each topic: trace/region reference, original expert words, interpretation, principal cue, captured conditions/guardrails, next action, unresolved items, and confirmation status.

Track each candidate question's purpose and state: proposed, asked, answered, declined, deferred, or dropped. Deduplicate by meaning, not just exact wording. A paraphrase of an answered question is still a repeat. A truly different condition may justify a new question, but it still needs budget and relevance.

Suggested application state includes:

- Session phase and expert controls, including listen-only mode.
- Active topic and original pointing-event ID.
- Agent questions already asked in this phase/topic/session.
- Covered knowledge and unanswered items ranked by importance.
- Evidence eligibility and recording state.
- Draft revision under expert review.

Budget checks and topic-closing behavior should be enforced by the application, not left entirely to an instruction telling the LLM to be brief. Account for generated follow-ups and automatic timeout turns as well as gesture-triggered prompts.

Keep **session timestamps** separate from **signal-axis intervals**. If the visual reference cannot be mapped to exact signal time, retain the image region and leave that numeric interval unknown.

## 11. Bounded debrief and confirmation

Select a small number of important, genuinely unanswered matters. Drop low-value candidates. Do not enumerate every missing field or restart the live interview topic by topic.

Possible questions tied to saved evidence:

- “Earlier you said this applies normally. Which cases are excluded?”
- “You checked the other channel here. What should someone do if it is unavailable?”
- “What important situation did today's examples not cover?”
- “Which mistake would you expect a newcomer to make first?”

A teach-back should describe the captured process and explicitly retain limitations:

> First I check [context]. When I see [feature], I consider [interpretation] because [evidence]. I distinguish it from [alternative] using [difference]. If [exception], I [stop or escalate]. Otherwise I [action]. We have not established [unresolved item].

Use only parts supported by the expert's statements. Ask for correction, then confirm the revised scope within the closing budget. Record the exact revision reviewed. Silence is not confirmation.

## 12. Challenge requirements and the question-budget tension

The supplied challenge requires:

- **Capture:** At least three questions during a real task, at natural pauses and about visible evidence; at least one concerns a guardrail.
- **Map:** At least three debrief questions on matters not answered during the task, ending with a teach-back the expert confirms.
- **Evidence:** Every map step and guardrail links to a screen moment and the expert's own words.
- **Teach:** A newcomer handles an unseen case; the tutor catches one wrong decision before it is saved and explains with captured expert reasoning.
- **Trust:** Off-record handling and protection of personal data.

The brief suggests three-to-five live questions per ten minutes. Counts are challenge acceptance checks, not an unlimited quota-filling mechanism. General setup questions do not automatically count as live, screen-grounded questions.

Choose a demonstration rich enough to support the required questions naturally. Do not deliberately ignore supplied answers to create debrief gaps. If the expert stops or no meaningful questions remain, honor that outcome and report that the session did not demonstrate every required count. Never fabricate questions, answers, or compliance.

The written challenge also describes screen-sharing and watching the newcomer’s screen. The team's glasses-based capture approach still needs to address that wording; no organizer exception has been established.

## 13. ElevenLabs implementation direction

The following is based on official documentation consulted during this discussion on 4 October 2026. It describes available building blocks and proposed use, not a tested configuration. Verify behavior in the chosen SDK and transport during implementation.

### Agent structure

Start with one expert agent and explicit application-managed phases. A concise system prompt may be enough for a first prototype. A **free-form Procedure** can hold adaptive interviewing instructions; ElevenLabs documents procedures that adapt wording/order as well as structured procedures and workflows. The budget must constrain any procedure, too. [Procedures](https://elevenlabs.io/docs/eleven-agents/customization/procedures)

### Turn-taking

The proposed starting settings are **Patient** turn eagerness, expert interruptions enabled, and filler speech disabled. ElevenLabs documents turn eagerness, silence timeouts, interruption controls, and soft-timeout fillers. Exact timeout values remain to be tuned; silence must not become a recurring source of unsolicited questions. [Conversation flow](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)

**Skip Turn** supports remaining silent when the expert needs time or requests a pause. It is a conversational tool, not a durable privacy control or a substitute for application-managed listen-only mode. [Skip Turn](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/skip-turn)

### Context and deliberate turn requests

**Contextual updates** can supply visual/event information without themselves requesting a spoken response. **User-message events** trigger the response flow. Therefore, keep background context updates separate from a deliberate, application-controlled request to ask a question after timing and budget checks pass. Label programmatic requests as application events; never preserve them as expert statements. [Client-to-server events](https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events)

The JavaScript SDK documents `sendContextualUpdate`, `sendUserMessage`, and `sendUserActivity`. Activity signals can help avoid interruptions, but do not establish that someone has finished thinking. Verify the corresponding behavior in the chosen iPhone integration. [JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script)

### Persistence and tools

Backend operations could save an explanation, record an unresolved item, and record expert confirmation against a specific revision. These would be custom application tools, not assumed built-in product features. ElevenLabs supports connecting API operations through webhook tools. [Webhook tools](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools)

The real-time conversation should not depend on an unlimited, accumulating question queue. Send concise current context and relevant coverage state rather than every frame or every old question. Check automatic responses and retry paths against the same limits as deliberately initiated questions.

## 14. Ownership across workstreams

| Workstream | Role in this strategy |
|---|---|
| WS1: Marketing, business case, pitch | Demo narrative and accurate claims about what was captured and taught |
| WS2: Glasses, iPhone, visual processing | Native capture, pointing event, region/evidence, timestamps, audio-path coordination |
| WS3: ElevenLabs expert interaction | Interview policy, question selection, voice/provider adapter, expert debrief and confirmation behavior |
| WS4: Prototype data and scenarios | Expert-reviewed teaching examples, confusable/boundary cases, distinct learner examples |
| WS5: Knowledge and newcomer tutor | Knowledge semantics, bounded gap suggestions, synthesis, confirmation scope, tutor logic |
| WS6: Backend and integration | Shared state, event routing, storage, budget/counter enforcement with WS3, revision handling and runtime integration |
| WS7: Frontend and user experience | Browser status and controls, visual reference, review UI, supported expert overrides |

WS5 may suggest missing information, but its suggestions must not override WS3/WS6 question limits or the expert's request to move on. WS7 should reflect acknowledged recording and mode state. Off-record handling must apply across evidence, transcripts, derived knowledge, and provider behavior to the extent actually implemented; do not promise that an LLM instruction alone prevents retention.

## 15. Rehearsal and acceptance checks

Rehearse with one clear trace, one confusable example, and one boundary case. Include these interactions:

| Rehearsal event | Desired outcome |
|---|---|
| Expert points and immediately explains | Agent listens and does not repeat already supplied questions |
| Expert points silently | One relevant opening question at an appropriate moment |
| Expert pauses mid-thought | Agent allows time rather than filling the silence |
| Expert provides a complete explanation | No follow-up merely to continue the conversation |
| Expert says “usually” | Exception question considered, not automatically mandatory |
| Same region is pointed at repeatedly | No reset of budget or duplicate interview |
| Expert says “skip” or “next” | Topic/question closes without a paraphrased retry |
| Expert says “just listen” | No unsolicited questions until explicit resumption |
| Topic or session budget is exhausted | Agent remains quiet and records unresolved material accurately |
| Expert moves to another trace | Old questions do not become attached to the new evidence |
| Expert corrects the agent | Relevant statement/revision is updated without restarting the interview |
| Expert ends early | Session ends or closes briefly; missing requirements remain accurately reported |
| Off-record requested | Supported controls execute; no false claim of privacy protection |

Review question counts, meaningful information gained per question, semantic repeats, interruptions, compliance with “move on,” correct evidence linkage, and expert-rated burden. Define hard success checks for budgets and ignored controls. Do not optimize only for the amount of information extracted.

Then assess whether the captured material helps a newcomer on a different trace. This evaluates the value of the bounded session; it must not retroactively force the expert into endless follow-up questions.

## 16. Open decisions and suggested next work

The receiving agent should help turn this into a concrete, reviewable policy and prompt while preserving the user's correction. Open decisions include:

- Exact live, topic, orientation, debrief, and confirmation budgets.
- What constitutes the same topic and a semantically repeated question.
- How to combine gesture stability, speech, and explicit expert cues for timing.
- Whether the expert chooses an interaction preference at the start or uses spoken overrides only.
- The finite behavior for correction passes and an incomplete final teach-back.
- Whether extended discussion requires an explicit expert request and how that changes counters.
- Which questions the actual domain expert finds useful, irritating, or already obvious.
- The supported ElevenLabs/iPhone event and audio path, including how automatic turns respect limits.

Suggested next outputs are a short interaction policy, a conditional question bank, a draft ElevenLabs agent prompt, and rehearsal cases with expected ask/wait/move-on behavior. These are suggestions for the next assignment, not a claim that they have already been implemented.

## 17. Related material

This file is self-contained for conversational strategy. If the other files accompany it, they provide broader detail:

- [Project brief](project-brief.md)
- [WS3: ElevenLabs expert interaction](workstreams/03-elevenlabs-expert-interaction.md)
- [WS5: Knowledge and newcomer tutor](workstreams/05-knowledge-newcomer-tutor.md)
- [WS6: Backend and integration](workstreams/06-backend-integration.md)
- [WS7: Frontend and user experience](workstreams/07-frontend-user-experience.md)

Original local sources, which may not be accessible to another agent:

- Challenge PDF: `/Users/matthiassammer/Downloads/challange-1-descirption.pdf`
- Earlier discussion, 3 October 2026, 19:46: `/Users/matthiassammer/.codex/attachments/5cb62015-2440-4ec9-84f9-ffd8615d2f85/Pasted text.txt`
- Later discussion, 3 October 2026, 20:12: `/Users/matthiassammer/.codex/attachments/93be446b-9db8-4981-837b-436f5583a600/Pasted text.txt`
- Example trace photograph: `/Users/matthiassammer/Downloads/IMG_7079.png`

Later explicit user clarifications supersede earlier brainstorming. In particular, do not restore drawings, classifier training, a mouse-first expert workflow, or an unbounded “keep asking until everything is understood” objective.
