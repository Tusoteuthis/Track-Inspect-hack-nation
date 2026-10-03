# Research: WS3 Sprint 1

Most open questions were already answered by Sprint 0's spike (`notes/ws3-sprints/docs/elevenlabs-capabilities.md`). This file records the decisions that follow from it.

## R1 Event delivery
- **Decision**: `sendContextualUpdate(formatPointingEventUpdate(evt), { contextId: evt.event_id })`.
- **Rationale**: Sprint 0 verified live that this does not force a turn and that the agent uses the content on its next turn. A shared `context_id` supersedes earlier updates, so every event gets its own id.
- **Alternatives**: `sendUserMessage` was rejected because it forces a turn and pollutes the verbatim user record.

## R2 Question ↔ event linkage
- **Decision**: client tool `begin_question { event_id, kind, question }`, declared as a standalone tool (`tools.create`/`update` plus `prompt.toolIds`). Settings: `expectsResponse: true`, `executionMode: "immediate"`, `preToolSpeech: "off"`, `interruptionMode: "allow"`, `responseTimeoutSecs: 5`.
- **Rationale**: Sprint 0 verified the tool was called before each question (3 of 3 live) with about 160 ms round trip. Inline `prompt.tools` is legacy.
- **Name**: `begin_question`, as in the sprint prompt. Sprint 0's doc used `mark_question_target` and said either is fine.
- **Null event id**: the tool parameter is a string. The value `"none"` maps to `null`, because nullable literal JSON-schema properties are not clearly supported by `LiteralJsonSchemaProperty`.

## R3 Question text source
- **Decision**: the first final agent line after `begin_question` becomes `question`, verbatim. The tool parameter goes to `question_planned`.
- **Rationale**: what the expert heard is the evidence (Constitution II). What the LLM planned may differ from what it said.

## R4 Agent settings
- **Decision**: add an optional manifest `settings` block, applied with `agents.update`. It contains `llm`, `turnEagerness: patient`, `speculativeTurn`, `maxDurationSeconds`, `skipTurn`, plus `clientEvents` additions such as `agent_chat_response_part` and `vad_score`. A read-back then prints what took effect.
- **Rationale**: Sprint 0's notes for Sprint 1. The `skip_turn` setting set via create did not stick, so this sprint sets it through update and verifies it by reading back both `builtInTools.skipTurn` and any `system` tool in `toolIds`.

## R5 Agent creation
- **Decision**: extend `--create-missing` so it creates from scratch with `agents.create({ name, conversationConfig: { agent: { firstMessage, language, prompt: { prompt } } } })` when `cloneFrom` is absent or has no id. The id is printed and must be added to `web/.env` (the worktree only).
- **Rationale**: no expert agent existed. The user chose this option.

## R6 Probes
- **Decision**: probe history carries the event as a user-role turn `[POINTING_EVENT] …`, the same formatter output, and the limitation is documented. Every simulation passes `toolMockConfig: { begin_question: { defaultReturnValue: "ok exchange_id=ex-sim" } }`. Assertions are checked automatically, and `--runs N` prints a pass count per case.
- **Rationale**: Sprint 0 verified that contextual updates cannot be put into `partialConversationHistory`.

## R7 Persistence
- **Decision**: an idempotent full snapshot through `PUT`, validated server-side, with one temp-file-then-rename write per file. The `ExpertSessionStore` interface leaves room for WS6.
- **Rationale**: retries cannot duplicate, and the code stays simple.

## R8 Branch base
- **Decision**: this sprint branches from `worktree-ws03-sprint-0` instead of `voice`, because Sprint 0 was not merged yet. The user approved this. Merging Sprint 1 later brings Sprint 0 along with it.
