# TrackInspect-ios Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-10-03

## Active Technologies

- Swift 6, strict concurrency + SwiftUI, Observation, Vision, Core ML, AVFoundation, Meta DAT 0.7.0, ElevenLabs Swift SDK 3.4.0 (LiveKit transitively) (001-glasses-inspection)

## Project Structure

```text
TrackInspect/          # Native SwiftUI app and services
TrackInspectTests/     # XCTest
TrackInspectUITests/   # XCUITest + accessibility audit
specs/                 # Spec Kit feature artifacts
.specify/              # Constitution, templates and helper scripts
```

## Commands

```sh
xcodegen generate
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
SPECIFY_FEATURE=001-glasses-inspection bash .specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks
```

## Code Style

Swift 6, strict concurrency: Follow standard conventions

## Recent Changes

- 001-glasses-inspection: Added Swift 6, strict concurrency + SwiftUI, Observation, Vision, Core ML, AVFoundation, Meta DAT 0.7.0, ElevenLabs Swift SDK 3.4.0 (LiveKit transitively)

<!-- MANUAL ADDITIONS START -->
Read `AGENTS.md`, `README.md` and `.specify/memory/constitution.md` before work.
Use Spec Kit for plans: specify → clarify when needed → plan → tasks → analyze → implement. Definitions: `.claude/commands/speckit.*.md`.
Latest presentation feature: `specs/002-linear-style/` (build 2), with shared styling in `InspectionTheme.swift`; signed build ready, same-device installation pending reconnection. See `docs/LINEAR-STYLE.md`.
Current baseline: `specs/001-glasses-inspection/`; see `execution.md` for the full local run. App ID: `ai.track-inspect.app`; Meta callback: `trackinspect://`. This identifier is not a backend endpoint. Keep implemented code separate from pending hardware acceptance; never claim glasses A/V works from simulator tests alone.
No Git repository currently exists here; use `SPECIFY_FEATURE` for local workflow scripts. Do not rerun setup-plan on a filled plan unintentionally.
<!-- MANUAL ADDITIONS END -->
