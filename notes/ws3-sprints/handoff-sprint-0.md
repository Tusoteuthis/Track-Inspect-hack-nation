# WS3 Sprint 0 handoff — Capability spike, constitution, contracts & test setup

Branch: worktree-ws03-sprint-0   Worktree: .claude/worktrees/ws03-sprint-0   Dev port: 3100 (unused this sprint)   Spec: specs/20261003-235822-ws3-sprint-0-spike-contracts/   Date: 2026-10-04

## Delivered

| File | What it is |
|---|---|
| `.specify/memory/constitution.md` | Constitution v1.0.0: 8 principles, tech constraints, worktree workflow, governance |
| `specs/20261003-235822-ws3-sprint-0-spike-contracts/` | spec, plan, research, data model, contracts/pointing-event.schema.md, quickstart, tasks (17), checklist |
| `web/lib/expert/contracts.ts` | v0 types for 9 records (`ws3.v0`) plus `validatePointingEvent`, which reports every violated rule |
| `web/lib/expert/contracts.test.ts` | Fixture validation, invalid-input rejection, edge cases (16 tests) |
| `web/lib/voice/transcript.test.ts` | Transcript sanity tests (3) |
| `web/vitest.config.mts`, `web/package.json` | vitest 4.1, `npm test`, plus `npm run spike:ws3` |
| `web/fixtures/pointing-events/evt-00{1..5}-*.json` | resolved SYS1, resolved SYS2, repeat of 001, ambiguous, off-record. All `source: "fixture"`, session `fixture-session-001` |
| `web/public/fixtures/*.svg` | Placeholder trace images stamped "FIXTURE — not real data" (full plus 4 highlights) |
| `notes/ws3-sprints/docs/contracts-v0.md` | Partner-facing contract summary, "v0, pending agreement", open questions for WS2/WS5/WS6 |
| `notes/ws3-sprints/docs/elevenlabs-capabilities.md` | Q1–Q10 with quoted sources, "Recommended mechanisms" (a)–(f) with fallbacks and labels, 12 open risks |
| `web/scripts/ws3-capability-spike.mts` | Self-cleaning live check (one temp agent, deleted in `finally`). **Not yet run: see blocker** |

## Verification evidence

```
$ npm run typecheck
> tsc --noEmit                       (no errors)

$ npx vitest run
 Test Files  2 passed (2)
      Tests  19 passed (19)
```

Capability doc review (T015):
- All 10 questions are answered with doc URLs or SDK file paths.
- All 6 mechanisms have a fallback and a VERIFIED or DOCUMENTED-ONLY label.
- The "tentative agent response" bug it reports was double-checked in `node_modules/@elevenlabs/client/dist/BaseConversation.js:187`, where the SDK re-emits `{type:"tentative_agent_response", response}`.

Probe runs: N/A (no agent behavior in this sprint).

## ⚠️ Blocker: the ElevenLabs API key is invalid

The `ELEVENLABS_API_KEY` in `web/.env` is the same file as in the main checkout. The API rejected it with **401 `invalid_api_key`** on `api.elevenlabs.io` and `api.us.elevenlabs.io`, and with 400 on the EU host.

Consequences:
- No live checks ran.
- Every **agent-behaviour** statement in the capabilities doc is DOCUMENTED-ONLY. Only the SDK plumbing was VERIFIED, through an offline run of the installed client SDK against a fake connection.
- No temporary agent was created, so nothing needed cleaning up.
- Sprints 1+ also need a valid key (sync-agents, probes, live sessions).

## Decisions made

- **vitest 4.1 instead of 5.** vitest 5 needs `@types/node` ≥ 22. Bumping that shared dependency risks merge conflicts with WS5–WS7, which work in parallel.
- **Hand-written validators, no zod** (Principle VIII).
- **`trace_id`/`channel_id` must be `null` when unknown.** An empty string is rejected, to stop guessed placeholders.
- **`signal_interval` must be present (possibly `null`), never omitted.** This keeps "unknown" explicit (Principle IV).
- **The spike script was moved from /tmp into the repo** (`npm run spike:ws3`), so the live check can be repeated. It writes its results to `notes/ws3-sprints/docs/spike-results.json`.
- **`/speckit-analyze` was done as a manual consistency pass.** Spec FR-001..010 map to tasks T001–T017. No conflicts with the constitution.

## Recommended mechanisms (summary for Sprint 1+; details in the capabilities doc)

