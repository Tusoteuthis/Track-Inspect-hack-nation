# Implementation Plan: Linear-inspired interface

**Feature**: 002-linear-style | **Date**: 2026-10-03 | **Spec**: [spec.md](spec.md)

## Summary / technical context

Swift 6, iOS 17+, SwiftUI/Observation. Presentation-only redesign, no new packages. Add `TrackInspect/Views/InspectionTheme.swift` for tokens, button style, panel and status treatment. Rewrite `InspectionView.swift` into compact workspace and settings sections with neutral surfaces and violet accents. Set root tint and increment build number to 2 in `project.yml`, then regenerate. Keep app ID, ViewModel, services, storage and privacy semantics unchanged.

## Constitution check

All seven principles pass by design: native view-only scope; unchanged cloud consent/local-image boundary; no pipeline changes; honest model/route labels; no invented hardware evidence; no credentials copied; Spec Kit artifacts precede implementation. Accessibility audits and hardware-acceptance boundaries remain enforced.

## Design decisions

- Compact inline navigation and sentence-case workspace hierarchy, rather than a large navigation title plus uppercase banner.
- Charcoal background, subtly lighter panels, 1 pt borders, 10–12 pt corners, 16 pt panel padding and generous separation between groups.
- Violet primary actions with white text; neutral secondary actions with visible borders. Minimum 44 pt interaction size even when visuals are compact. Respect Reduce Motion by using no decorative animation.
- Preview placeholder is a restrained framing/grid treatment with a small glasses symbol. Actual live state comes from running state plus received preview, not decorative metadata.
- Analysis and voice headers use small icons and factual badges. Results, transcripts and warnings remain readable text.
- Setup becomes a matching scrollable group of panels; retain navigation title “Setup”, labelled agent field and Done/Pair actions.
- Large Dynamic Type uses vertical control layouts, natural content height and scrolling. UI identifiers remain stable.

## Files / tests

- `TrackInspect/Views/InspectionTheme.swift`, `InspectionView.swift`, `InspectionSettingsView.swift`
- `TrackInspect/App/TrackInspectApp.swift` (tint only)
- `project.yml` + generated project (build 2)
- `TrackInspectUITests/InspectionUITests.swift` (workspace/setup visual-flow assertions)
- `docs/LINEAR-STYLE.md` (screenshots, checks and installation outcome)

## Execution

1. Add UI regression assertions for workspace/setup structure while preserving existing IDs.
2. Implement shared theme and full dashboard/settings restyle.
3. Run full test suite, review screenshots; test narrow/largest-text and accessibility audits.
4. Build signed 0.1.0 (2); update previously installed development app without starting capture. Record locked-device launch failures rather than claiming success.

Execution: 37 tests passed on iPhone 16 and seven UI tests passed on iPhone SE. Signed build 2 and packaging succeeded. The original phone became unavailable; installation attempt failed with CoreDevice 4016 and remains pending. See `docs/LINEAR-STYLE.md`.

No exceptions, additional data model or service API changes. See [tasks.md](tasks.md), [research.md](research.md), [contracts/ui.md](contracts/ui.md) and [quickstart.md](quickstart.md).
