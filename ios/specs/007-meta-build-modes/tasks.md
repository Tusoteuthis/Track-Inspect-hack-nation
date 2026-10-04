# Tasks

- [x] T001 Implement explicit build helper and Settings mode label.
- [x] T002 Test both configuration values and run legacy regression suite.
- [x] T003 Build/sign both variants; verify boolean values/signatures; install/launch legacy only.
- [x] T004 Document choices, artifacts and remaining hardware validation.

Validation: first run caught ignored nested startupOptions.usesDam key. Verified MWDAT.DAMEnabled with actual SDK Configuration parser for both values; corrected helper and UI accordingly. Initial UI audit timed out, then flagged a label obscured by the navigation bar following an arbitrary swipe. Changed audit to initial Settings viewport (no issue suppression). Final full legacy run: 59 unit + 8 UI tests passed. `/tmp/trackinspect-legacy-final-tests.log`.

Both signed device builds passed deep/strict signature verification and plist checks (DAM=true, legacy=false). Artifacts `build/0.1.0-7-dam/TrackInspect.app` and `build/0.1.0-7-legacy/TrackInspect.app`. Legacy build 7 installed/launched on original iPhone 16 Pro Max. No pairing state reset or capture started. Actual glasses connection recovery remains unverified; build 6's ignored flag means this legacy installation alone is not a demonstrated mode change from build 6.
