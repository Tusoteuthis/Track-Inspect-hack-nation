# Project Brief: AI Apprentice for Railway Sensor Traces

**Working project name:** AI Apprentice for Railway Sensor Traces  
**Context:** Challenge 1, “The AI Apprentice,” 7th Global AI Hackathon, powered by ElevenLabs  
**Brief updated:** 3 October 2026, Europe/Vienna  
**Purpose:** Give a new agent the context needed to contribute without replaying the prior discussions. This is a context and scope document; individual work assignments are given separately.

## 1. Read this first

The team wants to capture an experienced railway engineer’s knowledge of **sensor traces** and use it to **teach newcomers**.

The expert wears **Meta Ray-Ban smart glasses** and looks at a trace displayed on a screen. They **physically point with a finger at a region of that screen**. The glasses’ camera captures the scene; the connected application detects the pointing gesture and associates it with the relevant trace region. An **ElevenLabs voice agent asks the expert to explain what they see**, then asks follow-up questions about their reasoning, distinctions, exceptions, and guardrails.

The system preserves the visual evidence and the expert’s explanation, confirms its understanding through a debrief, and turns that knowledge into material a voice tutor can use to teach another person on an unfamiliar trace.

**The core loop:**

> Expert points at a trace → application identifies the visual reference → voice agent asks → expert explains → apprentice clarifies and confirms → knowledge is persisted → newcomer learns to interpret an unseen trace.

### Confirmed scope and corrections

- **Sensor traces only.** Technical drawings, railway plans, and field maintenance were explored earlier but are outside the current prototype scope.
- **The glasses are the primary recording and interaction device.** Do not redesign the core experience around a mouse, keyboard, or conventional screen-sharing assistant.
- **Physical finger-pointing is central.** It is not a mouse cursor or a click on the trace viewer.
- **The expert supplies the interpretation.** The pointing gesture prompts the agent to ask the expert what the feature means; it does not assume the AI already knows the answer.
- **ElevenLabs supplies the voice-agent experience.** Specific APIs, models, and integration details still need validation.
- **The immediate product outcome is newcomer teaching.** Creating ground-truth datasets and training a signal classifier have been deferred.
- **The team favors text plus linked visual evidence in a simple filesystem**, with Markdown as the initial knowledge format. The exact schema remains a design decision.
- **Capture, Map, and Teach are all required by the challenge.** A capture-only prototype does not complete the challenge.

## 2. Problem, users, and value

Experienced engineers can recognize and interpret patterns in railway sensor traces that are difficult to explain through simple thresholds or existing documentation. Their expertise includes knowing what matters, what can be ignored, which similar-looking features have different meanings, and when the evidence is insufficient.

The team’s domain discussion centers on distinguishing wheel-related events from effects associated with a magnetic track brake or other noise. These are explanations supplied in brainstorming, not independently verified engineering rules.

The proposed product helps an expert externalize this reasoning through a natural conversation grounded in the exact trace region they are discussing. It then makes that reasoning available to a newcomer through examples, questions, and feedback.

| Role | Need | Intended benefit |
|---|---|---|
| Expert engineer | Explain visual judgments without manually writing extensive documentation | Point, speak, correct, and confirm |
| Newcomer or junior engineer | Learn how to interpret traces and recognize limits | Guided practice with expert reasoning and visual evidence |
| Organization | Retain expertise and support onboarding | Reusable, traceable teaching material |

The exact commercial buyer, pricing, and measured business value have not been established. Reduced expert documentation effort, faster onboarding, and retained expertise are business hypotheses to test, not demonstrated results.

## 3. How the idea evolved

The **19:46 discussion** began with smart glasses and explored several railway applications. The team converged on having an expert point at something visible and explain it through a voice conversation. Technical drawings and sensor traces were both considered at that stage.

The **20:12 discussion** developed the sensor-trace example in more detail. It included manually labeling signal regions and using labels to train a small model. The discussion also described a previous visualization/annotation tool and prior model experiments.

The user subsequently clarified two important decisions:

1. The prototype concerns **traces only**, not drawings.
2. The team will **focus on teaching newcomers**, deferring ground-truth generation and classifier training.

Do not revive earlier alternatives as though they remain agreed requirements.

## 4. Expert capture and newcomer teaching

