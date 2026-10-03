<!--
Sync Impact Report
- Version change: (unfilled template) → 1.0.0
- Principles defined (template slots 1–5 replaced, 3 added):
  I. Expert Is the Source of Truth
  II. Verbatim Evidence
  III. Evidence Linkage
  IV. Time Discipline
  V. Fixtures Are Labeled
  VI. Trust and Off-Record
  VII. Verifiable Increments
  VIII. Simplicity
- Added sections: Technology Constraints, Development Workflow, Governance
- Removed sections: none
- Templates: plan/spec/tasks templates read this file at runtime; no template edits needed.
- Deferred TODOs: none
-->

# Track Inspect — AI Apprentice for Railway Sensor Traces Constitution

## Core Principles

### I. Expert Is the Source of Truth

- The system MUST NOT supply, suggest or imply an interpretation of a trace feature. Interpretations,
  reasons, exceptions and guardrails come only from the expert.
- Agent questions MUST NOT be leading: they MUST NOT name a physical cause or interpretation that the
  expert has not stated.
- An ambiguous or unresolved visual reference MUST be clarified before any answer is treated as an
  interpretation of that region.

Rationale: the product captures human expertise; an AI-originated interpretation would contaminate
the knowledge that newcomers are later taught.

### II. Verbatim Evidence

- Expert words MUST be stored verbatim and kept in fields separate from AI synthesis (summaries,
  notes, draft steps).
- A quote attributed to the expert MUST appear verbatim in a stored answer. Fabricated or paraphrased
  quotes are forbidden.
- Qualifiers ("usually", "only if") MUST be preserved; a qualified statement MUST NOT become an
  absolute rule.
- Unknown values MUST stay `null`; they are never guessed or synthesized.

Rationale: auditable, trustworthy knowledge requires that every claim can be traced back to what the
expert actually said.

### III. Evidence Linkage

- Every expert exchange MUST reference exactly the pointing event it was asked about. That reference
  MUST NOT change when later events arrive or the expert moves on.
- Every workflow step and guardrail in a draft or confirmed revision MUST cite both a screen moment
  (event) and the expert's own words (exchange). A step without both is flagged as unsupported.
- Confirmation MUST reference the exact revision reviewed; silence is never confirmation.

Rationale: the challenge requires evidence links; a smooth conversation with mismatched evidence is a
failure.

### IV. Time Discipline

- Session time (recording timeline) and signal time (trace axis) MUST NOT be derived from or
  substituted for one another. A signal interval is recorded only when calibrated; otherwise `null`.
- Processing latency MUST be logged separately from intentional waiting for a natural pause.

Rationale: conflated timelines create false precision. Merged latency figures hide either slowness or
good restraint.

### V. Fixtures Are Labeled

- Every record created from simulated or fixture data MUST carry `source: "fixture"`, and any UI
  showing it MUST label it as such.
- Fixture data MUST NOT be presented as live capture in demos, docs or reports.

Rationale: the demo has to show honestly what is live and what is simulated.

### VI. Trust and Off-Record

- Off-record content MUST be excluded from every persisted path: transcripts, exchanges, coverage,
  drafts, timing logs and exports. Excluding it means dropping it, not just flagging it.
- Limits on third-party retention (for example provider-side audio and transcripts) MUST be stated
  explicitly. Claims MUST NOT exceed what is verified.
- Evaluator answer keys (WS4) MUST NOT reach any agent prompt, knowledge base, tool or served asset.
- Permanent provider secrets MUST stay server-side; clients receive only short-lived tokens.

Rationale: experts will only share knowledge with a system they can trust. Leaking the answer key
would invalidate the teaching demonstration.

### VII. Verifiable Increments

- Pure logic MUST be developed test-first with vitest.
- Agent behavior MUST be verified with simulated-conversation probes. A behavior passes only when it
  holds in at least 4 of 5 runs, and the actual counts MUST be reported.
- Each sprint MUST close with a human live-voice gate. Claims of "working" MUST be backed by pasted
  verification output.

Rationale: agent-implemented work needs autonomous, checkable acceptance criteria. Conversational
quality still needs a human judgment.

### VIII. Simplicity

- Prefer local files and in-process modules over new infrastructure (no databases, queues or vector
  stores unless a principle cannot otherwise be met).
- Persistence, synthesis and transport MUST sit behind small interfaces, so that WS5 (knowledge) and
  WS6 (backend) can replace them without touching conversation logic.

Rationale: hackathon timeline. The integration owners will replace the stand-ins later.

## Technology Constraints

- Web app: Next.js 16 (App Router), React 19, TypeScript in strict mode (no `any`), located in `web/`.
- Voice: ElevenLabs Agents through `@elevenlabs/react` (browser) and `@elevenlabs/elevenlabs-js`
  (server and scripts). API surface MUST be verified against the installed typings or official docs
  before use; `notes/ws3-sprints/docs/elevenlabs-capabilities.md` records the verified findings.
- The ElevenLabs API key is server-side only (`web/.env`); the browser receives conversation tokens
  from `web/app/api/conversation-token/route.ts`.
- Persistence: local filesystem under `knowledge/` (JSON + Markdown + linked images), written
  atomically through server route handlers.
- Tests: vitest for logic; `npm run probe` (simulateConversation) for agent behavior.

## Development Workflow

- Several agents work on this repository in parallel. Each agent MUST work in its own git worktree
  under `.claude/worktrees/<name>` on its own branch. It MUST NOT edit files in, or run state-changing
  git commands in, the shared main checkout or another agent's worktree.
- Each WS3 sprint is one spec-kit feature (specify → plan → tasks → analyze → implement), using
  timestamped spec directories (`specs/<timestamp>-ws3-sprint-N-<slug>/`) to avoid numbering
  collisions across workstreams.
- Sprint agents commit on their branch, write `notes/ws3-sprints/handoff-sprint-N.md`, and do not
  merge or push. The human merges into `voice` after the live gate.
- Dev servers use per-sprint ports (3100 + sprint number) to avoid collisions.
- Commit messages end with the co-author attribution required by the team's tooling.

## Governance

- This constitution supersedes conflicting guidance in plans, specs and prompts. A sprint prompt may
  add constraints but MUST NOT relax a principle.
- Amendments are made with `/speckit-constitution`. Each amendment updates the Sync Impact Report and
  bumps the version with semantic versioning:
  - MAJOR: a principle is removed or redefined.
  - MINOR: a principle or section is added or materially expanded.
  - PATCH: wording only.
- Every spec, plan and handoff note MUST include a constitution check. Any deviation MUST be
  justified in the plan's complexity tracking or the handoff note's "Decisions made".
- Human gates confirm compliance for conversational behavior. Unit tests and probes confirm it for
  logic and agent behavior.

**Version**: 1.0.0 | **Ratified**: 2026-10-03 | **Last Amended**: 2026-10-03
