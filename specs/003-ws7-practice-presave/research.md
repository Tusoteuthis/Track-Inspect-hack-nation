# Research: WS7 S2

## R1 Outcome values
- **Decision**: WS5 outcomes are `ok | intervene | uncertain`. They map as follows: `ok` → review_complete, and everything else → guidance_needed.
- **Rationale**: WS5 sprint-plan.md:44 and sprint-3-tutor-evaluation.md:42. WS6 api-v0 §6's default policy allows `uncertain` with escalation, but we can't yet show escalation honestly, so we fail closed.
- **Alternatives**: allowing `uncertain` with an escalation notice. Deferred to WS5/WS6 agreement.

## R2 Screen observation route
- See `notes/ws7-screen-observation.md`.
- **Decision**: periodic JPEG stills go to `DataSource.submitScreenFrame` (WS6/WS5 consume them later), plus a silent `sendContextualUpdate` noting each frame and draft revision.
- **Rationale**: the SDK's only image route is `uploadFile` followed by `sendMultimodalMessage`, which emits a `multimodal_message` carrying a `user_message` text. That counts as a user turn and would make the agent speak, which breaks B2 "UI does not trigger speech". `contextual_update` is verified silent (WS3 capabilities doc).
- **Alternatives**: multimodal upload. Kept behind the spike, live check at the human gate.

## R3 Mic permission
- **Decision**: use `navigator.permissions.query({name:"microphone"})` with an onchange listener. If that's unavailable, show "unknown". It is shown separately from agent status.
- **Rationale**: `VoiceSession` exposes no onError, and its internals are owned by WS3.

## R4 Commit idempotency
- **Decision**: the caller generates an `idempotency_key` per click intent and stores it in reducer state. A retry gets a new key, because it is a new intent per WS6 §5.8.

## R5 Fixture evaluator placement
- **Decision**: put it in a separate `lib/data/fixturePractice.ts`. It reads citations dynamically from the workmap fixture (the first confirmed guardrail or step with resolved evidence).
- **Rationale**: S1 rewrites workmap.json in parallel, so hard-coded ids would break on merge.
