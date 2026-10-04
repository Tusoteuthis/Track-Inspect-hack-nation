# Tasks: Linear-inspired interface

- [x] T001 [US1,US2] Extend UI tests with workspace/setup structure checks and screenshots (`TrackInspectUITests/InspectionUITests.swift`). Covers FR-002/003.
- [x] T002 [US1,US2] Implement shared theme, panel/button/status components and root tint (`InspectionTheme.swift`, `TrackInspectApp.swift`). Covers FR-001/004.
- [x] T003 [US1,US2,US3] Restyle dashboard, preview, results, voice and setup while preserving actions, privacy and identifiers (`InspectionView.swift`). Covers FR-002/003/004.
- [x] T004 [US3] Run all tests, normal/narrow/large-text screenshots and unsuppressed accessibility audits; fix issues and record `docs/LINEAR-STYLE.md`. Covers FR-003/004.
- [ ] T005 Set build 0.1.0 (2), regenerate, build/sign and update the previously installed device app; record deployment outcome and retain all hardware limitations. Covers FR-005.

## Execution result

T001–T004 complete: 30 unit + 7 UI tests passed on iPhone 16, with all 7 UI tests also passing on iPhone SE. Dashboard/settings screenshots and largest-text checks reviewed. Details: `docs/LINEAR-STYLE.md`.

T005 **partially complete / installation blocked**: signed build 0.1.0 (2), project regeneration, signature verification and development IPA packaging all succeeded. The original iPhone 16 Pro Max is unavailable; same-device install attempt failed with CoreDevice 4016. Do not mark installed, and do not substitute another phone. Artifact: `build/0.1.0-2/TrackInspect.app`.

Dependencies: T001 → T002 → T003 → T004 → T005. No service or ViewModel modifications. All five requirements map to tasks; no constitution exceptions or unresolved product decisions. Hardware checks from feature 001 remain independent/open.
