#!/bin/bash
# Explicit startup choice; does not modify the source plist or reset SDK state.
set -euo pipefail
MODE="${1:-}"
case "$MODE" in dam|legacy) shift ;; *) echo 'Usage: build-meta-mode.sh dam|legacy [xcodebuild options/actions]' >&2; exit 2 ;; esac
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$(mktemp /tmp/trackinspect-mode.XXXXXX)"
trap 'rm -f "$PLIST"' EXIT
python3 - "$ROOT/TrackInspect/Info.plist" "$PLIST" "$MODE" <<'PY'
import plistlib,sys
with open(sys.argv[1], 'rb') as f:
    info=plistlib.load(f)
info['MWDAT'].pop('startupOptions', None)
info['MWDAT']['DAMEnabled'] = sys.argv[3] == 'dam'
with open(sys.argv[2], 'wb') as f:
    plistlib.dump(info, f)
PY
cd "$ROOT"
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -derivedDataPath "/tmp/TrackInspect-mode-$MODE" \
  "$@" "INFOPLIST_FILE=$PLIST"