### 4.1 Expert session: agreed interaction

1. The expert wears the Meta Ray-Ban glasses and views a sensor trace on a screen.
2. They physically point to a feature or region.
3. The application processes the glasses’ camera feed to detect the gesture and establish what region is being referenced.
4. The system preserves enough visual context to make the explanation understandable later.
5. The ElevenLabs voice agent invites the expert to explain what they see.
6. The expert answers aloud; the agent asks useful follow-up questions.
7. The system links the explanation to the correct visual evidence.
8. At the end, the apprentice asks about unresolved issues and explains its understanding back for confirmation or correction.

The glasses capture the camera view and support the intended voice interaction. Do not assume finger detection, region recognition, or LLM processing runs inside the glasses. The division of processing between glasses, iPhone, and backend is unresolved.

### 4.2 Question strategy: proposed behavior

A pointing gesture establishes the topic; it should not automatically force speech while the expert is already talking. Retain the reference, listen, and ask at an appropriate pause.

Useful questions include:

- “What are you seeing in this part of the trace?”
- “Which feature makes you interpret it that way?”
- “What could look similar but mean something different?”
- “What surrounding context do you need to check?”
- “When would you be unsure or ask someone else?”

Questions should build on what the expert has already said. Avoid a fixed, repetitive questionnaire for every gesture. Finger detection, gesture debouncing, ambiguity handling, turn-taking, and pause detection still need implementation decisions.

### 4.3 Debrief and Work Map

The debrief identifies missing explanations and unresolved exceptions, asks follow-up questions, and ends with a teach-back that the expert confirms.

The Work Map must represent **how to approach and complete the interpretation task**, with links to visual examples, decisions, reasons, and guardrails. A folder of disconnected image captions is insufficient for the challenge.

### 4.4 Newcomer experience

The newcomer works through a trace the expert did not demonstrate. The tutor uses the saved knowledge to ask for an interpretation, explain relevant reasoning, and help the newcomer recognize exceptions and uncertainty.

The challenge requires the tutor to catch at least one wrong decision **before it is saved**, and explain the correction using the expert’s reasoning. A proposed implementation is a trace annotation or interpretation interface with a review step before saving. This interface is not yet agreed or implemented.

The newcomer’s hardware is still undecided. Do not assume that both expert and newcomer must wear glasses, or that the newcomer must use a particular application.

## 5. Visual example and domain boundaries

The supplied image, `IMG_7079.png`, is a photograph of a screen showing a sensor explanation with two curves labeled **SYS1** and **SYS2**, their relative displacement, and marked **ON/OFF trigger levels**. The visible video title names the Frauscher Wheel Sensor RSR180.

Use it as a reference for the type of visual material the expert will discuss. It does not establish a vendor partnership, provide a raw numeric dataset, or prove a general interpretation rule.

In the transcripts, the expert describes distinctions such as narrower/deeper and broader/shallower patterns. Treat these as candidate observations to clarify with the expert, not universal rules to encode without confirmation.

Do not infer exact signal values, times, channel semantics, or physical causes from the photograph alone. The source image also does not demonstrate that finger detection or camera-to-screen alignment works.

## 6. Knowledge persistence

### 6.1 Direction established in the discussion

Use human-readable text, initially **Markdown**, linked to images in a simple filesystem. The team wants a format that is easy to inspect and can later be converted into other representations.

For this trace-teaching use case, preserving the visual evidence alongside the explanation is the proposed default because the shape and context are part of the lesson. An individual general rule may refer to existing images rather than duplicate them.

The tutor can retrieve and use these saved materials as reference knowledge. Model training is not required for this MVP.

### 6.2 Proposed knowledge entry

| Field | Purpose |
|---|---|
| Stable entry ID | Keep references consistent across images, explanations, and teaching |
| Session and trace reference | Identify the source recording and displayed trace |
| Full image and highlighted region | Preserve context and identify what the expert pointed at |
| Channel and signal interval, if known | Ground the observation in the trace without guessing precision |
| Session timestamp | Locate the original gesture and explanation |
| Observation | Describe the visible feature |
| Expert interpretation | Record what the expert says it means |
| Reasoning | Explain the cues and distinctions supporting that interpretation |
| Exceptions and guardrails | Record limits, uncertainty, and escalation conditions |
| Original expert words | Preserve evidence supporting the synthesis |
| Verification status | Separate expert-confirmed knowledge from unresolved material |

