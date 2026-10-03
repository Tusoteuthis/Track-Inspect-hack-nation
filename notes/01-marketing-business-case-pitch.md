# Workstream 1 Brief: Marketing, Business Case, Pitch

**Project:** AI Apprentice for Railway Sensor Traces — working name  
**Challenge:** “The AI Apprentice,” Challenge 1, 7th Global AI Hackathon, powered by ElevenLabs  
**Updated:** 3 October 2026  
**Concrete output:** A pitch deck and demo story that explain the customer problem, show knowledge transfer, and connect the MVP to a credible business and moonshot.  
**Reference:** [Full project brief](../project-brief.md)

## 1. Project context you must preserve

An experienced railway engineer wears **Meta Ray-Ban smart glasses** while viewing **sensor traces on a screen**. They physically point with a finger at a trace region. A connected application detects the pointing gesture in the glasses’ camera feed, captures the visual reference, and gives that context to an **ElevenLabs voice agent**. The agent asks the expert to explain what they see and why, then follows up about exceptions and guardrails.

After a debrief and expert confirmation, the system saves the reasoning with linked images, initially using Markdown and a simple filesystem. A voice tutor uses that knowledge to coach a newcomer through a trace the expert never demonstrated.

The user explicitly narrowed the MVP to **traces only** and **teaching newcomers**. Technical drawings, field maintenance, ground-truth labeling campaigns, and training a signal classifier are out of scope. Glasses and physical pointing are central to the product experience.

The five workstreams are: 1) business and pitch; 2) glasses and visual processing; 3) expert voice conversation; 4) prototype examples; 5) persisted knowledge and newcomer tutor. Your work explains the integrated result. It does not redefine the engineering scope.

## 2. Your mission

Explain why capturing an engineer’s visual judgment matters, why this interaction is useful, who might pay for it, and how the demo proves its value. Make the narrative understandable to judges who are unfamiliar with railway sensors.

The most important outcome is **a newcomer making a reasoned decision on an unfamiliar trace using knowledge captured from an expert**. The glasses are the capture experience; the business value is retained expertise and usable teaching.

Distinguish the expert user, newcomer user, organizational beneficiary, and economic buyer. Potential buyers such as engineering training leaders or organizations with specialist sensor-analysis teams are hypotheses to investigate, not confirmed customers.

## 3. Deliverables

| Deliverable | Contents |
|---|---|
| Positioning brief | One-sentence description, initial customer segment, user/buyer distinction, problem, value proposition, differentiation |
| Business case | Explicit assumptions, proposed success metrics, potential costs, and a credible pilot design |
| Business model options | A small number of pricing/packaging hypotheses with a recommended initial option and reasons |
| Pitch deck | Clear problem, demonstrated solution, customer value, business direction, and a final moonshot slide |
| Demo story and run sheet | Presenter narration, role transitions, expected visible evidence, dependencies, and recovery paths |
| Claim register | Which claims are demonstrated, externally sourced, team-reported, or still assumptions |

No pitch duration, slide limit, price, commercial buyer, or brand name has been confirmed. Prepare a modular narrative and label any assumed duration instead of presenting one as a competition rule.

## 4. Suggested narrative

Use this as a starting structure, not a required slide count:

1. **A specific expert judgment:** An engineer sees a feature in a trace that a newcomer could misinterpret.
2. **The knowledge gap:** The important knowledge includes why an interpretation is valid and when it fails.
3. **The interaction:** Put on glasses, point at the feature, explain it, and answer relevant follow-ups.
4. **The captured knowledge:** Open a Work Map entry and show the trace region, expert words, reasoning, and guardrail.
5. **Knowledge transfer:** Let a newcomer interpret an unseen trace; show the tutor intervene before a wrong decision is saved.
6. **Business value:** Explain the intended buyer, pilot, and measurable benefit with assumptions clearly labeled.
7. **Moonshot:** End with one slide connecting today’s narrow MVP to a larger opportunity.

