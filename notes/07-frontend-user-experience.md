# Workstream 7 Brief: Frontend and User Experience

**Project:** AI Apprentice for Railway Sensor Traces — working name  
**Challenge:** “The AI Apprentice,” Challenge 1, 7th Global AI Hackathon, powered by ElevenLabs  
**Updated:** 3 October 2026  
**Concrete output:** One coherent web application for expert-session support, Work Map review, and newcomer practice, connected to the shared backend.  
**Reference:** [Full project brief](../project-brief.md)

## 1. Project context

An expert wears **Meta Ray-Ban smart glasses**, views **sensor traces on a screen**, and physically points at a region with a finger. The native iPhone/glasses application identifies the region and captures the evidence. An **ElevenLabs voice agent** asks the expert what the feature means and draws out their reasoning, exceptions, and guardrails.

The apprentice runs a debrief and teach-back, receives expert confirmation, and stores knowledge as Markdown plus linked images. A voice tutor then coaches a newcomer through an unseen trace and catches a wrong decision before it is saved.

The scope is **traces only** and **teaching newcomers**. Technical drawings, field maintenance, classifier training, and large labeling campaigns are excluded. Glasses and physical pointing remain the primary expert interaction; a web companion must not silently turn the product into mouse-driven knowledge capture.

Seven workstreams cover WS1 business/pitch; WS2 native iPhone, glasses, and vision; WS3 expert conversation/ElevenLabs adapter; WS4 cases; WS5 knowledge and teaching logic; WS6 shared backend; WS7 web frontend. You own the browser experience, not the native iPhone app or specialist reasoning modules.

## 2. Your mission and ownership

Make the learning loop understandable and usable for the expert, newcomer, and judges. Users should be able to see what the apprentice is referring to, correct misunderstandings, inspect the evidence, and complete a teaching session.

| You own | Other owner |
|---|---|
| All web screens, navigation, browser state presentation, responsive layouts | WS2 owns native iPhone capture UI and glasses integration |
| Expert companion controls and visual feedback | WS3 owns when/what the expert agent asks |
| Work Map rendering, evidence viewer, correction/review UI | WS5 owns knowledge content, schema meaning, verification rules |
| Newcomer trace display, draft decision controls, feedback and assessment UI | WS5 owns tutor questions, evaluation, and learning assessment logic |
| Browser microphone/screen-sharing controls and client-side capture integration where required | WS3 supplies voice adapter behavior; WS6 handles shared transport/configuration |
| Save controls, progress, errors, reconnect presentation | WS6 owns authoritative state and backend commit enforcement |

Do not create separate competing interfaces inside WS3 or WS5. They specify the behavior and data your screens must express. Technical diagnostics can remain in their development tooling.

## 3. Minimum application flow

### A. Session setup and trace display

Provide a clear entry into expert capture or newcomer practice. Use WS4 case assets with stable IDs and permitted context. Present traces at a size that remains legible when viewed through the glasses.

Show the actual device/session connection status from WS6. Browser screen sharing, if needed, is a companion capability; it does not replace physical pointing. Do not imply that the browser can pair with or stream from the glasses without the supported WS2 integration.

### B. Expert companion

Provide a lightweight view of the active trace, recent indicated region, agent status, and recording state. Let the expert pause or stop a session, request off-record handling, and access the current visual reference when useful. Keep controls from obscuring the trace.

WS3 decides when to ask a question. Do not trigger speech merely because the UI received a gesture. Display ambiguity honestly so the expert can understand a clarification request. Preserve the original capture and annotated region; do not draw a confident highlight on an unrelated or stale frame.

### C. Debrief and expert review

Support the spoken debrief with a view of unresolved questions and the draft process when useful. Show which version is being reviewed and reflect corrections from the conversation.

The challenge requires a spoken teach-back and explicit expert confirmation. A silent “Approve” button cannot replace that interaction. A correction or confirmation control can supplement it, with WS3/WS5 defining semantics and WS6 recording the reviewed revision.

### D. Clickable Work Map

Render the interpretation workflow with clear step/decision navigation. Selecting a step should show the relevant captured trace, highlighted region, expert words, reasoning, and guardrails. Let the user inspect the full image as well as the focused region.

Distinguish the expert’s original statement from an AI summary and show whether knowledge is confirmed, unresolved, or no longer eligible. Do not display placeholders as confirmed expert evidence.

### E. Newcomer practice

Display an unfamiliar trace and the allowed context. Provide a concrete way to draft the agreed decision, receive voice guidance, inspect an expert example, correct the draft, and save it after review.

The exact task controls depend on the decision defined by WS4/WS5: for example an annotation, interpretation, or escalation choice. That is still a product decision; do not assume a full chart-editing suite is required.

Own the browser-side screen observation/capture experience required for the tutor, including clear permission/connection status. The supported capture mechanism must be verified during implementation. Structured UI actions can supplement visual context; a list of hidden form values alone does not demonstrate the challenge’s screen-watching requirement.

### F. Learning summary

Show the assessment returned by WS5: what the learner did independently, what required help, and what to practice next. Avoid presenting an assisted correction as proof of independent mastery.

## 4. API and state coordination

