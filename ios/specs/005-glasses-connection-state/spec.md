# Settings glasses connection state

## User scenarios and testing

As a wearer, I open Settings and see whether my glasses are actually connected, rather than just registered with Meta. While Settings remains open, disconnecting or reconnecting updates the indication. Beginning video does not report streaming until frames arrive.

Acceptance: registered without an active link displays Disconnected; a confirmed link displays Connected; fresh camera frames display Streaming; pending approval, missing setup and unavailable status never look connected. Backgrounding pauses status checks and does not start recording on return.

## Requirements

- FR-001: Show an accessible, text-and-symbol status in Settings' Glasses section, independent of color.
- FR-002: Distinguish checking, unavailable, not registered, awaiting approval, disconnected, connecting, connected and streaming. Include a short explanation/next step.
- FR-003: Refresh while foreground Settings is visible, reflecting available connection changes within two seconds. Stop refreshing when dismissed/backgrounded.
- FR-004: Status checks must not start registration, camera capture, microphone capture or cloud voice. Streaming requires fresh actual video frames, not a start request or photo preview.

## Key entity

Glasses connection status: transient, non-persisted snapshot distinct from app registration authorization.

## Assumptions

“Connected” refers to the Meta glasses link, not ElevenLabs voice (already shown on the dashboard). No new permission or pairing workflow is requested. Status describes the selected video device when a video session exists; otherwise any available glasses link. Real-device link accuracy remains a hardware check.

## Success criteria

Settings clearly distinguishes registration from connectivity; automated mapping/lifecycle tests prove no false streaming from startup/photos and no capture from refresh; UI tests verify the status is present and accessible. Existing tests remain green.