Keep **session time** separate from **signal time**. “The expert pointed at 02:15 in the recording” is not the same as “the feature spans 120–150 milliseconds in the trace.” If no reliable signal-time mapping exists, store the visual region and leave the precise interval unknown.

### 6.3 Proposed filesystem layout

This is an illustrative structure, not an implemented contract:

```text
knowledge/
  workflow.md
  sessions/
    session-001.md
  entries/
    observation-001.md
    observation-002.md
  images/
    observation-001-full.png
    observation-001-highlighted.png
  assessments/
    newcomer-session-001.md
```

`workflow.md` describes the sequence of interpretation steps and links to supporting entries. Entries retain the evidence and reasoning. A clickable Work Map UI can render this material.

Preserve the distinction between the expert’s original statements and the AI’s summary. A disputed statement should remain unresolved until corrected or confirmed.

## 7. Challenge requirements and acceptance criteria

These requirements come from the supplied Challenge 1 brief. They are requirements to address in the submission, not claims that the current concept already satisfies them.

| Area | Required behavior |
|---|---|
| Capture | During a real task, ask at least **three** questions at natural pauses, each about something visible; at least **one** concerns a guardrail |
| Map: debrief | Ask at least **three** follow-up questions that were not answered during the task |
| Map: confirmation | End with a teach-back the expert confirms or corrects |
| Map: evidence | Every step and guardrail links to a screen moment and the expert’s own words |
| Teach | A judge acting as a newcomer processes a case the expert never showed |
| Teach: intervention | Catch at least **one** wrong decision before it is saved and explain it with the expert’s reasoning |
| Learning outcome | Show what the newcomer has mastered and what to practice next |
| Trust | Explain how information can go off the record and how personal data on screen is protected |
| Pitch | End with **one moonshot slide** explaining the larger vision and how the MVP leads to it |

The demo must answer five questions:

1. **When to ask:** How does the apprentice recognize an appropriate pause and avoid interrupting typing, reading, or speech?
2. **What to ask:** How does it seek reasoning and guardrails rather than merely describe visible facts?
3. **When it understands:** How are gaps resolved, and how does expert confirmation demonstrate understanding?
4. **Whether learning transfers:** Can the newcomer handle an unfamiliar case?
5. **Trust:** How can the expert take information off the record, and how is sensitive material protected?

### Challenge guidance and suggested technology

- Use a workflow lasting roughly **5–10 minutes**, with fake or sandbox data, hidden judgment, and real limits or exceptions.
- The brief suggests roughly **3–5 live questions per 10 minutes**, with remaining questions saved for the debrief.
- ElevenLabs is central to the voice experience. The brief names **ElevenAgents**, **Expressive Mode**, and **Scribe v2 Realtime**. Their exact integration in this project has not been selected or verified.
- The underlying LLM, vision model, and agent framework are flexible.
- The brief suggests extracting events from frames every **1–2 seconds**. This is a suggested architecture, not a confirmed setting for the glasses application or a proven rate for finger tracking.
- Multiple experts, cross-language teaching, and exporting guardrails for agents are stretch goals.

### Important fit issue to resolve

The written challenge explicitly describes a screen-sharing web app and a tutor watching the newcomer’s own screen. This project intentionally uses glasses as the expert’s primary capture and interaction device while the expert views traces on a screen.

The team still needs to establish how its demonstration addresses that wording, including any companion screen capture and the newcomer interface. Do not quietly replace the glasses experience, and do not claim the organizers have approved an equivalent capture method without evidence.

## 8. Workstreams and responsibilities

The user identified four workstreams. A fifth was proposed in discussion with the assistant because persistence and teaching require explicit ownership; the user has not yet confirmed that organizational split.

