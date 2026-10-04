# Feature: TrackInspect app icon

**Created**: 2026-10-03 | **Feature**: 003-app-icon (non-Git workspace)

## User story
As a user, I can identify TrackInspect on the iPhone/iPad home screen by a distinctive icon that matches its charcoal/violet design.

## Clarifications / requirements
- FR-001: Original rail-and-viewfinder artwork; no text, third-party logos or pre-rounded outer corners. Readable at small sizes.
- FR-002: Opaque RGB square PNGs in a complete native iPhone/iPad/marketing AppIcon asset set, including 1024×1024 master.
- FR-003: Configure AppIcon in canonical XcodeGen project, regenerate and verify compiled icon metadata/resources in simulator and signed device builds.
- FR-004: Retain `ai.track-inspect.app`, existing build number 3 observed at task start, runtime behavior and privacy boundaries. Do not undo unrelated version changes.

## Acceptance
Review master and downsampled icon; validate all asset dimensions/alpha; compile and confirm primary app icon exists in the built bundle. Simulator appearance is verifiable without glasses credentials. Physical installation is not claimed while the previously targeted phone remains unavailable.
