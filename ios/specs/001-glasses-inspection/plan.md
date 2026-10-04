# Implementation Plan: Glasses Inspection Base App

**Feature**: `001-glasses-inspection` | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)  
**Status**: Local implementation/hardening/validation complete; hardware/cloud acceptance blocked. Baseline code was retrospective; the full run is recorded in [execution.md](execution.md). No Git branch exists.

## Summary

Preserve the native prototype already built. Use Meta DAT for frames, a serial Vision/Core ML service for local classification, and the official ElevenLabs SDK for voice. Finish lifecycle/privacy coverage and validate simultaneous A/V on real hardware before treating the feature as accepted.

## Technical Context

**Language/Version**: Swift 6, strict concurrency  
**Primary Dependencies**: SwiftUI, Observation, Vision, Core ML, AVFoundation, Meta DAT 0.7.0, ElevenLabs Swift SDK 3.4.0 (LiveKit transitively)  
**Storage**: Public agent ID in UserDefaults; previews/transcripts/results in memory; local Meta xcconfig ignored  
**Testing**: XCTest; simulator, unsigned device build, physical-device acceptance  
**Target Platform**: iOS 17+, iPhone and iPad; real glasses require iPhone validation  
**Project Type**: Native mobile app, XcodeGen + SPM  
**Performance Goals**: Request 24 fps low-resolution DAT video; sample analysis at most once per 750 ms; one active inference; text context at most once per 5 s  
**Constraints**: Local images only; foreground capture; no embedded ElevenLabs API key; hardware-dependent audio/video coexistence  
**Scale/Scope**: One glasses session, one conversation, one dashboard and setup sheet; no backend in baseline

## Constitution Check

| Principle | Design gate | Evidence / remaining acceptance |
|-----------|-------------|---------------------------------|
| I Native architecture | Pass | Protocols isolate DAT/ElevenLabs; SDK Combine bridge stays in voice adapter |
| II Privacy | Pass in design | Explicit cloud consent, opt-in context, local inference; device privacy audit pending |
| III Bounded concurrency | Pass locally | Serial/bounded inference, coalesced teardown, generation guards, cancellation/race/throttle tests passed |
| IV Honest capability | Pass | UI/docs name general classification, not defect detection |
| V Hardware evidence | Design pass; release gate open | Route UI/fallback exist; real simultaneous A/V untested |
| VI Secure configuration | Pass in baseline | Ignored Meta secrets; public agent ID only |
| VII Spec-driven delivery | Pass after adoption | Current behavior explicitly retrospective; remaining tasks unchecked |

Re-evaluation after implementation: no architectural exceptions required. Automated accessibility/layout checks pass. Physical hardware/privacy, hands-on VoiceOver usability and sustained-session profiling gates remain open; this plan does not authorize claiming production readiness.

## Project Structure

```text
.specify/                         # constitution, scripts, templates
.claude/commands/speckit.*.md      # Spec Kit workflow commands
specs/001-glasses-inspection/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/services.md
  tasks.md
TrackInspect/
  App/                            # composition and lifecycle
  Views/                          # dashboard/setup
  ViewModels/                     # session orchestration
  Services/                       # protocol boundaries and SDK adapters
  Config/                         # optional local credentials
TrackInspectTests/
project.yml
```

## Phase 0 — Research / baseline

Document choices and known constraints in [research.md](research.md). Hardware coexistence is an experiment, not something simulator research can resolve. Keep public-agent auth and general classification as explicit prototype scope rather than silently inventing a backend or inspection model.

## Phase 1 — Design

Maintain [data-model.md](data-model.md), [contracts/services.md](contracts/services.md) and [quickstart.md](quickstart.md). Treat protocol/lifecycle changes as contract changes. Keep desired lifecycle behavior distinct from the current flag-based implementation.

## Full-run implementation design

- Application identity: `ai.track-inspect.app`; test identifiers use that prefix. No DNS, server, universal-link or infrastructure changes are implied.
- Coalesce teardown with retained tasks so all stop callers join completion. Mark state/cancel callbacks synchronously before awaiting SDK shutdown. Start video and voice cleanup together during background transition.
- Scope ViewModel callbacks by run generation as a second boundary beyond DAT's internal tokens. Ignore stale frame/status/error/transcript callbacks from old sessions.
- Retain inference/context slots until their tasks actually finish. Only the latest replacement photo may wait; live frames never queue. Cancelling analysis invalidates publication, not ownership of the running slot.
- Inject timing policy/clock for deterministic throttling and watchdog tests, without changing production defaults (750 ms analysis, 5 s context, 12 s stall).
- Validate model input/output and filter/sort/deduplicate classification output; exercise malformed data, invalid model and output contracts with tests, without inventing a trained classifier.
- Add UI-test target for setup, consent, accessibility text-size/layout checks. Automated labels/screenshots do not substitute for a real VoiceOver usability pass.

## Phase 2 — Tasks and execution order

1. Baseline implemented files and existing test evidence.
2. Add lifecycle, context-throttle/disable and stale-result tests; fix discovered issues.
3. Validate US1 video/local analysis on hardware independently.
4. Validate US2 voice independently, then simultaneous video/Bluetooth voice and phone fallback.
5. Validate US3 consent, summary delivery and privacy boundaries.
6. Perform accessibility and sustained-session checks; record exact hardware/firmware and results.
7. Use `ai.track-inspect.app`, regenerate project, run complete local test/build/consistency validation. Record unavailable hardware checks as blocked, not passed.

Detailed checklist: [tasks.md](tasks.md). Run Spec Kit consistency analysis before implementation. Do not mark hardware tasks done based on builds.

## Validation Strategy

Current evidence: [docs/VALIDATION.md](../../docs/VALIDATION.md) records 30 XCTest and 5 XCUITest passes on iPhone 16, five repeated UI passes on iPhone SE, and unsigned device build success, including actual local inference and negative/transition behavior. [Hardware validation](../../docs/HARDWARE-VALIDATION.md) records blocked integration/profile checks; no unperformed test is marked passed.

## Complexity Tracking

No additional runtime services or architecture layers proposed. Private-agent backend, object detection/VLM inference, background capture and production release must get separate numbered specifications.
