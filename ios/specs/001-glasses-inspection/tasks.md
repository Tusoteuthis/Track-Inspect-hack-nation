# Tasks: Glasses Inspection Base App

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/services.md`  
**Convention**: `[P]` means independently parallelizable; `[USn]` maps to a user story. Checked items are retrospective baseline evidence, not claims of prior Spec Kit execution.

## Phase 1 — Existing foundation (baselined)

- [x] T001 Define Swift 6/iOS 17 targets, pinned DAT/ElevenLabs packages and tests in `project.yml` and generated `TrackInspect.xcodeproj`.
- [x] T002 Define injectable service DTOs/protocols in `TrackInspect/Services/ServiceProtocols.swift` and app composition in `TrackInspect/App/TrackInspectApp.swift`.
- [x] T003 Add ignored credential configuration, callback/permission plist and setup documentation in `TrackInspect/Config/`, `TrackInspect/Info.plist`, `.gitignore`, `README.md`.

## Phase 2 — Existing user-story implementation (baselined)

- [x] T004 [US1] Implement DAT registration/session/frame adapter in `TrackInspect/Services/MetaVideoService.swift`.
- [x] T005 [US1] Implement serial local classification and optional Core ML model in `TrackInspect/Services/LocalAnalysisService.swift`.
- [x] T006 [US1] Implement preview, photo test path, sampling, cancellation and frame watchdog in `TrackInspect/ViewModels/InspectionViewModel.swift` and `TrackInspect/Views/InspectionView.swift`.
- [x] T007 [US2] Implement public-agent voice, transcripts/mute, consent and route controls in `TrackInspect/Services/ElevenLabsVoiceService.swift`, ViewModel and View.
- [x] T008 [US3] Implement opt-in uncertain text summaries with five-second send spacing in ViewModel and DTO context formatting.
- [x] T009 Record simulator/unsigned-device builds and six passing tests in `TrackInspectTests/InspectionTests.swift` and `docs/VALIDATION.md`.

Completed implementation is not equivalent to completed hardware acceptance.

## Phase 3 — Hardware gates (not performed)

- [ ] T010 [US1] Validate pairing/return URL, camera permission denial, first frame, offline local processing, removal/disconnection and restart on a physical iPhone; record device/firmware and results in `docs/HARDWARE-VALIDATION.md`.
- [ ] T011 [US2] Validate real public-agent conversation, ten turns, mute/stop, actual Bluetooth HFP microphone and speaker, interruption, ten-minute simultaneous DAT video/voice, and phone-audio fallback; record failures/unsupported combinations separately in `docs/HARDWARE-VALIDATION.md`.
- [ ] T012 [US3] Validate actual agent receipt of opt-in summaries; audit that no images are uploaded, opt-out prevents new sends and background/end stops microphone transmission; record evidence in `docs/HARDWARE-VALIDATION.md`.

## Phase 4 — Hardening and tests

- [x] T013 [US1] Extend `TrackInspectTests/LifecycleTests.swift` and `PrivacyTimingTests.swift` with rapid start/stop/restart, teardown ownership, stale frame/result and stalled-frame coverage; fix any lifecycle gaps in `InspectionViewModel.swift` / `MetaVideoService.swift`.
- [x] T014 [US2] Add voice-start cancellation/failure, repeated stop and background-during-connect tests in `TrackInspectTests/LifecycleTests.swift` and `PrivacyTimingTests.swift`; fix service/ViewModel gaps as needed.
- [x] T015 [US3] Add context throttling, disable-during-send and slow-inference bounded-work tests in `TrackInspectTests/PrivacyTimingTests.swift`; fix orchestration as needed.
- [x] T016 [US1] Add malformed image and custom-classifier output-contract tests in `TrackInspectTests/ClassifierContractTests.swift`; document fixtures in `TrackInspectTests/Fixtures/README.md` and implement contracts in `LocalAnalysisService.swift` / `ClassifierContract.swift`.
- [x] T017 [P] Audit VoiceOver labels, Dynamic Type, contrast, narrow layouts and non-color status in `TrackInspect/Views/InspectionView.swift`; fix and record results in `docs/VALIDATION.md`.
- [ ] T018 [US1] Profile a ten-minute target-device session for inference latency, frame continuity, memory, thermals and battery; record results and any supported-device constraints in `docs/HARDWARE-VALIDATION.md`.

## Full-run identity and UI automation

- [x] T020 Apply `ai.track-inspect.app` to `project.yml`, generated project, configuration examples and documentation; test the built app bundle identity and Meta callback scheme. Covers FR-013.
- [x] T021 Add `TrackInspectUITests/` and target/scheme configuration; automate setup navigation, cloud-consent cancellation, readable status/labels and large-text scrolling/layout smoke checks. Covers FR-014 and supports T017.

## Phase 5 — Acceptance

- [x] T019 Rebuild simulator/device targets, run all tests, analyze spec/plan/task consistency, and update `docs/VALIDATION.md` plus README with measured capabilities and limitations. Keep unsupported/unperformed acceptance items explicit.

## Full-run evidence — 2026-10-03

T013–T016: `LifecycleTests.swift`, `PrivacyTimingTests.swift`, `ClassifierContractTests.swift` plus initial `InspectionTests.swift` — **30 tests passed**. Tests are split into focused files rather than all added to the initial test file. Synthetic custom-model boundary tests do not certify a trained model; fixture scope is documented under `TrackInspectTests/Fixtures/`.

T017/T021: **5 UI tests passed on iPhone 16 and again on iPhone SE (3rd generation), iOS 18.5**. Default/largest-text screenshots reviewed; contrast, sufficient labels and hit regions audited without ignored issues. This completes automated label/layout review, not a hands-on real VoiceOver usability sign-off.

T020: built device plist and unit test verify `ai.track-inspect.app`; setup/config examples aligned.

T019: final combined **35-test** run, unsigned device build, plist lint, Spec Kit checks and consistency review passed. Evidence: `docs/VALIDATION.md` and `execution.md`.

**Still open**: T010, T011, T012 and T018 require signed/provisioned hardware, glasses access and real agent credentials. Prerequisites and unperformed scenarios are recorded in `docs/HARDWARE-VALIDATION.md`. Full hands-free/safety/production acceptance is not claimed.

## Dependencies and Execution Strategy

- T001–T009 are implemented baseline. Reconfirm them if code changes.
- Start with T013–T016 before claiming robust lifecycle/privacy behavior. They share the test file and should be serialized unless split into independent files.
- T010/T011 require provisioned credentials and physical hardware; T012 follows working independent video/voice. T018 follows stable US1 capture.
- T017 can run independently of hardware provisioning; coordinate shared UI edits.
- T020 precedes build validation; T021 follows UI hardening. T019 includes all local checks plus explicit recording of blocked hardware outcomes; it is not a sign-off on full hardware acceptance.
- Hardware execution is gated independently of local implementation, not a reason to skip local hardening. T010–T012/T018 remain open until devices and credentials are supplied.
- T019 depends on hardening and recorded hardware outcomes. A phone-audio fallback pass must not be reported as a glasses-microphone coexistence pass.
- Production private-agent authentication, a domain-trained model and App Store delivery require separate `/speckit.specify` features, not unchecked scope expansion here.
