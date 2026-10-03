# WS5 Sprint 3 — Tutor evaluation & pre-save intervention

> Paste this whole file as the first message to a fresh coding agent started in the repo root.

## Your role

You are the implementing agent for **Sprint 3** of workstream WS5. This sprint is critical for the challenge and carries the most risk. Build the **`TutorEvaluator`**: given a newcomer's **draft decision + reason** on an unseen trace and the **pinned, eligible expert knowledge**, decide whether the draft may be saved. If not, return an intervention that **cites the expert's own words** and asks the learner to reconsider. WS6 blocks the commit based on your outcome. Context sections A1–A8 below apply in full.

## Worktree identity (use in the A6 setup)

- Sprint number `N` = **3**
- Slug = **tutor-evaluation**
- Branch = **`ws5/sprint-3-tutor-evaluation`**
- Worktree = **`/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees/ws5-sprint-3`**
- Dev-server port = **3503**

## Read first

- `notes/ws5-sprints/handoff-sprint-2.md`, `notes/ws5-sprints/knowledge-schema-v0.md`, `web/lib/knowledge/`
- `notes/05-knowledge-newcomer-tutor.md` §7–9
- WS6: `notes/ws6-sprints/sprint-3-newcomer-presave.md` (`TutorEvaluator` interface, `LearnerDraft`, `Evaluation`, `canCommit`, `outcome-policy.json` "pending WS5 agreement") and the merged `web/lib/backend/` if present
- WS4: `notes/04-prototype-data-scenarios.md` §4–7 (task definition, learner-visible vs evaluator-only material) and any merged case fixtures
- `notes/ws3-elevenlabs-capabilities.md` (only if you consider evaluating inside the voice agent)

## Prerequisites

WS5 Sprint 2 merged into `voice`. If not, stop and tell the human. **Human decision D1 (below) answered**; ask for it before `/speckit-plan` if it isn't recorded in `notes/ws5-sprints/sprint-plan.md`.

## Decision D1 — evaluation mechanism (human decides; record it in the handoff)

Judging a free-form "decision + reason" against expert reasoning needs a language model. Options:
- **(a) Server-side LLM call with structured output** (recommended): deterministic guards before and after, provider key in `web/.env`. If the provider is Anthropic, use the `claude-api` skill for current model IDs and SDK usage, and never guess them.
- **(b) The ElevenLabs tutor agent judges via a client tool.** This ties the save gate to voice nondeterminism and conversation state. Not recommended for the gate itself.
- **(c) Rule matching on structured fields.** Only possible if WS4 defines a structured decision. Keep it as a fallback behind the same interface.

Whatever the choice, the **guard layer below is deterministic and tested**, and the LLM is only one step inside it.

## Scope

### Lane A — Evaluator core (`web/lib/knowledge/evaluate.ts`)

1. `evaluate({ draft, case_view, knowledge })` returns `{ outcome: "ok" | "intervene" | "uncertain", cited: { entry_id, revision_id, exchange_ids, quote }[], feedback_text, guiding_question, uncertainty: string | null, escalation: { entry_id, revision_id } | null }`. The shape matches WS6's interface, and an adapter maps any extra fields.
2. Pipeline:
   1. **Input guard.** Every knowledge revision passes `isTeachable` (else throw). `case_view` is the learner view only; reject inputs carrying evaluator fields.
   2. **Retrieve** with `retrieve()` (guardrails always included).
   3. **Judge** (D1): compare the draft's decision and reason with the retrieved expert reasoning, guardrails and the case's visible observations. The judge sees **only** retrieved eligible entries, the case view and the draft: no case ID semantics, no answer key, no other cases.
   4. **Output guard.**
      - Every citation must reference a pinned revision.
      - Every `quote` must be verbatim in that revision's expert words (`assertQuotesVerbatim`).
      - `intervene` without at least one valid citation is downgraded to `uncertain`.
      - `feedback_text` may not contain quoted text that isn't a valid citation.
      - If the knowledge does not cover the case, the outcome is `uncertain`, with either a confirmed escalation rule (`escalation` set) or a request for missing context. Never an invented rule.
