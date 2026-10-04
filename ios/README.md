# TrackInspect iOS

Native iPhone/iPad prototype for Meta Ray-Ban video, Mentra-compatible Bluetooth glasses, local visual analysis, and an ElevenLabs voice assistant.

**iOS bundle identifier: `ai.trackinspect.app`**. This is the app identity, not an assumed backend URL. Meta callback remains `trackinspect://`.

**Stack:** Swift 6 strict concurrency, SwiftUI + Observation, protocol-based services, async/await, XcodeGen, Swift Package Manager. Follows the native architecture of `stoz3n-ios-chat` and the DAT 0.7 session/camera pattern from `savevision-ios`. No Matrix/chat server is needed for this workflow; no unrelated template credentials or code were copied.

## What works in this first version

- Pair through Meta AI and handle the `trackinspect://` return link.
- Directly scan, connect, reconnect, disconnect, and forget Even Realities G1/G2, NIMO, or Mentra Live over Bluetooth, with battery/readiness status and text HUD tests on G1/G2/NIMO.
- Receive DAT camera frames at low resolution / 24 fps, with a live phone preview.
- Or choose **iPhone** under Settings → Video source to use the phone's back camera instead of glasses (no Meta setup needed; not yet validated on a device, see `specs/009-phone-video/`).
- Analyze sampled frames locally using Apple's built-in Vision image-classification model. One inference at a time, at most ~1.3 analyses/second; incoming frames are skipped while inference is busy.
- Optionally load a bundled **image classification** Core ML model named `InspectionClassifier` instead.
- Detect a pointing index finger in each analysed frame with Apple's on-device Vision hand-pose model: direction within the image and a fingertip marker on the preview. A geometric heuristic, not yet tried on a real hand (see `specs/010-finger-pointing/`).
- Report the pointing target: the nearest standout object along the finger (Vision saliency) is boxed and its region classified locally; a "Pointing target" panel shows the frame with the finger and box painted on, with a share button. Held in memory only. Saliency does not run on the simulator, so this is untested on real images.
- By default (switch in the Local vision panel) upload that annotated screenshot to the Passiv LLM gateway for a short description, shown in the panel and sent to the voice agent as a text message during a call. Needs `PASSIV_API_KEY` in `Secrets.xcconfig`. This is the only image that can leave the device.
- Start an ElevenLabs public-agent conversation using the official Swift SDK (LiveKit microphone capture, agent audio playback, interruption handling, transcripts and mute).
- Request iPhone or Bluetooth HFP audio and display the actual system route.
- Opt in to sending textual visual summaries to the agent, at most once every five seconds. Images are never sent to ElevenLabs.
- Analyze a photo selected with the system photo picker without Meta credentials or glasses.
- Initiate video and voice shutdown independently on backgrounding, reset summary-sharing consent, reject stale callbacks/results, and require explicit restart. No local recording or transcript persistence.
- Coalesce concurrent stop requests; keep inference work bounded even when a synchronous model operation ignores cancellation. Repeated photo selection retains only the latest replacement.
- Accessible labelled controls, adaptive large-text layouts and automated contrast/hit-region checks on normal and narrow simulators.

**This is not a trained railway defect detector or a safety system.** The default model emits general image labels, not defect diagnoses, bounding boxes, or free-form visual reasoning. A domain-trained model and validation dataset are separate work.

## Planning with Spec Kit

Feature planning uses **Spec Kit**. Start with [the constitution](.specify/memory/constitution.md) and [the current plan](specs/001-glasses-inspection/plan.md); [tasks](specs/001-glasses-inspection/tasks.md) separate implemented prototype work from pending hardware acceptance.

