# WS3 trust: off-record, strikes, retention

**Status:** Sprint 4 (2026-10-04). Code: `web/lib/expert/record-state.ts`, `strike.ts`, `completion.ts`, `elevenlabs-deletion.ts`, the snapshot validator in `contracts.ts`. Answers the brief's demo question 5 ("How can the expert take information off the record, and how is sensitive material protected?").

Labels used below: **TESTED** = covered by vitest; **VERIFIED LIVE** = observed against the real ElevenLabs API (Sprint 0 spike, `docs/elevenlabs-capabilities.md`); **DOCUMENTED-ONLY** = from the official docs or SDK source, not run; **UNVERIFIED IN VOICE** = implemented, but no live voice session has exercised it yet (human gate).

## 1. What "off the record" means, end to end

### Going off the record (four triggers, one mechanism)

| Trigger | How | Segment `trigger` |
|---|---|---|
| Expert says "off the record", "stop recording", "don't record this" | The client detects the phrase in the final transcript line **and** the agent calls the client tool `set_record_state({state:"off_record"})` (idempotent) | `expert_phrase` or `agent_tool` |
| Console | "Go off the record" button | `console` |
| Capture (WS2) | A `PointingEvent` arrives with `record_state: "off_record"` | `capture_event` |

Each change closes the current `RecordingSegment` and opens a new one. The **acknowledged** state is the last stored segment; the console shows it ("OFF THE RECORD · since … · trigger"), not a local toggle (WS7 §5). The agent acknowledges with "Okay, off the record." (probes 5/5) and is told by tool result and by a `[RECORD_STATE]` contextual update to ask nothing until back on the record.

**The triggering utterance is excluded too.** "Off the record: X" is usually one utterance, and it is transcribed before the agent's tool call. The segment therefore starts at the expert line that asked for it (searched up to 30 s back; for a paraphrased request the agent recognised, the latest expert line since the agent last spoke). That line and everything after it is dropped.

### While off the record (all **TESTED**)

Dropped **in memory, before any snapshot is built** — not flagged, not filtered at save time:
- expert and agent transcript lines, answer lines, preamble lines;
- timing marks (expert speech, agent speech), including marks stamped back into a closed segment later;
- pointing events, on- or off-record (never stored, never a topic, never released, never evidence; their images are never linked);
- every recording tool call: `begin_question`, `record_coverage`, `signal_task_complete`, `propose_draft`, `confirm_revision`, `strike_last_answer` return `error the expert is off the record …` and nothing is created. So no exchange, coverage note, gap answer, draft step or confirmation can come from off-record material, and the gap selector and draft builder never see it (test: an off-record answer to an open debrief gap leaves the gap open).

Kept: the segment's times and trigger, and counts (`off_record_excluded`: transcript lines, events, timing marks, refused tool calls). Files show a neutral marker: *"off-record segment from T1 to T2 (content excluded)"*.

### Back on the record

Only the expert ends a segment: the phrase "back on the record" / "you can record again", the agent tool `set_record_state on_record`, or the console. A capture event may end only a segment a capture event started. The "back on the record" line itself is dropped (it may carry trailing off-record words). The agent says "Okay, back on the record." and never refers to off-record content (probe 5/5 with the sentinel in its context).

### Defence in depth

`validateSessionSnapshot` (server, before every write) refuses any off-record event or exchange and any transcript line, answer line, preamble line or timing mark timestamped inside an off-record segment. A bug that leaks content makes the save fail loudly instead of writing it.

**Sentinel test** (`web/lib/expert/trust-run.test.ts`): a full fixture session says "pineapple calibration" inside the off-record request and again while off record, delivers an off-record capture event, tries to ask about it, strikes another answer, finishes, and is saved through the real file store plus demo-evidence export plus a deletion report. Every file in the session folder is scanned: no sentinel, no struck word, no off-record event id or image name. A mutation that disables the exclusion makes it fail.

## 2. "Forget what I just said" (strike)

Trigger: agent tool `strike_last_answer` (probe 5/5) or the console "Strike last answer" button. The target is the latest exchange holding expert words other than the strike request itself.

- The expert's words in that exchange are removed (transcript lines too), plus any "forget what I just said" lines since. The exchange keeps its id (with no answer lines) so evidence links stay valid. A `Strike` record lists what it affected.
- AI text derived from it is redacted: coverage notes; draft steps citing it ("(step removed: it relied on words the expert asked to strike)", `supported: false`); a `change_reason` based on it; the spoken teach-back of a superseded revision.
- Coverage cells and debrief gaps that relied only on it reopen.
- **Revisions citing it are superseded; confirmations of them, or whose response was the struck answer, are invalidated.** A `confirmed` session goes back to `teach_back` (phase trigger `strike`), the agent is told the confirmation no longer counts, and a new teach-back confirmation (after a new `propose_draft`, if the revision was superseded) is required. `completion.json` can therefore never report a struck confirmation as complete. **TESTED.**
- The tool's `reason` parameter is ignored and never stored, because the agent paraphrases the struck words into it (seen in the probes).

