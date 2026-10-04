# Fix: Meta registration recovery

**Date**: 2026-10-03 | **Input**: Device screenshot displaying `MWDATCore.RegistrationError error 0` after pairing.

## Evidence / clarification

Resolved Meta DAT 0.7.0 declares `RegistrationError.alreadyRegistered` as raw value 0. The adapter always starts registration and the ViewModel renders `.localizedDescription`, losing SDK semantics. Being registered is not a failure and does not prove the glasses are currently connected or streaming.

## User story / requirements

As a wearer who has already approved Meta registration, I can return or tap Pair again without seeing a false failure, and understand the next step.

- FR-001: Existing registered state and an SDK `.alreadyRegistered` race both resolve successfully without unregistering, re-prompting or clearing access.
- FR-002: Pending registration and successful registration have distinct SDK-free result values and persistent screen feedback. Approval completion is only reported after SDK state confirms it.
- FR-003: Real registration/callback errors explain configuration, Meta AI installation, network or retry action; never show only the generic Swift error or include credentials.
- FR-004: Coalesce repeated Pair actions while an attempt is in flight; keep pairing feedback separate from camera stop/background status. Never auto-start capture.
- FR-005: Add regression tests, preserve all other workflows, build/sign and install the fix on the previously selected phone when available. Increment build from 3 to 4.

## Acceptance

Raw-value regression confirms error 0; registered/pending/race tests pass; actual failures remain visible; UI says registered with Meta rather than connected glasses. Returning from Meta callback updates feedback. No unregistration, secret copying or automatic camera/microphone activation. Physical video/audio coexistence remains independently unverified.
