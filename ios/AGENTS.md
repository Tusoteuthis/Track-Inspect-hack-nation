# TrackInspect iOS

Standalone native SwiftUI iOS app, not a modification of sibling templates.

- Read README.md for setup, architecture and limitations.
- Use **Spec Kit for all feature planning**: `/speckit.specify` → `/speckit.clarify` when needed → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`. Read `.specify/memory/constitution.md` first. Workflow definitions are in `.claude/commands/`; follow them manually if the current host does not expose these commands.
- Latest presentation feature: `specs/002-linear-style/` (build 2); source of truth for shared visual tokens is `TrackInspect/Views/InspectionTheme.swift`. Device reinstallation is pending reconnection; see `docs/LINEAR-STYLE.md`. Use `SPECIFY_FEATURE=002-linear-style` for that feature's scripts.
- Current baseline and next work: `specs/001-glasses-inspection/`; `execution.md` records the completed local full run. T010/T011/T012/T018 remain hardware/cloud gates. Keep specs/plans/tasks aligned with code; distinguish implemented prototype tasks from unperformed hardware acceptance. Do not substitute a different planning workflow.
- This directory currently has no Git repository. Use `SPECIFY_FEATURE=001-glasses-inspection` with `.specify/scripts/bash/` when selecting the baseline explicitly; do not claim a feature branch was created.
- Swift 6 strict concurrency; iOS 17+. SwiftUI views → observable main-actor ViewModel → protocol-defined services.
- Application bundle identifier: **`ai.track-inspect.app`**. Meta callback: `trackinspect://`. Do not infer a backend URL or configure DNS from the app identifier.
- `project.yml` is canonical. Run `xcodegen generate` after changing project structure. Commit generated project and SPM lockfile.
- Build/test the TrackInspect scheme. Physical glasses and ElevenLabs credentials are required for end-to-end acceptance; don't equate simulator tests with hardware validation.
- Never copy sibling secrets or embed ElevenLabs API keys. Local Meta configuration belongs only in gitignored `TrackInspect/Config/Secrets.xcconfig`.
- Video must stay on device. Cloud voice requires consent; text analysis sharing is explicitly opt-in.
- Keep inference off the main actor, bounded and cancel-safe. Never describe generic image labels as trained defect detection or safety certification.
- DAT owns video. ElevenLabs/LiveKit owns audio capture; display the actual iOS route and preserve the iPhone-audio fallback.
