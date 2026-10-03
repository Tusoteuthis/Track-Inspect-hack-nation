# Workstream 6 Brief: Backend and Integration

**Project:** AI Apprentice for Railway Sensor Traces — working name  
**Challenge:** “The AI Apprentice,” Challenge 1, 7th Global AI Hackathon, powered by ElevenLabs  
**Updated:** 3 October 2026  
**Concrete output:** A shared backend connecting glasses capture, expert conversation, confirmed knowledge, and newcomer tutoring through one working application.  
**Reference:** [Full project brief](../project-brief.md)

## 1. Project context

An expert wears **Meta Ray-Ban smart glasses**, looks at **sensor traces on a screen**, and physically points at a trace region. The connected iPhone application detects the gesture and captures its visual reference. An **ElevenLabs voice agent** asks the expert to explain the feature, their reasoning, and relevant exceptions or guardrails.

After a spoken debrief and expert confirmation, the system persists knowledge as Markdown with linked images. A newcomer voice tutor uses that captured knowledge on an unfamiliar trace and catches a wrong decision before it is saved.

The MVP is **traces only** and **teaching newcomers**. Drawings, field maintenance, classifier training, and large-scale dataset labeling are deferred. Preserve the glasses-first, physical-pointing experience. The newcomer does not necessarily wear glasses.

Seven workstreams now cover: WS1 business/pitch; WS2 native iPhone, glasses, and vision; WS3 expert conversation and ElevenLabs adapter; WS4 prototype scenarios; WS5 knowledge and teaching logic; WS6 shared backend; WS7 web frontend. This brief assigns infrastructure ownership, not the choice of programming language, framework, database, hosting provider, or model. No implementation or stack has been verified.

## 2. Your mission and ownership

Make the specialist components operate as one application with stable identifiers, durable evidence, consistent state, and inspectable failures. Own the shared service layer and technical integration path.

| You own | Specialist owner |
|---|---|
| APIs, event delivery, validation, shared session state | WS2 produces pointing events; WS3 and WS5 define domain behavior |
| Uploads, evidence storage, Markdown persistence, revision records | WS5 defines knowledge content, schema semantics, and eligibility rules |
| Runtime hosting and invocation of specialist modules | WS3 implements expert dialogue/provider adapter; WS5 implements synthesis, retrieval selection, tutor evaluation |
| Server-side save/commit enforcement | WS5 returns the domain evaluation; WS7 presents the draft and feedback |
| Credentials, configuration, access to sessions/assets | WS3 defines provider requirements; clients consume appropriately scoped access |
| Service startup, technical deployment configuration, integration diagnostics | WS7 owns browser packaging and UI; WS2 owns native-device setup |

Do not independently implement a competing interview agent, synthesis pipeline, tutor policy, or user interface. Specialist logic can be modules in the same backend process; separate workstreams do not require separate services.

WS6 owns technical integration. WS1 coordinates the presentation run sheet with the team; a named person still needs to own the live demonstration.

## 3. Minimum end-to-end path

1. Create an expert session and provide its identifiers to the native capture client and web companion.
2. Receive eligible images and pointing events from WS2, preserving their relationship and capture times.
3. Deliver the event and usable evidence reference to WS3; persist linked expert exchanges.
4. Invoke WS5 synthesis and pass draft revisions and gaps back to WS3 for the debrief.
5. Persist expert confirmation against the exact reviewed revision and expose the Work Map to WS7.
6. Create a newcomer session with a permitted unseen case and a selected confirmed knowledge revision.
7. Route the learner’s screen context and draft decision to WS5; deliver evaluation and voice feedback to the client.
8. Commit only a current, eligible decision after the agreed review behavior, and persist the learning assessment.

Keep this flow simple enough to run locally for integration. A local filesystem is compatible with the current persistence direction. A cloud deployment, object store, or vector database is not required merely because this is a backend.

## 4. Shared contracts and data model

Own the versioned transport contracts and sample fixtures in coordination with each producer and consumer. Existing field names in WS2/WS3/WS5 are proposed v0 formats, not implemented APIs.

| Resource/event | Key relationships |
|---|---|
| Session | Role, lifecycle, recording state, case/trace reference, selected knowledge revision |
| Evidence asset | Stable asset ID, original image, optional highlighted derivative, session, dimensions and coordinate basis |
| Pointing event | `session_id`, `event_id`, `frame_id`, image references, region, mapping status, timestamps, optional signal interval |
| Expert exchange | `exchange_id`, linked event, question, original answer, source offsets and recording eligibility |
| Knowledge entry/revision | Stable entry ID, revision, content and evidence references, verification state |
| Confirmation | Exact draft revision reviewed, expert response, confirmed/corrected/unresolved result |
| Learner draft/evaluation | Decision revision, visual context, knowledge revision, evaluation result and cited evidence |
| Assessment | Initial decision, assistance, final outcome, evidence used, suggested practice |

API coverage should include session lifecycle, uploads and evidence reads, event/exchange ingestion, knowledge and confirmation, learner draft/evaluation/commit, assessment reads, and correction/deletion. Agree endpoint names rather than inventing incompatible routes in each component.

Keep **recording time** separate from **signal-axis time**. Keep image coordinates tied to a declared frame. Unknown trace identity or signal interval remains unknown.

