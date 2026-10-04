# Plan

DAT 0.7 Wearables.configure() accepts no configuration argument, while Runtime parser tests established that Configuration reads boolean MWDAT.DAMEnabled from bundle metadata, NOT the previously used MWDAT.startupOptions.usesDam. The old nested key silently left Configuration.usesDam false. This corrects the earlier unverified claim that build 6 enabled DAM. Avoid swizzling/private API or writable bundle modifications.

Build helper requires dam|legacy, derives a temporary Info.plist from the canonical file and writes a real boolean (not substituted string). Pass absolute INFOPLIST_FILE to xcodebuild with mode-specific derived data. Canonical default now genuinely enables DAM through the verified key; legacy is selected explicitly by the helper. Extra xcodebuild options support tests/signing; signing team remains CLI-only. UI reads actual bundle boolean. Build 7 for both, separate artifacts, same identity means only one can be installed at a time. No authorization changes.

Constitution check: no exceptions. Tests cover pinned SDK parsing and installed mode label. Tasks map all requirements; no blockers. User explicitly requested legacy installation; real connection outcome remains hardware validation.
