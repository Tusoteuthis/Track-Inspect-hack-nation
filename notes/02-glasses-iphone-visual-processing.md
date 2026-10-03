# Workstream 2 Brief: Glasses, iPhone, Visual Processing

**Project:** AI Apprentice for Railway Sensor Traces — working name  
**Challenge:** “The AI Apprentice,” Challenge 1, 7th Global AI Hackathon, powered by ElevenLabs  
**Updated:** 3 October 2026  
**Concrete output:** A physical pointing event from the Meta Ray-Ban camera feed, linked to a captured image and a highlighted trace region.  
**Reference:** [Full project brief](../project-brief.md)

## 1. Project context you must preserve

An expert wears **Meta Ray-Ban smart glasses**, looks at **sensor traces on a screen**, and physically points at a region with a finger. The connected application recognizes the visual reference. An **ElevenLabs voice agent** asks the expert what it means and follows up about reasoning, exceptions, and guardrails.

The confirmed knowledge is saved as Markdown plus linked images and used to teach a newcomer on an unseen trace. The goal is knowledge transfer. Technical drawings, field maintenance, large-scale ground-truth generation, and classifier training are outside the MVP.

The glasses are the primary expert capture and interaction device. Do not replace the experience with cursor tracking, mouse clicks, or a conventional screen-sharing assistant. Supporting tools can help development, but the final capture claim must reflect actual glasses-based behavior.

The five workstreams cover business, visual capture, expert voice interaction, prototype data, and knowledge/tutoring. You supply trustworthy visual references to the conversation and knowledge systems.

## 2. Your mission and boundaries

Make “this part of the trace” a reliable, inspectable reference that remains attached to the expert’s explanation after their finger moves away.

You own hardware integration, camera acquisition, pointing detection, region identification, visual evidence, timing information, and capture latency measurement. Coordinate the audio route with WS3 and shared evidence storage with WS5.

You do not own the domain meaning of a signal, the expert interview policy, the knowledge synthesis, or the newcomer curriculum. Detecting a finger or a dip does not establish what the dip physically means.

## 3. Starting evidence and unresolved technology

A teammate reports an earlier glasses-to-smartphone streaming prototype. Locate and inspect it before deciding what can be reused. No repository, supported hardware configuration, or tested SDK integration has been established in this conversation.

The team raised using the native Meta integration and potentially running models locally on the iPhone. Verify the exact available glasses generation, iPhone, SDK support, permissions, streaming behavior, and audio routing against current official documentation and actual hardware. No particular model or on-device capability is already selected.

Local processing is a candidate for lower latency; measure it. Do not promise that it is faster or better before comparing the actual processing path.

The sample photograph shows SYS1/SYS2 curves with dips and ON/OFF trigger lines. It supplies visual context, not a numeric dataset or calibrated screen geometry.

## 4. Minimum capture flow

1. Establish a working camera path from the glasses to the application.
2. Display an agreed trace fixture from WS4 on a monitor and record a representative first-person view.
3. Detect a physical pointing gesture and identify the screen area it refers to.
4. Select a usable frame and preserve sufficient surrounding trace context.
5. Create a highlighted version that makes the selected region clear.
6. Emit a stable event for WS3 and a retrievable visual reference for WS5.
7. Handle ambiguous or repeated gestures explicitly instead of silently assigning the wrong region.

A finger can obscure the trace. Retain a suitable adjacent frame when available, but record how it relates to the pointing frame and keep coordinates aligned. Do not generate or reconstruct missing trace content and present it as observed evidence.

Moving the head, changing camera perspective, switching traces, two visible channels, glare, and screen moiré are relevant practical cases. Prioritize the conditions used in the hackathon demo, and state limitations.

## 5. Proposed pointing-event contract

This is a suggested v0 handoff, not an existing API. Coordinate changes with WS3 and WS5 before their implementations diverge. All references should remain resolvable beyond the live conversation.

| Field | Meaning |
|---|---|
| `schema_version` | Version of the agreed handoff format |
| `session_id`, `event_id` | Stable identifiers used by conversation and knowledge records |
| `captured_at_utc`, `session_time_ms` | Wall-clock capture time and elapsed session time; define the session origin |
| `frame_id`, `image_ref`, `highlighted_image_ref` | Original evidence and a derivative highlighting the selected region |
| `region` | Bounding box or equivalent region with an explicit coordinate system |
| `mapping_status` | Suggested values: `resolved`, `ambiguous`, `unresolved` |
| `trace_id`, `channel_id` | Identifiers when reliably known; otherwise null |
| `signal_interval` | Optional start/end and unit only when calibrated to the trace |
| `record_state` | Whether the event is eligible for recording under the agreed privacy behavior |

