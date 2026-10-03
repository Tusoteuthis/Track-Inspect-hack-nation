# WS5 Sprint 2 — Synthesis, gaps, teach-back & Work Map content

> **Status: DONE (2026-10-04)** on branch `worktree-ws05-sprint-2` (typecheck clean, 225/225 tests). See [handoff-sprint-2.md](handoff-sprint-2.md). Still open: the human gate and the merge into `voice`. Don't run this prompt again.

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 2** of workstream WS5. Turn the expert's captured events and exchanges into **draft knowledge entries and a workflow**. Identify **genuine gaps** for WS3's debrief, produce the **teach-back** text, handle **corrections as new revisions**, and produce the **Work Map content** that WS6 serves and WS7 renders. Your modules replace WS3's and WS6's synthesis stubs. Context sections A1–A8 below apply in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **2**
- Slug = **synthesis-workmap**
- Branch = **`worktree-ws05-sprint-2`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation/.claude/worktrees/ws05-sprint-2`**
- Dev-server port = **3502**

## Read first

- `notes/ws5-sprints/handoff-sprint-1.md`, `notes/ws5-sprints/docs/knowledge-schema-v0.md`, `web/lib/knowledge/`
- `notes/05-knowledge-newcomer-tutor.md` §5–6
- WS3: `notes/ws3-sprints/sprint-3-debrief-confirmation.md` (coverage dimensions, gap selector, `DraftRevision`, the `synthesis.ts` interface `getGaps(state)` / `buildDraft(state, parentRevision?)`, the verbatim-quote test) and the merged `web/lib/expert/synthesis.ts` / `coverage.ts` if present
- WS6: `notes/ws6-sprints/sprint-2-knowledge-confirmation.md` (`SynthesisModule.synthesize` signature, revision store, Work Map API shape) and the merged `web/lib/backend/modules.ts` if present

## Prerequisites

WS5 Sprint 1 merged into `voice`. If not, stop and tell the human. WS3 Sprint 3 and WS6 Sprint 2 are **not** required. Implement against the interface signatures in their prompts, and if their code is merged, against the real code. Record which in the handoff.

## Decision to make at the start (record it in the handoff)

**Step text generation.** Default: **deterministic** synthesis. Entries and workflow steps are assembled from coverage dimensions and verbatim quotes with template process phrasing ("Check …", "If … then …", "Stop and escalate when …"), which needs no LLM. Optional: an LLM *rephrasing* pass, only if a provider key is available in `web/.env` and the human agreed. It may only rephrase the synthesis sections, never quotes. Its output must pass `assertQuotesVerbatim` and an "introduces no new domain claim" check (every noun phrase in the synthesis appears in linked expert lines, or the pass is rejected and the deterministic text is kept). If WS3 chose agent-composed drafts (`propose_draft` tool), accept those as input and validate them instead of generating.

## Scope

### Lane A — Synthesis core (`web/lib/knowledge/synthesize.ts`)

1. `synthesize({ events, exchanges, confirmations, prior })` returns `{ entries: KnowledgeEntryContent[] /* new draft revisions only */, workflow: WorkflowDoc, gaps: Gap[], teach_back: TeachBack | null }`. The function is pure and deterministic on the same input.
2. Grouping: one entry per distinct decision, guardrail or exception the expert stated. Several exchanges may support one entry, and one exchange may support several entries. **Never force one-to-one.**
3. Keep the observation, the expert's statement and the AI synthesis separate. Preserve qualifiers. A statement with "usually" and no stated exception produces a gap, not a rule.
4. Exclude off-record exchanges and events **before** synthesis. Add a test that an off-record answer line never appears in any output field.
5. Revisions:
   - unchanged inputs produce no new revision (content hash);
   - changed support produces `rev-(n+1)` with `parent_revision_id` and a `change_reason` referencing the exchange;
   - a correction affects only the entries it touches, and dependent entries (sharing that evidence) are flagged for re-confirmation.
6. `WorkflowDoc`: an ordered list of steps in **logical decision order**, not recording order. Each step references `entry_id@revision_id`, and the session timeline is kept as secondary metadata. `renderWorkflowMarkdown(doc)` produces `knowledge/workflow.md` content with relative links.

### Lane B — Gaps and teach-back (`gaps.ts`, `teach-back.ts`)

1. `findGaps(...)` returns `Gap { gap_id, kind: "missing_reason" | "unclear_guardrail" | "conflict" | "unqualified_exception" | "missing_evidence" | "ambiguous_reference", description /* plain, no interpretation */, related_event_ids, related_exchange_ids, priority }[]`.
   - Gaps are only for what was **not** answered.
   - Guardrails and conflicts get the highest priority.
   - A gap answered later in the session disappears.
   - If fewer than 3 genuine gaps exist, return fewer. **Never pad.** The handoff tells WS4/WS3 to make sure the scenario leaves ≥ 3 gaps.
2. `buildTeachBack(revisionSet)` returns process-level text ("To interpret a trace like this, first …; if …; stop and escalate when …"). It covers each step and guardrail and ends with an explicit confirmation question. It lists `{ entry_id, revision_id }[]` reviewed, so a confirmation binds to exactly those.
3. Adapters:
   - `web/lib/knowledge/adapters/ws3-synthesis.ts` implements WS3's `getGaps` / `buildDraft`, mapping our output to their `DraftRevision` (`steps` with `supporting_event_ids` and `supporting_exchange_ids`).
   - `web/lib/knowledge/adapters/ws6-synthesis-module.ts` implements WS6's `SynthesisModule` (`id: "ws5-synthesis"`, `version`).
   - Don't edit their files; export so they can import. Add a short section to `notes/ws5-sprints/docs/knowledge-schema-v0.md` on how to swap the stub out.

### Lane C — Work Map content (`workmap.ts`)

1. `buildWorkMap({ workflow, revisions, events, exchanges, assets })` returns the steps in logical order. Each step carries:
   - `{ entry_id, revision_id, status, kind, title }`
   - `expert_words: { exchange_id, question, quote }[]` (verbatim)
   - `synthesis` (tagged as AI)
   - `guardrails: { trigger, action, expert_words }[]`
   - `visual: { event_id, asset_id, original_ref, highlighted_ref, region }[]`
   - `confirmation`
   - `broken_links: string[]`
2. Missing evidence becomes `broken_links`; it is never dropped silently. Only eligible content is included by default, with an `include_draft` option.
3. Export the type for WS7 (`WorkMapContent`). WS6 serves it from `GET /api/workmap`.

## Out of scope

Tutor evaluation (Sprint 3), routes/jobs/locks (WS6), Work Map UI (WS7), and the debrief conversation itself (WS3).

## Acceptance criteria

- `npm run typecheck` and `npx vitest run` pass. Tests cover:
  - synthesis on fixtures produces entries passing `validateEntry`
  - many-to-many evidence
  - off-record exclusion
  - qualifier → gap
  - unchanged input → no new revision
  - correction → new revision with parent and `change_reason`, plus dependent entries flagged
  - gaps exclude answered items and are never padded
  - the teach-back covers every step and guardrail and lists the reviewed revisions
  - every Work Map step has ≥ 1 visual and ≥ 1 verbatim quote or a `broken_links` entry
  - the WS3 and WS6 adapters type-check against their interfaces (real or the documented signature)
- If an LLM pass is enabled: ≥ 4/5 runs keep all quotes verbatim and add no new claims (counts reported).
- `notes/ws5-sprints/handoff-sprint-2.md` is written, including the step-text decision and the integration status with WS3 and WS6.

## Human gate (for the human, ~20 min)

1. Run the fixture synthesis script the agent provides (e.g. `npx tsx web/lib/knowledge/dev/synthesize-fixtures.mts`) and open the generated `workflow.md` and the entries in a Markdown viewer. **Check:**
   - The steps read as a process.
   - Every step shows an image link and verbatim expert words.
   - Nothing is stated that the expert did not say.
2. Read the gap list. **Check:** each gap is real and not already answered.
3. Read the teach-back aloud. **Check:** it sounds like instructions someone else could follow.
4. Merge into `voice` if satisfied (same `git -C … merge --no-ff worktree-ws05-sprint-2` + `worktree remove` pattern as Sprint 1). Tell the WS3 and WS6 owners that the real synthesis module is available.

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
