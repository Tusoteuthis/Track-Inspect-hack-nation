# WS3 Sprint 2 — Live interview quality: topic queue, dedup, ambiguity, pause-aware asking, timing

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 2** of workstream WS3. Sprint 1 made one linked interaction work. Your job is to make the **live interview** behave like a good apprentice:
- It does not interrupt the expert.
- It does not ask twice about the same thing.
- It handles unclear or outdated pointing honestly.
- It produces timing evidence showing that it waited on purpose rather than being slow.

At the end, a fixture-driven session must naturally produce **≥ 3 live questions, including ≥ 1 guardrail question, with zero duplicates**. Context sections A1–A8 below apply in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **2**
- Slug = **live-interview**
- Branch = **`ws3/sprint-2-live-interview`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-2`**
- Dev-server port = **3102**

**First action:** follow section A6 at the bottom of this prompt to create your worktree. Do not edit anything in the main checkout.

## Read first

- `notes/ws3-sprints/handoff-sprint-1.md` and `handoff-sprint-0.md`
- `notes/ws3-elevenlabs-capabilities.md`, especially Q1 (contextual updates), Q4 (turn-taking), Q5 (client events), Q9 (skip-turn tool) and "Recommended mechanisms (c)"
- `web/lib/expert/contracts.ts`, `web/lib/expert/session.ts`, `web/components/expert/ExpertConsole.tsx`, `agents/expert/system-prompt.md`, `agents/probes.json`
- `notes/03-elevenlabs-expert-interaction.md` §6 (question selection and timing) and §8 (record processing delay separately from intentional waiting)

## Prerequisites

Sprint 1 merged into `voice`, and the human gate passed. If the handoff lists open linkage defects, fix those first.

## Scope

### 1. Topic queue and dedup (pure logic, `web/lib/expert/topics.ts`, test-first)
- Each incoming event becomes a **topic candidate**.
- Dedup rule: same `channel_id` (or both null), region IoU ≥ 0.5, within a configurable window (default 20 s) of a previous event → **merge** into the existing topic. Record the new `event_id` as an alias with a `TimingMark topic_queued`, and don't create a new question.
- Merged events remain stored as evidence. The exchange keeps the **primary** event_id, plus `related_event_ids` (add to contracts if missing; document it).
- Topic states: `queued`, `released`, `asked`, `answered`, `deferred_to_debrief`, `dropped_off_record`.
- **Ambiguous / unresolved** mapping → the topic's first question must be `clarify_reference`. Its answer never counts as an interpretation of a region.
- **Staleness:** if a topic has waited longer than a threshold (default 30 s), or a newer non-duplicate event has arrived on another region, the release text tells the agent to refer to the preserved moment explicitly ("the region you pointed at a moment ago on SYS1…").
- **Live question budget:** about 3–5 live questions per 10 minutes, configurable. Beyond the budget, topics go to `deferred_to_debrief` (Sprint 3 consumes these). Never drop them silently.

### 2. Pause-aware release
Implement the mechanism recommended in the capabilities doc. The default design if it was verified:
- Events are **queued**, not sent straight to the agent.
- A release controller watches the conversation state: user speaking/VAD, the agent's speaking mode, and the time since the last user final line.
- A topic is released (contextual update with the `[POINTING_EVENT]` text) only when:
  - the agent is not speaking,
  - there is no ongoing user speech, and
  - the user has been quiet for at least `pause_ms` (configurable, start at ~1200 ms; tune in the human gate).
- Only **one** topic is released at a time. The next waits until the current exchange has an answer, or the expert moves on.
- In parallel, tune turn-taking settings on the expert agent (turn timeout or eagerness, per the capabilities doc) through `sync-agents` or documented dashboard steps.
- Prompt changes:
  - When the expert is clearly mid-explanation, don't jump in. If a skip-turn or stay-silent system tool exists, use it.
  - When the expert has already answered what a topic would ask, either skip the question or ask a deeper one (reasoning, distinction, guardrail).
  - Make sure at least one live question targets a guardrail ("When would you not trust this?", "When would you stop and ask someone?") once the basic interpretation is given.
- **Document the prototype's limitation** in the handoff: speech silence is not proof that the expert has finished thinking, and say what the prototype can and cannot detect.
- Fallback if client-side gating isn't possible: release immediately and rely on prompt restraint plus turn-taking settings. Document that clearly.

### 3. Timing report (`web/lib/expert/timing.ts`, test-first)
For each exchange compute:
- **processing latency** = event_received → topic ready (our processing)
- **intentional wait** = topic ready → topic_released (deliberate pause-waiting)
- **agent latency** = topic_released → question_tool_called → agent_speech_started

Also count how many agent turns started while the user was speaking (should be 0). Write `timing-report.md` into the session folder and show a compact table in the ExpertConsole.

### 4. Question tagging
Each exchange keeps `phase: "live"` and `kind`. Expose live counters in the console: live questions, guardrail questions, deferred topics, unlinked agent questions, interruptions. The counters must be derived from stored records, not tracked separately.

### 5. Scripted fixture run
Add a "Run fixture scenario" helper to the console. It injects `evt-001`, `evt-003` (duplicate of 001), `evt-002` and `evt-004` (ambiguous) at configurable offsets, so the human can talk through a realistic 3–5 minute task. Fixtures stay labeled.

### 6. Probes
Add cases and report pass counts (≥ 4/5):
- duplicate event → no second question
- ambiguous event → clarify_reference first
- after interpretation is given → the next question is reasoning, distinction or guardrail, not a repeat
- expert says "usually" → asks about the exceptions
- a stale-topic release → the question explicitly refers to the earlier moment

## Out of scope

Debrief, coverage tracking, teach-back and confirmation (Sprint 3). Off-record behavior beyond "don't release off_record topics" (Sprint 4).

## Acceptance criteria

- `npm run typecheck` and `npm test` pass. Tests cover:
  - dedup (IoU and window edges)
  - ambiguity → clarify first
  - staleness wording flag
  - budget overflow → deferred
  - release gating conditions (each condition blocks release)
  - timing calculations
- Probe cases pass ≥ 4/5 (counts reported).
- In the scripted fixture scenario, the stored records show ≥ 3 live questions, ≥ 1 with `kind: guardrail`, 0 duplicate questions for evt-001/evt-003, and a clarify_reference exchange for evt-004.
- `timing-report.md` separates processing latency from intentional wait.
- The handoff note documents the tuned `pause_ms`, the turn-taking settings and the limitations.

## Human gate (for the human, ~30 min)

1. In the sprint worktree, run `cd web && npm run dev -- -p 3102`, open http://localhost:3102, and start an expert session and press "Run fixture scenario". Talk through the task like a real expert, including long explanations and thinking pauses.
2. **Check:**
   - the agent never talks over you
   - questions come at natural pauses
   - pointing twice at the same spot does not cause two questions
   - you are asked to clarify the ambiguous event
   - at least one guardrail question comes up
3. Open `timing-report.md` and confirm the interruption count is 0 and the waits look deliberate. If the agent feels too eager or too slow, adjust `pause_ms` or the turn-taking settings with the agent, and rerun.
4. If satisfied, merge the branch into `voice`, from the main checkout once it's clean and no other agent is mid-commit: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff ws3/sprint-2-live-interview`. Then remove the worktree: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-2`.

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