A plausible moonshot is a reusable library of expert-confirmed industrial interpretation workflows. Broader sectors and agent use can be future directions; do not imply that they are supported by the current prototype.

## 5. What the challenge expects the story to prove

- **Capture:** At least three live, screen-grounded questions at natural pauses, including one about a guardrail.
- **Map:** At least three additional debrief questions addressing previously unanswered matters, followed by an expert-confirmed teach-back.
- **Traceability:** Every step and guardrail links to a screen moment and the expert’s own words.
- **Teach:** A newcomer handles an unseen case, and the tutor catches at least one wrong decision before it is saved, using expert reasoning.
- **Learning:** Show what the newcomer has mastered and what to practice next.
- **Trust:** Explain off-record handling and protection of personal data.
- **Pitch:** Finish with one moonshot slide showing the path from the MVP.

The challenge describes screen-sharing and watching the newcomer’s own screen. The team must reconcile that wording with glasses-based expert capture. Coordinate with workstreams 2 and 5; do not claim organizer approval or conceal a gap.

## 6. Business evidence and claim discipline

Propose metrics such as expert time spent documenting, newcomer task completion, interpretation errors, and performance with less assistance. Define the comparison and measurement method before making numerical claims.

If using an ROI model, expose its assumptions. For example, estimated saved training hours multiplied by the relevant cost rate is an estimate; it is not observed customer savings. Include the cost of expert capture and review instead of assuming knowledge creation is free.

Research current market, competitor, vendor-pricing, and customer claims when actually preparing the pitch, using attributable sources. The present brief supplies no verified market size or competitive ranking.

Important boundaries:

- A teammate reported prior classifier results around 92% and 100% for different outputs. These are unverified prior experiments, not apprentice or teaching results.
- The example image names Frauscher and the RSR180 sensor. It does not establish a partnership, endorsement, or customer relationship.
- Faster onboarding and lower documentation effort are intended benefits until measured.
- The conversation suggests keeping some newcomer-product functionality proprietary. Exact licensing and commercial boundaries remain undecided.
- Do not claim on-device processing, real-time accuracy, or a latency value until workstream 2 provides evidence.

## 7. Handoffs and collaboration

| Partner | What you need | What you provide |
|---|---|---|
| WS2: glasses and vision | Actual hardware, successful interaction footage, measured latency, limitations | The specific visual moment the audience must understand |
| WS3: expert conversation | Real questions, expert answers, debrief, confirmation evidence | A concise narrative around knowledge capture |
| WS4: examples | Expert-reviewed scenario, newcomer case, plausible error | A consistent story using the agreed examples |
| WS5: knowledge and tutor | Working evidence links, unseen-case tutoring, correction and assessment | Demo sequence and business explanation of the learning outcome |

Agree on the same scenario and terminology across the deck, data, and live demo. Keep evaluation-only answers out of material supplied to the runtime tutor. The business narrative can describe expected outcomes, but it must not become an undisclosed answer source for the application.

## 8. Acceptance criteria

- A new reader can explain who the product serves, how glasses and pointing work, and what the newcomer gains.
- The pitch presents the full Capture → Map → Teach loop.
- Every product claim matches demonstrated behavior or is explicitly labeled as a plan or assumption.
- The business case names a testable buyer and value hypothesis without inventing customer validation.
- The run sheet identifies what the audience will see at every critical step and what evidence supports it.
- The final slide is the moonshot and explains how the MVP leads there.
- The deck does not drift into technical drawings, autonomous railway operation, or classifier training as the current deliverable.

## 9. Suggested first steps and open decisions

Start by writing the positioning sentence and a one-page story using the agreed trace scenario. Ask the engineering workstreams for their actual evidence, then build the deck around what the prototype can demonstrate. Leave unsettled numbers and unbuilt features as labeled assumptions.

Resolve the pitch duration, initial buyer, pilot success measure, business model hypothesis, commercial boundary, and named demo owner. These questions should not prevent drafting a concrete story.

This workstream produces pitch artifacts; publishing, contacting customers, or making commercial commitments are separate tasks.
