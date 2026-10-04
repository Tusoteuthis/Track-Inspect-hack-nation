# Plan: TrackInspect app icon

## Technical approach
Use a repository-owned Swift/CoreGraphics renderer (`scripts/generate-app-icon.swift`) to create original artwork without external assets or Python dependencies. Render at 1024×1024 and downsample to all conventional iPhone/iPad icon slots. Store RGB PNGs and Contents.json in `TrackInspect/Assets.xcassets/AppIcon.appiconset/`.

Artwork: opaque charcoal square with subtle violet illumination, four rounded viewfinder corner marks, and two perspective rails with cross ties. Use the current theme palette; no copied branding, tiny text or baked-in iOS icon mask.

Set `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` in `project.yml`, preserving build 3 and all unrelated values, then regenerate. Add a runtime bundle metadata test. Compile/test simulator and signed device app, verify dimensions/no alpha and compiled CFBundleIcons. Capture a simulator home-screen screenshot if possible. Do not substitute a different physical phone if the original target is unavailable.

## Constitution check / analysis
All principles pass: asset/build-only scope, native stack, no runtime/SDK/data/credential changes, no claims of hardware acceptance. FR-001→T001; FR-002→T001/T003; FR-003→T002/T003; FR-004→T002/T003. No blocking ambiguities.

## Artifacts
`spec.md`, `research.md`, `tasks.md`; renderer, asset catalog, `project.yml`, `TrackInspectTests/AppIconTests.swift`, and `docs/APP-ICON.md`.