Use stable IDs to handle retries without duplicate questions or duplicate knowledge entries. Specify event ordering, acknowledgement, and reconnection behavior. A ready event must reference evidence that is actually available; do not send dangling asset references as though upload succeeded.

## 5. State and concurrency

The backend is authoritative for shared session, recording, confirmation, and commit state. WS3 still owns conversational turn-taking, and WS5 still owns knowledge/teaching decisions. WS7 displays actual service state rather than inventing a separate source of truth.

Prevent old work from overwriting new state. For example:

- A delayed answer must retain its original pointing-event reference.
- A confirmation must not verify a draft that changed after the expert reviewed it.
- An evaluation must refer to the exact learner decision and knowledge revision it assessed.
- Editing a decision after evaluation requires another evaluation before commit.
- If the relevant knowledge is revoked or corrected, do not reuse a stale evaluation without applying the agreed revision policy.

A disabled Save button alone is insufficient. Enforce the pre-save rule on the backend, including requests sent twice or sent while evaluation is pending. WS5 defines evaluation outcomes and uncertainty behavior; WS6 enforces their agreed consequences without inventing domain judgments.

## 6. Provider and runtime boundaries

WS3 owns the ElevenLabs integration adapter and expert interaction behavior. WS6 owns the runtime routes, secret storage/configuration, session association, and any supported client-access issuance needed to run that adapter. Coordinate with WS2 on the actual glasses/iPhone audio path and WS7 on browser audio controls.

Do not send permanent provider secrets to the browser or native application. Verify supported credential and connection mechanisms when implementing rather than assuming a particular SDK feature exists.

WS5 supplies synthesis, retrieval-selection, and tutor-evaluation modules. Host and invoke them through agreed interfaces. Preserve human-readable Markdown and images as inspectable artifacts even if a small metadata index is added.

## 7. Evidence and trust

Own storage operations, revision consistency, and enforcement of session/asset access. WS5 defines what qualifies as confirmed teaching material. Exclude draft, unresolved, revoked, or off-record content according to those rules.

Off-record state must propagate to capture, audio handling, exchanges, jobs, and persistent outputs. Agree whether transient processing is permitted; do not merely label a record off-record while still storing its contents. Remove or invalidate dependent material when sources are deleted or corrected, and prevent delayed jobs from recreating excluded data.

Keep WS4 evaluator-only answer keys outside runtime retrieval, served assets, and tutor-accessible tools. Development fixtures must be clearly labeled and must not silently substitute for captured expert knowledge in the final demo.

Do not introduce enterprise infrastructure unrelated to the MVP. Define the access boundary appropriate to the actual demo deployment, and accurately document its limits.

## 8. Deliverables

- Runnable shared backend with documented local startup and environment configuration.
- Versioned API/event contracts and representative fixtures for WS2, WS3, WS5, and WS7.
- Reliable image/evidence storage and Markdown/revision persistence.
- Session lifecycle, live update delivery, confirmation handling, and authoritative pre-save enforcement.
- Integration adapters that invoke specialist modules without duplicating their logic.
- Diagnostics showing IDs and timings across capture, conversation, synthesis, and tutor evaluation; avoid exposing excluded content in logs.
- Technical deployment configuration and run instructions for the selected environment; public publishing is a separate action unless authorized.
- An integration demonstration and concise failure/recovery notes.

## 9. Handoffs

| Partner | Receive | Provide |
|---|---|---|
| WS2 | Capture events, image assets, native transport requirements | Session IDs, upload/ingestion contract, acknowledgement and reconnect behavior |
| WS3 | Expert agent/provider adapter, exchange and confirmation events | Event transport, persisted state, provider configuration, draft/gap routing |
| WS4 | Versioned learner-visible assets and separate evaluator fixtures | Asset-loading contract and runtime/evaluation separation |
| WS5 | Knowledge schema semantics, synthesis/retrieval/evaluation modules | Storage, revision APIs, execution lifecycle, commit enforcement |
| WS7 | UI state and API needs, browser frame/decision events | Stable API and live updates, evidence access, error states |
| WS1 | Demo sequence | Working environment, verified technical behavior, known limits |

## 10. Acceptance criteria

- One real pointing event can be traced through an expert answer, confirmed knowledge entry, Work Map, and newcomer feedback using stable identifiers.
- Images and evidence references resolve in the actual native/backend/browser setup.
- Repeated delivery, a temporary disconnect, and delayed processing do not duplicate or misattach records.
- Confirmation applies only to the reviewed revision.
- A wrong learner decision can be intercepted before save; pending, stale, or changed drafts cannot bypass the agreed backend review.
- Correction, deletion, and off-record state propagate to storage, pending work, and retrieval eligibility.
- Evaluator-only answers and permanent provider secrets are not accessible to runtime clients/tutors.
- The team can start the integrated application from the documented instructions and identify a failed component without guessing.

## 11. Suggested first steps

Align on one event, one exchange, one knowledge revision, and one learner decision fixture. Implement the smallest storage/API path and give WS7 a stable contract immediately. Integrate WS2/WS3/WS5 incrementally, replacing labeled fixtures with live components. Add meaningful checks for retries, revision changes, and the pre-save boundary rather than building a distributed platform first.

Open decisions include the stack, local versus hosted execution, event transport, access boundary, retention behavior, and supported deployment target. Choose these with the available repository and hardware evidence; none is preselected by this brief.
