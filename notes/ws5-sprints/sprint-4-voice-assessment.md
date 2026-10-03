# WS5 Sprint 4 — Voice tutor, screen observation, assessment & trust

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 4** of workstream WS5. Make the tutor **speak**: an ElevenLabs newcomer agent that asks what the learner notices, delivers Sprint 3's evaluation feedback and cites the expert. Define what the tutor consumes from the **learner's screen**. Produce an **honest learning assessment**. Prove that **revocation and off-record** never leak into teaching. Finish with the **end-to-end demo** from a captured expert statement to an unseen case. Context sections A1–A8 below apply in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **4**
- Slug = **voice-assessment**
- Branch = **`worktree-ws05-sprint-4`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-4`**
- Dev-server port = **3504**

## Read first

- `notes/ws5-sprints/handoff-sprint-3.md`, `web/lib/knowledge/`
- `notes/05-knowledge-newcomer-tutor.md` §7–12
- WS3: `notes/ws3-sprints/docs/voice-interface.md` (WS3 Sprint 4, voice reuse for the tutor), `notes/ws3-sprints/docs/elevenlabs-capabilities.md`, `web/components/voice/VoiceSession.tsx`, `web/lib/voice/flows.ts` (the `tutor` flow already exists)
- WS6: `notes/ws6-api-v0.md`, the newcomer/evaluation/commit/assessment routes and SSE events (Sprints 3–4)
- WS7: `notes/ws7-sprints/` handoffs, especially the newcomer practice screen and screen-share capture
- `web/scripts/sync-agents.mts`, `web/scripts/probe-agents.mts`, `agents/manifest.example.json`

## Prerequisites

WS5 Sprint 3 merged into `voice`. If not, stop and tell the human. For the **live** gate you also need WS6 Sprint 3 (commit guard) and a newcomer screen (WS7 S3, or the dev harness below). If they are missing, finish everything that is verifiable with V1/V2 checks and list what blocks the live gate.

## Scope

### Lane A — Tutor agent (`agents/tutor/`, V2 probes)

1. `agents/tutor/system-prompt.md` and the first message. Behavior:
   - asks what the learner notices or would decide **before** explaining
   - one question at a time; responsive, not a quiz on every step
   - delivers evaluation feedback (`guiding_question` first, then the expert's reasoning with the quote)
   - **never states a domain rule that isn't in the delivered citations**
   - says plainly when the knowledge doesn't cover something, and follows the escalation rule
   - never claims the learner has "mastered" something after one coached correction
2. How the tutor gets context follows the mechanism recommended in `notes/ws3-sprints/docs/voice-interface.md` / the capabilities doc (e.g. contextual updates carrying `[EVALUATION eid outcome …]` blocks with citations, and dynamic variables for the session). Knowledge reaches the agent **only** as the cited, eligible snippets for the current evaluation, never as a bulk knowledge-base upload of all entries. The evaluator notes never reach it.
3. Client tools only if they are needed and documented. For example, `request_evaluation()` lets the agent trigger WS6's evaluation route when the learner says "I'd save this". Keep the save gate on the server.
4. Wire the tutor in `agents/manifest.json` (shared file: minimal change, explained in the handoff). Push with `npm run sync-agents -- --agent tutor` **only**.
5. Probes in `agents/probes.json` (tutor cases; minimal shared-file change), each passing ≥ 4/5:
   - asks before telling;
   - cites only the delivered quotes;
   - refuses to invent a rule for an uncovered case;
   - doesn't interrupt the learner's draft;
   - no mastery claims.

### Lane B — Screen observation contract (`web/lib/knowledge/observation.ts`)

1. Define what the evaluator and tutor consume from the learner's screen: `LearnerScreenContext { frame_asset_id | null, region | null, visible_case_id, draft_rev, captured_at_utc, source: "screen_share" | "app_state" }`. WS7 captures it (screen share or app state); WS6 stores it as `visual_context`. Document the hand-over in `notes/ws5-sprints/docs/knowledge-schema-v0.md`.
2. The tutor's question refers to what is visible on the learner's screen (the region they selected or are looking at), not just the draft text. The challenge requires observing the learner's own screen; record honestly in the handoff which part is real screen observation and which is structured app state.

### Lane C — Assessment (`web/lib/knowledge/assessment.ts`)

1. `buildAssessment({ timeline, evaluations, commits, knowledge })` returns `{ session_id, decisions: { draft_rev_initial, outcome_class: "correct_unassisted" | "correct_after_help" | "unresolved_or_escalated", interventions, cited_entries }[], skills_demonstrated, needed_help_with, practice_next, limitations, source }`.
   - `practice_next` is derived from entries cited in interventions.
   - `limitations` always states that one coached correction is not proof of independent mastery. If a second, reduced-help case was done, it reports transfer separately.
2. `renderAssessmentMarkdown()` for `knowledge/assessments/<sid>.md`. The adapter implements WS6's assessment module interface.

### Lane D — Trust propagation and end-to-end proof

1. WS5-level tests:
   - revoking an entry removes it from `selectEligible`, and a pinned session that cites it gets `knowledge_changed` semantics (via WS6 if merged);
   - entries depending on revoked evidence are flagged;
   - off-record exchanges never appear in synthesis, retrieval, evaluation citations, agent context blocks or assessments (one test walks every output path);
   - assessments and evaluator notes are never eligible as knowledge.
2. `web/lib/knowledge/dev/e2e-ws5.mts` runs the chain on the real modules: expert fixture (or a live session, if WS3 is merged) → synthesis → confirmation → pin → unseen case → wrong draft → `intervene` with citation → revised draft → `ok` → commit (via WS6 routes if merged) → assessment. It prints the ID chain from the expert's quote to the learner's feedback.
3. **Dev harness (only if WS7's newcomer screen isn't merged):** `web/app/dev/ws5-tutor/page.tsx`, clearly marked DEV ONLY. It shows a trace image, a draft decision/reason form with a Save button that goes through the WS6 commit route, and the `VoiceSession` on the `tutor` flow. Delete or hide it once WS7's screen exists.

## Out of scope

Polished UI (WS7), the backend guard itself (WS6), expert conversation (WS3), multi-expert, multilingual.

## Acceptance criteria

- `npm run typecheck` and `npx vitest run` pass. Tests cover the assessment classes and limitations text, trust propagation across every output path, and the screen-context contract.
- Tutor probes pass ≥ 4/5 (counts pasted).
- `e2e-ws5.mts` output is pasted, showing the expert-quote → intervention → corrected commit → assessment chain, with live vs fixture parts labelled.
- `notes/ws5-sprints/handoff-sprint-4.md` is written, mapping **every acceptance criterion of `notes/05-knowledge-newcomer-tutor.md` §12** to its evidence, or to "not met + why".

## Human gate (for the human, ~30 min live voice)

1. From the worktree: `cd web && npm run dev -- -p 3504`. Open the WS7 newcomer screen, or `/dev/ws5-tutor`.
2. Act as the newcomer on the unseen case. **Check:** the tutor asks what you notice before explaining.
3. Make a deliberately wrong decision and try to save. **Check:**
   - The save is blocked.
   - The tutor asks a guiding question, then explains with the expert's own words.
   - You can open the expert's evidence image.
4. Correct and save. **Check:** the assessment says "correct after help", names what to practise, and claims no mastery.
5. Revoke the cited entry (WS6 route or script) and retry. **Check:** the tutor no longer uses it.
6. Merge into `voice` if satisfied (same pattern as Sprint 1). Hand the e2e output and assessment to WS1 for the pitch.

---

## A. Shared project context (identical in every WS5 sprint prompt)

### A1. The product in one paragraph

We are building an **AI Apprentice for railway sensor traces** for Challenge 1 ("The AI Apprentice") of the 7th Global AI Hackathon, powered by ElevenLabs. An experienced railway engineer (the **expert**) wears **Meta Ray-Ban smart glasses** and looks at **sensor traces on a screen**. They **physically point with a finger** at a trace region. An iPhone app (WS2) detects the gesture and emits a **PointingEvent** with image evidence. An **ElevenLabs voice agent** (WS3) asks the expert what they see, why, and when they would be unsure. After a spoken **debrief** and a **teach-back** that the expert **confirms or corrects**, the knowledge is saved as Markdown plus linked images. A **newcomer** then works on a trace the expert never showed. A voice tutor catches a wrong decision **before it is saved** and explains it using the expert's own reasoning. **We are WS5**: we own what that knowledge *means* and how the tutor *uses* it.

Core loop: *expert points → app identifies the visual reference → voice agent asks → expert explains → apprentice clarifies and confirms → knowledge is persisted → newcomer learns on an unseen trace.*

### A2. Non-negotiable scope rules

- **Sensor traces on a screen only.** No technical drawings, railway plans, field maintenance, dataset labelling or classifier training.
- **WS5 is domain logic only.** We write pure TypeScript modules: schema semantics, synthesis, eligibility and retrieval, tutor evaluation, assessment, and the tutor agent's prompt. **WS6** owns routes, storage, jobs, locks and server-side commit enforcement. **WS7** owns every screen, including the Work Map and the newcomer UI. Do not build competing routes, stores or polished UI. A dev-only harness is allowed only where a sprint says so.
- **No invented domain knowledge.** WS5 never defines what a curve means, never adds decision categories, and never hardcodes labels. Interpretations come only from the expert's confirmed words. The newcomer task stays **generic**: *draft decision + reason → review → commit*, until WS4 and the expert define it.
- **Expert words are verbatim and kept separate from AI synthesis.** Never synthesize a quote. Every quoted span must appear in a linked expert answer line. Keep qualifiers ("usually", "only if"). Never promote speculation or a transcript summary into a confirmed rule. Unknowns stay `null`.
- **Every workflow step and guardrail links to both a screen moment (event / image region) and the expert's own words (exchange).** Never fabricate a one-to-one match to fill a field.
- **Session time ≠ signal time.** Never derive one from the other, and never read numbers or timestamps off a photographed curve.
- **Only eligible knowledge teaches.** The tutor sees only `confirmed`, current, non-revoked revisions whose evidence is on-record. Drafts, unresolved, revoked, off-record-derived, assessment records and evaluator notes never reach the tutor's prompt, retrieval or tools.
- **No answer key, no case-specific code.** WS4's evaluator notes are never loaded. No `if (case_id === …)`. Tutor success must come from captured expert knowledge applied to the visible case.
- **When knowledge is insufficient, ask or escalate; don't invent.** A confirmed instruction to escalate is valid knowledge.
- **Fixtures are labelled.** Everything derived from fixtures carries `source: "fixture"`, and the demo must show what is live and what is fixture.

### A3. Challenge requirements WS5 must make demonstrable

| Requirement | WS5 part |
|---|---|
| Debrief ≥ 3 follow-up questions not answered during the task | We supply genuine **gaps** to WS3 (missing reason, unclear guardrail, conflict, unqualified exception). Never manufacture gaps. |
| Teach-back the expert confirms or corrects | We supply the process-level **teach-back text** from the current revision. Confirmation binds to that exact revision. |
| Every step and guardrail links to a screen moment and the expert's words | Our entry schema and Work Map content guarantee it; broken links are reported, never hidden |
| Newcomer processes a case the expert never showed | Retrieval and evaluation work from knowledge plus the visible case, never from the case ID |
| Catch ≥ 1 wrong decision before it is saved, explained with the expert's reasoning | Our `TutorEvaluator` returns `intervene` with verbatim citations. WS6 blocks the commit. |
| Learning outcome | Our assessment separates *correct unassisted* / *correct after help* / *unresolved or escalated* and says what to practise next, without claiming mastery from one coached correction |
| Trust | Revoked or off-record material never reappears via synthesis, retrieval or cached pins |

### A4. Workstream map (who owns what)

| WS | Owns | Relationship to WS5 |
|---|---|---|
| WS1 | Pitch, business case | Consumes our demonstrated learning flow; only claims backed by evidence |
| WS2 | Glasses/iPhone capture, PointingEvent | Indirect: its events arrive through WS3/WS6 records |
| WS3 | Expert conversation, ElevenLabs adapter, debrief, teach-back delivery, confirmation tool | **Produces** exchanges, draft revisions and confirmations. Its Sprint 3 puts coverage/draft logic behind `web/lib/expert/synthesis.ts` (`getGaps`, `buildDraft`) **for us to replace**. Its Sprint 4 writes `notes/ws3-sprints/docs/voice-interface.md` for our tutor. |
| WS4 | Trace cases, task definition, evaluator notes | Supplies learner-visible cases; the evaluator answer key must never reach us at runtime |
| **WS5 (us)** | Knowledge schema semantics, synthesis, eligibility/retrieval, tutor evaluation, assessment, tutor agent prompt | — |
| WS6 | Backend: routes, Markdown/JSON store, jobs, confirmation binding, commit guard | **Hosts** our modules in `web/lib/backend/modules.ts` (`SynthesisModule`, `TutorEvaluator`, eligibility, assessment) with labelled stubs until ours land. Enforces our outcome policy. |
| WS7 | Web frontend, including Work Map and newcomer UI, screen-share capture | Renders our content; we define the meaning, not the pixels |

Full briefs: `notes/project-brief.md`, `notes/05-knowledge-newcomer-tutor.md` (**our brief**), `notes/03-elevenlabs-expert-interaction.md` + `notes/ws3-sprints/`, `notes/06-backend-integration.md` + `notes/ws6-sprints/` (if merged), `notes/04-prototype-data-scenarios.md`, `notes/07-frontend-user-experience.md`. Our plan: `notes/ws5-sprints/sprint-plan.md`.

### A5. Repository state you start from

Repo root (shared main checkout, **read-only for you**, see A6): `/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation`. Base branch: **`voice`**. WS3, WS6 and WS7 merge into `voice` in parallel, so **always check what has already been merged** before creating anything (`git log --oneline voice`, `ls web/lib web/lib/*`, `ls notes/*-sprints/handoff-*`).

```
agents/                    ElevenLabs agent config (manifest/probes examples); "tutor" agent = ELEVENLABS_AGENT_ID_TUTOR
notes/                     Briefs and plans. Ours: notes/05-knowledge-newcomer-tutor.md + notes/ws5-sprints/
web/                       Next.js 16 / React 19 / TypeScript strict (path alias "@/*" → web/*)
  lib/voice/               flows.ts (expert | tutor), transcript.ts
  lib/expert/              WS3: contracts.ts (PointingEvent, ExpertExchange, DraftRevision, ExpertConfirmation …), synthesis.ts (Sprint 3)
  lib/contracts/           WS6: zod transport contracts "ws6.v0" (KnowledgeRevision, LearnerDraft, Evaluation, Assessment …)
  lib/backend/             WS6: store, jobs, modules.ts (hosts our modules), commit-policy.ts, outcome-policy.json
  lib/knowledge/           **WS5 (ours)**: all our modules live here
  fixtures/ws5/            **WS5 (ours)**: labelled fixtures
  scripts/                 sync-agents.mts, probe-agents.mts (text-only simulateConversation), tts-roundtrip.mts
knowledge/                 runtime Markdown + images written by WS6 (entries/<id>/rev-<n>.md, workflow.md, assessments/)
.specify/ + .claude/skills/speckit-*   spec-kit 1.0.4
```

Code style: small focused modules, pure functions where possible, comments only where the "why" is non-obvious, strict TypeScript, no `any`. Match the style of `web/lib/voice/transcript.ts`. **Reuse partner types:** import WS3/WS6 contracts; never fork their field meanings. If a field you need is missing, add a WS5-side type that maps to theirs and list the request in your handoff.

**Never invent APIs** (ElevenLabs, LLM providers, WS3/WS6 modules). Check installed typings, official docs and the partner's merged code. For ElevenLabs, read `notes/ws3-sprints/docs/elevenlabs-capabilities.md` (WS3 Sprint 0) first. If something does not exist, say so and choose a documented fallback.

### A6. Git worktree isolation (MANDATORY — other agents work in this repo in parallel)

Several agents work on this repository **at the same time**. The main checkout (branch `voice`) is shared, and other agents may be editing or committing there right now. **You work only in your own git worktree.**

**Hard rules**
- **Never** run `git checkout`, `git switch`, `git reset`, `git stash`, `git clean`, `git rebase`, `git merge` or `git pull` in the main checkout. Don't edit, create or delete files there. Don't run `npm install` or `npm run dev` there.
- **Never** touch another agent's worktree or branch. Don't delete branches or worktrees you didn't create.
- **Stay inside WS5 paths:** `web/lib/knowledge/`, `web/fixtures/ws5/`, `agents/tutor/`, `notes/ws5-sprints/`, `specs/*-ws5-*`. Editing a shared file (`web/package.json`, `agents/manifest.json`, `agents/probes.json`, `.gitignore`, partner code) needs a clear reason in the handoff. Never edit partner modules; request changes in the handoff instead.
- Only push config to the **tutor** ElevenLabs agent (`npm run sync-agents -- --agent tutor`). Never touch the expert agent.
- All file edits, commands, tests, dev servers and commits happen **inside your worktree directory**.

**Worktree layout.** All workstream worktrees live in the shared folder `<repo>/.claude/worktrees/` (next to `ws03-…`, `ws06-…`, `ws07-…`). WS5 sprint `N` uses folder **`ws05-sprint-N`** and branch **`worktree-ws05-sprint-N`**.

**Recommended start: the human launches you inside your worktree** (see `notes/ws5-sprints/HOW-TO-START-AN-AGENT.md`). That is the safest setup, because your whole session (shell, relative paths, spec-kit scripts) then lives in the worktree. You may also have been started in the main checkout. Either way, run this location check **before doing anything else** (replace `N` with the sprint number from "Worktree identity"):

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
WT_ROOT=$REPO/.claude/worktrees
WT=$WT_ROOT/ws05-sprint-N
BR=worktree-ws05-sprint-N
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
- `ls notes/ws5-sprints/` shows these prompts, and the previous sprint's `handoff-sprint-(N-1).md` exists (except for Sprint 1).
- `ls .specify .claude/skills` shows spec-kit, and `.specify/memory/constitution.md` is filled in (WS3 Sprint 0). WS5 **does not write its own constitution**; it follows the shared one.
- `git -C "$WT" status` is clean and on `$BR`.
- The sprint's **Prerequisites** are met.

**Dev server.** Use the WS5 port range: `npm run dev -- -p 350N` (Sprint 1 → 3501, Sprint 2 → 3502, …).

**Spec-kit inside the worktree.** Spec-kit here does not create git branches; your branch is already `$BR`. Other workstreams create specs in parallel, so sequential numbers would collide. When `/speckit-specify` runs `create-new-feature.sh`, pass `--timestamp --short-name ws5-sprint-N-<slug>`. If the skill doesn't let you pass flags, rename the created directory afterwards to `specs/<timestamp>-ws5-sprint-N-<slug>/` and update `.specify/feature.json` to match.

**Subagents for lanes.** Subagents work inside **your** worktree: run them sequentially if they touch the same files. For true parallelism, give each lane its own nested worktree under `$WT_ROOT/ws05-sprint-N-lane-X`, branched from `$BR`, and merge the lanes into `$BR` yourself. These lane worktrees and branches are yours to create and remove.

### A6c. Where WS5 documents live (all inside `notes/ws5-sprints/`)

```
notes/ws5-sprints/
  README.md                         how to run the sprints (for the human)
  HOW-TO-START-AN-AGENT.md          human guide: create the worktree, launch, kickoff, isolation checks, merge
  sprint-plan.md                    overview, decisions, dependencies, open decisions (e.g. D1)
  sprint-1-…md … sprint-4-…md       these paste-ready prompts
  handoff-sprint-N.md               written by each sprint agent at the end
  docs/                             WS5 reference docs produced by the sprints:
    knowledge-schema-v0.md            Sprint 1: entry schema, statuses, invariants, mapping to WS3/WS6 (extended in Sprints 2 and 4)
```

Put every WS5 note you create in this folder (or `docs/`). Don't add WS5 files elsewhere in `notes/`.

### A6b. How every WS5 sprint is executed

1. Read this whole prompt, then do the A6 worktree setup and checks.
2. Read the files listed under "Read first", **from your worktree**, plus every partner handoff merged since the last WS5 sprint (`notes/ws3-sprints/handoff-*`, `notes/ws6-sprints/handoff-*`, `notes/ws7-sprints/handoff-*`). Look especially for "Requests to partner workstreams" addressed to WS5.
3. Use spec-kit: `/speckit-specify` with the sprint's goal, scope and acceptance criteria (naming per A6), then `/speckit-clarify` only if something is truly ambiguous, then `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`. This prompt wins on conflicts.
4. Where the sprint lists **lanes**, parallelize them per A6 "Subagents for lanes" once the types are fixed, then integrate.
5. Use test-driven development for all pure logic (vitest). Run the verification commands (A7) before claiming anything works, and paste the actual outputs into the handoff.
6. Commit in small logical commits on `$BR`, each message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. **Do not merge into `voice`, do not push, and do not remove your worktree.** The human merges after the gate.
7. Write the handoff note `notes/ws5-sprints/handoff-sprint-N.md` (template in A8), commit it, then stop and report to the human with:
   - the worktree path
   - the branch name
   - the dev port
   - the exact human-gate steps, run from the worktree

### A7. Standard verification commands

```bash
cd web
npm run typecheck
npx vitest run
npm run sync-agents -- --agent tutor   # Sprint 4 only; pushes prompt/tools to the TUTOR agent only
npm run probe -- tutor                 # simulated text conversations; run 5x for pass-rate claims
npm run dev -- -p 350N                 # human gate at http://localhost:350N
```

LLM-backed behavior (synthesis phrasing, tutor evaluation, tutor agent) is nondeterministic. A behavior counts as passing only if it holds in **≥ 4 of 5 runs** per case. Report the actual counts. If a required key is missing from `web/.env`, do every step that doesn't need it, list what is blocked, and ask the human. Never fake an LLM or probe result.

### A8. Handoff note template (`notes/ws5-sprints/handoff-sprint-N.md`)

```markdown
# WS5 Sprint N handoff — <title>
Branch: worktree-ws05-sprint-N   Worktree: <path>   Dev port: 350N   Spec: specs/<timestamp>-ws5-sprint-N-<slug>/   Date: <date>
## Delivered (files + one line each)
## Verification evidence (pasted output: typecheck, vitest summary, LLM/probe pass counts)
## Decisions made (and why), especially deviations from this prompt
## Contract/interface changes (WS5 types; mapping to WS3/WS6 contracts)
## Partner integration status (which WS3/WS6 interfaces are real vs stub; how WS6 swaps in our module)
## Known limitations / open issues
## Requests to partner workstreams (WS3, WS4, WS6, WS7)
## Human gate checklist (exact steps, what to look for)
## Notes for the next sprint
```
