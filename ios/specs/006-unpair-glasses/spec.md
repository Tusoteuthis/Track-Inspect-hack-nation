# Unpair TrackInspect

## User story and acceptance

A wearer can remove TrackInspect's Meta authorization in Settings and subsequently register again to troubleshoot an unusable registration. This does not unpair the glasses from iPhone Bluetooth or Meta AI and does not factory-reset anything.

## Requirements

- Explicit destructive confirmation with Cancel; cancellation changes nothing.
- Stop video and voice before requesting SDK unregistration. Prevent concurrent pairing/unpairing and capture startup during removal.
- Treat already-unregistered as success. Do not claim completion merely because the companion app opened: distinguish pending from SDK-confirmed removal.
- Show actionable failures and allow retry. Clear stale registered feedback only on confirmation; preserve normal pairing afterward without automatic recording.
- No direct credential/key deletion, no secret logging, no reset performed automatically upon install.

## Success criteria

Unit tests cover idempotent success, pending and error outcomes, shutdown ordering and re-pairing. UI tests verify confirmation cancellation. Build/install the update; live Meta unregistration remains user-triggered hardware validation.