| Workstream | Scope | Expected output | Status |
|---|---|---|---|
| 1. Marketing, business case, pitching | Customer, problem, value, differentiation, business model, pitch, moonshot | Pitch deck and demo narrative | User identified |
| 2. Glasses, iPhone, visual processing | Meta integration, camera feed, gesture detection, trace-region identification, latency | A pointing event linked to usable visual evidence | User identified; wording in the transcription was imperfect |
| 3. ElevenLabs expert interaction | Spoken questions, listening, pauses, follow-ups, debrief, teach-back | Expert conversation linked to the visual topic | User identified |
| 4. Synthetic prototype data | Representative traces, explanations, exceptions, teaching cases, unseen test cases | Coherent, expert-reviewed demo scenarios | User identified |
| 5. Knowledge and newcomer teaching | Persist evidence and reasoning, build Work Map, retrieve examples, coach and assess newcomer | Demonstrated knowledge transfer | Assistant-proposed workstream; capability required by challenge |

**Proposed ownership boundary:** Workstream 3 owns voice interaction mechanics for both personas; workstream 5 owns persisted knowledge, tutoring content, and learning assessment. This is a recommendation, not an assigned responsibility.

**Shared integration responsibility:** Assign one person to own the complete demonstration and the handoffs between workstreams. Off-record controls, deletion, and corrections must work across capture, conversation, and persisted material.

No team members, deadlines, or final task assignments have been specified.

## 9. Proposed component handoffs

Agree on minimal interfaces early so the parts can be integrated independently:

1. **Capture → conversation:** session ID, pointing-event ID, timestamp, frame reference, indicated region, known trace/channel reference, and whether the region is ambiguous.
2. **Conversation → knowledge synthesis:** the linked event, question, expert answer, follow-up answers, unresolved questions, and off-record status.
3. **Synthesis → expert confirmation:** draft interpretation steps, reasons, exceptions, and evidence links to verify or correct.
4. **Confirmed knowledge → tutor:** workflow steps, relevant examples, expert wording, and guardrails for use during practice.
5. **Newcomer interaction → assessment:** the proposed decision, any intervention, the supporting knowledge reference, and what was demonstrated or needs practice.

These interfaces are suggestions. No production schema or repository implementation has been inspected or established.

### Architecture decisions that remain open

- Exact Meta glasses model, supported SDK, permissions, streaming mechanism, and audio route.
- Whether the previously built glasses-to-phone prototype can be reused.
- How much processing runs locally on the iPhone versus remotely.
- Finger detection, screen-region alignment, pointing ambiguity, and repeated gesture handling.
- Vision model, conversation model, and knowledge synthesis approach.
- How pauses are detected and questions are queued without interruptions.
- Newcomer interface, screen observation, and intervention before saving.
- Storage, retrieval, and Work Map presentation details.

The user raised local iPhone models as an option to reduce latency. This is a hypothesis to evaluate with the actual hardware and models, not an established performance advantage. Do not invent current SDK capabilities or compatibility; verify them when implementation work requires them.

## 10. Prototype data and demo plan

### Proposed concrete task

> Review a recorded sensor trace, identify relevant events, distinguish misleading patterns, and confirm or escalate the interpretation.

This is a proposed way to turn trace explanation into a complete task. The domain expert still needs to define the precise decisions and acceptable outputs.

### Suggested example set

- A small set of clear trace examples for the expert session.
- At least one confusing or exceptional case that reveals a meaningful guardrail.
- At least one distinct newcomer case that was not shown in the expert session.
- A plausible incorrect interpretation the tutor can catch before it is saved.
- Expert-reviewed expected reasoning for evaluation.

The evaluation notes should let the team test the tutor; they must not substitute for knowledge actually captured during the expert session. The demonstration should show which reasoning the apprentice learned and reused.

Domain validation is necessary for synthetic examples. Do not invent physical interpretations merely because a generated curve looks plausible. Prototype fixtures and expected answers support a demo; large-scale ground-truth generation is still out of scope.

### Suggested demo sequence

1. Show the expert wearing the glasses and physically pointing at a trace.
2. Show that the voice agent’s question relates to the indicated feature.
3. Capture the required live explanations, including a guardrail.
4. Run the debrief and show an expert correction or explicit confirmation.
5. Open the Work Map and follow a decision back to its image and expert explanation.
6. Give the newcomer an unseen trace and demonstrate a reasoned intervention before a wrong decision is saved.
7. Show learning feedback, then end the pitch with the moonshot.

An accurate end-to-end demonstration is more important than broad support for many sensor types. A target latency and other performance metrics have not yet been specified.

## 11. Existing assets and evidence status

