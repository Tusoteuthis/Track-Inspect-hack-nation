# Plan and consistency review

Use existing Swift 6 service boundaries. Add VideoService.unregister() returning Bool (true only when confirmed unregistered), implemented through DAT startUnregistration and a closure-injected MetaRegistrationFlow helper. Map all pinned SDK errors to safe app messages. Existing .available registration state or alreadyUnregistered establishes completion; .unavailable is not proof.

ViewModel coalesces unpair with pair, stops both pipelines before calling the adapter, prevents capture startup during active/pending removal, and refreshes connection after callbacks/polling to reconcile completion. Settings confirmation explains app-only scope, displays progress/pending/success and allows retries. The screen remains open so pending can be refreshed and errors are visible.

Constitution: no exceptions, no credentials or stored SDK keys modified manually; user confirmation required. No new SDK dependency. Build 6; tests and device installation, but no automatic invocation of unregistration on user's behalf.

Requirement-to-task review: T001 covers SDK safety/results; T002 confirmation/lifecycle; T003 tests; T004 deploy/evidence. No unresolved specification conflicts.