Workflow: `/speckit.specify` → `/speckit.clarify` (as needed) → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`. Commands are defined in `.claude/commands/`; local helper scripts live in `.specify/scripts/bash/`. See [quickstart](specs/001-glasses-inspection/quickstart.md) for non-Git operation and bootstrap details.

## Explicit Meta modes — 0.1.0 (7)

Both DAM and legacy-camera builds are available; **legacy (without DAM) build 7 is installed**. Settings shows the installed mode. **67 tests passed.** Important correction: DAT 0.7 reads `MWDAT.DAMEnabled`; the old nested `startupOptions.usesDam` flag was ignored. This is not yet a confirmed connectivity fix. See [build choices and artifacts](docs/META-BUILD-MODES.md).

## Unpair TrackInspect — 0.1.0 (6)

Settings → **Unpair TrackInspect** offers a confirmation before stopping video/voice and removing this app's Meta authorization. It does not unpair the glasses from Bluetooth or Meta AI. Pending removal is distinguished from confirmed completion; afterward use Pair again. **Build 6 installed/launched; 57 unit + 8 UI tests passed.** No removal was performed automatically. Actual connection recovery remains unverified. See [feature evidence](specs/006-unpair-glasses/tasks.md).

## Live glasses status — 0.1.0 (5)

Settings → Glasses now displays the actual Meta link status, distinct from registration: disconnected, connecting, connected or streaming, with setup/pending/unavailable states. Refreshes once per second while Settings is active; never starts capture. Streaming requires fresh video frames. **Build 5 installed and launched on the iPhone 16 Pro Max; 51 unit + 7 UI tests passed.** Physical glasses transitions still require user validation. See [feature evidence](specs/005-glasses-connection-state/tasks.md).

## Registration fix — 0.1.0 (4)

Meta's “registration error 0” means **already registered**. Repeated pairing now succeeds idempotently, with separate registration feedback and actionable messages for real failures. **Build 4 was installed and launched on the iPhone 16 Pro Max; all 53 automated tests passed.** See [registration fix details](docs/REGISTRATION-FIX.md). Registration alone does not establish live camera/voice support.

## App icon

A custom violet rail/viewfinder icon now matches the charcoal interface. [Preview and build details](docs/APP-ICON.md). The icon-enabled signed build retains the existing **0.1.0 (3)** version and is packaged separately at `build/0.1.0-3-icon/`; the icon is included in the installed build 5.

## Latest interface update

**0.1.0 (2)** adds a Linear-inspired charcoal/violet workspace with compact navigation, bordered panels and matching setup screens. See [screenshots and validation](docs/LINEAR-STYLE.md) and [Spec Kit feature 002](specs/002-linear-style/plan.md).

Signed artifacts: `build/0.1.0-2/TrackInspect.app` and `build/0.1.0-2/TrackInspect-0.1.0-2-development.ipa`. This interface is included in the installed build 5. All 30 unit tests and seven UI tests passed, including repeated UI validation on iPhone SE.

## First development build

**Version 0.1.0 (1)** has been built and Apple Development signed. Local artifacts:

- `build/0.1.0/TrackInspect.app`
- `build/0.1.0/TrackInspect-0.1.0-1-development.ipa`

See [build details and installation instructions](docs/FIRST-BUILD.md). The IPA is development-provisioned, not a TestFlight/App Store release. Meta credentials still need to be configured and rebuilt for glasses access; the public ElevenLabs agent ID is entered in Settings.

## Build

Requires macOS, Xcode 16+ with Swift 6, XcodeGen, and internet access for initial package resolution. Validated here with Xcode 27 and the iOS 18.5 simulator.

```sh
brew install xcodegen # if needed
xcodegen generate
open TrackInspect.xcodeproj
```

Choose the `TrackInspect` scheme. The app builds without credentials for photo/local-analysis testing. Optional secrets are included by `TrackInspect/Config/Base.xcconfig`:

```sh
cp TrackInspect/Config/Secrets.example.xcconfig TrackInspect/Config/Secrets.xcconfig
```

Fill in your signing team, Meta app ID and client token. These are intentionally blank; do not reuse the templates' identities. Register **`ai.trackinspect.app`** with Meta and Apple. The bundle identifier is set in `project.yml`; regenerate the project after changing it.

```sh
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build

xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -destination 'platform=iOS Simulator,name=iPhone 16,OS=18.5' \
  CODE_SIGNING_ALLOWED=NO test
```

The generated Xcode project and SPM lockfile are included. `project.yml` is canonical; regenerate after adding files or changing dependencies.

## Meta setup / real glasses

1. Create a Meta Wearables DAT app for bundle **`ai.trackinspect.app`** and your Apple team.
2. Configure the app link/redirect `trackinspect://` and camera capability, and enable the required developer/testing access in Meta's tooling.
3. Enter the Meta configuration in the gitignored xcconfig, then build to a physical iPhone.
4. Pair supported glasses in Meta AI. In TrackInspect → Settings → **Pair glasses in Meta AI**, approve access and return.
5. Wear the glasses, keep competing camera apps closed, and select **Start glasses video**.

The integration uses Meta DAT **0.7.0**, a long-lived selector, a session pinned to the resolved device, a wait for session `.started` before capability attachment, and a fresh session after stop. It reports device errors rather than looping blindly on retries.

## Mentra-compatible glasses

