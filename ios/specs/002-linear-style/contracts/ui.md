# UI contract

Preserve identifiers `inspectionScroll`, `videoControl`, `videoStatus`, `photoPicker`, `voiceControl`, `voiceStatus`, `shareFindings`, `settingsButton`, `agentID`.

Keep accessible action names “Start glasses video”, “Stop video”, “Talk to agent”, “End voice”, “Analyze a test photo”, “Settings”, “Done”. Keep navigation title “Setup”, public-agent field semantics, cloud consent alert and error alert.

Add `workspaceHeading` and `setupIntroduction` identifiers for visual-flow regression coverage. `applicationIdentity` exposes accessibility label “Application identifier” and the bundle ID as its accessibility value. Restyled panels must contain the same business controls. Decorative grid/icons are excluded from accessibility. Disabled controls remain distinguishable and non-interactive.

Large text stacks related actions and wraps captions naturally. Live badge must not appear before a camera frame exists. Photo mode is explicitly labelled as a photo, never live video.
