# WS7: Screen observation for the newcomer tutor (Sprint 2 spike)

Date: 2026-10-04. Branch: `ws7-sprint-2`. Owner: WS7.

## Question
How can visual context from the learner's screen (`navigator.mediaDevices.getDisplayMedia`) reach the ElevenLabs tutor without the UI making the agent speak (B2: "UI does not trigger speech")?

## Findings

### 1. Browser capture (Chrome)

| Behaviour | Result | How verified |
|---|---|---|
| `getDisplayMedia({ video: { frameRate: 5 }, audio: false })` returns a `MediaStream` after the learner chooses a source | works | Playwright Chromium with `--auto-select-desktop-capture-source=Entire screen` (`web/e2e/practice-screen.spec.ts`). The real picker is checked at the human gate. |
| Still frame: `<video muted playsInline>` → `canvas.drawImage` → `toBlob("image/jpeg", 0.7)`, scaled to ≤1280 px wide | works; a frame is acknowledged within about 1 s of the grant | same e2e ("Last still image received at …") |
| Denial throws `DOMException` `NotAllowedError` | mapped to the "denied" state | code path in `useScreenObservation.ts`; manual check at the gate |
| The browser's own "Stop sharing" bar fires `ended` on the video track | mapped to the "stopped" state | listener in `useScreenObservation.ts`; manual check at the gate |
| Feature detection must run after mount (SSR has no `navigator`) | the `MARK_UNSUPPORTED` event avoids a hydration mismatch | unit test `screenCapture.test.ts` |

### 2. What the installed SDK offers
Installed: `@elevenlabs/react` 1.16.0, `@elevenlabs/client` 1.26.0, `@elevenlabs/types` 0.24.0.

| API | Source | Effect |
|---|---|---|
| `sendContextualUpdate(text, { contextId? })` | `client/dist/BaseConversation.d.ts`; wire `{type:"contextual_update", text, context_id}` | Text only. Does **not** trigger a response. WS3 verified this live (`notes/ws3-sprints/docs/elevenlabs-capabilities.md`), and ElevenLabs' WebSocket docs say "Context text to inject into the conversation without interrupting". |
| `uploadFile(blob) → { fileId }` | `client/dist/utils/uploadFile.js`: `POST /v1/convai/conversations/{id}/files` (multipart `file`) | Needs a live conversation id. Images or PDFs only. |
| `sendMultimodalMessage({ text?, fileIds })` | wire `{type:"multimodal_message", text:{type:"user_message",…}, files:[{type:"file_input", file_id}]}` (`types/dist/generated/types/asyncapi-types.d.ts` L89–103) | ElevenLabs' WebSocket reference says it **triggers an agent response**. The docs also say the file is bound "to the user's turn". |
| Any vision, screen or base64-image API | grep of `.d.ts` and dist | **None.** The only `screen` hit is `navigator.wakeLock.request("screen")`. |

ElevenLabs docs:
- [Multimodal input](https://elevenlabs.io/docs/eleven-agents/customization/multimodal-input): `file_input.enabled`, `max_files_in_memory` (1–10), `max_files_per_conversation` (default 10). The model must support images. Older files beyond the memory limit are replaced with a summary. It is documented for chat channels, not voice calls.
- [Upload conversation file](https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/upload-file): `POST /v1/convai/conversations/{conversation_id}/files` takes an image or PDF and returns `{ file_id }`. The auth rules for browser token sessions are not documented.
- [Agent WebSockets](https://elevenlabs.io/docs/eleven-agents/api-reference/eleven-agents/websocket): `multimodal_message` triggers a response and allows at most 5 files. `contextual_update` does not interrupt.
- [Processing images and documents](https://elevenlabs.io/blog/processing-images-and-documents-in-elevenagents): the file is stored as a native reference bound to the user's turn. There is no mention of screen sharing.

## Routes considered

| Route | Verdict |
|---|---|
| A. Periodic stills go to `DataSource.submitScreenFrame` (WS6 stores them; WS5's evaluator or tutor tooling reads them), followed by a silent `sendContextualUpdate("[PRACTICE screen_frame frame=<id> draft_rev=N captured=<utc>]")` | **Implemented.** No speech is triggered, frames stay in our storage, and frames are tied to the draft revision. They reach the tutor's reasoning through WS5 evaluation, the cited snippets in contextual updates, and later a WS5 client or server tool if needed. |
| B. `uploadFile` + `sendMultimodalMessage` every N seconds | **Rejected as default.** Each message is a user turn that triggers a reply (documented), so the agent would talk whenever a frame is sent. That breaks B2. It also caps at 10 files per conversation by default, and voice-session support is undocumented. |
| C. B, but only when the learner explicitly asks the tutor to look | Possible later. It would be learner-initiated, like speaking. It needs WS3/WS5 agreement and a live check that the agent model accepts images in a voice (WebRTC) session. **Not built.** |
| D. Only a text description of UI state | **Insufficient on its own** (brief §3.E: hidden form values alone don't satisfy screen watching). Kept as a supplement: draft edited, review requested, evaluation received, saved. |

## Implemented (Sprint 2)
- `web/components/practice/useScreenObservation.ts`: capture, a frame every 5 s plus one on "Request review", cleanup on stop, track end and unmount.
- `web/lib/practice/screenCapture.ts`: states `unsupported | idle | requesting | active | denied | stopped | error`. Only acknowledged frames count as sent.
- `web/components/practice/ScreenSharePanel.tsx`: permission, active-sharing (with the time of the last acknowledged frame), stopped, denied and error states, each shown with an icon and text.
- `DataSource.submitScreenFrame(caseId, blob, { draft_revision, captured_at_utc }) → Ack<ScreenFrameRef>`. The fixture acknowledges with a counter id. WS6 needs to provide the real endpoint (see handoff).
- `web/components/practice/TutorPanel.tsx`: `TutorContextBridge` sends `sendContextualUpdate` with a unique `contextId` per event (WS3 found that a reused id supersedes the earlier update). Draft edits are debounced and flushed before any other event so order is preserved. Nothing calls `sendUserMessage` or `sendMultimodalMessage`.

## Open / blocked
- **Live tutor check** (needs `ELEVENLABS_AGENT_ID_TUTOR` and a key in `web/.env`): confirm at the human gate that contextual updates for screen frames and practice events keep the tutor silent, and that it uses them on its next natural turn.
- **Route C live check**: does `uploadFile` work with a browser conversation-token session, and does the tutor's model accept images during a WebRTC voice session? This is not tested and needs WS3's agent configuration.
- **WS6**: frame storage endpoint (proposed `POST /api/sessions/:sid/screen-frames`, multipart, returns `{frame_id, captured_at_utc, draft_rev}`). **WS5**: whether the evaluator or tutor consumes frames.