Use WS6’s shared APIs and live updates for sessions, capture evidence, conversation status, knowledge revisions, learner evaluations, commits, and assessment. Give WS6 the UI’s required states early; do not invent a second backend in frontend code.

Carry session, event, entry, and revision identifiers through selections and actions. Account for loading, no data, ambiguous evidence, processing, correction, disconnected state, and failure. A fixture-only screen should be visibly identified during development and replaced by real data for the final claim.

For learner review, distinguish at least:

- Draft changed / not yet reviewed.
- Review pending.
- Guidance or correction needed.
- Review complete under the agreed policy.
- Saving, saved, or save failed.

Editing a reviewed decision must invalidate the displayed review state. Avoid optimistic “Saved” feedback before the backend confirms the commit. WS6 must enforce the review boundary server-side; your UI communicates it and prevents accidental double submissions.

## 5. Voice, trust, and usability

The expert primarily interacts through the glasses and voice. The companion UI should support that experience without demanding frequent clicks. The newcomer may use browser audio; the exact hardware path remains undecided.

Show whether the agent is listening, speaking, waiting, or disconnected using real component state. Distinguish microphone permission from recording eligibility. “Off record” must reflect acknowledged backend/capture state, not only a local toggle. Provide accurate feedback if a stop, deletion, or correction has not completed.

Keep trace colors, channel labels, axes, and highlights legible. Use more than color alone to distinguish selection and status. Ensure text, focus behavior, and core controls remain usable with keyboard input. Do not clutter the product with SDK names, internal IDs, or debug logs; keep diagnostics in a separate developer view if needed.

No visual brand, design system, web framework, or repository has been selected. Reuse an established project if one exists; this brief does not require a new site platform or deployment service.

## 6. Challenge evidence the UI must expose

The complete product must demonstrate three relevant live questions including a guardrail question; three additional debrief questions; an expert-confirmed teach-back; a Work Map with visual and verbal evidence for every step/guardrail; and an unseen newcomer case with a pre-save correction and learning feedback.

Your UI makes these behaviors reviewable but does not manufacture them. Use actual session evidence from WS3/WS5. Coordinate screen-sharing interpretation with WS2/WS6 and the team; no organizer exception has been established for glasses capture.

The final pitch and moonshot slide belong to WS1. Help make the application’s essential moments understandable on the demo screen without rebuilding the deck inside the product.

## 7. Deliverables

- Connected web application covering expert companion, review/debrief support, Work Map, practice, and assessment.
- Reusable trace/evidence viewer with accurate region highlighting and full-context inspection.
- Browser controls for required audio/screen capture and consistent status/error feedback.
- Draft decision and pre-save review interface connected to WS6 and WS5.
- Integrated off-record, correction, and deletion controls for the implemented backend behavior.
- Documented startup/build instructions, environment requirements, and a concise demo navigation guide.
- Visual and interaction verification of the primary user journeys on the intended demo display.

These are outputs expected from the workstream, not features already implemented. Public deployment is handled with WS6 under the team’s deployment authorization.

## 8. Handoffs

| Partner | Receive | Provide |
|---|---|---|
| WS2 | Native connection status, captured evidence and geometry, monitor readability constraints | Legible trace presentation and companion display needs |
| WS3 | Expert voice behavior/status, supported browser voice adapter hooks | Controls and views for conversation, debrief, and correction |
| WS4 | Stable trace assets, case manifest, learner-visible context | Rendering requirements and display issues |
| WS5 | Work Map content, eligibility rules, tutor feedback, assessment | UI for viewing evidence and exercising the defined learning flow |
| WS6 | APIs, live state, asset access, recording and commit enforcement | UI state requirements, browser capture/events, integration feedback |
| WS1 | Demo sequence, audience needs, any agreed identity | Predictable navigation and verified user-facing moments |

Never bundle WS4 evaluator-only answers into the frontend, including hidden JSON, client code, tooltips, or case metadata delivered to the tutor. Development mocks must be kept separate from the actual knowledge-transfer demonstration.

## 9. Acceptance criteria

- The expert can use glasses and physical pointing while the web companion provides accurate status and evidence.
- The complete session can be navigated from capture through confirmed Work Map to newcomer practice without disconnected mock screens.
- Every map step and guardrail opens the correct visual region and expert words.
- Unconfirmed, revoked, missing, or ambiguous material is not presented as verified knowledge.
- The newcomer can propose, reconsider, correct, and save a decision while observing appropriate pending/error states.
- At least one wrong decision is intercepted before save using real feedback from the captured-knowledge tutor.
- Changing a draft or knowledge revision cannot leave a stale “reviewed” state that falsely permits saving.
- The learner summary distinguishes independent from assisted performance.
- Off-record and correction controls reflect acknowledged shared state.
- Trace readability, core navigation, reconnect behavior, and the intended demo display are checked.

## 10. Suggested first steps

Sketch the expert → map → newcomer journey and agree its states with WS3/WS5/WS6. Render one WS4 trace and one evidence-backed Work Map step using the shared fixture format. Connect the real API early, then complete the draft-review-save loop before polishing secondary screens.

Open decisions include the web stack, visual identity, learner task controls, browser screen-capture route, and display layout. Resolve them without changing the glasses-first scope or independently choosing domain rules.
