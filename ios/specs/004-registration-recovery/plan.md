# Plan: Meta registration recovery

Swift 6/iOS 17+, same dependencies. Implement a small main-actor `MetaRegistrationFlow` helper in Services that takes SDK state/start closures, allowing tests without configuring real Meta credentials or devices. It skips registered/registering state, normalizes the already-registered race and translates actual errors. The adapter remains the SDK boundary.

Change `VideoService.register` to return SDK-free `GlassesRegistrationStatus` and `handle(url:)` to return an optional confirmed/pending status for SDK-consumed links. Preserve unrelated URL behavior. Update the two existing test mocks. Add ViewModel pairing guard and separate registration status; display it in camera/setup panels without conflating registration with connection or streaming.

Callback errors use explicit app messages; do not swallow genuine callback failures merely because an old registration exists. Validate SDK state after an accepted callback before reporting registration complete. Permission/camera/inference/voice services are otherwise unchanged.

Constitution check: native service boundary preserved; no privacy, concurrency or credential exceptions. No hardware claim from registration alone. Preserve style and icon, bump only build to 4. Tests precede implementation and cover all five requirements (tasks below). Build from an isolated DerivedData directory to avoid the stale signed asset issue seen in the last deployment.

Files: `Services/ServiceProtocols.swift`, `MetaRegistrationFlow.swift`, `MetaVideoService.swift`, `ViewModels/InspectionViewModel.swift`, dashboard/settings views, test mocks/new registration tests, `project.yml`, docs.