Suggested geometry: a normalized box `{x, y, width, height}` in the **original saved frame**, with origin at its top-left, values in `[0, 1]`, and the original frame dimensions recorded. If you use a rectified screen image instead, declare that coordinate space and retain the transform/reference needed to find the region in the original evidence. Do not mix geometry from different images.

`session_time_ms` refers to the recording. `signal_interval` refers to the trace’s horizontal axis. Never substitute one for the other. A region without an exact signal-time mapping is still useful for teaching.

Confidence scores are optional and should state what they measure. An uncalibrated detector score is not a probability that the expert’s interpretation is correct.

## 6. Timing and interaction responsibilities

Emit enough timing and event identity information for WS3 to deduplicate gestures, reject stale references, and connect the correct question and answer. A sustained finger pose should not become an endless series of new topics.

WS3 decides when to speak. A pointing event identifies a topic; it does not force the agent to interrupt the expert. If the trace changes before the question can be asked, the preserved frame or an explicit clarification should ground the conversation.

Measure at least capture/availability time, gesture-processing time, event emission, and event receipt. Coordinate with WS3 to measure question readiness and speech onset separately from time deliberately spent waiting for a natural pause. Report hardware, processing location, and measurement conditions.

No latency threshold or frame cadence is agreed. The challenge’s suggested one-to-two-second vision sampling is not a validated rate for finger tracking. Choose and document settings from the actual interaction needs.

## 7. Deliverables

- Working capture-to-event path on the available glasses/iPhone configuration, or a precise report of any unresolved hardware limitation.
- A usable original frame and highlighted region for each retained event.
- Versioned event format and representative fixtures, including resolved and ambiguous cases.
- Small diagnostic view or evidence report showing which region was selected and why it is usable.
- Latency measurements and a documented handling strategy for repeated gestures, lost streams, stale frames, and ambiguous pointing.
- Setup/run instructions and configuration needed by the integrating team, without embedding credentials.
- Agreed capture/off-record behavior coordinated with WS3 and WS5.

A replay or prerecorded event adapter can unblock other workstreams early. Label it as a development fixture; it does not prove live hardware support or replace the final glasses demonstration.

## 8. Dependencies and handoffs

| Partner | Receive | Provide |
|---|---|---|
| WS3: expert voice | Conversation-ready/busy information and clarification needs; audio integration constraints | Pointing events, visual references, timing, ambiguity state |
| WS4: prototype data | Stable trace fixtures, monitor presentation, known case IDs, representative gesture scenarios | Capture constraints and observed visibility problems |
| WS5: knowledge/tutor | Evidence storage expectations and reference-resolution contract | Durable evidence references, region geometry, capture timestamps |
| WS1: pitch | The critical demo moments | Verified capabilities, footage, measurements, and limitations |

The newcomer’s hardware remains undecided. Coordinate with WS5 if its screen observation can reuse this capture stack; do not make glasses mandatory for the newcomer without a decision.

## 9. Trust and challenge fit

Off-record behavior must be consistent across frames, audio, transcripts, and derived entries. Agree which transient processing is allowed, when capture stops, and what is discarded. Do not mark sensitive data “off record” in one component while another persists it.

The challenge explicitly asks for screen-sharing and screen-grounded evidence. Establish whether a companion browser/screen capture is needed to satisfy that requirement and produce legible evidence. Preserve the glasses and physical pointing as the primary expert interaction. Organizer acceptance of an equivalent capture method has not been established.

## 10. Acceptance criteria

- An expert physically points at a trace while wearing the glasses, and the application produces an event from that capture path.
- The highlighted region can be compared with the original frame and matches the intended reference in the agreed demo cases.
- The event retains a stable identity and image reference through the question, answer, and saved knowledge entry.
- Ambiguous references are flagged for clarification; exact signal times are never fabricated.
- Repeated gestures, changed traces, and delayed questions do not silently attach answers to the wrong region.
- Latency is measured on the actual configuration and separates processing from intentional conversational waiting.
- Off-record behavior works consistently with downstream storage.
- Supporting fixtures and unverified capabilities are clearly identified.

## 11. Suggested first steps

First verify the available hardware and prior prototype. Then demonstrate one camera frame and one pointing event on an agreed trace before building generalized recognition. Give WS3 and WS5 a sample event immediately so their work can proceed independently. Expand to ambiguity, timing, and representative failure cases once the complete single-event handoff works.
