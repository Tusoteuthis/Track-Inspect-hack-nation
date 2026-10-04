# Research

Evidence: resolved `MWDATCore.swiftinterface` in Meta DAT 0.7.0 lists `RegistrationError: Int` cases `alreadyRegistered`, `configurationInvalid`, `metaAINotInstalled`, `networkUnavailable`, `unknown` and exposes `.description`, not `LocalizedError`. A runtime regression test will confirm raw value 0.

Decision: treat already-registered as an idempotent successful registration outcome, not just a nicer error. Do not force unregistration or reset persisted SDK state; that would unnecessarily revoke existing approval. Configuration changes are not justified by this screenshot.

Decision: separate registration feedback from camera status to survive background teardown during companion-app handoff. Block overlapping attempts at the ViewModel and normalize `.registering` in the adapter.

Decision: keep Meta types in Services. State/start closure injection tests the exact production decision path without a sprawling fake of WearablesInterface. SDK callback handling remains real and requires subsequent user confirmation on the phone; mocks do not prove hardware connectivity.
