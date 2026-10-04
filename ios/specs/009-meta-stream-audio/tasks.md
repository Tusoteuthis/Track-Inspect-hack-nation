# Deferred tasks

Nothing below is implemented or hardware-validated.

## P0 — feasibility gates
- [ ] T001 Verify released Meta audio API, exact version, channel/account eligibility and device/firmware requirements. R1.
- [ ] T002 Verify a supported ElevenLabs external-input transport, single-source behavior and authentication. R1/R3.
- [ ] T003 Run a consented local audio/video spike and record a go/no-go decision. Do not proceed if unavailable. R1/R2.

## P1 — contracts and implementation
- [ ] T004 Define SDK-free frames, bounded bridge, input/state contracts and fake services. R3–R6.
- [ ] T005 Write failing conversion, backpressure, privacy and lifecycle tests before production changes. R2/R3/R5/R6.
- [ ] T006 Implement DAT audio capture and negotiated PCM conversion off the main actor. R1/R5.
- [ ] T007 Implement external-audio uplink, exclusive source ownership, reply playback and interruptions. R3/R4.
- [ ] T008 Implement consent, mute/stop/background/unpair cleanup, source switching and explicit fallback. R2/R3/R6.
- [ ] T009 Add capability-gated input selection, truthful input/output indicators and recoverable errors. R4/R7.

## P2 — acceptance and rollout
- [ ] T010 Run full unit/integration/UI regressions, including Mentra and existing system-microphone behavior. R2–R7.
- [ ] T011 Execute and document all physical acceptance scenarios in plan.md. R1–R7.
- [ ] T012 Document supported combinations, measured limitations and rollback; release as opt-in only. R7.

Order: T001/T002 → T003 → T004/T005 → T006–T009 → T010/T011 → T012. Revisit transport/backend scope after feasibility rather than assuming an SDK upgrade alone completes the work.