## 3. ElevenLabs side: facts, sources, what we did

| Fact | Status | Source |
|---|---|---|
| Audio passes through ElevenLabs for the live conversation (WebRTC) and is transcribed there | inherent | ElevenLabs Agents architecture |
| Per-agent defaults on our account: `record_voice: true`, `retention_days: -1` (docs: 2 years by default), `zero_retention_mode: false`, redaction off | VERIFIED LIVE (read back on a new agent) | capabilities doc Q7; https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention |
| `conversations.delete(id)` deletes the **whole** conversation (then `404 conversation_not_found`) | VERIFIED LIVE | capabilities doc Q7; https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/delete |
| No API deletes **part** of a conversation; history redaction is enterprise-only | DOCUMENTED-ONLY | https://elevenlabs.io/docs/eleven-agents/customization/privacy |
| Muting the mic (`useConversationInput().setMuted(true)` → LiveKit `track.mute()`) stops audio from leaving the browser | DOCUMENTED-ONLY (SDK source) | capabilities doc (f) |

**Implemented:**
- **Session-scoped conversation deletion.** `POST /api/expert-sessions/<id>/elevenlabs-deletion` deletes the ElevenLabs conversation(s) of one ended session that had an off-record segment. The ids come only from that session's saved `session.json` (`conversation_ids`; a resume adds one); nothing is listed or bulk-deleted; malformed ids are never sent; 404 is reported as `not_found`. The report goes to `elevenlabs-deletion.json` and `session.json`, and the console shows it per conversation. Trigger: the console button, or automatically after the final save when "delete … when it ends" is ticked (default on). **TESTED with the SDK mocked; not run live in this sprint.** If the deletion fails (for example while ElevenLabs is still processing the conversation), the console says so and the button retries.
- **Optional mic mute while off the record** (console checkbox, default off). With it on, off-record speech never reaches ElevenLabs, but the expert can no longer *say* "back on the record" and must use the console. **UNVERIFIED IN VOICE.**
- `sendUserActivity()` every 4 s while off the record, so the agent's 15 s turn timeout does not make it speak into the silence. **UNVERIFIED IN VOICE.**

**Available but deliberately not applied** (orchestrator decision for this sprint):
- `platform_settings.privacy.zero_retention_mode: true` on the expert agent. Not applied because the expert agent is **shared** by all WS3 worktrees and gates; ZRM disables `conversations.get` (history, tool-call audit, the audio offsets we may want) and restricts the LLM to Gemini, Claude or ElevenLabs-hosted Qwen; workspace-wide ZRM is enterprise-only and per-agent availability on our plan is undocumented.
- `record_voice: false`, a low `retention_days` (0 = scheduled deletion), `delete_audio`, `delete_transcript_and_pii`. Not applied for the same shared-agent reason; they would also affect sessions that never went off record. They are one `sync-agents` setting away if the team decides so.

**What we must not claim:** while the mic is not muted, words spoken off the record **do reach ElevenLabs** (speech-to-text and the LLM context of that conversation) and are stored there under the account's retention until the conversation is deleted. Our guarantee is about **our** records (`knowledge/sessions/…`) and the knowledge passed to WS5. Between the session end and a successful deletion, ElevenLabs holds the full conversation. The agent's LLM context also contains the off-record words for the rest of that conversation; the prompt and the tool results forbid it from using them (probe 5/5), but that is model behaviour, not a guarantee.

## 4. Boundaries

- **Personal data on screen** (names, IDs, faces in the glasses camera frame) is WS2's concern: capture decides which frames are taken, stored and how they are redacted. WS3 stores only the image *references* WS2 provides, and none for off-record events. WS2 open question: will capture stop taking frames when off record, or only tag them?
- **Persisted knowledge for WS5:** only on-record material can exist by construction; WS5's eligibility check (`web/lib/knowledge/eligibility.ts`, `off_record_evidence`) is a second guard.
- **Answer-key separation:** WS4's evaluator answer key is not loaded into the expert agent's prompt, knowledge base (0 docs attached) or tools, nor served by any WS3 route. Nothing in Sprint 4 changes that.
- **Corrections propagate** as new immutable revisions (Sprint 3); **strikes** propagate as redaction + supersession + invalidation (above). WS6 (shared backend) must preserve both when it takes over storage: rewriting a revision is allowed only for ids listed in a strike's `superseded_revision_ids`.