TrackInspect also links the official native `MentraBluetoothSDK` at version `0.1.20`, with its analytics disabled. No Mentra account, API key, or companion app is required. Open Settings, select the exact model to scan, then connect a discovered pair. G1, G2, and NIMO support short text HUD tests; Mentra Live does not have a working text HUD in this SDK.

This is an additional BLE/HUD backend, not a substitute live vision pipeline. The SDK sends photos to a hosted webhook and streams video to RTMP/SRT/WHIP endpoints; it does not provide in-process camera frames to TrackInspect. Live on-device frame analysis therefore remains Meta DAT or a user-selected photo. Real discovery, firmware compatibility, display output, and audio/camera behavior require physical-device validation.

## ElevenLabs setup

1. Create a **public conversational agent** in ElevenLabs. Configure its prompt, voice, language and data-retention policy there.
2. Enter its agent ID in TrackInspect → Settings. An agent ID is **not** an API key.
3. Tap **Talk to agent**, confirm cloud audio transmission, and grant microphone permission.
4. Check the displayed input/output route. Use **iPhone audio** or **Glasses Bluetooth** as appropriate.
5. Optionally enable **Share local findings with agent**. Configure your agent to regard these as uncertain observations, never authoritative safety conclusions or instructions.

The initial UI implements public agents only. For private agents, add an authenticated backend that obtains a short-lived ElevenLabs **conversation token**, then adapt `ElevenLabsVoiceService.start` to call `ElevenLabs.startConversation(conversationToken:)`. Do not put an ElevenLabs API key in this app, xcconfig, UserDefaults, or source control. A signed WebSocket URL and a WebRTC conversation token are different credentials.

### Audio/video coexistence is a hardware acceptance gate

DAT supplies **video**, not raw microphone audio in this app. ElevenLabs captures the active **iOS audio input**, using Bluetooth HFP when available. The microphone may otherwise be the phone's; the app does not silently label it as the glasses microphone.

SaveVision documents glasses-side camera termination when another audio consumer takes over. Simultaneous DAT video + Bluetooth conversational audio is therefore **not guaranteed** across glasses firmware/models. Validate it on your actual hardware. If voice terminates video, select iPhone audio, close competing sessions, then restart video. Do not claim full hands-free glasses operation until this test passes.

## A domain-specific local model

Add `InspectionClassifier.mlmodel` or `InspectionClassifier.mlpackage` under `TrackInspect/Resources/`, regenerate the project and build. Xcode compiles it to `InspectionClassifier.mlmodelc`. It must accept exactly one image (no other required inputs), expose a predicted string/integer class label and dictionary probabilities, and produce classification observations. Inference uses Core ML `.all` compute units and center-crop preprocessing; train/export accordingly.

Without that file the app explicitly displays **Apple Vision · general classifier**. Invalid custom models report an error rather than silently falling back. Object detectors or VLMs need a different `AnalysisService` implementation and output UI. No model download occurs at runtime.

## Layout

- `TrackInspect/App/` — composition and foreground lifecycle.
- `TrackInspect/Views/` — inspection dashboard, privacy consent and setup.
- `TrackInspect/ViewModels/` — session orchestration, throttling, context sharing.
- `TrackInspect/Services/` — DAT, ElevenLabs, local inference and injectable protocols.
- `TrackInspectTests/` — lifecycle, consent/throttling, cancellation, classifier contract, real Vision inference and bundle-identity tests. See `TrackInspectTests/Fixtures/README.md` for fixture scope.
- `TrackInspectUITests/` — setup, consent cancellation, empty-agent error, largest-text and accessibility audits.
- `docs/VALIDATION.md` — measured local build/test results.
- `docs/HARDWARE-VALIDATION.md` — blocked hardware/cloud acceptance and execution procedure.

## Acceptance checklist

- [ ] Physical iPhone signing, Meta registration, return URL and denied camera permission.
- [ ] First video frame, glasses removal/disconnection, no-frame timeout and restart.
- [ ] Agent connection, denied microphone permission, mute, transcripts and agent interruption.
- [ ] Confirm actual glasses microphone + speaker route and simultaneous video on your firmware.
- [ ] iPhone-audio fallback preserves video.
- [ ] Lock/background stops capture; foreground does not auto-resume recording.
- [ ] Airplane mode/network loss gives recoverable voice failure while local photo inference works.
- [ ] Validate trained model accuracy, thermal performance and battery on target iPhones.

The full local Spec Kit implementation/validation pass is recorded in `specs/001-glasses-inspection/execution.md`. Simulator builds/tests do not validate Meta hardware, Bluetooth routing or live ElevenLabs credentials. App Store assets, production private-agent authentication, telemetry, localization and domain model training remain outside this first prototype.
