# Hardware acceptance — blocked, not passed

**Feature**: `001-glasses-inspection`  
**Application identity**: `ai.track-inspect.app`  
**Meta callback**: `trackinspect://`  
**Status as of 2026-10-03**: local simulator/build validation completed; the subsequent **0.1.0 (1) Apple Development signed build succeeded** (see [FIRST-BUILD.md](FIRST-BUILD.md)). End-to-end hardware and paid cloud sessions were not performed.

A paired iPhone 16 Pro Max was visible to Xcode during discovery. That alone does not provide glasses access, signing authorization/configuration, Meta app provisioning or an ElevenLabs agent. No app was installed on the physical phone and no existing app or shared installation was replaced.

## Required inputs

- Apple signing team and provisioning for `ai.track-inspect.app`: verified for the first development build via the local keychain and automatic provisioning; no physical installation yet.
- TrackInspect-specific Meta app ID/client token, camera capability, tester access and `trackinspect://` registration.
- Compatible glasses, worn and paired, with model/firmware recorded.
- Public ElevenLabs agent ID configured for this test and permission to transmit microphone audio.
- User/device access for permission prompts, audio-route verification and hands-free testing.

No sibling credentials were copied. No DNS/backend was configured for `ai.track-inspect.app`; it is the iOS bundle identifier.

## Test record (fill during execution)

| Field | Value |
|-------|-------|
| App version/build | 0.1.0 / 1 (current prototype; confirm tested build) |
| iPhone model / iOS | Not yet tested |
| Glasses model / firmware | Not supplied |
| Meta app capability/tester registration | Not provisioned in this workspace |
| ElevenLabs agent / retention setting | Not supplied; never record API keys here |
| Actual microphone / output route | Not measured |
| Test operator / timestamp | Not performed |

## Open acceptance tasks

| Task | Scenario | Status / evidence needed |
|------|----------|--------------------------|
| T010 / US1 | Pairing, return URL, denied camera permission, first frame, offline local processing, removal/disconnect/retry | BLOCKED — record permission flow, frame timestamps and successful retry |
| T011 / US2 | Ten-turn voice conversation, microphone denial, mute/end, route change and interruption | BLOCKED — verify physical microphone cessation and actual spoken interaction |
| T011 / US2 | Ten minutes simultaneous DAT video and glasses HFP voice | BLOCKED — no claim of compatibility; capture exact hardware/firmware and disruptions |
| T011 / US2 | Phone-audio fallback while video remains live | BLOCKED — report separately; not equivalent to glasses hands-free success |
| T012 / US3 | Opt-in summaries reach agent; opt-out, no image upload, stop/background privacy audit | BLOCKED — simulator mocks/source review do not prove live transport or physical microphone behavior |
| T018 / US1 | Ten-minute inference/frame continuity, latency, memory, thermals and battery profile | BLOCKED — use physical-device instrumentation; no fabricated performance numbers |

## Procedure

1. Configure signing/Meta and build to the iPhone following README. Verify the installed bundle identity before pairing.
2. Run US1 independently, then US2 with phone audio, then request glasses Bluetooth. Read and record the actual route; never infer it from the button tapped.
3. Test combined glasses video/audio, then the phone-audio fallback. Record any device-originated camera termination, not just whether a retry hides it.
4. Exercise consent, mute, stop, lock/background during active use and during connection. Confirm no auto-resume on foreground.
5. Review traffic destinations and payload categories without retaining personal recordings or secrets. The app has no image-upload implementation; still validate SDK behavior/agent retention in the configured environment.
6. Profile a sustained session and assess real VoiceOver navigation/usability. Store only non-sensitive metrics and conclusions.
7. Update this report, `docs/VALIDATION.md` and the task list. Leave unsupported cases labelled unsupported and blocked cases unperformed.
