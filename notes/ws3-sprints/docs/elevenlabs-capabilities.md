# ElevenLabs capabilities for WS3: spike results

**Date:** 2026-10-03 (docs research). Live spike run on 2026-10-04.
**Scope:** Sprint 0, Lane A (research only, no app code).
**Sources used:** ElevenLabs docs (the `.md` versions of the pages listed in `https://elevenlabs.io/docs/llms.txt`), the ElevenLabs changelog (`https://elevenlabs.io/docs/changelog/...`), and the SDK typings and source installed in `web/node_modules`.

## SDK versions installed (read from `node_modules/*/package.json`)

| Package | Version | Notes |
|---|---|---|
| `@elevenlabs/react` | **1.16.0** | Re-exports everything from `@elevenlabs/client` (`export * from "@elevenlabs/client"` in `dist/index.d.ts`) |
| `@elevenlabs/client` | **1.26.0** | Top-level install (`web/node_modules/@elevenlabs/client`); there is no nested copy |
| `@elevenlabs/types` | **0.24.0** | Generated socket event types (`dist/generated/types/asyncapi-types.d.ts`) |
| `@elevenlabs/elevenlabs-js` | **2.70.0** | Server SDK (Fern-generated) |

## Status of the empirical checks

- **Live API experiments: run on 2026-10-04 (VERIFIED LIVE).** The first attempt on 2026-10-03 failed because the old key was invalid (`401 invalid_api_key`). After the key was replaced, `cd web && npm run spike:ws3` ran `web/scripts/ws3-capability-spike.mts` and wrote the raw results to `notes/ws3-sprints/docs/spike-results.json`. The script:
  - created one temporary agent, `ws3-spike-temp-DELETE-ME` (text-only, `turn_timeout` 30);
  - read its config back;
  - tested `turn_timeout` bounds;
  - ran simulateConversation variants A–D;
  - ran three text-only WebSocket sessions: ws0 (prompt override without permission), ws1 (contextual updates, client-tool linking, a "let me think" turn), ws2 (prompt and first-message override with permission);
  - read ws1's history and fetched its audio;
  - deleted everything it created.
- **Cleanup result:**
  - `agentDeleted = true`; all 3 conversations deleted, and `get` after delete returns `404 conversation_not_found`.
  - The auto-created tool needed `tools.delete(id, { force: true })`. The plain delete returned `409 "Tool is still in use by: Unknown / Main"`, because the deleted agent's orphaned branch still counts as a dependent. It was force-deleted by hand (`204`, then `404` on `get`), and the script now passes `force: true`.
  - Nothing from the spike remains in the account.
- Caveat: the sessions were **text-only** (`conversation.text_only: true`, `user_message` instead of speech). Voice-specific behaviour (VAD, tentative transcripts, interruptions, audio turn-taking) is still DOCUMENTED-ONLY.
- **Offline SDK check: run (VERIFIED).** an offline script (scratch, not kept) subclasses `BaseConversation` from `@elevenlabs/client@1.26.0` with a fake connection (no network) and feeds it server events. This checks what the client SDK puts on the wire and which callback receives which event. Results are cited in Q1, Q2 and Q5.

Labels used below:
- **VERIFIED LIVE**: observed against the real API in the 2026-10-04 spike (text-only sessions); evidence in `spike-results.json`.
- **VERIFIED (offline SDK)**: confirmed by running the installed SDK code.
- **SDK source**: read in the installed typings or JS.
- **DOCUMENTED-ONLY**: stated in the official docs, not tested against the live API.

---

## Q1. `sendContextualUpdate`: what it does, whether it triggers a turn, and how it compares to `sendUserMessage` and `sendUserActivity`

**Answer.**
- `sendContextualUpdate(text, { contextId? })` sends `{type:"contextual_update", text, context_id?}`. It adds background information to the LLM context.
- It is documented as **not interrupting** and **not triggering a response**. No doc says it can trigger a turn.
- But the update is part of the context the *next* agent turn sees. An agent turn still happens whenever normal turn-taking gives the agent one: the user stops speaking, or the `turn_timeout` silence timer expires. So a contextual update cannot *cause* a reply, but the agent may *use* it in a reply it was going to give anyway. Whether the LLM ever "answers" a contextual update on the next natural turn depends on the prompt. Live (text-only), the agent stayed silent after each update and used the content on the next turn (see "Verified empirically?" below).
- `sendUserMessage(text)` is processed **as user input and triggers the same response flow as speech**. It shows up in history as a user turn; a `source_medium` field (`audio` | `text` | …) exists on turns.
- `sendUserActivity()` sends `{type:"user_activity"}`. It **resets the turn-timeout timer**, and the agent pauses speaking for about 2 s. The SDK throttles it to once per second.
- **Visibility afterwards:** yes. Each transcript item in the conversation history has `contextual_update_info { context_id, is_superseded }`. The SDK doc for `getSummary` says the full `GET /v1/convai/conversations/{id}` returns "the full transcript with tool calls and contextual updates".
- **`contextId` semantics:** `is_superseded` is "True when this contextual update has been replaced by a newer update with the same context_id". The changelog describes `contextId` as being "for deduplicating contextual updates". Whether a superseded update is also **removed from the LLM context** is **not documented**.

**Evidence.**
- Docs, Client to server events: "Contextual updates allow your application to send non-interrupting background information to the conversation. … Updates are incorporated as background information in the conversation. Does not interrupt the current conversation flow."
- Same page, User messages: "Text is processed as user input to the conversation. Triggers the same response flow as spoken user input."
- Same page, User activity: "Resets the turn timeout timer. Does not affect conversation content or flow."
- React docs: "`sendContextualUpdate`: Sends contextual information to the agent that won't trigger a response." Also: "Unlike `sendContextualUpdate`, this [sendUserMessage] will be treated as a user message and will prompt the agent to take its turn in the conversation."
- React docs, `sendUserActivity`: "The agent will pause speaking for ~2 seconds after receiving this signal."
- Typings (`@elevenlabs/client/dist/BaseConversation.d.ts`): `sendContextualUpdate(text: string, options?: ContextualUpdateOptions): void;` where `ContextualUpdateOptions = { contextId?: string }`. Also `sendUserMessage(text: string, options?: SendUserMessageOptions): void;` and `sendUserActivity(): void;`.
- Source (`BaseConversation.js`): `const USER_ACTIVITY_THROTTLE_MS = 1000;`
- Wire types (`@elevenlabs/types`): `ContextualUpdateClientToOrchestratorEvent { type: "contextual_update"; text: string; context_id?: string; }`
- History model (`elevenlabs-js/api/types/ConversationHistoryTranscriptResponseModel.d.ts`): `contextualUpdateInfo?: ElevenLabs.ContextualUpdateInfo;` and the docs say `ContextualUpdateInfo`: "`context_id` … Client-supplied identifier grouping related contextual updates. `is_superseded` … True when this contextual update has been replaced by a newer update with the same context_id."
- `elevenlabs-js` `conversations/client/Client.d.ts` (getSummary): "Tool calls, tool results, and contextual updates are omitted … use GET /v1/convai/conversations/{conversation_id} when you need the full transcript with tool calls and contextual updates."
- Changelog 2026-05-04: "@elevenlabs/client@1.5.0 … Added optional `contextId` to `sendContextualUpdate` for deduplicating contextual updates". Changelog 2026-05-13: "Added `contextual_update_info` to conversation transcript response items."

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/customization/events/client-to-server-events
- https://elevenlabs.io/docs/eleven-agents/libraries/react
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get
- https://elevenlabs.io/docs/changelog/2026/5/4
- https://elevenlabs.io/docs/changelog/2026/5/13
- `web/node_modules/@elevenlabs/client/dist/BaseConversation.{d.ts,js}`

**Verified empirically?**
- **VERIFIED (offline SDK):** `sendContextualUpdate("POINTING EVENT evt-001", {contextId:"pointing"})` put exactly `{"type":"contextual_update","text":"POINTING EVENT evt-001","context_id":"pointing"}` on the wire. Two `sendUserActivity()` calls back-to-back produced **one** `{"type":"user_activity"}` (throttled).
- **VERIFIED LIVE (no turn):** in session ws1, a `contextual_update` for evt-001 was sent at t=523 ms. No agent output followed during a 10 s idle window; the next agent output came only after the `user_message` at t=10 524 ms. The same held for the evt-002 update at t=15 466 ms (8 s idle, silence).
- **VERIFIED LIVE (used on the next turn):** after "Hmm, look at this part here.", the agent referred to the update's content ("What specifically about channel SYS1 caught your attention?").
- **VERIFIED LIVE (history shape):** a contextual update appears in `conversations.get` as **two `role:"agent"` items with no `message`**:
  1. a `tool_calls` entry `system:contextual_update {"context_id":"pointing"}`, carrying `contextual_update_info`;
  2. a `tool_results` entry whose `result_value` is the full update text.
  They carry the same `time_in_call_secs` as the surrounding turn.
