# WS3 Sprint 0 — Capability spike, constitution, contracts & test setup

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 0** of workstream WS3 (ElevenLabs expert interaction). This sprint builds the foundation the next four sprints depend on. It does **not** build any conversation behavior yet. Your three goals:
1. Find out **from official sources** what ElevenLabs actually supports for the behaviors we need.
2. Write the project's spec-kit constitution.
3. Define the shared v0 data contracts plus sample fixtures, and add a test runner.

Context sections A1–A8 below apply to you in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **0**
- Slug = **spike-contracts**
- Branch = **`ws3/sprint-0-spike-contracts`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-0`**
- Dev-server port = **3100**

**First action:** follow section A6 at the bottom of this prompt to create your worktree. Do not edit anything in the main checkout.

## Read first

- `notes/03-elevenlabs-expert-interaction.md` (our brief, all of it)
- `notes/03a-ws3-sprint-plan.md` (the sprint split you are starting)
- `notes/02-glasses-iphone-visual-processing.md` §5 (PointingEvent v0 fields and geometry)
- `notes/05-knowledge-newcomer-tutor.md` §3–5 (what WS5 expects from us)
- `web/components/voice/VoiceSession.tsx`, `web/lib/voice/transcript.ts`, `web/scripts/probe-agents.mts`, `web/scripts/sync-agents.mts`

## Prerequisites

None. Your worktree branches from the local `voice` tip. It must already contain `notes/ws3-sprints/`, `.specify/` and `.claude/skills/speckit-*`; the A6 checks verify this.

## Spec-kit note for this sprint

The constitution is part of this sprint, so run `/speckit-constitution` **first** (Lane B), then `/speckit-specify` for the rest of the sprint.

## Scope

### Lane A — ElevenLabs capability spike (research only, no app code)

Answer each question with **official sources** (ElevenLabs docs at elevenlabs.io/docs, the changelog, and the installed SDK typings in `web/node_modules/@elevenlabs/react`, `@elevenlabs/client` if present, and `@elevenlabs/elevenlabs-js`). Quote the relevant doc line or type signature and give the URL or file path for each answer. Where docs are silent, say "not documented". Where you verify something empirically (for example with a small script against the API using `web/.env`), describe the experiment and its output.

| # | Question | Why we need it |
|---|---|---|
| Q1 | What exactly does `sendContextualUpdate` do? Can it ever trigger an agent turn? How does it differ from `sendUserMessage`? Are contextual updates visible in the conversation transcript or history afterwards? | The core mechanism for telling the agent about a pointing event without forcing it to speak |
| Q2 | Client tools: how are they declared on the agent (dashboard vs API; the schema of a client tool in the agent config), how does the React SDK dispatch them (`clientTools` in `startSession`), can the tool return a value to the LLM, and is there a "wait for response" option? Can `sync-agents.mts` create or update tool definitions through `elevenlabs-js`, and which method and shape does that take? | Sprint 1 links questions to events through a client tool |
| Q3 | Do client tools work inside `agents.simulateConversation` (the `probe` script)? If they are only *recorded* there and not executed, how can mocked tool results be supplied (for example `toolMockConfig` or similar)? | Agents must be able to test tool-calling behavior without a microphone |
| Q4 | Turn-taking controls: turn timeout, "turn eagerness" or similar, interruption handling, silence/end-of-turn detection, soft timeouts. What is configurable, where, and with what values? Can any of it be changed per session (overrides) from the client? | Sprint 2: wait for a natural pause, never interrupt |
| Q5 | Which client-side events exist in `@elevenlabs/react` 1.16 (`onMessage`, `onModeChange`, `onDebug`, VAD score, `onAgentChatResponsePart`, user/agent speaking state, …), and what payloads and timestamps do they carry? Is there a "user is speaking" signal usable for pause detection? | Pause-aware question release and the timing log |
| Q6 | Does the conversation history from the API (`conversations.get`) include per-turn `time_in_call_secs` or similar offsets, tool calls and contextual updates? Can audio be fetched afterwards? | Evidence offsets for exchanges (transcript/audio offsets) |
| Q7 | Data retention and privacy: zero-retention mode, per-agent retention settings, deleting a conversation (`conversations.delete`), disabling audio storage. What applies on our plan or tier? | Sprint 4 off-record: what can truly be excluded on the ElevenLabs side |
| Q8 | Dynamic variables and per-session overrides: can the system prompt and first message be overridden per session? Can dynamic variables change mid-session? | Phase switching (live → debrief → teach-back) |
| Q9 | System tools available (for example `end_call`, `skip_turn`, language detection). Is there a "skip turn / stay silent" tool the agent can use to deliberately not speak? | Interruption restraint |
| Q10 | Which LLMs can the agent use, and which is the current default? Any known limits on tool-call reliability? | Prompt and tool design in Sprint 1 |

**Deliverable:** `notes/ws3-elevenlabs-capabilities.md` with one section per question (answer, evidence, source) and a final **"Recommended mechanisms"** section that tells Sprints 1–4 which mechanism to use for:
- (a) delivering pointing events
- (b) linking a question to an event
- (c) pause-aware release of queued topics
- (d) phase switching
- (e) timing capture
- (f) off-record

For each, give a fallback if the preferred mechanism fails. Mark every recommendation as *verified* (tested) or *documented-only*.

### Lane B — Constitution (`/speckit-constitution`)

Fill `.specify/memory/constitution.md` (currently an empty template). Principles, each with a short rationale:
1. **Expert is the source of truth.** The agent never supplies interpretations; no leading questions.
2. **Verbatim evidence.** Expert words are stored verbatim and kept separate from AI synthesis; no fabricated quotes; qualifiers preserved; unknowns stay `null`.
3. **Evidence linkage.** Every exchange references exactly the pointing event it was asked about, even if the expert has moved on.
4. **Time discipline.** Session time and signal time are never conflated; processing latency is logged separately from intentional waiting.
5. **Fixtures are labeled.** Fixture-sourced data is marked and never presented as live.
6. **Trust.** Off-record material is excluded from every persisted path; the evaluator answer key never reaches runtime; no permanent secrets in clients.
7. **Verifiable increments.** Pure logic is test-first (vitest); agent behavior is verified by probes with stated pass rates; a human live gate closes each sprint.
8. **Simplicity.** Local files and in-process modules over infrastructure; behind small interfaces so WS5/WS6 can replace them.

Also include: a technology constraints section (Next.js 16, React 19, TypeScript strict, ElevenLabs SDKs, local filesystem persistence under `knowledge/`), a governance section, and version `1.0.0` with today's date.

### Lane C — Contracts, fixtures and test runner

1. Add **vitest** to `web/` (dev dependency, a `test` script `vitest run`, config resolving the `@/*` alias). Add one trivial test for `web/lib/voice/transcript.ts` (`appendFinal` replaces a tentative line; exact repeats are skipped) to prove the setup works.
2. Create `web/lib/expert/contracts.ts` with **v0 TypeScript types** (snake_case field names to match the briefs and the JSON on disk), plus a `SCHEMA_VERSION = "ws3.v0"` constant and small runtime type guards or validators for anything that arrives from outside (PointingEvent, tool params). Types:
   - `PointingEvent` — `schema_version`, `session_id`, `event_id`, `source: "live" | "fixture"`, `captured_at_utc` (ISO), `session_time_ms`, `frame_id`, `image_ref`, `highlighted_image_ref`, `region: { x, y, width, height, coordinate_space: "original_frame_normalized", frame_width_px, frame_height_px }`, `mapping_status: "resolved" | "ambiguous" | "unresolved"`, `trace_id | null`, `channel_id | null`, `signal_interval: { start, end, unit } | null`, `record_state: "on_record" | "off_record"`, optional `label` (human-readable hint for dev UIs only — never fed to the agent as an interpretation).
   - `ExpertExchange` — `exchange_id`, `session_id`, `event_id | null` (null only for exchanges not tied to an event, for example the debrief about general workflow), `phase: "live" | "debrief" | "teach_back"`, `kind: "explain" | "reasoning" | "distinction" | "context" | "guardrail" | "exception" | "clarify_reference" | "gap"`, `question` (agent's spoken words, verbatim), `answer_lines: { text, at_utc, transcript_line_id }[]` (verbatim expert words), `asked_at_utc`, `answer_started_at_utc | null`, `answer_ended_at_utc | null`, `audio_offset_secs | null`, `record_state`, `source: "live" | "fixture"`.
   - `CoverageItem` — `dimension: "decision" | "reason" | "cues" | "alternatives" | "guardrails" | "unresolved"`, `event_id | null`, `status: "missing" | "partial" | "covered"`, `supporting_exchange_ids: string[]`, `note | null` (AI note, clearly marked as synthesis).
   - `OpenQuestion` — `open_question_id`, `missing_fact`, `why_it_matters`, `related_event_ids`, `related_exchange_ids`, `answered_by_exchange_id | null`.
   - `DraftRevision` — `revision_id` (`rev-1`, `rev-2` …), `session_id`, `created_at_utc`, `parent_revision_id | null`, `steps: { step_id, text, kind: "step" | "decision" | "guardrail" | "exception", supporting_event_ids, supporting_exchange_ids }[]`, `change_reason | null`.
   - `ExpertConfirmation` — `confirmation_id`, `revision_id`, `status: "confirmed" | "corrected" | "unresolved"`, `step_ids_reviewed`, `expert_response_exchange_id`, `at_utc`.
   - `SessionCompletion` — `session_id`, `ended_at_utc`, `end_reason: "completed" | "incomplete" | "aborted"`, `confirmed_revision_id | null`, `coverage: CoverageItem[]`, `unresolved_open_question_ids`, `excluded: { off_record_segments: number, excluded_exchange_ids: string[] }`, `counts: { live_questions, live_guardrail_questions, debrief_questions }`.
   - `TimingMark` — `session_id`, `event_id | null`, `exchange_id | null`, `mark: "event_received" | "topic_queued" | "topic_released" | "question_tool_called" | "agent_speech_started" | "answer_started" | "answer_ended"`, `at_utc`, `at_perf_ms`.
   - `RecordingSegment` — `segment_id`, `state: "on_record" | "off_record"`, `started_at_utc`, `ended_at_utc | null`.
3. Create fixtures in `web/fixtures/pointing-events/` (JSON, all `source: "fixture"`, one shared `session_id: "fixture-session-001"`):
   - `evt-001-resolved.json` — a clear resolved region on channel SYS1
   - `evt-002-resolved-sys2.json` — a different region on SYS2
   - `evt-003-repeat-of-001.json` — a new `event_id` but the same region as evt-001 a few seconds later (for dedup tests)
   - `evt-004-ambiguous.json` — `mapping_status: "ambiguous"`, region spanning both channels
   - `evt-005-off-record.json` — `record_state: "off_record"`

   Use placeholder image refs under `web/public/fixtures/` (add 2–3 simple placeholder PNG/SVG "trace screenshot" images so the dev UI can render them; label them visibly as FIXTURE). Do **not** encode any interpretation of the trace in the fixtures.
4. Unit tests: every fixture validates against the guards; invalid samples (missing `event_id`, bad `mapping_status`, out-of-range region) are rejected.
5. Write `notes/ws3-contracts-v0.md`, a human-readable summary of the contracts for WS2, WS5 and WS6. It is a proposal: mark it "v0, pending agreement", and list the open questions for each partner.

## Out of scope

Agent prompt, client tools, UI changes, persistence routes. These start in Sprint 1.

## Acceptance criteria

- `notes/ws3-elevenlabs-capabilities.md` answers Q1–Q10, each with a source, plus "Recommended mechanisms" with fallbacks and verified/documented-only labels.
- `.specify/memory/constitution.md` filled, versioned 1.0.0, no template placeholders left.
- `cd web && npm run typecheck && npm test` passes. The tests cover the transcript sanity case, fixture validation and invalid-input rejection.
- `web/lib/expert/contracts.ts`, `web/fixtures/pointing-events/*.json` (5 files), and `notes/ws3-contracts-v0.md` exist.
- Handoff note `notes/ws3-sprints/handoff-sprint-0.md` written.

## Human gate (for the human, ~15 min)

1. Read the "Recommended mechanisms" section and accept or adjust it.
2. Skim `notes/ws3-contracts-v0.md` and share it with the WS2, WS5 and WS6 owners.
3. If satisfied, merge the branch into `voice`, from the main checkout once it's clean and no other agent is mid-commit: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff ws3/sprint-0-spike-contracts`. Then remove the worktree: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-0`.

---

## A. Shared project context (identical in every WS3 sprint prompt)

### A1. The product in one paragraph

We are building an **AI Apprentice for railway sensor traces** for Challenge 1 ("The AI Apprentice") of the 7th Global AI Hackathon, powered by ElevenLabs. An experienced railway engineer (the **expert**) wears **Meta Ray-Ban smart glasses** and looks at **sensor traces on a screen**. They **physically point with a finger** at a trace region. A connected iPhone application (workstream WS2) detects the gesture in the glasses' camera feed, captures the region and emits a **PointingEvent**. An **ElevenLabs voice agent** (our workstream, **WS3**) asks the expert to explain what they see, then asks about reasons, distinctions, exceptions and guardrails. After a spoken **debrief** and a **teach-back** that the expert **confirms or corrects**, the confirmed knowledge is saved as Markdown plus linked images. A separate tutor (WS5) later uses it to teach a newcomer on an unseen trace.

Core loop: *expert points → app identifies the visual reference → voice agent asks → expert explains → apprentice clarifies and confirms → knowledge is persisted → newcomer learns.*

### A2. Non-negotiable scope rules

- **Sensor traces only.** No technical drawings, field maintenance, dataset labeling or classifier training.
- **Glasses-first, physical finger pointing.** Never redesign the expert experience around mouse clicks, a cursor or a conventional screen-sharing assistant. A browser companion page is fine for development and for controls.
- **The expert supplies the interpretation.** The agent must never invent or suggest what a curve means. No leading questions that insert an unconfirmed physical interpretation.
- **Expert wording is preserved verbatim and kept separate from AI summaries.** Never synthesize a quote. Never turn a qualified statement ("usually", "only if") into an absolute rule. Missing values stay missing (`null`), never guessed.
- **Session time ≠ signal time.** "The expert pointed at 02:15 in the recording" (`session_time_ms`) is not "the feature spans 120–150 ms on the trace" (`signal_interval`). Never derive one from the other.
- **An ambiguous pointing event is never treated as resolved.** Clarify the visual reference before interpreting the answer.
- **Fixtures must be labeled as fixtures.** Simulated pointing events are fine during development, but every record created from a fixture carries `source: "fixture"`, and the demo must show what is live and what is a fixture.
- **WS4's evaluator answer key is never loaded into the agent**, its prompt, its knowledge base or its tools.
- **No permanent ElevenLabs API key in the browser.** The browser only receives short-lived conversation tokens from the existing server route.

### A3. Challenge requirements WS3 must make demonstrable

| Requirement | Detail |
|---|---|
| Live questions | ≥ **3** questions during the real task, each at a natural pause, each about something visible (a pointing event) |
| Guardrail | ≥ **1** of the live questions concerns a guardrail (when to stop, escalate, distrust the evidence) |
| Debrief | ≥ **3** follow-up questions after the task about matters **not already answered** live |
| Teach-back | Final spoken teach-back that the expert explicitly **confirms or corrects**; silence is not confirmation |
| Evidence | Every workflow step and guardrail links to a screen moment (event) **and** the expert's own words (exchange) |
| Interruption restraint | Roughly 3–5 live questions per 10 minutes; others deferred to the debrief; never interrupt ongoing speech; no repeated questions |
| Trust | Off-record content excluded consistently from recording and knowledge paths; corrections propagate |

Useful question patterns (patterns, not a script): "What do you recognize in this region?", "Which part of the shape makes you interpret it that way?", "What could look similar, and how would you distinguish it?", "What additional context do you need before deciding?", "When would you stop and ask someone else?", "You said 'usually' — what are the exceptions?". Do not keep asking "why?" once the reasoning has been given.

### A4. Workstream map (who owns what)

| WS | Owns | Relationship to WS3 |
|---|---|---|
| WS1 | Pitch, business case | Consumes our demo transcripts and verified claims |
| WS2 | Glasses/iPhone capture, gesture detection, PointingEvent | **Produces** PointingEvents; we use fixtures until live |
| WS3 (**us**) | Expert conversation, ElevenLabs adapter, timing, debrief, teach-back, confirmation | — |
| WS4 | Prototype trace scenarios, evaluator answer key | Supplies scenarios; answer key must stay out of our agent |
| WS5 | Knowledge synthesis, Work Map, newcomer tutor | **Consumes** our exchanges/confirmations; will later replace our in-memory coverage tracker |
| WS6 | Shared backend (does not exist yet) | Will take over our local-file persistence later; keep it behind a small interface |
| WS7 | Web frontend | Will build the polished UI; our UI is a functional dev/companion page |

Full briefs, if you need more detail: `notes/project-brief.md`, `notes/03-elevenlabs-expert-interaction.md` (our brief), `notes/02-glasses-iphone-visual-processing.md` (PointingEvent contract, §5), `notes/05-knowledge-newcomer-tutor.md` (knowledge entry structure, §3–5), `notes/06-backend-integration.md`. The overall WS3 sprint plan is `notes/03a-ws3-sprint-plan.md`.

### A5. Repository state you start from

Repo root (shared main checkout, **read-only for you**, see A6): `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`. Base branch for all WS3 work: **`voice`**. You work in your own worktree branched from `voice`.

```
agents/                       ElevenLabs agent config (manifest.example.json, probes.example.json, tts-samples.example.json)
notes/                        Briefs and plans (read-only for you unless the sprint says otherwise)
web/                          Next.js 16 / React 19 / TypeScript app (path alias "@/*" → web/*)
  app/api/conversation-token/route.ts   GET ?flow=expert|tutor → short-lived WebRTC token (uses ELEVENLABS_API_KEY server-side)
  app/page.tsx                          Flow picker + <VoiceSession> + dev "ContextSender" (sends free-text sendContextualUpdate)
  components/voice/VoiceSession.tsx     ConversationProvider wrapper: start/stop orb, live transcript,
                                        props: flow, dynamicVariables, clientTools, onFinalLine, onConnected, children
                                        (children are inside the provider and may call useConversationControls())
  lib/voice/flows.ts                    FLOWS = { expert, tutor } → env var holding the agent id
  lib/voice/transcript.ts               finalLineFrom/tentativeTextFrom/appendFinal/appendTentative; TranscriptLine has `at` (epoch ms)
  scripts/sync-agents.mts               npm run sync-agents [-- --agent expert] [-- --create-missing]
                                        pushes systemPrompt / firstMessage / knowledge docs from agents/manifest.json to ElevenLabs
  scripts/probe-agents.mts              npm run probe [-- expert] — TEXT-ONLY simulated conversations via
                                        client.conversationalAi.agents.simulateConversation; prints agent reply + tool calls;
                                        cases from agents/probes.json
  scripts/tts-roundtrip.mts             npm run tts-roundtrip — TTS → Scribe round trip (can synthesize test "expert" audio)
  .env.example                          ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID_EXPERT, ELEVENLABS_AGENT_ID_TUTOR
.specify/ + .claude/skills/speckit-*   spec-kit 1.0.4 (sequential feature numbering; creates specs/NNN-name/ and a feature branch)
```

Packages: `@elevenlabs/react` ^1.16, `@elevenlabs/elevenlabs-js` ^2.70, `next` ^16.1, `react` ^19.2, `tsx`, `typescript`. Code style: small focused modules, comments only where the "why" is non-obvious, strict TypeScript, no `any`. Match the existing style in `VoiceSession.tsx` and `transcript.ts`.

**Never invent ElevenLabs API surface.** Check the installed SDK typings in `web/node_modules/@elevenlabs/...` and the official ElevenLabs docs, plus `notes/ws3-elevenlabs-capabilities.md` once Sprint 0 has produced it. If something you need does not exist, say so and choose a documented fallback.

### A6. Git worktree isolation (MANDATORY — other agents work in this repo in parallel)

Several agents work on this repository **at the same time**. The main checkout (`/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`, branch `voice`) is shared, and other agents may be editing files or committing there right now. To avoid corrupting their work, **you work only in your own git worktree.**

**Hard rules**
- **Never** run `git checkout`, `git switch`, `git reset`, `git stash`, `git clean`, `git rebase`, `git merge` or `git pull` in the main checkout. Don't edit, create or delete files there. Don't run `npm install` or `npm run dev` there.
- **Never** touch another agent's worktree or branch. Don't delete branches or worktrees you didn't create.
- All file edits, commands, tests, dev servers and commits happen **inside your worktree directory**.
- Only push config to the **expert** ElevenLabs agent (`npm run sync-agents -- --agent expert`). Never touch the tutor agent or any other agent.

**Setup (run once at the start; replace `N` and `<slug>` with the sprint number and slug from the title of this prompt)**

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
WT_ROOT=/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees
WT=$WT_ROOT/ws3-sprint-N
BR=ws3/sprint-N-<slug>

mkdir -p "$WT_ROOT"
git -C "$REPO" worktree list                    # check that $WT and $BR don't already exist
git -C "$REPO" fetch origin 2>/dev/null || true # read-only for the main checkout; ignore if offline
git -C "$REPO" worktree add -b "$BR" "$WT" voice   # new branch from the local voice tip
cd "$WT"

# Things git does not carry into a worktree:
cp "$REPO/web/.env" web/.env 2>/dev/null || echo "web/.env missing: ask the human"
[ -f agents/manifest.json ] || { [ -f "$REPO/agents/manifest.json" ] && cp "$REPO/agents/manifest.json" agents/; }
[ -f agents/probes.json ]   || { [ -f "$REPO/agents/probes.json" ]   && cp "$REPO/agents/probes.json" agents/; }
(cd web && npm ci)
```

**Checks after setup.** If any check fails, stop and ask the human; don't copy files from the main checkout to work around it.
- `ls notes/ws3-sprints/` shows the sprint prompts, and the previous sprint's `handoff-sprint-(N-1).md` exists (except for Sprint 0).
- `ls .specify .claude/skills` shows spec-kit. If it's missing, the spec-kit setup hasn't been committed to `voice` yet.
- `git -C "$WT" status` is clean and on `$BR`.

**Dev server.** Use a sprint-specific port so you don't collide with other agents: `npm run dev -- -p 310N` (Sprint 0 → 3100, Sprint 1 → 3101, …). Use that URL in the human-gate instructions.

**Spec-kit inside the worktree.** Spec-kit 1.0.4 here does not create git branches; it creates `specs/NNN-name/` and a local `.specify/feature.json`. Your branch is already `$BR`. Other agents also create specs in parallel, so sequential numbers would collide on merge. When `/speckit-specify` runs `create-new-feature.sh`, pass `--timestamp --short-name ws3-sprint-N-<slug>`. If the skill doesn't let you pass flags, rename the created directory afterwards to `specs/<timestamp>-ws3-sprint-N-<slug>/` and update `.specify/feature.json` to match.

**Subagents for lanes.** Subagents work inside **your** worktree: run them sequentially if they touch the same files. For true parallelism, give each lane its own nested worktree under `$WT_ROOT/ws3-sprint-N-lane-X`, branched from `$BR`, and merge the lanes into `$BR` yourself. These lane worktrees and branches are yours to create and remove.

### A6b. How every WS3 sprint is executed

1. Read this whole prompt, then do the A6 worktree setup and checks.
2. Read the files listed under "Read first" in the sprint section, **from your worktree**.
3. Use spec-kit for the sprint: run `/speckit-specify` with the sprint's goal and scope (paste the "Scope" and "Acceptance criteria" sections as the feature description; naming per A6). Then `/speckit-clarify` only if something is truly ambiguous, then `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`. Keep the specs consistent with this prompt; this prompt wins on conflicts.
4. Where the sprint lists **lanes**, they are independent once the contracts are fixed. Parallelize them following A6 "Subagents for lanes", then integrate.
5. Use test-driven development for all pure logic (vitest). Run the verification commands below before claiming anything works, and paste actual outputs into the handoff note.
6. Commit in small logical commits on `$BR`, ending each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not merge into `voice`, do not push, and do not remove your worktree.** The human merges after their live gate.
7. Finish by writing the sprint handoff note `notes/ws3-sprints/handoff-sprint-N.md` (template in A8) in your worktree and committing it. Then stop and report to the human with:
   - the worktree path
   - the branch name
   - the dev-server port
   - exactly what they must do for the **human gate**, including running the gate from the worktree (`cd $WT/web && npm run dev -- -p 310N`)

### A7. Standard verification commands

```bash
cd web
npm run typecheck
npx vitest run                         # once Sprint 0 has added vitest
npm run sync-agents -- --agent expert  # pushes prompt/tools to the EXPERT agent only
npm run probe -- expert                # simulated text conversations; run 5x for pass-rate claims
npm run dev -- -p 310N                 # live test at http://localhost:310N (N = sprint number; human gate)
```

`web/.env` (copied into your worktree during A6 setup) must contain `ELEVENLABS_API_KEY` and `ELEVENLABS_AGENT_ID_EXPERT`. If they are missing, do every step that does not need them, list what is blocked, and ask the human — never fake a probe result.

Probe results are nondeterministic. A behavior counts as "passing" only if it holds in **≥ 4 of 5 runs** per probe case. Report the actual counts.

### A8. Handoff note template (`notes/ws3-sprints/handoff-sprint-N.md`)

```markdown
# WS3 Sprint N handoff — <title>
Branch: ws3/sprint-N-<slug>   Worktree: <path>   Dev port: 310N   Spec: specs/<timestamp>-ws3-sprint-N-<slug>/   Date: <date>
## Delivered (files + one line each)
## Verification evidence (pasted command output: typecheck, vitest summary, probe pass counts)
## Decisions made (and why) — especially anything that deviates from the sprint prompt
## Contract changes (fields added/renamed in web/lib/expert/contracts.ts)
## Known limitations / open issues
## Human gate checklist (exact steps for the human to run live, and what to look for)
## Notes for the next sprint
```