- **(a) Event delivery:** `sendContextualUpdate(text, { contextId: event_id })`, one unique contextId per event.
- **(b) Question↔event linkage:** a client tool called right before the question.
  - The doc names it `mark_question_target`; the Sprint 1 prompt calls it `begin_question`. Either is fine, but keep one name.
  - Settings: `expects_response: true`, `pre_tool_speech: off`.
  - Managed through `tools.create/update` plus `toolIds` in `sync-agents.mts`.
  - Tested with `simulateConversation` + `toolMockConfig`.
- **(c) Pause-aware release:** a client gate (agent listening + VAD/volume low + no tentative user transcript + rate limit), then a state contextual update. Agent turn settings: `turn_eagerness: patient`, plus `skip_turn` when nothing is released. Fallback: `sendUserMessage("[CONTROL] …")`, filtered out of the verbatim record.
- **(d) Phase switching:** one session; switch with a state contextual update (`contextId: "ws3-phase"`).
- **(e) Timing:** client-side stamps on every callback (server events have no timestamps), cross-checked post-call with `conversations.get` (`time_in_call_secs`, whole seconds).
- **(f) Off-record:** mute the mic (audio never reaches ElevenLabs), plus a state update, plus periodic `sendUserActivity()`. Afterwards, `conversations.delete`. Also `record_voice: false` and short retention. Zero-retention mode is enterprise-only.

## Contract changes

None beyond v0 as specified in the sprint prompt. Sprint 1 will add `question_planned` to ExpertExchange (planned). Sprint 2 will add `related_event_ids` (planned).

## Known limitations / open issues

1. Invalid API key (blocker above).
2. **Existing bug:** `web/lib/voice/transcript.ts` `tentativeTextFrom()` checks for `internal_tentative_agent_response`, but the SDK emits `{type:"tentative_agent_response", response}`, so tentative agent text never renders. It also ignores `tentative_user_transcript`, which Sprint 2 needs as a "user still speaking" signal. **Fix in Sprint 1.**
3. `max_duration_seconds` defaults to 600 s, too short for interview plus debrief. Sprint 1 must raise it on the expert agent.
4. The default LLM is not documented, and the last documented default is discouraged for tools. Sprint 1 must pin `prompt.llm` in sync-agents.
5. Contextual updates cannot be represented in `simulateConversation` history through the SDK. Probes approximate them with marked user turns; a raw-REST variant is in the spike script.
6. `skip_turn` may stop the agent re-engaging on silence (Sprint 2 risk).
7. The partner contracts are not yet reviewed by WS2, WS5 or WS6.

## Human gate checklist (~15 min)

1. **Fix the API key.** Put a valid `ELEVENLABS_API_KEY` in `<repo>/web/.env` and copy it to `.claude/worktrees/ws03-sprint-0/web/.env`.
2. **Run the live check (optional now, required before Sprint 1 builds on (a)–(c)):**
   ```bash
   cd .claude/worktrees/ws03-sprint-0/web && npm run spike:ws3
   ```
   - Expect `done; agentDeleted = true`.
   - Skim `notes/ws3-sprints/docs/spike-results.json`.
   - Ask an agent to update the DOCUMENTED-ONLY labels in the capabilities doc.
3. Read "Recommended mechanisms" in `notes/ws3-sprints/docs/elevenlabs-capabilities.md` and accept or adjust them.
4. Share `notes/ws3-sprints/docs/contracts-v0.md` with the WS2, WS5 and WS6 owners.
5. Merge, once the main checkout is clean and no other agent is mid-commit:
   ```bash
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws03-sprint-0
   git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-0
   ```
   (Removing the worktree deletes its `web/.env` copy and `node_modules`; that's fine.)

## Notes for the next sprint (Sprint 1)

- **Before building, read** "Recommended mechanisms" and "Open risks" in the capabilities doc. Every agent-behaviour claim is unverified until `spike:ws3` has run with a valid key.
- **Agent setup:**
  - pin the LLM;
  - raise `max_duration_seconds`;
  - set `turn_eagerness: patient`;
  - enable `skip_turn`;
  - enable `vad_score` and `tentative_user_transcript` in `client_events`.
- **Code fixes and contracts:**
  - fix `tentativeTextFrom()`;
  - the contracts and validators are in `web/lib/expert/contracts.ts`; add validators for client-tool params there.
- **Sample data:** fixture images are served from `/fixtures/...`; fixture JSON is in `web/fixtures/pointing-events/`.