- **VERIFIED LIVE (`is_superseded`):** both updates used `context_id:"pointing"`. Afterwards evt-001's item had `is_superseded: true` and evt-002's had `false`. Whether superseded text is dropped from the LLM context is still not documented, but in ws1 the agent did not refer back to evt-001. **Use a unique `contextId` per pointing event.**

---

## Q2. Client tools: declaration, schema, dispatch, return values, and managing them from `sync-agents.mts`

**Answer.**
- **Declaring a tool.** Use the dashboard (Tools → Add Tool → type *Client*), the CLI, or the API. The recommended API path is:
  1. Create a standalone tool with `client.conversationalAi.tools.create({ toolConfig: { type: "client", … } })`.
  2. Reference it from the agent with `agents.update(id, { conversationConfig: { agent: { prompt: { toolIds: [tool.id] } } } })`.
- **Inline tools.** You can also put tools inline in `conversationConfig.agent.prompt.tools`. The typing marks this path as legacy: "A list of tools that the agent can use … use tool_ids instead".
- **Updating a tool.** `tools.update(toolId, ToolRequestModel)`. `tools.list`, `tools.get`, `tools.delete` and `tools.getDependentAgents` also exist.
- **Client tool schema** (`ClientToolConfigInput`, all from typings):
  - `name`, `description`
  - `parameters` (JSON schema object)
  - `expectsResponse` (default `false`; this is the dashboard's "Wait for response")
  - `responseTimeoutSecs` (1–120)
  - `executionMode` (`immediate` (default) | `post_tool_speech` | `async`)
  - `preToolSpeech` (`auto` | `force` | `off`)
  - `interruptionMode` (`allow` | `disable_during_tool` | `disable_during_tool_and_turn`)
  - `assignments` (map the tool result into dynamic variables)
  - `toolErrorHandlingMode`, `toolCallSound`, `toolCallSoundBehavior`, `dynamicVariables`
  - `ToolRequestModel` also takes `responseMocks` (used in tests and simulations).
- **React dispatch.** Pass `clientTools: Record<string, (params) => string|number|void|Promise<…>>` to `ConversationProvider`, `useConversation` or `startSession`, or register a tool with the `useConversationClientTool(name, handler)` hook. The SDK merges the two sources and throws on a name conflict.
- When a `client_tool_call` arrives, the SDK `await`s the handler, so **async handlers are supported**. It sends back `client_tool_result` with:
  - `result = String(value)`, or `JSON.stringify(value)` for objects;
  - `"Client tool execution successful."` if the handler returns nothing;
  - `is_error:true` plus an error text if the handler throws or the tool name is unknown. You can intercept unknown names with `onUnhandledClientToolCall`.
- **Returning a value to the LLM.** Supported, but the tool must have `expects_response: true`. Otherwise "the agent assumes success and continues the conversation".
- **Inside `sync-agents.mts`.** Yes: `tools.create` / `tools.update`, then `agents.update` with `prompt.toolIds`. The script already calls `agents.update`, so it would add a tools section that upserts by name (`tools.list`, then match `toolConfig.name`).

**Evidence.**
- Client tools doc (CLI JSON): `{ "type": "client", "name": "logMessage", "description": "…", "expects_response": false, "parameters": { "type": "object", "properties": { "message": { "type": "string", … } }, "required": ["message"] } }`
- Client tools doc (TypeScript): `const tool = await elevenlabs.conversationalAi.tools.create({ toolConfig: { type: "client", name: "logMessage", … expectsResponse: false, parameters: {…} } }); await elevenlabs.conversationalAi.agents.update("agent_…", { conversationConfig: { agent: { prompt: { toolIds: [tool.id] } } } });`
- Client tools doc: "When you want your agent to receive data back from a client tool, ensure that you tick the **Wait for response** option … the agent will wait for its response and append the response to the conversation context." Also: "The tool and parameter names in the agent configuration are case-sensitive and **must** match those registered in your code."
- `ClientToolConfigInput.d.ts`: `expectsResponse?: boolean` with "If true, calling this tool should block the conversation until the client responds with some response which is passed to the llm. If false then we will continue the conversation without waiting…". Also `executionMode?` with "'immediate' executes the tool right away when requested by the LLM, 'post_tool_speech' waits for the agent to finish speaking before executing, 'async' runs the tool in the background without blocking". Also `responseTimeoutSecs?` with "Must be between 1 and 120 seconds".
- Tools API ref: "`expects_response` (boolean, optional, default: false)" and "`execution_mode` (enum, optional, default: immediate)".
- `PromptAgentApiModelInput.d.ts`: `toolIds?: string[];` and `tools?: …ToolsItem[]` with "A list of tools that the agent can use over the course of the conversation, use tool_ids instead".
- `tools/client/Client.d.ts`: `create(request: ElevenLabs.ToolRequestModel)`, `update(tool_id: string, request: ElevenLabs.ToolRequestModel)`, `list(…)`, `get(…)`, `delete(…)`, `getDependentAgents(…)`.
- React typings: `export type ClientTool<…> = (parameters: Parameters) => Promise<Result> | Result;`, `ClientToolResult = string | number | void`, and `useConversationClientTool(name, handler)`.
- React docs: "If the function returns a value, it is passed back to the agent as a response. The tool must be explicitly set to block the conversation in the ElevenLabs UI for the agent to await and react to the response. Otherwise, the agent assumes success and continues the conversation."
- Source `BaseConversation.js` `handleClientToolCall`: `const result = (await this.options.clientTools[name](parameters)) ?? "Client tool execution successful."; const formattedResult = typeof result === "object" ? JSON.stringify(result) : String(result);`
- Wire types: `ClientToolCall { tool_name; tool_call_id; parameters: Record<string, any>; event_id: number }`.

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools
- https://elevenlabs.io/docs/eleven-agents/api-reference/tools/create
- https://elevenlabs.io/docs/eleven-agents/libraries/react
- `web/node_modules/@elevenlabs/elevenlabs-js/api/types/ClientToolConfigInput.d.ts`, `ToolRequestModel.d.ts`, `PromptAgentApiModelInput.d.ts`
- `web/node_modules/@elevenlabs/elevenlabs-js/api/resources/conversationalAi/resources/tools/client/Client.d.ts`
- `web/node_modules/@elevenlabs/react/dist/conversation/{types,ConversationClientTools}.d.ts`
- `web/node_modules/@elevenlabs/client/dist/BaseConversation.js`

**Verified empirically?** **VERIFIED (offline SDK):**
- An async handler returning `{ok:true, linked:"evt-001"}` produced `{"type":"client_tool_result","tool_call_id":"c1","result":"{\"ok\":true,\"linked\":\"evt-001\"}","is_error":false}`.
- A `void` handler produced `result:"Client tool execution successful."`.
- An unknown tool name produced `is_error:true` and `"Client tool with name unknownTool is not defined on client"`, plus `onError`.

**VERIFIED LIVE:**
- **Creating the agent with an inline client tool** (`prompt.tools`) auto-created a standalone tool (`tool_…`, `type:"client"`) and stored its id in `prompt.toolIds`.
- **Read-back** of `prompt.tools` showed `expectsResponse: true`, `executionMode: "immediate"` and `responseTimeoutSecs: 10`.
- **Deleting such a tool** after deleting the agent needs `tools.delete(id, { force: true })`. Without `force` the API returns `409` because of the deleted agent's orphaned "Main" branch. Upserting by name via `tools.create` / `tools.update` and `toolIds` is therefore cleaner for `sync-agents.mts` than inline tools.
- **LLM calling the tool, 3 of 3 user turns in ws1:**
  - On the wire, `client_tool_call {tool_name:"mark_question_target", tool_call_id, parameters:{event_id:"evt-001"}, event_id:2, expects_response:true}` arrived. We replied with `client_tool_result`. Then `agent_tool_response {status:"success"}` arrived, about 160 ms later, and the question text followed about 180 ms after that.
  - The tool always came **before** the question within the same server `event_id`, and the `event_id` argument was the **most recent pointing event**. That is evt-002 for "OK. And this one here?", which is correct, because no new event had been sent.
- **Opaque call ids:** `tool_call_id` formats varied within one session (`chatcmpl-tool-…` and `call_…`). Treat them as opaque strings.

---

## Q3. Client tools inside `agents.simulateConversation`

**Answer.**
- **Client tools are not executed** in a simulation, because no client exists. The tool call is **recorded** in `tool_calls` with `type:"client"`. A **mock result** is returned to the LLM, by default the string `"Tool Called."`.
- **Mocked results.** `simulationSpecification.toolMockConfig` is a map from tool name to `{ defaultReturnValue?: string, defaultIsError?: boolean }`. The default return value is `"Tool Called."`.
- **Shared mocks.** Tools can also carry their own `responseMocks` (`{ mockResult, parameterConditions?, isError? }`, evaluated top-to-bottom) via `ToolRequestModel`.
- **Newer fields not in SDK 2.70.** The changelog (2026-08-03) says simulations now accept `tool_mock_overrides` keyed by tool ID. That field is **not present in elevenlabs-js 2.70 typings**, so it would need a raw request.
- **Partial history.**
  - `partialConversationHistory` items **can** include `toolCalls` and `toolResults`, so a prior tool exchange can be replayed.
  - They **cannot** carry contextual updates. `contextual_update_info` exists only on the *response* model; the *input* model `ConversationHistoryTranscriptCommonModelInput` lacks it, in both the docs and the typings.
  - To simulate a pointing event, put it into a plain `user`/`agent` turn, or into a `dynamicVariables` value. This is an approximation: in production it arrives as a contextual update.

**Evidence.**
- Simulate guide, example output: a client call `{"type":"client","request_id":"redirectToDocs_…","tool_name":"redirectToDocs","params_as_json":"{\"path\": …}","tool_has_been_called": false}`, followed by a result `{"type":"client", …, "result_value":"Tool Called.","is_error":false,"tool_has_been_called":true,"tool_latency_secs":0}`.
- Simulate API ref, `ConversationSimulationSpecification`: "`tool_mock_config` (map from string to ToolMockConfig, optional)" and "`partial_conversation_history` (list of ConversationHistoryTranscriptCommonModelInput, optional)". Also `ToolMockConfig`: "`default_return_value` (string, optional, default: Tool Called.)", "`default_is_error` (boolean, optional, default: false)".
- Typings: `ConversationSimulationSpecification { simulatedUserConfig; toolMockConfig?: Record<string, ToolMockConfig>; partialConversationHistory?: …[]; dynamicVariables?: Record<string, unknown> }`.
- Typings: `ConversationHistoryTranscriptCommonModelInput` has `toolCalls?`, `toolResults?`, `timeInCallSecs`, and so on, but **no** `contextualUpdateInfo`.
- Tools API ref, `ToolResponseMockConfigInput`: "`mock_result` (string, required) — The return value the LLM sees when this mock is active. `parameter_conditions` … If the list is empty, the mock will always activate. `is_error` …"
- Changelog 2026-04-01: "Tool response mocking for tests: Agent simulation tests and test suite invocations now support a `tool_mock_config` field … `MockingStrategy` (`all`, `selected`, `none`) … `MockNoMatchBehavior` (`call_real_tool`, `raise_error`)".
- Changelog 2026-08-03: "Agent simulations and unit tests can now define `tool_mock_overrides`, keyed by tool ID".
- Live sessions too: `startSession` accepts `toolMockConfig { mockingStrategy, mockedToolNames, fallbackStrategy }` (`client/dist/utils/BaseConnection.d.ts`). This could let the browser session mock tools, but it is not needed for client tools.

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/guides/simulate-conversation
- https://elevenlabs.io/docs/eleven-agents/api-reference/agents/simulate-conversation
- https://elevenlabs.io/docs/eleven-agents/api-reference/tools/create
- https://elevenlabs.io/docs/changelog/2026/4/1
- https://elevenlabs.io/docs/changelog/2026/8/3
- `elevenlabs-js/api/types/{ConversationSimulationSpecification,ToolMockConfig,ConversationHistoryTranscriptCommonModelInput}.d.ts`

**Verified empirically?** **Partly (VERIFIED LIVE, 2026-10-04):**
- **A (no mock) and B (`toolMockConfig` with `defaultReturnValue: "MOCKED-RESULT-123"`):**
  - The partial history put the pointing event into a plain user turn.
  - In both runs the agent **did not call the tool**. It asked "Is there anything specific you'd like to know about channel SYS1?" directly.
  - So the mock result value was **not observed**, and `toolMockConfig` is accepted but still unexercised.
- **C (partial history with a replayed client `toolCalls` / `toolResults` pair):** accepted without error. The agent continued normally and did not call the tool again.
- **D (raw REST, `contextual_update_info` on a history *input* item):**
  - `200`, the field is **silently ignored**. The item is treated as a normal user turn: the agent replied "Understood." to it, and `contextual_update_info` came back `null`.
  - On the next turn the agent **called the client tool** (`mark_question_target {"event_id":"evt-555"}`) and then asked "What do you see?". So client tool calls *are* recorded in simulation output (`tool_calls`).
- **Tool compliance differed:** the tool was called in 1 of 3 simulations versus 3 of 3 live turns.
- **Practical consequences for `probe-agents.mts`:**
  - print `toolResults` as well as `toolCalls`;
  - always pass `toolMockConfig`;
  - make the probe's simulated history end on a user turn that clearly references the event;
  - judge tool compliance over ≥ 5 runs, not one.

---

## Q4. Turn-taking controls

**Answer.** Everything below lives under `conversation_config.turn` (SDK: `conversationConfig.turn`), except where noted.

| Setting | Field path | Values / default | Notes |
|---|---|---|---|
| Take turn after silence | `turn.turn_timeout` | Docs: 1–30 s. API default **7**. **Live: `-1` or 1–300 s** | "Maximum wait time for the user's reply before re-engaging the user". VERIFIED LIVE: `-1` and `60` accepted; `0.5` rejected with `400 "Turn timeout must be -1 or between 1 and 300 seconds"` |
| Initial wait | `turn.initial_wait_time` | seconds, unset = turn_timeout | Only when first message is empty |
| End call after silence | `turn.silence_end_call_timeout` | default **-1** (off) | |
| Turn eagerness | `turn.turn_eagerness` | `patient` \| `normal` (default) \| `eager` | "Patient – waits longer before taking its turn" |
| Turn model | `turn.turn_model` | `turn_v2` \| `turn_v3` (default) | End-of-turn detection model |
| Speculative turn | `turn.speculative_turn` | bool. API ref says default false; **a new agent read back `true`** (live) | Starts LLM before full turn confidence. Set explicitly in `sync-agents` |
| Spelling patience | `turn.spelling_patience` | `auto` \| `off` | |
| Interruption ignore terms | `turn.interruption_ignore_terms`, `interruption_ignore_term_languages`, `merge_with_default_ignore_terms` | list / bool | Backchannels like "gotcha" do not interrupt |
| Transcribe while interruptions are disabled | `turn.transcribe_on_disabled_interruptions` | bool, default false | |
| Soft timeout (filler) | `turn.soft_timeout_config.{timeout_seconds, message, use_llm_generated_message, …}` | default `-1` (disabled), range 0.5–8.0 s | Filler while the LLM is slow; **keep disabled** for us |
| Interruptions on/off | `conversation.client_events` must include `"interruption"` | list of enum | "To enable interruptions, make sure interruption is a selected client event." This governs the *user* interrupting the *agent* |
| First-message interruptions | `agent.disable_first_message_interruptions` | bool | |
| Per-tool interruptions | tool `interruption_mode` | `allow` \| `disable_during_tool` \| `disable_during_tool_and_turn` | |
| Max duration | `conversation.max_duration_seconds` | default 600, range 60–7200 | **Must raise** for a 10+ minute expert session |
| VAD | `vad.background_voice_detection` | bool (changelog 2026-08-03) | |

**Per-session overrides from the client.**
- **None of the turn timing fields can be overridden.** `ConversationConfigClientOverrideConfig.turn` only covers `softTimeoutConfig.{message, additionalSoftTimeoutMessages}`.
- What *can* be overridden per session, once enabled in `platform_settings.overrides.conversation_config_override`:
  - `agent.first_message`, `language`, `max_conversation_duration_message`
  - `agent.prompt.{prompt, llm, tool_ids, native_mcp_server_ids, knowledge_base}`
  - `conversation.{text_only, max_duration_seconds}`
  - `tts.*`, `asr.keywords`
- **Workflows** can override the full `TurnConfig` per workflow node (`TurnConfigWorkflowOverride`), including `turnTimeout` and `turnEagerness`. That is a per-phase, server-side change, not a client override.
- The only client-side lever on turn timing is `sendUserActivity()`, which resets the turn-timeout timer.

**Evidence.**
- Conversation flow doc: "The value is specified in seconds and must be between 1 and 30 seconds. In the CLI and API, configure this setting with the `conversation_config.turn.turn_timeout` field."
- Same doc: "Set `conversation_config.turn.turn_eagerness` to one of `"patient"`, `"normal"`, or `"eager"`."
- Same doc: "Interruption settings can be configured in the agent's **Advanced** tab under **Client Events**. To enable interruptions, make sure interruption is a selected client event."
- Same doc: "Default `-1` (disabled) | Range `0.5` to `8.0` seconds" (soft timeout). Also: "The default is 600 seconds (10 minutes). You can set a value from 60 to 7,200 seconds."
- Create-agent API ref, `TurnConfig`: "`turn_timeout` (double, optional, default: 7)", "`silence_end_call_timeout` (double, optional, default: -1)", "`turn_eagerness` (enum, optional, default: normal)", "`turn_model` (enum, optional, default: turn_v3)".
- Typings: `TurnConfigOverrideConfig { softTimeoutConfig?: SoftTimeoutConfigOverrideConfig }` and `SoftTimeoutConfigOverrideConfig { message?: boolean; additionalSoftTimeoutMessages?: boolean }`.
- Typings: `ConversationConfigOverrideConfig { textOnly?: boolean; maxDurationSeconds?: boolean }`.
- Typings: `AgentConfigOverrideConfig { firstMessage?; language?; maxConversationDurationMessage?; prompt?: PromptAgentApiModelOverrideConfig }` and `PromptAgentApiModelOverrideConfig { prompt?; llm?; toolIds?; nativeMcpServerIds?; knowledgeBase? }`.
- Typings: `TurnConfigWorkflowOverride` has `turnTimeout initialWaitTime silenceEndCallTimeout turnEagerness … softTimeoutConfig`.
- Client typings, `BaseSessionConfig.overrides`: `{ agent?: { prompt?, firstMessage?, language? }, tts?: { voiceId?, speed?, stability?, similarityBoost? }, asr?: { keywords? }, conversation?: { textOnly? } }`. No `turn`.

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- https://elevenlabs.io/docs/eleven-agents/api-reference/agents/create
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides
- `elevenlabs-js/api/types/{TurnConfig,TurnEagerness,SoftTimeoutConfig,TurnConfigOverrideConfig,ConversationConfigClientOverrideConfigInput,TurnConfigWorkflowOverride}.d.ts`
- `@elevenlabs/client/dist/utils/BaseConnection.d.ts`

**Verified empirically?** **VERIFIED LIVE (config only):**
- **`turn_timeout` bounds:** `-1` or 1–300 s (see the table).
- **A freshly created agent read back:**
  - `turnEagerness:"normal"`, `turnModel:"turn_v3"`, `speculativeTurn:true`
  - `silenceEndCallTimeout:-1`, `softTimeoutConfig.timeoutSeconds:-1`
  - `spellingPatience:"auto"`, `retranscribeOnTurnTimeout:false`
- **Overrides default to off** (`platformSettings.overrides.conversationConfigOverride`): every field is `false` except `conversation.textOnly: true`.
- **Not verified (voice):** how the turn-taking settings behave with real speech.

---

## Q5. Client-side events in `@elevenlabs/react` 1.16

**Answer.**
- **React callbacks.** `HookCallbacks` (all optional props on `ConversationProvider` / `useConversation`): `onConnect, onDisconnect, onError, onMessage, onAudio, onModeChange, onStatusChange, onCanSendFeedbackChange, onDebug, onUnhandledClientToolCall, onVadScore, onInterruption, onAgentToolResponse, onAgentToolRequest, onConversationMetadata, onMCPToolCall, onMCPConnectionStatus, onAsrInitiationMetadata, onAgentChatResponsePart, onAgentReasoningResponsePart, onAgentResponseCorrection, onRichContent, onAudioAlignment, onGuardrailTriggered, onAgentTyping, onExternalAgentConnected, onExternalAgentDisconnected, onPing, onContextUsage, onIncomingEvent, onOutgoingEvent`.
- **Hooks:** `useConversationMode()` → `{mode, isSpeaking, isListening}`, `useConversationStatus()`, `useConversationInput()` → `{isMuted, setMuted}`.
- **Controls:** `getInputVolume()`, `getOutputVolume()`, `getInputByteFrequencyData()`, `getOutputByteFrequencyData()`.

**Payloads.** None carry a wall-clock timestamp; most carry a server `event_id` integer.

| Callback | Payload | Timestamp? |
|---|---|---|
| `onMessage` | `{ message, event_id, response_id?, source: "user"\|"ai", role: "user"\|"agent", attachments? }`. Fires for final `user_transcript` and final `agent_response` only | event_id only |
| `onModeChange` | `{ mode: "speaking" \| "listening" }`. **Agent** speaking state. On WebRTC it is derived from LiveKit active speaker: agent identity → `speaking`, anything else (including the user talking) → `listening` | no |
| `onStatusChange` | `{ status: "disconnected"\|"connecting"\|"connected"\|"disconnecting" }` | no |
| `onVadScore` | `{ vadScore: number }` (0–1, "probability that the user is speaking") | no |
| `onInterruption` | `{ event_id }` | event_id |
| `onAgentChatResponsePart` | `{ text, type: "start"\|"delta"\|"stop", event_id, response_id? }`. For voice it must be enabled in `client_events` | event_id |
| `onAgentResponseCorrection` | `{ … }` (`agent_response_correction_event`). Truncated text after an interruption | event_id |
| `onAudioAlignment` | `{ chars[], char_start_times_ms[], char_durations_ms[] }`. Relative to the audio chunk, not to the session | relative ms |
| `onAgentToolRequest` / `onAgentToolResponse` | `{ tool_name, tool_call_id, tool_type, is_error, is_called, event_id }` | event_id |
| `onConversationMetadata` | `{ conversation_id, agent_output_audio_format, user_input_audio_format }` | no |
| `onDebug` | Every server event the SDK does not handle itself (see below), plus `{type:"tentative_agent_response", response}` | varies |
| `onIncomingEvent` / `onOutgoingEvent` | Raw event objects (all incoming except pings handled first) | no |

**Events that reach the app only through `onDebug`** (VERIFIED offline). They must be enabled in the agent's `conversation.client_events`:
- `tentative_user_transcript` → `{type, tentative_user_transcription_event:{user_transcript, event_id}}`. **This is the "user is still talking" text signal.**
- `internal_turn_probability` → `{turn_probability_internal_event:{turn_probability}}`
- `agent_response_complete` → `{agent_response_complete_event:{event_id}}`. "Fires when the agent has finished its response, including any pending tool calls."
- `internal_tentative_agent_response` → re-emitted as `{type:"tentative_agent_response", response}`

**"User is speaking" signal for pause detection.** Several usable signals, none with timestamps, so stamp them on receipt:
1. `onVadScore`: server VAD, 0–1. Must be enabled in `client_events`. Whether it is delivered over the WebRTC data channel was not verified; the SDK routes any data-channel JSON through the same `handleMessage`.
2. `tentative_user_transcript` via `onDebug`.
3. **Local** `getInputVolume()` (0–1, mic level, polled; independent of the server). Reads 0 while muted.
4. `onModeChange` / `useConversationMode` tells you when the **agent** is speaking. It is not a user-speech signal.
5. `internal_turn_probability`: an end-of-turn likelihood. Experimental/internal, not documented on the client events page.

**Evidence.**
- `react/dist/conversation/types.d.ts`: `export type HookCallbacks = Pick<Callbacks, "onConnect" | … | "onIncomingEvent" | "onOutgoingEvent">`.
- `client/dist/types.d.ts`: `onVadScore?: (props: { vadScore: number }) => void;`, `onModeChange?: (prop: { mode: Mode }) => void;`, `onAgentChatResponsePart?: (props: AgentChatResponsePartClientEvent["text_response_part"]) => void;`, and `MessagePayload`.
- `types/dist/generated/types/asyncapi-types.d.ts`: `TentativeUserTranscriptionEvent { user_transcript: string; event_id: number; }`, `TurnProbabilityInternalEvent { turn_probability: number; }`, `VadScoreEvent { vad_score: number; }`, and the `client_events` enum `"audio" | "agent_response" | … | "tentative_user_transcript" | … | "vad_score" | … | "internal_turn_probability" | "internal_tentative_agent_response" | …`.
- `client/dist/BaseConversation.js`, in the `onMessage` switch: `default: { if (this.options.onDebug) { this.options.onDebug(parsedEvent); } }`.
- `client/dist/utils/WebRTCConnection.js`: `this.room.on(RoomEvent.ActiveSpeakersChanged, … this.updateMode(speakers[0].identity.startsWith("agent") ? "speaking" : "listening")`.
- Client events doc: "`vad_score` … Indicates the probability that the user is speaking. Values range from 0 to 1". Also: "`agent_response_complete` … Must be explicitly enabled in the agent's `client_events` configuration".
- React docs: "**onAgentChatResponsePart** … for voice conversations, enable `agent_chat_response_part` in the agent's `client_events` configuration." Also "getInputVolume / getOutputVolume: Methods that return the current input/output volume levels (0-1 scale)."
- Changelog 2025-04-21: "VAD Score: Added a new client event which sends VAD scores to the client".

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/customization/events/client-events
- https://elevenlabs.io/docs/eleven-agents/libraries/react
- https://elevenlabs.io/docs/changelog/2025/4/21
- `web/node_modules/@elevenlabs/{react,client,types}/dist/...` as quoted

**Verified empirically?** **VERIFIED (offline SDK):**
- `tentative_user_transcript`, `internal_turn_probability` and `agent_response_complete` all arrived at `onDebug` unchanged.
- `internal_tentative_agent_response` arrived as `{"type":"tentative_agent_response","response":"What do"}`.
- `vad_score` arrived as `{"vadScore":0.93}`.
- `user_transcript` arrived at `onMessage` as `{"source":"user","role":"user","message":"look here","event_id":8}`.

**VERIFIED LIVE (config):**
- A new agent's default `conversation.client_events` is `["audio","interruption","agent_response","user_transcript","agent_response_correction","agent_tool_response"]`. So **`vad_score`, `tentative_user_transcript`, `agent_chat_response_part` and `agent_response_complete` are off by default**, and Sprint 1 must add them in `sync-agents`.
- In the text-only ws sessions, `agent_chat_response_part` (`start` / `delta` / `stop`, same `event_id` and `response_id` as the final `agent_response`) was still delivered.
- No server event carried a wall-clock timestamp.

> **Bug found in existing code:** `web/lib/voice/transcript.ts` `tentativeTextFrom()` checks `event.type === "internal_tentative_agent_response"` and reads `tentative_agent_response_internal_event`. The SDK actually calls `onDebug({ type: "tentative_agent_response", response })`, so **tentative agent lines never render today**. It also does not handle `tentative_user_transcript`. Fix in Sprint 1 or 2.

---

## Q6. Conversation history: offsets, tool calls, contextual updates and audio

**Answer.**
- `client.conversationalAi.conversations.get(conversationId)` (`GET /v1/convai/conversations/{id}`) returns:
  - `metadata.start_time_unix_secs` and `call_duration_secs`
  - `has_audio`, `has_user_audio`, `has_response_audio`
  - `transcript[]`
- Each transcript item has:
  - `role` (`user` | `agent`)
  - **`time_in_call_secs` (integer: whole-second resolution)**
  - `message`, `original_message`, `interrupted`, `source_medium` (`audio` | `text` | …), `source_event_id`
  - **`tool_calls[]`** (`request_id, tool_name, params_as_json, tool_has_been_called, type`) and **`tool_results[]`** (`result_value, is_error, tool_latency_secs`, …)
  - **`contextual_update_info`** (`context_id`, `is_superseded`)
  - `conversation_turn_metrics`, `llm_usage`
- The status moves through `initiated → in-progress → processing → done | failed`, so poll until `done`.
- **Audio:** `client.conversationalAi.conversations.audio.get(conversationId)` (`GET …/{id}/audio`) returns `ReadableStream<Uint8Array>`. It is only available when `record_voice` is on and ZRM is off.
- **Lightweight summary:** `conversations.getSummary(id)` omits tool calls and contextual updates.
- **Timing caveat:** `time_in_call_secs` has 1-second resolution, and the server events in the browser carry no timestamps. So sub-second timing (for example "answer started") must be captured **client-side**.

**Evidence.**
- Conversations get API ref: "`time_in_call_secs` (integer, required)", "`tool_calls` (list of ConversationHistoryTranscriptToolCallCommonModelOutput, optional)", "`tool_results` (…)", "`contextual_update_info` (ContextualUpdateInfo, optional)", "`source_medium` (enum, optional) – Allowed values: `audio`, `dtmf`, `text`, `image`, `file`", "`start_time_unix_secs` (integer, required)", "`has_audio` (boolean, required)".
- `elevenlabs-js` `conversations/resources/audio/client/Client.d.ts`: `get(conversation_id: string, requestOptions?): core.HttpResponsePromise<ReadableStream<Uint8Array>>;`
- `elevenlabs-js` `conversations/client/Client.d.ts`: `get(conversation_id: string, request?: …ConversationsGetRequest, …): …GetConversationResponseModel` and `getSummary(…)` "Tool calls, tool results, and contextual updates are omitted".

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/get-audio
- `elevenlabs-js/api/types/ConversationHistoryTranscriptResponseModel.d.ts`
- `elevenlabs-js/api/resources/conversationalAi/resources/conversations/...`

**Verified empirically?** **VERIFIED LIVE** (ws1 history, via `conversations.get` polled until `status:"done"`):
- **Metadata:** `hasAudio: true`, `metadata.startTimeUnixSecs` and `callDurationSecs: 37` are present.
- **Turn offsets:** every transcript item carries integer `time_in_call_secs` (0, 10, 23, 24, 25, 33, 34).
- **Text input:** user text turns carry `source_medium:"text"`.
- **Client tool calls** appear as an agent item with `tool_calls ["client:mark_question_target {\"event_id\": \"evt-001\"}"]`, followed by an agent item with `tool_results` (`result_value` is our JSON ack, `tool_latency_secs` about 0.16). These come before the agent item that holds the question text.
- **Contextual updates** appear as described in Q1.
- **Audio:** `conversations.audio.get(id)` returned a stream, even for this text-only session.

---

## Q7. Data retention and privacy

**Answer.** Per-agent fields under `platform_settings.privacy` (SDK `platformSettings.privacy`, type `PrivacyConfigInput`):

| Field | Default | Meaning |
|---|---|---|
| `record_voice` | `true` | "Whether to record the conversation". `false` means no audio is stored; transcripts are still stored |
| `retention_days` | API ref default `-1`; docs say "By default, ElevenLabs retains conversation data for 2 years" | `-1` = unlimited, `0` = "scheduled deletion" |
| `delete_transcript_and_pii` | `false` | "Whether to delete the transcript and PII" |
| `delete_audio` | `false` | "Whether to delete the audio" |
| `apply_to_existing_conversations` | `false` | Apply the new retention to old data |
| `zero_retention_mode` | `false` | "no PII data is stored" |
| `conversation_history_redaction` | — | Entity redaction; **enterprise only** |

- **ZRM per agent:** no recordings, no transcripts or PII-bearing metadata stored post-call. Data can then only be retrieved through **post-call webhooks**.
- **ZRM side effects:**
  - Only Gemini, Claude and ElevenLabs-hosted Qwen LLMs can be used under ZRM.
  - `enableReasoningSummary` is "Not ZRM compatible".
  - "Enabling Zero Retention Mode may impact ElevenLabs' ability to debug".
- **Plan / tier:**
  - Workspace-wide ZRM is titled "Zero Retention Mode (Enterprise)" and "is available to select enterprise customers".
  - The per-agent toggle page does not state a plan restriction. Whether our (non-enterprise?) workspace may enable per-agent ZRM is **not documented**; verify in the dashboard.
  - History redaction is explicitly enterprise-only.
- **Deleting a conversation:** `client.conversationalAi.conversations.delete(conversationId)` (`DELETE /v1/convai/conversations/{id}`) deletes the **whole** conversation. **No API exists to delete part of a conversation** (for example one off-record segment). Not documented.
- **Muting:** `setMicMuted(true)` / `useConversationInput().setMuted(true)` stops sending mic audio; on WebRTC it is LiveKit `track.mute()`. Off-record speech then never reaches ElevenLabs.

**Evidence.**
- `PrivacyConfigInput.d.ts`: `recordVoice?` "Whether to record the conversation", `retentionDays?` "-1 indicates there is no retention limit", `deleteTranscriptAndPii?`, `deleteAudio?`, `applyToExistingConversations?`, `zeroRetentionMode?` "no PII data is stored", `conversationHistoryRedaction?`.
- Create-agent API ref: "`record_voice` (boolean, optional, default: true)", "`retention_days` (integer, optional, default: -1)", "`zero_retention_mode` (boolean, optional, default: false)".
- Retention doc: "By default, ElevenLabs retains conversation data for 2 years. … Unlimited retention by setting the value to -1. Scheduled deletion by setting the value to 0".
- Audio saving doc: "Set `platform_settings.privacy.record_voice`". Also: "Disabling audio saving will prevent new call audio recordings from being stored. Existing recordings will remain until deleted".
- ZRM per-agent doc: "No call recordings will be stored. No transcripts or call metadata containing PII will be logged or stored by our systems post-call. … To retrieve information about calls made with ZRM-enabled agents, you must use post-call webhooks."
- ZRM (Enterprise) doc: "Zero Retention Mode is available to select enterprise customers." Also: "For ElevenLabs Agents, Gemini, Claude, and ElevenLabs-hosted Qwen LLMs can be used in Zero Retention Mode."
- Privacy doc: "This feature [history redaction] is available to enterprise clients only." Also: "Maximum Privacy: Disable audio saving and set retention to 0 days for immediate deletion of data."
- `conversations/client/Client.d.ts`: `delete(conversation_id: string, requestOptions?): core.HttpResponsePromise<unknown>;`
- `client/dist/utils/WebRTCConnection.js` `setMuted`: "Use LiveKit's built-in track muting … `micTrackPublication.track.mute()`".

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/customization/privacy
- https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention
- https://elevenlabs.io/docs/eleven-agents/customization/privacy/audio-saving
- https://elevenlabs.io/docs/eleven-agents/customization/privacy/zrm
- https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode
- https://elevenlabs.io/docs/eleven-agents/api-reference/conversations/delete
- Changelog 2025-05-19 ("Allowed enabling Zero Retention Mode (ZRM) per agent")

**Verified empirically?** **VERIFIED LIVE:**
- **Deletion:** `conversations.delete(id)` succeeded for all 3 spike conversations. A following `get` returned `404 {"code":"conversation_not_found"}`.
- **Privacy defaults on a new agent:** `recordVoice:true`, `retentionDays:-1`, `deleteTranscriptAndPii:false`, `deleteAudio:false`, `zeroRetentionMode:false`, `conversationHistoryRedaction.enabled:false`.
- **Not tested:** whether our plan allows setting `zero_retention_mode: true` per agent, and microphone muting (needs a voice session).

---

## Q8. Per-session prompt / first-message overrides, and changing dynamic variables mid-session

**Answer.**
- **Overrides.** Yes. `startSession({ overrides: { agent: { prompt: { prompt }, firstMessage, language }, tts, asr, conversation: { textOnly } } })`. Each field must first be allowed under `platform_settings.overrides.conversation_config_override` (for example `agent.first_message: true`, `agent.prompt.prompt: true`). Otherwise "an error will be thrown" (the exception is ASR keywords, which are soft-ignored).
- The wire type also allows `agent.prompt.llm`. The client typing `ConversationConfigOverrideAgentPrompt { prompt?: string; llm?: string }` exposes it too.
- The docs recommend dynamic variables over full overrides.
- **Dynamic variables** are set once at session start (`dynamicVariables` in `startSession`). There is **no client→server event to change them mid-session**; the outgoing event types are only `client_tool_result, contextual_update, conversation_initiation_client_data, mcp_tool_approval_result, multimodal_message, pong, user_activity, user_audio (audio chunk), feedback, user_message`.
- Mid-session changes are possible **server-side only**:
  - a tool result with `assignments` (JSON path → dynamic variable); the docs show this for webhook and client tools;
  - the **Update state** system tool.
- Update state is **not in elevenlabs-js 2.70 typings** (`SystemToolConfigInputParams` has no `update_state`), so configure it in the dashboard or with a raw API call.
- Conflict in the docs: the client tools page says "Note system tools cannot update dynamic variables", while the Update state page says it does. Treat Update state as the newer feature.

**Evidence.**
- Overrides doc: "Overrides can be enabled for the following fields in the agent's security settings: System prompt, First message, Language, Voice ID, LLM, Tools, Knowledge base, Text-only mode, Stability, Speed, Similarity boost, ASR keywords". Also: "For security reasons, overrides are disabled by default." Also: "Set fields under `platform_settings.overrides.conversation_config_override` to `true` …". Also: "For most fields, an error will be thrown if an override is provided when that field does not have overrides enabled."
- Overrides doc (warning): "we recommend using Dynamic Variables as the preferred way to customize your agent's responses".
- `client/dist/utils/BaseConnection.d.ts`: `overrides?: { agent?: { prompt?: ConversationConfigOverrideAgentPrompt; firstMessage?: string; language?: Language; }; tts?: {…}; asr?: { keywords?: string[] }; conversation?: { textOnly?: boolean } }` and `dynamicVariables?: Record<string, string | number | boolean>;`.
- `types/dist/generated/types/outgoing.d.ts`: `export type { ClientToolResultClientToOrchestratorEvent, ContextualUpdateClientToOrchestratorEvent, ConversationInitiationClientToOrchestratorEvent, InputAudioChunk, McpToolApprovalResultClientToOrchestratorEvent, MultimodalMessageClientToOrchestratorEvent, PongClientToOrchestratorEvent, UserActivityClientToOrchestratorEvent, UserAudio, UserFeedbackClientToOrchestratorEvent, UserMessageClientToOrchestratorEvent }`.
- Dynamic variables doc: "Tool calls can create or update dynamic variables if they return a valid JSON object. To specify what should be extracted, set the object path(s) using dot notation." Client tools doc: "The values from the response can also optionally be assigned to dynamic variables, similar to webhook tools."
- Update state doc: "lets your agent set one or more dynamic variables while a conversation is in progress … A single tool call can assign up to 10 dynamic variables at once."
- Useful system variables: `system__conversation_id`, `system__call_duration_secs`, `system__time_utc`, `system__agent_turns`.

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides
- https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables
- https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/update-state
- https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools

**Verified empirically?** **VERIFIED LIVE:**
- **ws0, prompt override without permission:** the server sent `conversation_initiation_metadata` (a conversation id was created) and then **closed the socket with code `1008`, reason `"Override for field 'prompt' is not allowed by config."`**. In the React SDK this surfaces as a disconnect right after connect.
- **ws2, after enabling `platformSettings.overrides.conversationConfigOverride.agent.{firstMessage, prompt.prompt}`:**
  - the overridden first message was spoken: "Debrief starts now.";
  - the overridden prompt was followed: it answered "debrief-override", as the override prompt instructed.
- **Dynamic variables** (`phase`) were accepted at session start in all sessions. Whether `{{phase}}` was substituted into the override prompt was not isolated by this test.

---

## Q9. System tools

**Answer.**
- **System tools in elevenlabs-js 2.70** (`SystemToolConfigInputParams.systemToolType`): `end_call`, `end_procedure`, `knowledge_base`, `knowledge_base_rag`, `language_detection`, `play_keypad_touch_tone`, `skip_turn`, `start_procedure`, `transfer_to_agent`, `transfer_to_number`, `voicemail_detection`.
- **Additional tools in the docs:** *Update state* and *Flag issue for review*.
- **`skip_turn` exists** and is exactly the "stay silent" tool. It is enabled by adding it to `conversation_config.agent.prompt.built_in_tools.skip_turn` (SDK: `prompt.builtInTools.skipTurn`) as `{ type: "system", name: "skip_turn", description: "", params: { systemToolType: "skip_turn" } }`, or through Tools → Add tool → Skip Turn in the dashboard.
- **Optional custom `description`.** Overriding the default trigger description is how we would teach the LLM to "skip unless a released topic exists".
- **`skip_turn` behaviour:**
  - After the call, "the assistant will not speak. It waits for the user to re-engage or for another turn-taking condition to be met."
  - Per the changelog, it "prevents turn timeout from being triggered during intentional user pauses". That matters for us: after a skip, the agent may *not* re-engage via turn_timeout until the user speaks again.

**Evidence.**
- Skip turn doc: "The **Skip Turn** tool allows your conversational agent to explicitly pause and wait for the user to speak or act before continuing." Also "**No Verbal Response**: After this tool is called, the assistant will not speak." Also "Parameters: `reason` (string, optional)." Also the JS example `builtInTools: { skipTurn: { type: "system", name: "skip_turn", description: "", params: { systemToolType: "skip_turn" } } }`.
- System tools doc: "Skip turn: Enable the agent to skip their turns if the LLM detects the agent should not speak yet."
- `SkipTurnToolConfig.d.ts`: "After calling this tool, the assistant should not speak until the user speaks again, or another normal turn-taking condition is met. The tool itself has no parameters and performs no side-effects other than informing the backend that the current turn generation is complete."
- `BuiltInToolsInput.d.ts`: `transferToAgent?, endCall?, languageDetection?, transferToNumber?, skipTurn?, playKeypadTouchTone?, voicemailDetection?` (all `SystemToolConfigInput`).
- Changelog 2025-05-26: "Skip turn system tool … This prevents turn timeout from being triggered during intentional user pauses."
- `sync-agents.mts` already configures `language_detection` this way. `skip_turn` is the same pattern.

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools
- https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/skip-turn
- https://elevenlabs.io/docs/changelog/2025/5/26
- `elevenlabs-js/api/types/{SkipTurnToolConfig,SystemToolConfigInputParams,BuiltInToolsInput}.d.ts`

**Verified empirically?** **Not verified, and a warning sign.**
- The temp agent was created with `prompt.builtInTools.skipTurn` exactly as in the docs' JS example.
- The read-back of `prompt.builtInTools` showed **no enabled built-in tools**.
- In ws1, "Give me a second, let me think." got a question back instead of silence: the agent called `mark_question_target(evt-002)`, then asked "What aspect of channel SYS2 are you considering?".
- So either `builtInTools` passed on `agents.create` is not persisted, or the read-back shape differs from what the spike checked.
- **Sprint 1 must:**
  - enable `skip_turn` through `agents.update` (the same path `sync-agents.mts` already uses for `language_detection`);
  - confirm it by reading the agent back before relying on it.

---

## Q10. LLMs, the default model, and tool-call reliability

**Answer.**
- **Natively supported models** (docs, "Supported models"):
  - ElevenLabs-hosted: DeepSeek Flash 4.1, GLM 5.2, Qwen3.6-35B-A3B, Qwen3.5-397B-A17B
  - Google: Gemini 3.8 / 3.7 / 3.6 / 3.5 Flash, 3.5 Flash-Lite, 3.1 Pro Preview, 3.1 Flash Lite, 3 Flash Preview, 2.5 Flash, 2.5 Flash Lite
  - OpenAI: GPT-6.1 Sol, GPT-6 Astra/Sol/Luna, GPT-5.6 Sol/Terra/Luna, GPT-5.5, 5.4 (+Mini/Nano), 5.2, 5.1, 5 (+Mini/Nano), 4.1 (+Mini/Nano), 4o (+Mini)
  - Anthropic: Claude Opus 5.5 / 5 / 4.8 / 4.7, Sonnet 5.5 / 5 / 4.6 / 4.5, Haiku 4.5
  - Custom LLM is also supported.
- **SDK enum lags the docs.** The installed `elevenlabs-js` 2.70 `Llm` enum has 105 values, but it **lacks some doc-listed models** (for example `claude-sonnet-5-5`, which the simulate API ref lists, and GPT-6.1 Sol). A cast may be needed. Runtime list: `client.conversationalAi.llm.list()`, which also returns `supportsParallelToolCalls` and `deprecationInfo` per model.
- **Default:** observed live as `qwen35-397b-a17b` (see below). **Not documented** in the current docs or schema (`prompt.llm` is "optional" with no default). The changelog 2025-03-17 says "Changed the default agent LLM from Gemini 1.5 Flash to Gemini 2.0 Flash". The client tools page warns *against* Gemini-2.0-Flash for tools. **Always set `prompt.llm` explicitly** in `sync-agents`.
- **Tool-call reliability (documented):**
  - "When using tools, we recommend picking high intelligence models like GPT 5.2, Gemini-2.5-Flash, or Claude Sonnet 4.5 and avoiding Gemini-2.0-Flash."
  - "Some LLMs can struggle with extracting the relevant parameters from the conversation."
  - Also: clear tool names and descriptions, and prompt instructions on when to call each tool.
- **Other relevant settings:**
  - `temperature` (default 0)
  - `backupLlmConfig` / LLM cascading
  - `cascadeTimeoutSeconds` (2–15)
  - `enableParallelToolCalls` ("Not supported by all models")
  - `reasoningEffort` / `thinkingBudget` (latency trade-off)
  - Max system prompt size 2 MB
  - ZRM restricts LLMs to Gemini, Claude and ElevenLabs-hosted Qwen.

**Evidence.**
- LLM doc: "Currently, the following models are natively supported and can be configured via the agent settings: …". Also: "The maximum system prompt size is 2MB". Also "Backup LLM configuration … Default: Uses ElevenLabs' recommended fallback sequence".
- Client tools doc, "LLM selection" warning, quoted above.
- `PromptAgentApiModelInput.d.ts`: `llm?: ElevenLabs.Llm;` "The LLM to query with the prompt and the chat history"; `temperature?` "Defaults to 0."; `cascadeTimeoutSeconds?` "Must be between 2 and 15 seconds."
- `LlmInfoModel.d.ts`: `supportsParallelToolCalls: boolean;` and `deprecationInfo?`.
- Changelog 2025-03-17: "Default LLM update: Changed the default agent LLM from Gemini 1.5 Flash to Gemini 2.0 Flash".

**Sources.**
- https://elevenlabs.io/docs/eleven-agents/customization/llm
- https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools
- https://elevenlabs.io/docs/eleven-agents/api-reference/llm/list
- https://elevenlabs.io/docs/changelog/2025/3/17
- `elevenlabs-js/api/types/{Llm,LlmInfoModel,PromptAgentApiModelInput}.d.ts`

**Verified empirically?** **VERIFIED LIVE:**
- **Default model:** an agent created without `prompt.llm` read back **`llm: "qwen35-397b-a17b"`** (ElevenLabs-hosted Qwen3.5-397B-A17B), `temperature: 0`. This is today's undocumented default. It handled the client tool correctly in 3 of 3 live turns, but in only 1 of 3 simulations. Still pin `prompt.llm` explicitly.
- **`llm.list()`** returned 107 entries. Non-deprecated models with parallel-tool support include `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-4-5`, `gpt-5.5`, `gpt-6.1-sol`, `gemini-3.8-flash` and `gemini-3.5-flash`. `gemini-2.0-flash` and `gemini-2.5-flash` are marked deprecated.
- Full list: `spike-results.json` → `llms`.

---

## Recommended mechanisms

Status labels:
- **VERIFIED LIVE**: observed against the real API (2026-10-04 spike, text-only sessions, n = 1 run per behaviour unless stated).
- **VERIFIED (offline)**: tested by running the installed SDK code without network.
- **DOCUMENTED-ONLY**: from docs or typings, not exercised.

"VERIFIED LIVE" means "observed to work". It is not a pass rate: Sprint 1+ probes must still show ≥ 4 of 5 runs.

### (a) Delivering pointing events to the agent without forcing a reply

- **Use:** `sendContextualUpdate(text, { contextId: event.event_id })`. Use one compact line per event, for example `POINTING_EVENT id=evt-001 status=resolved channel=SYS1 region=[…] record=on`, with no interpretation. Use a **unique `contextId` per event**, so that `contextual_update_info.context_id` in the history maps back to the event and earlier events are not marked `is_superseded`.
- For "current state" information (current focus, released topics, phase), use a **fixed** `contextId` (for example `"ws3-state"`) so that only the newest copy is current.
- **Status:**
  - wire format **VERIFIED** (offline);
  - "does not trigger a response", "used on the next natural turn" and "same `context_id` supersedes the earlier update" are all **VERIFIED LIVE** (2 of 2 updates silent; text-only).
- **Fallback:** a client tool `get_pointing_events` (`expects_response: true`) that the agent calls to pull the latest events from client state. This never adds unsolicited context, but costs a tool round-trip per question. **DOCUMENTED-ONLY.** Dynamic variables are *not* a fallback: they cannot be changed from the client mid-session.

### (b) Linking a question to an event (client tool called right before asking)

- **Feasible.** Define a client tool such as `mark_question_target { event_id: string, kind?: string }` with:
  - `expects_response: true`, so the LLM blocks until our ack and then speaks the question;
  - `pre_tool_speech: "off"`;
  - `execution_mode: "immediate"`;
  - `interruption_mode: "allow"`;
  - a short `response_timeout_secs` (for example 5).
- The prompt says: "Before every question about a pointing event, call `mark_question_target` with that event's id".
- The browser handler records `{event_id, tool_call_id, server event_id, at_utc, at_perf_ms}` and returns a small JSON ack (for example `{"ok":true,"event_id":"evt-001"}`, or an error if the id is unknown or off-record).
- The next `onMessage` with `role:"agent"` is the question. Link it to the pending tool call.
- Post-call, the history shows the `tool_calls` entry on an agent turn immediately before the question, which gives a server-side cross-check.
- **Manage the tool** in `sync-agents.mts` with `tools.create` / `tools.update` plus `agents.update({ conversationConfig: { agent: { prompt: { toolIds } } } })`.
- **Test** with `simulateConversation` plus `toolMockConfig`. The call is recorded in `tool_calls`, but compliance in simulation was lower (1 of 3), so probes need ≥ 5 runs.
- **Status:**
  - SDK dispatch, async handler and returned JSON: **VERIFIED** (offline).
  - LLM calls the tool before the question, with the most recent event id; the ack round-trip takes about 160 ms; the call shows in history before the question: **VERIFIED LIVE** (3 of 3 turns, default LLM, text-only).
- **Fallback:** no tool. Link on the client: the event is the one whose topic was most recently *released* (see (c)) before the agent turn started. The `event_id` decision stays entirely on our side, and only one topic is released at a time. Do not ask the agent to embed ids in its text, because everything it emits is spoken. **DOCUMENTED-ONLY.**

### (c) Pause-aware release of queued topics

- **Use:** a client-side gate plus native turn-taking.
- **Client queue.** The client keeps a topic queue and **releases** a topic by sending a state contextual update (`contextId:"ws3-state"`, for example `RELEASED_TOPIC id=evt-001 kind=explain; you may ask now`) only when all of these hold:
  - the agent is not speaking (`useConversationMode().isListening`);
  - no user speech for at least N ms (`onVadScore` < threshold, with `vad_score` enabled in `client_events`, and/or local `getInputVolume()` below threshold);
  - no `tentative_user_transcript` in the last N ms;
  - the rate limit allows it (3–5 per 10 minutes).
- **Who takes the turn.** The agent asks on its **next natural turn**: either the end of the expert's utterance (turn model `turn_v3`, `turn_eagerness: "patient"`) or the silence turn (`turn_timeout` about 8–15 s).
- **When nothing is released,** the prompt makes the agent call **`skip_turn`** instead of speaking. Give `skip_turn` a custom description to that effect.
- **Status:**
  - event plumbing: **VERIFIED** (offline);
  - `turn_timeout` range (`-1` or 1–300 s) and the default `client_events` lacking `vad_score` / `tentative_user_transcript`: **VERIFIED LIVE**;
  - the gate behaviour itself: **DOCUMENTED-ONLY**.
- **`skip_turn` is NOT verified:** it was not enabled after `agents.create` (see Q9). In the live test, a "let me think" turn was answered with a question. Until Sprint 1 confirms `skip_turn` via read-back, assume the agent *will* speak on every natural turn, and rely on prompt rules plus the fallback below.
- **Risk:** `skip_turn` suppresses turn-timeout re-engagement, so after a skip the agent may wait for the expert to speak again before asking.
- **Fallback:** client-forced turn. When the gate opens, call `sendUserMessage("[CONTROL] Ask about released topic evt-001 now.")`. This *does* trigger a turn (documented). It is stored as a user turn with `source_medium:"text"`, so the persistence layer must drop every text-medium user turn and anything we sent ourselves from the verbatim expert record. **DOCUMENTED-ONLY.**
- **To suppress the agent during an ongoing expert explanation,** send `sendUserActivity()`. It resets the turn timer and pauses the agent for about 2 s.

### (d) Phase switching live → debrief → teach-back

- **Use:** one ElevenLabs session for the whole interview. Keep all phases' instructions in the system prompt. Switch with a state contextual update (`contextId:"ws3-phase"`, for example `PHASE=debrief`) sent from our UI or controller.
- **Optional server-side confirmation:** a client tool `get_phase` (`expects_response: true`) that returns phase-specific instructions and rules. Its result can be written to a `{{phase}}` dynamic variable through tool `assignments`.
- **Why one session:** one conversation id, one audio file, one `time_in_call_secs` timeline for evidence offsets.
- **Status:**
  - a contextual update is silently absorbed and used on the next turn: **VERIFIED LIVE** (see (a));
  - the agent switching behaviour on a `PHASE=` update: **DOCUMENTED-ONLY** (not tested).
- **Fallback:** end the session and start a new one per phase.
  - Use `overrides.agent.prompt.prompt` and `overrides.agent.firstMessage`. This requires enabling `platform_settings.overrides.conversation_config_override.agent.{first_message, prompt.prompt}`; **without that the server closes the socket with 1008**.
  - Use `dynamicVariables` to inject the phase and a compact summary of open questions.
  - Cost: separate conversation ids, audio files and timelines that must be stitched by our session id.
  - **VERIFIED LIVE** (override applied and followed; 1008 without permission).
- **Alternative:** ElevenLabs workflows, with per-node prompt and `TurnConfig` overrides, can change turn eagerness and timeout per phase. More moving parts; consider only if per-phase turn settings prove necessary. **DOCUMENTED-ONLY.**

### (e) Timing capture

- **Use client-side capture as the primary record.** Stamp every relevant callback on receipt with `Date.now()` (UTC) and `performance.now()`, since server events carry no timestamps, only `event_id`:
  - `onMessage` (final user and agent lines)
  - `onModeChange` (agent speech started and stopped)
  - `onDebug` `tentative_user_transcript` (answer started)
  - `onVadScore` threshold crossings
  - client tool calls (question_tool_called)
  - our own `sendContextualUpdate` (event_received, topic_released)
- Record `onConnect`'s `conversationId` and the connect time.
- **Post-session,** `conversations.get(id)` gives `metadata.start_time_unix_secs` plus per-turn `time_in_call_secs` (integer seconds) and `tool_calls` and `contextual_update_info`. Use these to cross-check and to compute `audio_offset_secs` for each exchange. Audio is available from `conversations.audio.get(id)` if `record_voice` stays on.
- **Status:**
  - callback payloads: **VERIFIED** (offline);
  - server events carry no wall-clock time; history has integer `time_in_call_secs`, `start_time_unix_secs`, `tool_calls` / `tool_results` / `contextual_update_info`; audio is downloadable: **VERIFIED LIVE**.
- **Fallback:** if the history is unavailable (ZRM, deleted, or the call fails), use client timestamps relative to `onConnect` as the audio offset approximation. Mark these `audio_offset_secs` as client-derived.

### (f) Off-record: what can be excluded on ElevenLabs' side

- **Use:**
  1. On "off record", call `useConversationInput().setMuted(true)`; on WebRTC this is LiveKit `track.mute()`. The expert's audio then never reaches ElevenLabs: no transcript, no recording, no LLM context.
  2. Send a state contextual update `RECORD_STATE=off; do not ask questions`.
  3. Call `sendUserActivity()` periodically (every ≤ 5 s). This stops the turn timeout from making the agent speak into the off-record silence.
  4. Locally, drop everything in the segment from every persisted path.
  5. On "on record", unmute and send `RECORD_STATE=on`.
- **Status:** mute mechanism **DOCUMENTED-ONLY** (SDK source read, not run).
- **Limits:** ElevenLabs cannot redact or delete *part* of a conversation. `conversations.delete(id)` removes the whole conversation; history redaction is enterprise-only.
- **Fallback / defence in depth:**
  - After our local export, call `conversations.delete(conversationId)` for any session that contained off-record segments (or for every session).
  - Agent-level `platform_settings.privacy`: `record_voice: false`, a low `retention_days`.
  - Optionally `zero_retention_mode: true`. This disables `conversations.get` transcripts, so data then comes only from client events and post-call webhooks, and it restricts the LLM to Gemini, Claude or Qwen.
  - `conversations.delete` removing the whole conversation (then `404`): **VERIFIED LIVE**.
  - Privacy settings and ZRM: **DOCUMENTED-ONLY** (defaults read back live: `record_voice: true`, `retention_days: -1`).
- **Caveat:** an off-record request that is spoken *before* muting is still transcribed. Prefer a UI or gesture toggle over a spoken command.

---

## Open risks

1. **Text-only verification.** The live spike (2026-10-04) used text-only sessions and n = 1 per behaviour. Voice behaviour (VAD, tentative transcripts, end-of-turn detection, interruptions, muting) is still DOCUMENTED-ONLY. The Sprint 1 and 2 live gates must cover it.
2. **Contextual updates do influence the next spoken turn** (VERIFIED LIVE). The agent used the latest event's content in its next question. That is wanted for linking, but prompt discipline must stop it from volunteering interpretations of the event.
2b. **`skip_turn` was not active after `agents.create` with `builtInTools.skipTurn`** (read-back empty), and a "let me think" turn got a question. Enable it via `agents.update` and confirm by read-back in Sprint 1.
3. **`skip_turn` and turn timeout interact.** After `skip_turn` the agent may not re-engage on silence (changelog: "prevents turn timeout from being triggered"). Pause-time questions could then wait until the expert speaks again. Sprint 2 must measure this live.
4. **Turn timing cannot be changed per session.** `turn_timeout` and `turn_eagerness` are agent-level (or workflow-node) only. The API accepts `-1` (disabled) or 1–300 s (VERIFIED LIVE), although the docs say 1–30 s.
5. **Integer-second `time_in_call_secs`, and no timestamps on client events.** Sub-second timing must come from client stamps; server offsets are coarse.
6. **Superseded contextual updates.** It is not documented whether `is_superseded` updates are removed from LLM context. Live, a shared `contextId` marked the earlier pointing event `is_superseded: true`. Use per-event ids.
7. **Simulation fidelity.** Contextual updates cannot be placed in `partialConversationHistory`: an input `contextual_update_info` is silently ignored and the item becomes a normal user turn (VERIFIED LIVE). Text probes therefore only approximate the live mechanism. Client tools are mocked, not executed, and tool compliance in simulation was lower (1 of 3) than live (3 of 3).
7b. **Tool cleanup.** Inline tools passed on `agents.create` become standalone tools. After the agent is deleted they still report an orphaned dependent and need `tools.delete(id, { force: true })`.
8. **SDK lag.** elevenlabs-js 2.70 lacks `update_state`, `tool_mock_overrides` and some LLM ids that are in the docs (for example `claude-sonnet-5-5`). Raw REST or casts may be needed.
9. **Default LLM is undocumented.** Live it is currently `qwen35-397b-a17b`. Defaults can change without notice, so pin `prompt.llm` in `sync-agents`.
9b. **Defaults that differ from the docs** (VERIFIED LIVE): `speculative_turn` read back `true`; `client_events` lacks `vad_score`, `tentative_user_transcript` and `agent_chat_response_part`. Set all of these explicitly.
10. **`max_duration_seconds` defaults to 600 s** (10 minutes). An expert session plus debrief will exceed it; raise it on the agent (range 60–7200).
11. **Plan restrictions.** ZRM and history redaction are enterprise features (per-agent ZRM availability on our plan is not documented). Off-record cannot rely on them.
12. **Existing bug.** `web/lib/voice/transcript.ts` `tentativeTextFrom()` never matches what the SDK emits (`{type:"tentative_agent_response", response}`), so tentative agent text is never shown. It also ignores `tentative_user_transcript`.
