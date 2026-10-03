# WS3 Sprint 3 — Coverage tracking, debrief, teach-back, revisioned confirmation & corrections

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 3** of workstream WS3. Sprints 1–2 delivered a well-behaved, evidence-linked live interview. This sprint delivers the **Map** half of the challenge:
1. Track what the captured material does and does not explain (**coverage**).
2. When the expert signals the task is done, run a **debrief** of ≥ 3 questions about genuinely unanswered matters.
3. Produce a numbered **draft revision** of the workflow and deliver a spoken **teach-back** of it.
4. Handle **corrections**: a correction creates a new revision that is re-checked.
5. Record an explicit, auditable **confirmation** tied to the exact revision reviewed. Silence never confirms.

This is the second high-risk design piece. Context sections A1–A8 below apply in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **3**
- Slug = **debrief-confirmation**
- Branch = **`ws3/sprint-3-debrief-confirmation`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-3`**
- Dev-server port = **3103**

**First action:** follow section A6 at the bottom of this prompt to create your worktree. Do not edit anything in the main checkout.

## Read first

- `notes/ws3-sprints/handoff-sprint-2.md`, `handoff-sprint-1.md`, `handoff-sprint-0.md`
- `notes/ws3-elevenlabs-capabilities.md`, especially Q2 (client tools with return values), Q8 (per-session overrides, dynamic variables) and "Recommended mechanisms (d)"
- `notes/03-elevenlabs-expert-interaction.md` §4 (output records), §5 (states 6–8), §7 (debrief and completion logic)
- `notes/05-knowledge-newcomer-tutor.md` §4–5. WS5 owns synthesis long-term. Your coverage tracker and draft builder are a **stand-in behind an interface** WS5 can replace, and both must keep the same evidence IDs.
- `web/lib/expert/contracts.ts`, `session.ts`, `topics.ts`, `timing.ts`, `agents/expert/system-prompt.md`

## Prerequisites

Sprint 2 merged into `voice`, and the human gate passed.

## Scope

### 1. Coverage tracking (`web/lib/expert/coverage.ts`, test-first)
- Dimensions per topic/event, plus one session-level row: `decision`, `reason`, `cues`, `alternatives`, `guardrails`, `unresolved` (`CoverageItem` in contracts).
- Filled by the agent through a client tool, called **after** the expert's answer:
  - `record_coverage({ exchange_id, dimensions: [{ dimension, status: "partial" | "covered", note }] })`
  - The handler validates that the exchange exists, upgrades statuses monotonically (never downgrades without a correction), and stores `supporting_exchange_ids`. The `note` is AI synthesis, stored as such, and never mixed with verbatim answer lines.
- Deferred topics from Sprint 2 (`deferred_to_debrief`) automatically become missing coverage or `OpenQuestion`s.
- A **gap selector** produces the ordered debrief agenda from missing/partial dimensions and open questions. It is deterministic and tested. It must exclude anything already covered, so the debrief never repeats answered questions. Prioritize guardrails and alternatives, and topics with no reason given.
- Put the coverage and draft logic behind `web/lib/expert/synthesis.ts`, an interface such as `getGaps(state)` and `buildDraft(state, parentRevision?)`, so WS5 can swap in its implementation.

### 2. Phases and debrief
- Phases: `live` → `debrief` → `teach_back` → `confirmed` | `incomplete`.
- Transition to debrief:
  - the expert says they're done (the agent calls `signal_task_complete()`), or
  - a console button for dev.
- Switch the agent's behavior using the mechanism recommended in the capabilities doc. Default: a contextual update carrying a `[PHASE debrief]` block with the gap agenda (gap ids + plain descriptions, no interpretations), plus prompt sections per phase.
- In debrief, `begin_question` is called with `phase: debrief`, `kind: gap` and a `gap_id`; extend the tool params and contracts and document it. Ask ≥ 3 debrief questions, one at a time. Answers update coverage. Stop when material gaps are resolved or the expert explicitly says something is unknown or needs escalation; that is valid knowledge and becomes a guardrail step.
- Live-question counters must not change during the debrief, and vice versa.

### 3. Draft revisions and teach-back
- `buildDraft` creates `DraftRevision rev-n`, an ordered list of workflow steps, decisions, guardrails and exceptions.
- Each step lists `supporting_event_ids` **and** `supporting_exchange_ids`. A step without both is flagged as unsupported and is **not** spoken as fact; it becomes a debrief gap instead.
- Step `text` is AI synthesis, written in process terms ("First check…, if … then …, stop and escalate when …"). It may quote the expert, but quotes must be copied verbatim from the answer lines (enforced by a test: every quoted span must appear in a linked answer line).
- **Generating the step text:** prefer having the ElevenLabs agent compose it through a tool call. Option A: `propose_draft({ steps: [...] })`; the client validates the evidence ids and assigns `rev-n`. Alternatively, call an LLM server-side in a route if Sprint 0 found that more reliable. Either way, the client is the authority for revision ids and evidence links. Record the choice in the handoff.
- The teach-back is delivered from the **current revision**. The agent receives a `[TEACH_BACK rev-n]` block and explains the process as something someone else could apply, not as a transcript summary. It then asks explicitly whether that is right.
- `revisions/rev-n.json` and `revisions/rev-n.md` are written to the session folder. Revisions are **immutable** once created.

### 4. Correction and confirmation
- `confirm_revision({ revision_id, status: "confirmed" | "corrected" | "unresolved", step_ids_reviewed })` is called only after an explicit verbal response from the expert. The handler:
  - rejects a stale `revision_id` (not the current one)
  - links `expert_response_exchange_id` to the exchange holding the expert's words
  - creates an `ExpertConfirmation`
- `corrected` → the agent asks or records what changes. The draft builder creates `rev-n+1` with `parent_revision_id` and a `change_reason` that references the correction exchange. Only the affected steps are re-taught and re-checked. The final confirmation must reference the **latest** revision.
- **Silence is not confirmation.** If there is no explicit response, nothing is confirmed. If the session ends without confirmation, the phase is `incomplete`.
- Write `confirmations.json` and update `exchanges.md` and `session.json`. Add `knowledge-draft.md`: the confirmed (or latest) revision rendered for WS5, with every step linked to its event images and the verbatim expert quotes, verification status per step (`confirmed`, `unresolved`) and the open questions.

### 5. Console
- phase indicator
- coverage grid (event × dimension)
- debrief agenda with done/remaining
- revision list with diff to the parent
- confirmation status
- counters: live questions, live guardrail questions, debrief questions

### 6. Probes (≥ 4/5 each)
- The debrief only asks about gaps on the agenda and never repeats a covered topic.
- The teach-back is process-shaped and ends with an explicit confirmation question.
- Expert says "that's wrong, it's only when …" → `confirm_revision status=corrected`, no `confirmed`.
- Expert stays silent or changes the subject → no `confirm_revision confirmed`.
- Expert says "I don't know, I'd escalate that" → recorded as a guardrail, not pushed further.

## Out of scope

Off-record exclusion, incomplete-session finalization, demo export and the WS5 interface doc (Sprint 4). Teaching the newcomer (WS5).

## Acceptance criteria

- `npm run typecheck` and `npm test` pass. Tests cover:
  - monotonic coverage
  - the gap selector excludes covered items
  - deferred topics become gaps
  - unsupported steps are flagged
  - the verbatim-quote check
  - immutable revisions
  - stale revision_id rejection
  - correction → new revision with parent and change_reason
  - no confirmation without an explicit-response exchange
- Probes pass ≥ 4/5 (counts reported).
- An end-to-end fixture session produces:
  - ≥ 3 debrief exchanges with `phase: debrief`, each tied to a gap that was missing before the debrief
  - ≥ 2 revisions when a correction is made
  - a final `ExpertConfirmation` referencing the latest revision
  - `knowledge-draft.md` with evidence links for every step and guardrail
- Handoff note written, including the draft-generation choice and its limitations.

## Human gate (for the human, ~45 min)

1. In the sprint worktree, run `cd web && npm run dev -- -p 3103`, open http://localhost:3103, then run the full fixture scenario from Sprint 2, then say "I'm done".
2. **Check:** the debrief asks ≥ 3 questions you hadn't already answered.
3. Listen to the teach-back and **deliberately correct one point**. **Check:** the agent re-teaches the corrected part and asks again, and the confirmation references the newer revision.
4. Confirm. Open `knowledge-draft.md`. **Check:** every step links to an image and your verbatim words, and nothing is quoted that you didn't say.
5. If satisfied, merge the branch into `voice`, from the main checkout once it's clean and no other agent is mid-commit: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation merge --no-ff ws3/sprint-3-debrief-confirmation`. Then remove the worktree: `git -C /Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation worktree remove /Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws3-sprint-3`.

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