3. **Feedback shape** (pedagogy from the brief §7):
   - `guiding_question` comes first ("What do you notice about … compared to …?"). The learner gets to reason before the answer is revealed.
   - Then the expert's reasoning, with the quote and a pointer to the evidence image.
   - A needed guardrail is never withheld.
   - Text only; voice delivery is Sprint 4.
4. **Outcome policy.** Review WS6's `outcome-policy.json` default (`ok: allow`, `intervene: block`, `uncertain: allow_with_escalation`). Confirm it, or propose changes with reasons in the handoff (`Requests to partner workstreams`). Don't edit WS6's file.
5. Adapter `web/lib/knowledge/adapters/ws6-tutor-evaluator.ts` implements WS6's `TutorEvaluator` (`id: "ws5-tutor"`, `version`).

### Lane B — Evaluation harness and anti-cheating tests (`web/lib/knowledge/__tests__/`, `web/fixtures/ws5/drafts/`)

1. Labelled fixture drafts against the fixture knowledge from Sprints 1–2. The drafts are written against the **fixture wording only**, never real domain claims:
   - consistent with a confirmed step → `ok`
   - violating a confirmed guardrail → `intervene`, citing that guardrail
   - a case the knowledge doesn't cover → `uncertain` with escalation or a context request
   - relying on a revoked or unresolved entry → never cited
   - correct decision with a bad reason → per policy, recorded in the handoff
2. **Anti-cheating tests:**
   - grep `web/lib/knowledge/` for case-ID literals, `EVALUATOR_DIR`, `evaluator` paths and answer-key fields, and fail on any match;
   - running the same draft with the case ID renamed gives the same outcome;
   - removing the relevant guardrail from the knowledge changes the outcome away from that citation.
3. Deterministic tests mock the judge. LLM-backed runs (`npm run eval:ws5` or a `tsx` script) execute each case 5×, and the handoff reports pass counts (≥ 4/5 required).

### Lane C — Learner timeline semantics (`timeline.ts`)

`buildTimeline(drafts, evaluations, commits)` returns ordered `{ at_utc, kind: "proposed" | "evaluated" | "guidance_delivered" | "revised" | "committed", draft_rev, evaluation_id?, outcome? }[]`. It distinguishes:
- *caught before save*: an `intervene` before any commit of that decision;
- *discovered after save*.

Sprint 4's assessment consumes this. Pure, tested.

## Out of scope

Voice delivery and the tutor agent prompt (Sprint 4), the commit guard itself and routes (WS6), the newcomer UI (WS7), and defining domain categories (WS4/expert).

## Acceptance criteria

- `npm run typecheck` and `npx vitest run` pass. Tests cover:
  - the input guard rejects non-eligible knowledge and evaluator fields
  - the output guard rules (downgrade without citation, non-verbatim quote rejected, uncited quote in feedback rejected)
  - all fixture draft classes, with a mocked judge
  - the anti-cheating tests
  - timeline caught-before-save vs after-save
- LLM-backed harness: each fixture class passes ≥ 4/5 runs (counts pasted), or the handoff states plainly what is blocked (e.g. a missing key).
- The WS6 adapter type-checks against the merged `TutorEvaluator`, or the documented signature.
- `notes/ws5-sprints/handoff-sprint-3.md` is written, including D1, the outcome-policy position and the harness results.

## Human gate (for the human, ~25 min)

1. Run the harness script. Read two `intervene` outputs. **Check:**
   - Each asks a guiding question first.
   - It cites the expert's exact words.
   - It does not reveal an answer the knowledge doesn't contain.
2. Write your own wrong draft for a fixture case and run it. **Check:** it is caught, and the explanation uses the expert's reasoning.
3. Write a draft about something the expert never covered. **Check:** `uncertain`, with escalation or a request for context, and no invented rule.
4. Confirm the outcome policy with the WS6 owner. Merge into `voice` if satisfied (same pattern as Sprint 1).

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
| WS3 | Expert conversation, ElevenLabs adapter, debrief, teach-back delivery, confirmation tool | **Produces** exchanges, draft revisions and confirmations. Its Sprint 3 puts coverage/draft logic behind `web/lib/expert/synthesis.ts` (`getGaps`, `buildDraft`) **for us to replace**. Its Sprint 4 writes `notes/ws3-voice-interface.md` for our tutor. |
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

