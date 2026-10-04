# Feature Specification: Linear-inspired interface

**Feature**: `002-linear-style` (non-Git workspace)  
**Created**: 2026-10-03  
**Input**: “changer teh style to linear app style”  
**Status**: Implemented and validated; signed build ready, same-device installation blocked by connectivity

## Clarifications

“Linear style” means visual inspiration, not copying branding or adding project-management features. Retain TrackInspect identity, native SwiftUI, dark mode and all existing behaviors. Use charcoal backgrounds, subtly elevated bordered panels, compact sentence-case typography, restrained violet accents and smaller corner radii. No new SDK, cloud calls or capture behavior. Build 0.1.0 (2) distinguishes the update on the already installed app.

## User stories

### US1 — Focused inspection workspace (P1)
As an inspector, I see an uncluttered workspace with clear camera, analysis and voice sections.

Acceptance: the idle screen has a compact navigation/header, neutral layered panels, explicit status text and violet primary actions. No mint styling, oversized rounded cards or decorative fake measurements remain. Starting/stopping video, choosing a photo and reading results remain available.

### US2 — Consistent setup and voice controls (P1)
As a user, I configure glasses/agent and manage voice in the same visual language.

Acceptance: setup panels, text fields and controls match the dashboard. Cloud consent still appears before voice starts; summary sharing remains separately opt-in. Existing agent ID is retained. Audio routes, transcript and error states remain visible when relevant.

### US3 — Accessible on small screens (P1)
As a user with large text or VoiceOver, I can navigate the refreshed app without clipped controls.

Acceptance: controls have at least 44 pt hit regions; large-text layouts stack and scroll; icons have labels; status is not color-only. Existing UI flow tests and contrast/description/hit-region audits pass on iPhone 16 and iPhone SE.

## Requirements

- **FR-001**: Centralize colors, borders, corners and primary/secondary control treatment in a shared theme; keep TrackInspect branding.
- **FR-002**: Restyle dashboard, preview/empty state, results, voice and settings consistently without changing service/ViewModel behavior.
- **FR-003**: Preserve user actions, state accuracy, cloud consent, summary opt-in, persisted agent ID and accessibility identifiers.
- **FR-004**: Support Dynamic Type, 44 pt controls, readable contrast and non-color status on regular and narrow screens.
- **FR-005**: Build/test 0.1.0 (2) with bundle `ai.track-inspect.app`; record screenshots and validation honestly. Updating the previously requested device installation must not start camera/microphone capture.

## Success criteria

- **SC-001**: Screenshot review shows a cohesive charcoal/violet design across dashboard and setup, rather than just an accent-color swap.
- **SC-002**: All unit/UI regressions pass; normal and largest-text controls remain reachable on both simulator sizes.
- **SC-003**: Signed device build succeeds with unchanged app identity; installation/launch outcome is recorded separately from untested hardware functionality.

## Edge cases / scope

Long model labels, long transcript text, waiting/stopping/error statuses and accessibility text sizes must wrap. No changes to inference, microphone routing, recording, credentials, package versions or backend scope. Original real-glasses acceptance remains open.