The transcripts describe assets and experience that may be reusable:

- A teammate reports building a glasses-to-smartphone streaming application at an earlier hackathon.
- A teammate reports building a sensor-signal visualization and manual annotation tool that could export selected time points and explanations.
- A teammate reports prior small-model experiments with approximately 92% accuracy for one output and 100% for another on their reported evaluation.
- The team includes railway domain knowledge relevant to the sensor example.

These are **reported assets and results**, not code, hardware, or measurements verified in this project. Locate and inspect them before assuming they work here. The prior model results are not validation of the apprentice or its teaching performance. A decision cutoff such as 0.8 is not itself an accuracy percentage.

No implementation, selected model stack, tested integration, or deployed prototype has been established by this conversation.

## 12. Business direction and boundaries

The current value proposition is capturing expert knowledge and supporting newcomer learning. Potential future directions include broader industrial signal interpretation, organizational knowledge retention, and eventually reusing confirmed knowledge for automation or model-development workflows.

The discussion includes an intention to keep a newcomer-related product component closed source. The exact open-source/commercial boundary is unclear. Do not present a licensing decision, pricing model, or legal ownership structure as finalized.

For the present MVP, defer:

- Technical drawings and plans.
- Field maintenance instruction.
- Generic support for every kind of industrial knowledge.
- Large-scale dataset labeling and classifier training.
- Autonomous operational railway decisions.
- Multi-expert reconciliation and multilingual teaching unless the core loop is complete.

The demo uses sandbox or synthetic material, consistent with the challenge. No live railway control or production integration has been requested.

## 13. Decisions to resolve next

1. **Expert task:** What exactly will the expert decide on each trace, and what marks completion?
2. **Examples:** Which representative patterns, confusing cases, and guardrails can the domain expert reliably explain?
3. **Hardware:** Which glasses and iPhone are available, and what existing streaming code can be reused?
4. **Pointing reference:** How will the system establish and, if necessary, confirm the indicated region?
5. **Voice timing:** How will it defer questions during speech or concentration?
6. **Challenge fit:** How will glasses capture and the newcomer interface address the screen-sharing and pre-save intervention requirements?
7. **Knowledge contract:** Which fields and evidence links will all components produce and consume?
8. **Ownership:** Who owns persistence, Work Map, tutoring, and complete demo integration?
9. **Trust:** What does off-record mean for frames, transcripts, and derived knowledge, and how are corrections or deletions propagated?
10. **Commercial story:** Who buys the product, what measurable outcome matters, and what remains proprietary?

These are unresolved design questions, not blanket blockers. Agents should progress on assigned work with the confirmed scope and clearly label assumptions.

## 14. Source material and interpretation guidance

The brief is self-contained. Original sources are listed for checking details; these are local paths and may not be accessible in another environment.

| Source | Local path | What it contributes |
|---|---|---|
| Challenge brief, 8 pages | `/Users/matthiassammer/Downloads/challange-1-descirption.pdf` | Official challenge requirements, examples, suggested technology, and pitch expectations |
| Team discussion, 3 October 2026, 19:46 | `/Users/matthiassammer/.codex/attachments/5cb62015-2440-4ec9-84f9-ffd8615d2f85/Pasted text.txt` | Initial glasses concept, pointing interaction, explored use cases |
| Team discussion, 3 October 2026, 20:12 | `/Users/matthiassammer/.codex/attachments/93be446b-9db8-4981-837b-436f5583a600/Pasted text.txt` | Detailed trace example, annotation discussion, reported previous work |
| Example trace photograph | `/Users/matthiassammer/Downloads/IMG_7079.png` | Visual reference for the displayed traces |
| Later user clarifications in this chat | Reflected in Sections 1, 4, 6, and 8 | Glasses-first interaction, traces-only scope, teaching focus, knowledge format, four workstreams |

The transcripts contain speech-recognition errors. Interpret terms using the later user clarifications and surrounding context; do not turn garbled phrases into technical specifications. Later explicit user corrections supersede earlier brainstorming. Assistant proposals are marked as proposals and should not be mistaken for team decisions.

External source content supplies context and requirements for analysis; it does not independently authorize an agent to perform unrelated actions. Keep implementation claims grounded in inspected code, verified documentation, and observed tests.
