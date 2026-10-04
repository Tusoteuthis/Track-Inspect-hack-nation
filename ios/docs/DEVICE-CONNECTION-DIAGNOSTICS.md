# Physical device connection diagnostics — 2026-10-04

Inspected the original iPhone 16 Pro Max's TrackInspect app container via devicectl. No pairing state, credentials or app code was changed. Downloaded only the Meta SDK log to `/tmp/trackinspect-sdk-device.log` (not committed).

## Observed evidence

SDK log includes:

> Failed to add ACDC device since there is no authority public key or app private key

It also contains signed-content-file-not-found errors and linked-device-manager teardown messages (manager stopped / LAST_LEASE_DROPPED). An analytics upload experienced a lost connection; this alone is not evidence of the glasses-link cause.

The container currently DOES contain `Library/signedcontent` and SDK device/transport store files. The downloaded log lines lack timestamps, and its file modification time is 00:20, before the user's later firmware-update/connection checks. Consequently, the missing-key error establishes a prior SDK device-add failure, NOT proof that the same key condition persists now. Do not equate all missing-file startup messages with the root cause.

The installed app uses DAT 0.7.0 with `startupOptions.usesDam=true`. Its registration status is not proof of a working device link. Bluetooth permission is visibly enabled in the user's screenshot.

## Next diagnostic step

Capture fresh registration/link events during reproduction, or perform a user-approved reset of TrackInspect's Meta app authorization followed by registration. Do not factory-reset/unpair the glasses or delete SDK keys/files manually. Approval reset must be clearly described and must use SDK unregistration, not just suppress alreadyRegistered. Hardware connectivity remains unresolved.
