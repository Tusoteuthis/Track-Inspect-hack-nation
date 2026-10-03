# WS3 Sprint 1 — Golden path: point → question → answer → saved evidence

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 1** of workstream WS3. Make **one complete, correctly linked interaction** work end to end:

> a (fixture) pointing event arrives → the ElevenLabs expert agent asks one grounded question at a sensible moment → the expert answers by voice → the exchange is saved to disk, linked to the **exact** event, with verbatim words and timing marks.

This is the highest-risk design piece of WS3 (the event ↔ question ↔ answer linkage). Everything later builds on it, so correctness of linkage beats polish. Context sections A1–A8 below apply in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **1**
- Slug = **golden-path**
- Branch = **`ws3/sprint-1-golden-path`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-1`**
- Dev-server port = **3101**

**First action:** run the A6 location check at the bottom of this prompt. It confirms you are in your worktree, or creates it if you were started in the main checkout. Do not edit anything in the main checkout.

## Read first

- `notes/ws3-sprints/handoff-sprint-0.md` (what Sprint 0 delivered and decided)
- `notes/ws3-sprints/docs/elevenlabs-capabilities.md`, **especially "Recommended mechanisms"**. Where this prompt's suggested mechanism conflicts with a verified finding there, follow the finding and record the deviation in your handoff note.
- `notes/ws3-sprints/docs/contracts-v0.md`, `web/lib/expert/contracts.ts`, `web/fixtures/pointing-events/`
- `.specify/memory/constitution.md`
- `notes/03-elevenlabs-expert-interaction.md` §3–6
- Existing code: `web/components/voice/VoiceSession.tsx`, `web/lib/voice/transcript.ts`, `web/app/page.tsx`, `web/app/api/conversation-token/route.ts`, `web/scripts/sync-agents.mts`, `web/scripts/probe-agents.mts`, `agents/*.example.json`

## Prerequisites

Sprint 0 merged into `voice`: contracts, fixtures, vitest and the capabilities doc all exist. Verify this inside your worktree (the handoff note exists and the files are present). If not, stop and tell the human; don't work around it.

## Design you must implement (unless Sprint 0 findings force a documented alternative)

**Event delivery.** When a pointing event arrives (in this sprint: the human clicks a fixture in the dev console), the client:
1. stores it in the session state,
2. logs `TimingMark event_received`,
3. sends the agent a **contextual update** (not a user message, so the agent is not forced to reply) in a compact, stable, machine-readable text format, for example:
   `[POINTING_EVENT] event_id=evt-001 mapping_status=resolved channel=SYS1 trace=trace-A record_state=on_record source=fixture. The expert is pointing at this region. Do not interpret it. When there is a natural pause, ask about it.`

   Never include the fixture's dev `label` or any interpretation. Keep the format builder in one pure, tested function.

**Question ↔ event linkage via a client tool.** The agent must call a client tool **immediately before** asking each question:
- `begin_question({ event_id: string | null, kind: <ExpertExchange.kind>, question: string })`
  - The client validates `event_id` (it must be a known event, or `null` only when the question is not about a pointing event) and creates an `ExpertExchange` with `phase: "live"`. It makes this the **active exchange**, logs `question_tool_called`, and returns a short result string to the LLM (for example `ok exchange_id=ex-003`, or `error unknown event_id evt-009, known: evt-001, evt-002`).
  - The exchange's `question` field is filled from the agent's **actual spoken final transcript line** that follows the tool call (verbatim). Keep the tool param as `question_planned`, an added contract field; document it.
- **Answer attachment rule:** every final **user** transcript line (`onFinalLine`) attaches verbatim to the active exchange (`answer_lines`) until the next `begin_question` call or session end. The first attached line sets `answer_started_at_utc`; each attachment updates `answer_ended_at_utc`.
- New pointing events arriving while an answer is in progress **never** re-link the active exchange. It keeps its original `event_id`. This is the key acceptance property.
- Agent speech that ends in a question but had no preceding `begin_question` call is recorded as an **unlinked agent question**, flagged in the UI and counted in the session. It is a defect signal for prompt tuning, not silently fixed.
- User lines before any question go to a `preamble` bucket (kept, not lost).

**Session state.** A pure reducer `web/lib/expert/session.ts` (no React, fully unit-tested) with actions such as `session_started`, `event_received`, `question_begun`, `agent_final_line`, `user_final_line`, `agent_speaking_changed`, `session_ended`. A thin React hook/provider wraps it. Tool handlers passed to `startSession` must read the **latest** state; use a ref/dispatcher pattern, because the `clientTools` object is captured when the session starts.

**Timing.** Record `TimingMark`s for event_received, question_tool_called, agent_speech_started (from the SDK mode/speaking change; extend `VoiceSession` with an optional `onModeChange`/`onSpeakingChange` prop if needed), answer_started and answer_ended. Store both `at_utc` and `performance.now()`.

**Persistence (local files, replaceable by WS6 later).**
- Route handler `PUT /api/expert-sessions/[sessionId]/snapshot` receives the full session state, validates it (contracts guards) and writes atomically (write temp, then rename) to `<repo>/knowledge/sessions/<sessionId>/`:
  - `session.json`
  - `events.json`
  - `exchanges.json`
  - `timing.json`
  - `transcript.md` — full transcript, each line tagged with role, time and active exchange_id
  - `exchanges.md` — human-readable: each exchange with event_id, image link, the question verbatim, and the expert answer verbatim in a blockquote
- The idempotent snapshot model means retries can never duplicate records. The client saves (debounced ~1 s) after each state change and on session end, and shows saved/saving/error state.
- Knowledge root comes from env `KNOWLEDGE_DIR` (default `../knowledge` relative to `web/`). Sanitize `sessionId` (`^[a-z0-9-]{1,64}$`) to prevent path traversal.
- Keep file I/O behind a small interface (`web/lib/expert/store.ts`) so WS6 can swap it out.
- Add `knowledge/sessions/` to the root `.gitignore`. Captured sessions are data, not source; the human decides what to commit.
- Session id is generated per expert session (for example `ses-<yyyymmdd-hhmmss>-<rand4>`). Fixture events get their `session_id` rewritten to the live session id when injected, keeping `source: "fixture"`.

**Expert agent configuration (in repo, pushed with sync-agents).**
- `agents/manifest.json` (from the example). The expert agent gets `systemPrompt: "expert/system-prompt.md"` and `firstMessage: "expert/first-message.md"`.
- Tool definitions: if Sprint 0 verified an API path, extend `web/scripts/sync-agents.mts` to push client tool definitions from `agents/expert/tools.json`, keeping the "fields left out are not touched" philosophy. Otherwise write `agents/expert/TOOLS-SETUP.md` with exact dashboard steps and tell the human in the gate.
- `agents/expert/system-prompt.md` must cover:
  - Persona: a curious, respectful apprentice. The expert is the authority.
  - How to read `[POINTING_EVENT]` updates.
  - Always call `begin_question` right before asking, with the correct `event_id`.
  - One short question at a time; build on what the expert already said.
  - Never interpret the trace, never suggest causes, no leading questions.
  - Wait for a natural pause; if the expert is mid-explanation, let them finish.
  - For `mapping_status` ambiguous or unresolved, first ask which region they mean (`kind: clarify_reference`).
  - The question patterns from section A3.
  - Brevity (spoken, 1–2 sentences).
  - Do not ask about events with `record_state=off_record`.
- `first-message.md`: a short greeting that explains the expert can point and talk, and that the agent will ask occasional questions.

**Dev console UI.** Replace the free-text `ContextSender` (keep it available behind a "raw" toggle) with `web/components/expert/ExpertConsole.tsx`, rendered inside `VoiceSession` for the expert flow only:
- fixture event buttons with thumbnails, labeled **FIXTURE**
- current session id
- event list
- exchanges list, showing event_id ↔ question ↔ verbatim answer lines (unlinked agent questions highlighted)
- timing marks
- save status

Keep `VoiceSession` generic (WS5 reuses it for the tutor). Add only optional props.

**Probes.** Extend `agents/probes.json` (from the example) with expert cases. Follow Sprint 0's finding on how to represent contextual updates and client tools in `simulateConversation`. If contextual updates cannot be simulated, inject the event text as a marked user turn for probes only, and document that limitation. Extend `probe-agents.mts` only if needed, for example to assert tool calls automatically and to run a case N times and print the pass count. Required cases:
1. Event arrives, expert silent → the agent calls `begin_question` with the correct `event_id` and asks one open, non-leading question.
2. The expert has already described the feature → the agent asks about reasoning or distinction, not "what is this?".
3. Leading-question trap: the expert says "this bump here" → the agent must not name a physical cause.
4. Two events delivered; the expert answers about the first → `begin_question.event_id` refers to the event actually being discussed.
5. Ambiguous event → `kind: clarify_reference`, no interpretation.

## Lanes (parallelizable once contracts are fixed)

- **Lane A (pure logic + server):** reducer, contextual-update formatter, answer-attachment rules, store and snapshot route, with tests first.
- **Lane B (agent config):** system prompt, first message, tool definitions, sync-agents extension, probes.
- **Lane C (UI wiring):** ExpertConsole, client tool handlers bound to the reducer, VoiceSession optional props, save loop.

## Out of scope (later sprints)

- Topic queue, gesture dedup and pause-gated release (Sprint 2). In this sprint events are delivered immediately as contextual updates, and restraint comes from the prompt only.
- Coverage, debrief, teach-back and confirmation (Sprint 3).
- Full off-record behavior (Sprint 4).

## Acceptance criteria

- `npm run typecheck` and `npm test` pass. Unit tests cover at least:
  - answer lines attach to the active exchange
  - a new event during an answer does not re-link it
  - unknown event_id in the tool → error result, no exchange
  - unlinked agent question detection
  - snapshot validation and path sanitization
  - contextual-update text contains no fixture label
- `npm run sync-agents -- --agent expert` succeeds, and the expert agent in ElevenLabs has the prompt and the `begin_question` tool.
- Probe cases 1–5 each pass in ≥ 4 of 5 runs (report counts; tune the prompt until they do, or document why not).
- Manual run by you where possible (`npm run dev -- -p 3101`, load the page, no console errors without a mic). The real voice check is the human gate.
- `knowledge/sessions/<id>/` contains all six files after a session, and `exchanges.md` reads correctly.
- Handoff note `notes/ws3-sprints/handoff-sprint-1.md` written.

## Human gate (for the human, ~30 min)

1. In the sprint worktree, run `cd web && npm run dev -- -p 3101` and open http://localhost:3101, choose "Expert capture", press Start.
2. Click fixture evt-001, talk about it for ~20 s, and pause. **Check:** the agent waits, then asks one grounded question without interpreting.
3. Answer it. While still answering, click evt-002. **Check:** your answer stays linked to evt-001.
4. Stop. Open `<worktree>/knowledge/sessions/<id>/exchanges.md`. **Check:** the question and your words are verbatim, under the right event, with timing marks.
5. If satisfied, merge the branch into `voice`, from the main checkout once it's clean and no other agent is mid-commit: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff ws3/sprint-1-golden-path`. Then remove the worktree: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-1`.

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

Full briefs, if you need more detail: `notes/project-brief.md`, `notes/03-elevenlabs-expert-interaction.md` (our brief), `notes/02-glasses-iphone-visual-processing.md` (PointingEvent contract, §5), `notes/05-knowledge-newcomer-tutor.md` (knowledge entry structure, §3–5), `notes/06-backend-integration.md`. The overall WS3 sprint plan is `notes/ws3-sprints/sprint-plan.md`.

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

**Never invent ElevenLabs API surface.** Check the installed SDK typings in `web/node_modules/@elevenlabs/...` and the official ElevenLabs docs, plus `notes/ws3-sprints/docs/elevenlabs-capabilities.md` once Sprint 0 has produced it. If something you need does not exist, say so and choose a documented fallback.

### A6. Git worktree isolation (MANDATORY — other agents work in this repo in parallel)

Several agents work on this repository **at the same time**. The main checkout (`/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`, branch `voice`) is shared, and other agents may be editing files or committing there right now. To avoid corrupting their work, **you work only in your own git worktree.**

**Hard rules**
- **Never** run `git checkout`, `git switch`, `git reset`, `git stash`, `git clean`, `git rebase`, `git merge` or `git pull` in the main checkout. Don't edit, create or delete files there. Don't run `npm install` or `npm run dev` there.
- **Never** touch another agent's worktree or branch. Don't delete branches or worktrees you didn't create.
- All file edits, commands, tests, dev servers and commits happen **inside your worktree directory**.
- Only push config to the **expert** ElevenLabs agent (`npm run sync-agents -- --agent expert`). Never touch the tutor agent or any other agent.

**Recommended start: the human launches you inside your worktree.** The human may already have created your worktree and started you in it. That is the safest setup, because your whole session (shell, file paths, spec-kit scripts) then lives in the worktree. You may also have been started in the main checkout. Either way, run this **before doing anything else** (replace `N` and `<slug>` with the values from "Worktree identity"):

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
WT_ROOT=/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees
WT=$WT_ROOT/ws3-sprint-N
BR=ws3/sprint-N-<slug>
HERE=$(git rev-parse --show-toplevel)
CUR=$(git branch --show-current)

if [ "$HERE" = "$WT" ] && [ "$CUR" = "$BR" ]; then
  echo "OK: already in my worktree ($WT on $BR); skip creation"
elif [ "$HERE" = "$REPO" ]; then
  echo "Started in the MAIN checkout; creating/using my worktree"
  if git -C "$REPO" worktree list | grep -q " $WT "; then
    echo "worktree exists already"
  else
    mkdir -p "$WT_ROOT"
    git -C "$REPO" worktree add -b "$BR" "$WT" voice
  fi
else
  echo "STOP: unexpected location $HERE on branch $CUR; ask the human"
fi
```

- **If it printed STOP:** stop and ask the human.
- **If the worktree exists but is on a different branch than `$BR`,** or `$BR` already exists elsewhere: stop and ask the human. Never force, reset or delete anything.
- **If you were started in the main checkout:** from now on, **every** shell command starts with `cd "$WT" && …`, and **every** file path you read, edit or write must start with `$WT/`, never with `$REPO/`. Run spec-kit commands (`/speckit-*`) only after `cd "$WT"`. Before each commit, check that `git -C "$REPO" status --short` shows none of your files.

Then, in the worktree, set up what git does not carry over:

```bash
cd "$WT"
[ -f web/.env ] || cp "$REPO/web/.env" web/.env 2>/dev/null || echo "web/.env missing: ask the human"
[ -f agents/manifest.json ] || { [ -f "$REPO/agents/manifest.json" ] && cp "$REPO/agents/manifest.json" agents/; }
[ -f agents/probes.json ]   || { [ -f "$REPO/agents/probes.json" ]   && cp "$REPO/agents/probes.json" agents/; }
[ -d web/node_modules ] || (cd web && npm ci)
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

### A6c. Where WS3 documents live (all inside `notes/ws3-sprints/`)

```
notes/ws3-sprints/
  README.md                         how to run the sprints (for the human)
  sprint-plan.md                    overview, estimates, verification modes
  sprint-0-…md … sprint-4-…md       these paste-ready prompts
  handoff-sprint-N.md               written by each sprint agent at the end
  docs/                             WS3 reference docs produced by the sprints:
    elevenlabs-capabilities.md        Sprint 0: verified ElevenLabs capabilities + recommended mechanisms
    contracts-v0.md                   Sprint 0: data contracts for WS2/WS5/WS6 (updated in Sprint 4)
    voice-interface.md                Sprint 4: how WS5 reuses the voice component and consumes our output
    trust.md                          Sprint 4: off-record semantics and retention facts
```

Put every WS3 note you create in this folder (or `docs/`). Don't add WS3 files elsewhere in `notes/`.

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
