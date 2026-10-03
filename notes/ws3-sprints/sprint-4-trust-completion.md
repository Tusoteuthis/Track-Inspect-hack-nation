# WS3 Sprint 4 — Off-record, session completion, demo evidence & WS5 handoff

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 4**, the final WS3 sprint. Make the expert session **trustworthy and complete**:
- Off-record material is excluded consistently.
- Incomplete sessions end honestly.
- The demo has exportable evidence (transcript, counts, timing).
- WS5 has a documented interface to consume our output and reuse our voice component.

Context sections A1–A8 below apply in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **4**
- Slug = **trust-completion**
- Branch = **`worktree-ws03-sprint-4`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-4`**
- Dev-server port = **3104**

**First action:** run the A6 location check at the bottom of this prompt. It confirms you are in your worktree, or creates it if you were started in the main checkout. Do not edit anything in the main checkout.

## Read first

- `notes/ws3-sprints/handoff-sprint-3.md` (and the earlier handoffs)
- `notes/ws3-sprints/docs/elevenlabs-capabilities.md`, especially Q6 (history and audio retrieval), Q7 (retention, zero-retention, deletion) and "Recommended mechanisms (f)"
- `notes/03-elevenlabs-expert-interaction.md` §3 (off-record), §9 (deliverables) and §11 (acceptance criteria)
- `notes/project-brief.md` §7 ("Trust" row and demo question 5)
- `notes/05-knowledge-newcomer-tutor.md` (what WS5 consumes) and `notes/07-frontend-user-experience.md` §5 (WS7 shows off-record from acknowledged state, not a local toggle)
- All of `web/lib/expert/`, `web/components/expert/ExpertConsole.tsx`, `web/components/voice/VoiceSession.tsx`

## Prerequisites

Sprint 3 merged into `voice`, and the human gate passed.

## Scope

### 1. Off-record (test-first for all logic)
- **Triggers:**
  - The expert says "off the record" / "stop recording", and the agent calls the client tool `set_record_state({ state: "off_record" })`. "Back on the record" sets it back on.
  - A console toggle.
  - Events arriving with `record_state: "off_record"`.
- Each change creates a `RecordingSegment`. The agent should briefly acknowledge the change ("Okay, off the record."), and the UI shows the **acknowledged** state.
- **Exclusion rules (local):**
  - Transcript lines, exchanges, coverage notes, draft steps and timing marks whose time falls inside an off-record segment are **never written to disk**. They are dropped in memory before the snapshot is built, not just flagged.
  - Off-record events are not released as topics and never become evidence. Their images are not copied or linked.
  - The persisted record keeps only a neutral marker, "off-record segment from T1 to T2 (content excluded)", plus counts in `SessionCompletion.excluded`.
  - The draft builder and gap selector must never see excluded content. Test this with an off-record answer that would otherwise fill a gap: the gap stays open.
  - Revisions already created from content that later becomes excluded: if the expert asks to strike something retroactively ("forget what I just said"), support removing the last exchange. Mark dependent revisions as superseded and require a re-confirmation. Simplest correct behavior: invalidate the current confirmation and say so.
- **ElevenLabs side:** apply what the capabilities doc found:
  - If per-conversation deletion or zero-retention is available on our plan, implement it (for example a server route that deletes the conversation after the session when any off-record segment occurred, or zero-retention configured on the expert agent through sync-agents). Clearly show the result in the console.
  - If not available, **say so explicitly** in the console and in `notes/ws3-sprints/docs/trust.md`. The audio passes through ElevenLabs for the live conversation, and its retention is governed by account settings. Never claim more than is true.
- Note for the demo: personal data on screen is WS2's concern (capture). Mention the boundary in `notes/ws3-sprints/docs/trust.md`.

### 2. Session completion and incomplete sessions
- On Stop, disconnect or error: build `SessionCompletion` with
  - `end_reason`
  - `confirmed_revision_id` (null unless an explicit confirmation of the latest revision exists)
  - final coverage
  - unresolved open questions
  - excluded counts
  - question counts (live, live guardrail, debrief), derived from stored records
- Write `completion.json` and `completion.md`.
- An incomplete session states plainly what was not finished ("teach-back not confirmed", "2 gaps unresolved"). It never claims full understanding.
- Reconnect handling: if the ElevenLabs connection drops mid-session, the session state survives (it lives in the client store and on disk). A new conversation can resume the same session id in the same phase, using a contextual update with a summary of the state, not the transcript. Mark this best-effort and document it.

### 3. Demo evidence export
- `demo-evidence.md` per session:
  - challenge checklist with ✓/✗ and links: ≥ 3 live questions at pauses, ≥ 1 guardrail, ≥ 3 debrief questions on unanswered matters, explicit teach-back confirmation or correction, evidence links per step and guardrail, off-record handling
  - annotated transcript (phase, event, exchange and timing per line)
  - the timing table from Sprint 2
  - what was **live** vs **fixture**
- A console button "Export demo evidence". The content is derived purely from stored records, and it's tested.

### 4. WS5 / WS6 / WS7 handoff docs
- `notes/ws3-sprints/docs/voice-interface.md`:
  - how WS5 reuses `VoiceSession` (props, client tools pattern, contextual updates, the token route, adding a flow in `flows.ts`, sync-agents/probe usage for the tutor agent)
  - the session folder layout and file semantics WS5 should consume (`knowledge-draft.md`, `revisions/`, `confirmations.json`, `exchanges.json`)
  - eligibility rule: only `confirmed` steps from the latest confirmed revision are teaching material, and off-record content is absent by construction
  - the `synthesis.ts` interface WS5 can replace
- `notes/ws3-sprints/docs/trust.md` — off-record semantics end to end, the ElevenLabs retention facts with sources, the limits, and the answer-key separation.
- Update `notes/ws3-sprints/docs/contracts-v0.md` to the final field set (bump to `ws3.v1` if fields changed since v0, and list the changes).

### 5. Probes (≥ 4/5 each)
- "Off the record — …" → `set_record_state off_record`, a short acknowledgement, no questions about the off-record content afterwards.
- "Back on the record" → state restored.
- "Forget what I just said" → the strike is handled and acknowledged.

## Out of scope

The tutor itself (WS5), the polished UI (WS7), the shared backend (WS6), glasses audio routing (WS2).

## Acceptance criteria

- `npm run typecheck` and `npm test` pass. Tests cover:
  - off-record content absent from **every** persisted file (scan the snapshot output for a sentinel phrase spoken during the off-record segment)
  - off-record events are never released
  - off-record answers do not close gaps
  - retroactive strike invalidates the confirmation
  - completion counts are derived from records
  - an incomplete session is never marked confirmed
  - demo-evidence checklist logic
- Probes pass ≥ 4/5 (counts reported).
- `notes/ws3-sprints/docs/voice-interface.md` and `notes/ws3-sprints/docs/trust.md` exist, and the contracts doc is updated.
- The ElevenLabs-side retention behavior is implemented or explicitly documented as a limitation.
- Handoff note `notes/ws3-sprints/handoff-sprint-4.md` written, including a final "WS3 status vs §11 acceptance criteria" table.

## Human gate (for the human, ~20 min)

1. In the sprint worktree, run `cd web && npm run dev -- -p 3104` and open http://localhost:3104. Run a full session. Midway, say "off the record", say a sentinel phrase (for example "pineapple calibration"), then say "back on the record".
2. After stopping, search the session folder for the phrase: `grep -ri pineapple <worktree>/knowledge/sessions/<id>/` must return nothing.
3. Check the console and `notes/ws3-sprints/docs/trust.md` for the ElevenLabs-side retention status.
4. Stop a second session before the teach-back and confirm that `completion.md` says incomplete.
5. Open `demo-evidence.md`. All challenge rows should be ✓ for the full session.
6. If satisfied, merge the branch into `voice`, from the main checkout once it's clean and no other agent is mid-commit: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff worktree-ws03-sprint-4`. Then remove the worktree: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws03-sprint-4`. WS3 is done; hand `notes/ws3-sprints/docs/voice-interface.md` to WS5.

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
WT_ROOT=$REPO/.claude/worktrees
WT=$WT_ROOT/ws03-sprint-N
BR=worktree-ws03-sprint-N
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

**Subagents for lanes.** Subagents work inside **your** worktree: run them sequentially if they touch the same files. For true parallelism, give each lane its own nested worktree under `$WT_ROOT/ws03-sprint-N-lane-X`, branched from `$BR`, and merge the lanes into `$BR` yourself. These lane worktrees and branches are yours to create and remove.

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
Branch: worktree-ws03-sprint-N   Worktree: <path>   Dev port: 310N   Spec: specs/<timestamp>-ws3-sprint-N-<slug>/   Date: <date>
## Delivered (files + one line each)
## Verification evidence (pasted command output: typecheck, vitest summary, probe pass counts)
## Decisions made (and why) — especially anything that deviates from the sprint prompt
## Contract changes (fields added/renamed in web/lib/expert/contracts.ts)
## Known limitations / open issues
## Human gate checklist (exact steps for the human to run live, and what to look for)
## Notes for the next sprint
```