**Never invent APIs** (ElevenLabs, LLM providers, WS3/WS6 modules). Check installed typings, official docs and the partner's merged code. For ElevenLabs, read `notes/ws3-elevenlabs-capabilities.md` (WS3 Sprint 0) first. If something does not exist, say so and choose a documented fallback.

### A6. Git worktree isolation (MANDATORY — other agents work in this repo in parallel)

Several agents work on this repository **at the same time**. The main checkout (branch `voice`) is shared, and other agents may be editing or committing there right now. **You work only in your own git worktree.**

**Hard rules**
- **Never** run `git checkout`, `git switch`, `git reset`, `git stash`, `git clean`, `git rebase`, `git merge` or `git pull` in the main checkout. Don't edit, create or delete files there. Don't run `npm install` or `npm run dev` there.
- **Never** touch another agent's worktree or branch. Don't delete branches or worktrees you didn't create.
- **Stay inside WS5 paths:** `web/lib/knowledge/`, `web/fixtures/ws5/`, `agents/tutor/`, `notes/ws5-sprints/`, `specs/*-ws5-*`. Editing a shared file (`web/package.json`, `agents/manifest.json`, `agents/probes.json`, `.gitignore`, partner code) needs a clear reason in the handoff. Never edit partner modules; request changes in the handoff instead.
- Only push config to the **tutor** ElevenLabs agent (`npm run sync-agents -- --agent tutor`). Never touch the expert agent.
- All file edits, commands, tests, dev servers and commits happen **inside your worktree directory**.

**Setup (run once at the start; use the sprint number `N` and `<slug>` from "Worktree identity")**

```bash
REPO=/Users/matthiassammer/Documents/Projects/Track-Inspect-hack-nation
WT_ROOT=/Users/matthiassammer/Documents/Projects/Track-Inspect-worktrees
WT=$WT_ROOT/ws5-sprint-N
BR=ws5/sprint-N-<slug>

mkdir -p "$WT_ROOT"
git -C "$REPO" worktree list                    # check that $WT and $BR don't already exist
git -C "$REPO" worktree add -b "$BR" "$WT" voice   # new branch from the local voice tip
cd "$WT"

# Things git does not carry into a worktree:
cp "$REPO/web/.env" web/.env 2>/dev/null || echo "web/.env missing: ask the human"
[ -f agents/manifest.json ] || { [ -f "$REPO/agents/manifest.json" ] && cp "$REPO/agents/manifest.json" agents/; }
[ -f agents/probes.json ]   || { [ -f "$REPO/agents/probes.json" ]   && cp "$REPO/agents/probes.json" agents/; }
(cd web && npm ci)
```

**Checks after setup.** If any check fails, stop and ask the human; don't copy files from the main checkout to work around it.
- `ls notes/ws5-sprints/` shows these prompts, and the previous sprint's `handoff-sprint-(N-1).md` exists (except for Sprint 1).
- `ls .specify .claude/skills` shows spec-kit, and `.specify/memory/constitution.md` is filled in (WS3 Sprint 0). WS5 **does not write its own constitution**; it follows the shared one.
- `git -C "$WT" status` is clean and on `$BR`.
- The sprint's **Prerequisites** are met.

**Dev server.** Use the WS5 port range: `npm run dev -- -p 350N` (Sprint 1 → 3501, Sprint 2 → 3502, …).

**Spec-kit inside the worktree.** Spec-kit here does not create git branches; your branch is already `$BR`. Other workstreams create specs in parallel, so sequential numbers would collide. When `/speckit-specify` runs `create-new-feature.sh`, pass `--timestamp --short-name ws5-sprint-N-<slug>`. If the skill doesn't let you pass flags, rename the created directory afterwards to `specs/<timestamp>-ws5-sprint-N-<slug>/` and update `.specify/feature.json` to match.

**Subagents for lanes.** Subagents work inside **your** worktree: run them sequentially if they touch the same files. For true parallelism, give each lane its own nested worktree under `$WT_ROOT/ws5-sprint-N-lane-X`, branched from `$BR`, and merge the lanes into `$BR` yourself.

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
Branch: ws5/sprint-N-<slug>   Worktree: <path>   Dev port: 350N   Spec: specs/<timestamp>-ws5-sprint-N-<slug>/   Date: <date>
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
