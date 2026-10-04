# TrackInspect · NSPCT

**Capture expert reasoning. Turn it into guided practice.**

TrackInspect is a hackathon prototype for transferring railway engineers' expertise to newcomers. An expert looks at a **railway sensor trace**, points to a feature and explains it aloud. An ElevenLabs voice agent asks follow-up questions, links explanations to visual evidence and helps turn confirmed reasoning into reusable teaching material.

Built for **Challenge 1: The AI Apprentice**, at the 7th Global AI Hackathon, powered by ElevenLabs. The web experience is branded **NSPCT**.

[Web demo](https://track-inspect.matthiass1.workers.dev) · [Demo walkthrough](notes/deploy/demo-script.md) · [iOS setup](ios/README.md) · [Web/backend setup](web/README.md)

> **Prototype, not a railway safety system.** The expert supplies the interpretation. Local image labels, pointing detection and model-generated descriptions are not certified defect detection or engineering judgments. Hardware and service availability affect the live demonstration; fixture paths are available and labelled.

## The experience

### 1. Capture

An expert wears smart glasses and physically points at a sensor trace on a screen. The iPhone app processes the camera view, identifies a candidate pointing target and connects visual context to the **Expert** voice conversation. The agent asks about the expert's reasoning, alternatives, exceptions and uncertainty.

### 2. Map

Review captured explanations and evidence, correct or confirm the resulting knowledge, and explore a **Work Map** of the interpretation task. The aim is a connected account of decisions and guardrails—not just a folder of captions.

### 3. Teach

A newcomer practices on another trace with the **Tutor** agent. The teaching flow uses eligible expert knowledge to guide reasoning and review decisions before they are committed. Fixture/stub evaluation is distinguished from live model-backed evaluation.

## What is in this repository?

| Component | Purpose | Stack |
|---|---|---|
| [`ios/`](ios/) | Glasses integration, local visual processing, pointing context and voice | Swift 6, SwiftUI, Vision/Core ML, Meta DAT, Mentra Bluetooth SDK, ElevenLabs |
| [`web/`](web/) | Expert capture, review, Work Map, newcomer practice and shared API | Next.js 16, React 19, TypeScript, server-sent events |
| [`agents/`](agents/) | Expert/Tutor prompts, configuration and probes | ElevenLabs agent tooling |
| [`notes/`](notes/) | Product brief, contracts, workstreams, deployment and demo guidance | Design and implementation documentation |
| [`ios/specs/`](ios/specs/) | iOS feature specifications and implementation plans | Spec-driven development |

```text
Glasses camera ──► iPhone visual processing ──► pointing context / evidence
                          │                              │
                          ▼                              ▼
                   ElevenLabs voice ◄────────► shared web backend
                                                         │
                                               review → Work Map → practice
```

The web UI and API share one Node process. The current deployed setup uses a single Cloudflare Container because live jobs, locks and SSE coordination are process-local. Storage abstraction work exists, but durable multi-instance deployment must not be assumed.

## Try the web demo locally

Requires **Node.js 20+** and npm. The fixture demonstration does not require voice-provider credentials.

```sh
cd web
npm ci
cp .env.example .env
npm run dev -- -p 3006
```

Open **http://localhost:3006**.

| Route | Screen |
|---|---|
| `/expert` | Expert capture and conversation |
| `/expert/display` | Trace/video display for the expert to inspect |
| `/review` | Review and confirm captured knowledge |
| `/map` | Work Map |
| `/practice` | Newcomer practice |
| `/summary` | Session summary |
| `/diagnostics` | Backend health and diagnostic state |

See the [demo navigation guide](notes/ws7-demo-navigation.md) for the intended sequence and fallbacks. Fixture data is labelled; live voice and model evaluation require additional configuration.

### Enable live voice and evaluation

Configure only the services you need in the gitignored `web/.env`:

| Variable | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | Server-side creation of short-lived voice conversation tokens |
| `ELEVENLABS_AGENT_ID_EXPERT` | Expert conversation agent |
| `ELEVENLABS_AGENT_ID_TUTOR` | Tutor conversation agent |
| `BACKEND_ACCESS_TOKEN` | Shared demo API access boundary |
| `ANTHROPIC_API_KEY` | Optional live tutor evaluation, with `WS5_MODULES=real` |

**Never commit keys or embed an ElevenLabs API key in a browser or iOS app.** Agent IDs are not secret credentials. Consult [`web/README.md`](web/README.md) for module defaults, authentication, storage paths and fixture/live distinctions.

## Run the iOS app

Requires macOS, Xcode with Swift 6 support, XcodeGen and an iPhone for real glasses testing. Minimum deployment target: **iOS 17**.

```sh
cd ios
xcodegen generate
open TrackInspect.xcodeproj
```

Choose the `TrackInspect` scheme and configure signing. The bundle identifier is **`ai.track-inspect.app`**. Meta registration returns through **`trackinspect://`**.

- Configure Meta credentials in the ignored `ios/TrackInspect/Config/Secrets.xcconfig`, using the example file as a guide.
- Meta developer-portal configuration, completed release-channel artifacts and tester access may be required; iPhone Bluetooth pairing alone does not authorize the app.
- Settings offers **Expert** and **Tutor** voice-agent presets, with manual configuration available.
- Mentra-compatible glasses support is a separate integration; do not assume all supported glasses supply the same camera or display capabilities.
- Check the actual audio route when choosing iPhone or glasses Bluetooth audio. Simultaneous glasses video, microphone and speaker operation requires hardware validation.

Detailed instructions and current caveats: [`ios/README.md`](ios/README.md). Future direct Meta camera-stream audio is documented in the [deferred implementation plan](ios/specs/009-meta-stream-audio/plan.md); it is not an implemented feature.

## Data handling and limitations

- Voice audio goes to ElevenLabs when a cloud voice conversation is started.
- The current iOS pointing flow can upload an **annotated pointing screenshot** to the configured Passiv gateway and, when configured, the shared backend. Its upload switch is documented as enabled by default in the iOS README. **Do not assume all images stay local**; review settings before using sensitive material.
- General image classification, saliency-based target selection and machine-generated visual descriptions can be wrong. They provide context for the expert, not authoritative interpretations.
- The backend implements review, confirmation and deletion/off-record workflows; see the [API contract](notes/ws6-api-v0.md) and [failure/recovery guide](notes/ws6-failure-recovery.md).
- The demo's shared access token is not production user authentication or role-based authorization.
- **Deployed data is ephemeral:** container restarts, redeploys, the restart endpoint or inactivity shutdown can discard runtime knowledge and sessions. Do not use the demo as the sole copy of important data.

## Development checks

```sh
cd web
npm run typecheck
npm test
npm run build
```

With the local server running:

```sh
npm run replay-capture
npm run e2e -- --base http://localhost:3006 --runtime-dir .runtime
```

For iOS, select a simulator available on your Mac:

```sh
cd ios
xcodebuild -project TrackInspect.xcodeproj -scheme TrackInspect \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  CODE_SIGNING_ALLOWED=NO test
```

These are validation commands, not a claim that all suites or hardware scenarios passed on the latest combined commit. Real agent calls, glasses behavior, routing and sustained performance need separate acceptance testing.

## Deploy to Cloudflare Containers

The deployed demo is at **https://track-inspect.matthiass1.workers.dev**; availability and access requirements can change.

Prerequisites: Docker running, an appropriately provisioned Cloudflare account and deployment credentials. Review [`web/wrangler.jsonc`](web/wrangler.jsonc), [`web/Dockerfile`](web/Dockerfile) and the [deployment handoff](notes/deploy/HANDOFF.md).

```sh
cd web
# Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID securely in your environment.
npx wrangler deploy

# Supply server secrets through the interactive prompts; never commit their values.
npx wrangler secret put ELEVENLABS_API_KEY
npx wrangler secret put ELEVENLABS_AGENT_ID_EXPERT
npx wrangler secret put ELEVENLABS_AGENT_ID_TUTOR
npx wrangler secret put BACKEND_ACCESS_TOKEN
# Optional: npx wrangler secret put ANTHROPIC_API_KEY
```

The Worker forwards configured secrets to the container. Browser API access is established through `/api/access?token=<BACKEND_ACCESS_TOKEN>`; treat that URL as sensitive. The protected `POST /__restart` endpoint restarts the container and **discards ephemeral data**. See deployment notes before invoking it.

## Further reading

- [Project brief and product scope](notes/project-brief.md)
- [Voice-agent strategy](notes/voice-agent-strategy-handoff.md)
- [Web/backend API contract](notes/ws6-api-v0.md)
- [Demo walkthrough](notes/deploy/demo-script.md)
- [Deployment and storage status](notes/deploy/HANDOFF.md)
- [Future Meta camera-stream audio](ios/specs/009-meta-stream-audio/plan.md)

## Repository locations

- **GitHub:** https://github.com/Tusoteuthis/Track-Inspect-hack-nation
- **Gitea (private):** https://git-dev.obachan.dev/budelius/Track-Inspect-hack-nation

Remotes are pushed explicitly; no automatic server-side mirroring is configured.
