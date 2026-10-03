/**
 * WS3 Sprint 0 live capability check (see notes/ws3-sprints/docs/elevenlabs-capabilities.md).
 * Self-cleaning: creates ONE temporary agent "ws3-spike-temp-DELETE-ME", runs simulateConversation
 * variants and three text-only sessions, reads the history, then deletes the conversations, the
 * agent and its auto-created tools in `finally`. Touches nothing else in the account.
 *
 *   npm run spike:ws3     # writes notes/ws3-sprints/docs/spike-results.json
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = resolve(webDir, "..", "notes", "ws3-sprints", "docs", "spike-results.json");
process.loadEnvFile(`${webDir}/.env`);
const require = createRequire(`${webDir}/package.json`);
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");

const apiKey = process.env.ELEVENLABS_API_KEY!.trim();
const client = new ElevenLabsClient({ apiKey });
const AGENT_NAME = "ws3-spike-temp-DELETE-ME";
const log: Record<string, unknown> = {};
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const errMsg = (e: unknown) => {
  const x = e as { statusCode?: number; body?: unknown; message?: string };
  return { status: x.statusCode, body: x.body ?? x.message };
};

const PROMPT = `You are a test apprentice in a research spike. Current phase: {{phase}}.
You receive background context messages describing POINTING EVENTS with an id like evt-001.
Never respond to a context message on its own; just remember it.
When the user speaks about something they see, FIRST call the tool mark_question_target with the event_id of the most recent pointing event, THEN ask exactly one short question about it.
If the user asks which phase you are in, answer with the phase name only.
If the user says they need a moment to think, call skip_turn and say nothing.`;

const TOOL = {
  type: "client" as const,
  name: "mark_question_target",
  description: "Call right before asking a question about a pointing event, with that event's id.",
  expectsResponse: true,
  responseTimeoutSecs: 10,
  parameters: {
    type: "object" as const,
    required: ["event_id"],
    properties: { event_id: { type: "string" as const, description: "Pointing event id, e.g. evt-001" } },
  },
};

type WsEvent = { t: number; dir: "in" | "out"; ev: any };

async function wsSession(agentId: string, init: Record<string, unknown>, script: (h: {
  send: (o: unknown) => void; waitFor: (pred: (e: any) => boolean, ms: number) => Promise<any>; idle: (ms: number) => Promise<void>;
}) => Promise<void>) {
  const { signedUrl } = await client.conversationalAi.conversations.getSignedUrl({ agentId });
  const events: WsEvent[] = [];
  const t0 = Date.now();
  const ws = new WebSocket(signedUrl);
  let closeInfo: unknown = null;
  const waiters: { pred: (e: any) => boolean; res: (e: any) => void }[] = [];
  const send = (o: unknown) => { events.push({ t: Date.now() - t0, dir: "out", ev: o }); ws.send(JSON.stringify(o)); };
  ws.onmessage = m => {
    const ev = JSON.parse(String(m.data));
    if (ev.type === "ping") { ws.send(JSON.stringify({ type: "pong", event_id: ev.ping_event.event_id })); return; }
    if (ev.type === "audio") return;
    events.push({ t: Date.now() - t0, dir: "in", ev });
    if (ev.type === "client_tool_call") {
      send({ type: "client_tool_result", tool_call_id: ev.client_tool_call.tool_call_id, result: JSON.stringify({ ok: true, linked_event_id: ev.client_tool_call.parameters?.event_id }), is_error: false });
    }
    for (const w of [...waiters]) if (w.pred(ev)) { waiters.splice(waiters.indexOf(w), 1); w.res(ev); }
  };
  const closed = new Promise<void>(res => { ws.onclose = c => { closeInfo = { code: c.code, reason: c.reason }; res(); }; });
  await new Promise<void>((res, rej) => { ws.onopen = () => res(); ws.onerror = e => rej(e); });
  send({ type: "conversation_initiation_client_data", ...init });
  const waitFor = (pred: (e: any) => boolean, ms: number) => new Promise<any>(res => {
    const w = { pred, res }; waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); res(null); } }, ms);
  });
  const idle = (ms: number) => sleep(ms);
  try { await Promise.race([script({ send, waitFor, idle }), closed]); } catch (e) { events.push({ t: Date.now() - t0, dir: "in", ev: { scriptError: String(e) } }); }
  if (ws.readyState === WebSocket.OPEN) ws.close();
  await Promise.race([closed, sleep(3000)]);
  const meta = events.find(e => e.ev.type === "conversation_initiation_metadata");
  return { conversationId: meta?.ev.conversation_initiation_metadata_event?.conversation_id as string | undefined, events, closeInfo };
}

const summarize = (events: WsEvent[]) => events.map(({ t, dir, ev }) => {
  const short = { ...ev };
  return `${String(t).padStart(6)}ms ${dir} ${JSON.stringify(short).slice(0, 260)}`;
});

async function getConversationWhenDone(id: string) {
  for (let i = 0; i < 30; i++) {
    const c = await client.conversationalAi.conversations.get(id);
    if (c.status === "done" || c.status === "failed") return c;
    await sleep(3000);
  }
  return client.conversationalAi.conversations.get(id);
}

const convIds: string[] = [];
let agentId: string | undefined;
let createdToolIds: string[] = [];

try {
  // --- LLM list
  try {
    const llms = await client.conversationalAi.llm.list();
    log.llmCount = llms.llms.length;
    log.llms = llms.llms.filter((l: any) => !l.isCheckpoint).map((l: any) => `${l.llm}${l.supportsParallelToolCalls ? " [parallel-tools]" : ""}${l.deprecationInfo ? " [deprecation]" : ""}`);
  } catch (e) { log.llmListError = errMsg(e); }

  // --- create temp agent
  const created = await client.conversationalAi.agents.create({
    name: AGENT_NAME,
    conversationConfig: {
      agent: {
        firstMessage: "Ready.",
        language: "en",
        dynamicVariables: { dynamicVariablePlaceholders: { phase: "live" } },
        prompt: {
          prompt: PROMPT,
          tools: [TOOL],
          builtInTools: { skipTurn: { type: "system", name: "skip_turn", description: "", params: { systemToolType: "skip_turn" } } },
        },
      },
      conversation: { textOnly: true },
      turn: { turnTimeout: 30 },
    },
  });
  agentId = created.agentId;
  log.agentCreated = true;

  const cfg = await client.conversationalAi.agents.get(agentId!);
  const p = cfg.conversationConfig.agent?.prompt as any;
  createdToolIds = p?.toolIds ?? [];
  log.readBack = {
    defaultLlm: p?.llm,
    temperature: p?.temperature,
    toolIds: p?.toolIds,
    inlineToolsReturned: (p?.tools ?? []).map((t: any) => ({ type: t.type, name: t.name, expectsResponse: t.expectsResponse, executionMode: t.executionMode, responseTimeoutSecs: t.responseTimeoutSecs })),
    builtInTools: Object.keys(p?.builtInTools ?? {}).filter(k => p.builtInTools[k]),
    turn: cfg.conversationConfig.turn,
    clientEventsDefault: cfg.conversationConfig.conversation?.clientEvents,
    privacyDefault: cfg.platformSettings?.privacy,
    overridesDefault: cfg.platformSettings?.overrides,
  };
  for (const id of createdToolIds) {
    try { const t = await client.conversationalAi.tools.get(id); (log.autoTools ??= [] as unknown[]) && (log.autoTools as unknown[]).push({ id, name: (t as any).toolConfig?.name, type: (t as any).toolConfig?.type }); } catch (e) { log.toolGetErr = errMsg(e); }
  }

  // --- turn timeout bounds (temp agent only)
  log.turnTimeoutTests = {};
  for (const v of [-1, 60, 0.5]) {
    try { await client.conversationalAi.agents.update(agentId!, { conversationConfig: { turn: { turnTimeout: v } } }); (log.turnTimeoutTests as any)[v] = "accepted"; }
    catch (e) { (log.turnTimeoutTests as any)[v] = errMsg(e); }
  }
  await client.conversationalAi.agents.update(agentId!, { conversationConfig: { turn: { turnTimeout: 30 } } });
  const afterTurn = await client.conversationalAi.agents.get(agentId!);
  log.turnAfterReset = afterTurn.conversationConfig.turn?.turnTimeout;

  // --- simulateConversation A: no mock
  const baseHistory = [
    { role: "agent", message: "Ready.", timeInCallSecs: 0 },
  ];
  const sim = async (label: string, extra: Record<string, unknown>) => {
    try {
      const res = await client.conversationalAi.agents.simulateConversation(agentId!, {
        simulationSpecification: {
          simulatedUserConfig: { firstMessage: "Hmm, look at this part here.", language: "en", prompt: { prompt: "You are the human. Reply only with 'ok'." } },
          partialConversationHistory: baseHistory,
          dynamicVariables: { phase: "live" },
          ...extra,
        },
        newTurnsLimit: 4,
      });
      log[label] = res.simulatedConversation.map((t: any) => ({ role: t.role, message: t.message, toolCalls: t.toolCalls?.map((c: any) => ({ name: c.toolName, params: c.paramsAsJson, called: c.toolHasBeenCalled, type: c.type })), toolResults: t.toolResults?.map((r: any) => ({ name: r.toolName, value: r.resultValue, err: r.isError, called: r.toolHasBeenCalled })), contextualUpdateInfo: t.contextualUpdateInfo }));
    } catch (e) { log[label] = { error: errMsg(e) }; }
  };
  // History that contains a pointing event as plain text in a user turn (contextual updates have no input field)
  baseHistory.push({ role: "user", message: "[context] POINTING EVENT evt-001: expert pointed at channel SYS1.", timeInCallSecs: 2 } as any);
  baseHistory.push({ role: "agent", message: "", timeInCallSecs: 3 } as any);
  await sim("simA_noMock", {});
  await sim("simB_toolMockConfig", { toolMockConfig: { mark_question_target: { defaultReturnValue: "MOCKED-RESULT-123" } } });

  // C: partial history containing a prior client tool call + result
  try {
    const res = await client.conversationalAi.agents.simulateConversation(agentId!, {
      simulationSpecification: {
        simulatedUserConfig: { firstMessage: "What did you just mark?", language: "en", prompt: { prompt: "You are the human. Reply only with 'ok'." } },
        partialConversationHistory: [
          { role: "agent", message: "Ready.", timeInCallSecs: 0 },
          { role: "user", message: "Look here.", timeInCallSecs: 2 },
          { role: "agent", timeInCallSecs: 3, toolCalls: [{ requestId: "req_1", toolName: "mark_question_target", paramsAsJson: "{\"event_id\":\"evt-777\"}", toolHasBeenCalled: true, type: "client" }] },
          { role: "agent", timeInCallSecs: 3, toolResults: [{ requestId: "req_1", toolName: "mark_question_target", resultValue: "{\"ok\":true,\"linked_event_id\":\"evt-777\"}", isError: false, toolHasBeenCalled: true, type: "client" }] },
          { role: "agent", message: "What do you recognize in this region?", timeInCallSecs: 4 },
        ],
        dynamicVariables: { phase: "live" },
      },
      newTurnsLimit: 2,
    });
    log.simC_historyWithToolResult = res.simulatedConversation.slice(5).map((t: any) => ({ role: t.role, message: t.message, toolCalls: t.toolCalls?.map((c: any) => c.toolName + " " + c.paramsAsJson) }));
  } catch (e) { log.simC_historyWithToolResult = { error: errMsg(e) }; }

  // D: raw REST with contextual_update_info on a history item (not in SDK input type)
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}/simulate-conversation`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        simulation_specification: {
          simulated_user_config: { first_message: "Hmm, look at this part here.", language: "en", prompt: { prompt: "Reply only with 'ok'." } },
          partial_conversation_history: [
            { role: "agent", message: "Ready.", time_in_call_secs: 0 },
            { role: "user", message: "POINTING EVENT evt-555 on channel SYS2.", time_in_call_secs: 2, contextual_update_info: { context_id: "pointing" } },
          ],
          dynamic_variables: { phase: "live" },
        },
        new_turns_limit: 3,
      }),
    });
    const body = await r.json();
    log.simD_rawContextualHistory = { status: r.status, turns: body.simulated_conversation?.map((t: any) => ({ role: t.role, message: t.message, tool_calls: t.tool_calls?.map((c: any) => c.tool_name + " " + c.params_as_json), cui: t.contextual_update_info })) ?? body };
  } catch (e) { log.simD_rawContextualHistory = { error: String(e) }; }

  // --- WS session 0: prompt override WITHOUT permission
  const s0 = await wsSession(agentId!, { dynamic_variables: { phase: "live" }, conversation_config_override: { agent: { prompt: { prompt: "Override prompt" } } } }, async h => { await h.waitFor(e => e.type === "agent_response", 8000); });
  if (s0.conversationId) convIds.push(s0.conversationId);
  log.ws0_overrideWithoutPermission = { closeInfo: s0.closeInfo, events: summarize(s0.events) };

  // --- WS session 1: contextual updates, client tool linking, skip_turn
  const s1 = await wsSession(agentId!, { dynamic_variables: { phase: "live" } }, async h => {
    await h.waitFor(e => e.type === "agent_response", 10000);
    h.send({ type: "contextual_update", text: "POINTING EVENT evt-001: expert pointed at channel SYS1, normalized region x=0.20-0.40.", context_id: "pointing" });
    await h.idle(10000); // any agent_response here = contextual update triggered a turn
    h.send({ type: "user_message", text: "Hmm, look at this part here." });
    await h.waitFor(e => e.type === "agent_response", 20000);
    await h.idle(4000);
    h.send({ type: "contextual_update", text: "POINTING EVENT evt-002: expert pointed at channel SYS2, region x=0.60-0.70.", context_id: "pointing" });
    await h.idle(8000);
    h.send({ type: "user_message", text: "Give me a second, let me think." });
    await h.idle(10000);
    h.send({ type: "user_message", text: "OK. And this one here?" });
    await h.waitFor(e => e.type === "agent_response", 20000);
    await h.idle(2000);
  });
  if (s1.conversationId) convIds.push(s1.conversationId);
  log.ws1 = { closeInfo: s1.closeInfo, events: summarize(s1.events) };

  // --- enable overrides, WS session 2 with prompt + first message override and changed dynamic variable
  await client.conversationalAi.agents.update(agentId!, {
    platformSettings: { overrides: { conversationConfigOverride: { agent: { firstMessage: true, prompt: { prompt: true } } } } },
  });
  const s2 = await wsSession(agentId!, {
    dynamic_variables: { phase: "debrief" },
    conversation_config_override: { agent: { first_message: "Debrief starts now.", prompt: { prompt: "You are in the DEBRIEF phase (dynamic phase variable: {{phase}}). If asked which phase you are in, answer exactly: 'debrief-override'." } } },
  }, async h => {
    await h.waitFor(e => e.type === "agent_response", 10000);
    h.send({ type: "user_message", text: "Which phase are you in?" });
    await h.waitFor(e => e.type === "agent_response", 20000);
  });
  if (s2.conversationId) convIds.push(s2.conversationId);
  log.ws2_overrideWithPermission = { closeInfo: s2.closeInfo, events: summarize(s2.events) };

  // --- history of session 1
  if (s1.conversationId) {
    const c = await getConversationWhenDone(s1.conversationId);
    log.history1 = {
      status: c.status, hasAudio: c.hasAudio, startTimeUnixSecs: c.metadata?.startTimeUnixSecs, callDurationSecs: c.metadata?.callDurationSecs,
      transcript: c.transcript.map((t: any) => ({ role: t.role, time_in_call_secs: t.timeInCallSecs, message: t.message, source_medium: t.sourceMedium, interrupted: t.interrupted, cui: t.contextualUpdateInfo, tool_calls: t.toolCalls?.map((x: any) => `${x.type}:${x.toolName} ${x.paramsAsJson}`), tool_results: t.toolResults?.map((x: any) => `${x.toolName} -> ${x.resultValue} latency=${x.toolLatencySecs}`), turn_metrics: t.conversationTurnMetrics ? Object.keys(t.conversationTurnMetrics.metrics ?? t.conversationTurnMetrics) : undefined })),
    };
    try { await client.conversationalAi.conversations.audio.get(s1.conversationId); log.audioGet = "returned a stream"; } catch (e) { log.audioGet = errMsg(e); }
  }
} catch (e) {
  log.fatal = errMsg(e);
} finally {
  // delete conversations created by this spike (also verifies conversations.delete)
  log.convDeletes = [];
  for (const id of convIds) {
    try { await client.conversationalAi.conversations.delete(id); let gone = false; try { await client.conversationalAi.conversations.get(id); } catch (e) { gone = (e as any).statusCode === 404 || true; (log as any).afterDeleteGet = errMsg(e); } (log.convDeletes as unknown[]).push({ id, deleted: true, getAfterDeleteFails: gone }); }
    catch (e) { (log.convDeletes as unknown[]).push({ id, error: errMsg(e) }); }
  }
  if (agentId) {
    try { await client.conversationalAi.agents.delete(agentId); log.agentDeleted = true; } catch (e) { log.agentDeleteError = errMsg(e); }
    try { await client.conversationalAi.agents.get(agentId); log.agentStillExists = true; } catch (e) { log.agentGetAfterDelete = errMsg(e); }
  }
  log.toolDeletes = [];
  for (const id of createdToolIds) {
    try {
      const t: any = await client.conversationalAi.tools.get(id);
      if (t.toolConfig?.name !== "mark_question_target") { (log.toolDeletes as unknown[]).push({ id, skipped: "name mismatch" }); continue; }
      await client.conversationalAi.tools.delete(id); (log.toolDeletes as unknown[]).push({ id, deleted: true });
    } catch (e) { (log.toolDeletes as unknown[]).push({ id, error: errMsg(e) }); }
  }
  writeFileSync(outPath, JSON.stringify(log, null, 2) + "\n");
  console.log("done; agentDeleted =", log.agentDeleted, "convDeletes =", JSON.stringify(log.convDeletes));
}
