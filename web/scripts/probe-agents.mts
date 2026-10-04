/**
 * Text probes against the live agents via ElevenLabs' conversation simulation.
 * Prints the agent's reply (and tool calls) to each scripted case so
 * prompt/knowledge changes can be checked without a microphone. Cases come
 * from ../agents/probes.json.
 *
 *   npm run probe                          # all agents
 *   npm run probe -- expert                # one agent
 *   npm run probe -- expert --runs 5       # each case 5×, with a pass-count summary
 *   npm run probe -- expert --runs 5 --case two-events,teach-back-shape   # only these cases
 *
 * Two case shapes:
 *   { name, user: string[] }                          print-only (a neutral agent turn between lines)
 *   { name, history: [{role, text}], expect: {...} }  explicit history, checked automatically
 *
 * Simulations cannot carry contextual updates, so pointing events are injected
 * as user-role `[POINTING_EVENT] …` turns (probes only). Client tools are not
 * executed in a simulation; begin_question is mocked via toolMockConfig.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type {
  ConversationHistoryTranscriptCommonModelInput as Turn,
  ConversationHistoryTranscriptResponseModel as OutTurn,
} from "@elevenlabs/elevenlabs-js/api";

type Expect = {
  toolCalled?: string; // this tool must be called before the spoken question
  eventId?: string; // event_id param of that tool call
  kind?: string | string[]; // kind param, one of these
  forbidPatterns?: string[]; // case-insensitive regexes; checked on the spoken reply and the tool's question param
  maxQuestions?: number; // max "?" in the spoken reply and max calls of toolCalled
  toolOptional?: boolean; // staying silent (no question, no tool call) also passes
  forbidKinds?: string[]; // kind params that must not be used
  requirePatterns?: string[]; // case-insensitive regexes the spoken question must match (when one is asked)
  requireTools?: ToolMatch[]; // each must be called (params JSON matching paramsPattern, if given)
  forbidTools?: ToolMatch[]; // none may be called (with params JSON matching paramsPattern, if given)
  allowedGapIds?: string[]; // every begin_question gap_id must be one of these
  endsWithQuestion?: boolean; // the spoken reply must end with "?"
};
type ToolMatch = { name: string; paramsPattern?: string };
type LegacyCase = { name: string; user: string[] };
type HistoryCase = { name: string; history: { role: "user" | "agent"; text: string }[]; expect?: Expect };
type Case = LegacyCase | HistoryCase;
// { "<agent>": { "envVar": "...", "language": "en", "cases": [...] } }
type Probes = Record<string, { envVar: string; language?: string; cases: Case[] }>;

type RunResult = { lastUser: string; toolCalls: { name: string; params: string }[]; reply: string; failures: string[] };

const TOOL_MOCKS = {
  // same wording as the app (SAY_IT in session.ts, AFTER_COVERAGE_LIVE in debrief.ts)
  begin_question: { defaultReturnValue: "ok exchange_id=ex-sim. Now say the question out loud, word for word." },
  record_coverage: { defaultReturnValue: "ok coverage recorded. Next: either call begin_question and then say that question out loud, or call skip_turn." },
  signal_task_complete: { defaultReturnValue: "ok phase=debrief." },
  propose_draft: { defaultReturnValue: "ok revision_id=rev-sim." },
  confirm_revision: { defaultReturnValue: "ok confirmation recorded." },
};

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(webDir, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const probesPath = resolve(webDir, "..", "agents", "probes.json");
if (!existsSync(probesPath)) {
  console.error(`Missing ${probesPath} (copy probes.example.json)`);
  process.exit(1);
}
const PROBES: Probes = JSON.parse(readFileSync(probesPath, "utf8"));
const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });

const args = process.argv.slice(2);
const runsIdx = args.indexOf("--runs");
const runs = runsIdx >= 0 ? Math.max(1, Number(args[runsIdx + 1]) || 1) : 1;
const caseIdx = args.indexOf("--case");
const caseFilter = caseIdx >= 0 ? new Set(args[caseIdx + 1]?.split(",")) : null;
const only = args.find((a, i) => !a.startsWith("--") && i !== runsIdx + 1 && i !== caseIdx + 1);

const summary: { agent: string; name: string; passed: number | null; runs: number }[] = [];

for (const [agent, spec] of Object.entries(PROBES)) {
  if (only && only !== agent) continue;
  const agentId = process.env[spec.envVar]?.trim();
  if (!agentId) {
    console.warn(`! ${agent}: ${spec.envVar} not set`);
    continue;
  }
  const cfg = await client.conversationalAi.agents.get(agentId);
  const first = cfg.conversationConfig.agent?.firstMessage ?? "";
  console.log(`\n═══ ${agent} (${cfg.name}) ═══`);

  for (const c of spec.cases) {
    if (caseFilter && !caseFilter.has(c.name)) continue;
    const history = buildHistory(c, first);
    // runs of one case go in parallel
    const results = await Promise.all(
      Array.from({ length: runs }, () => simulate(agentId, history, spec.language ?? "en", "expect" in c ? c.expect : undefined)),
    );
    console.log(`\n▸ ${c.name}\n  👤 ${results[0].lastUser}`);
    results.forEach((r, i) => {
      const verdict = "expect" in c && c.expect ? (r.failures.length ? `✗ ${r.failures.join("; ")}` : "✓") : "";
      if (runs > 1 || verdict) console.log(`  — run ${i + 1}/${runs} ${verdict}`);
      for (const tc of r.toolCalls) console.log(`  ⚙ ${tc.name} ${tc.params}`);
      console.log(`  🤖 ${r.reply || "(no agent turn)"}`);
    });
    const checked = "expect" in c && c.expect;
    summary.push({ agent, name: c.name, passed: checked ? results.filter(r => !r.failures.length).length : null, runs });
  }
}

if (summary.some(s => s.passed !== null)) {
  console.log("\n═══ summary ═══");
  const w = Math.max(...summary.map(s => `${s.agent}/${s.name}`.length));
  for (const s of summary) {
    const label = `${s.agent}/${s.name}`.padEnd(w);
    console.log(`  ${label}  ${s.passed === null ? "(no assertions)" : `${s.passed}/${s.runs}`}`);
  }
}

// --- helpers ------------------------------------------------------------------

// history = first message, then the case's turns; the simulator continues from
// there, so the next agent turn is the agent's real reply.
function buildHistory(c: Case, first: string): Turn[] {
  const history: Turn[] = [{ role: "agent", message: first, timeInCallSecs: 0 }];
  if ("history" in c) {
    c.history.forEach((t, i) => history.push({ role: t.role, message: t.text, timeInCallSecs: (i + 1) * 5 }));
  } else {
    c.user.forEach((u, i) => {
      if (i > 0) history.push({ role: "agent", message: "Understood.", timeInCallSecs: i * 10 - 5 });
      history.push({ role: "user", message: u, timeInCallSecs: i * 10 });
    });
  }
  return history;
}

async function simulate(agentId: string, history: Turn[], language: string, expect?: Expect): Promise<RunResult> {
  const lastUser = [...history].reverse().find(t => t.role === "user")?.message ?? "";
  let turns: OutTurn[];
  try {
    const res = await client.conversationalAi.agents.simulateConversation(agentId, {
      simulationSpecification: {
        simulatedUserConfig: {
          firstMessage: lastUser,
          language,
          prompt: { prompt: "You are the human in this conversation. Reply only with 'ok'." },
        },
        partialConversationHistory: history,
        toolMockConfig: TOOL_MOCKS,
      },
      // a tool call (or a language switch) costs turns before the spoken reply
      newTurnsLimit: 4,
    });
    turns = res.simulatedConversation.slice(history.length);
  } catch (e) {
    return { lastUser, toolCalls: [], reply: "", failures: [`simulation failed: ${(e as Error).message}`] };
  }

  // the agent's response = everything up to the next user turn
  const end = turns.findIndex(t => t.role === "user");
  const block = end >= 0 ? turns.slice(0, end) : turns;
  const toolCalls: { name: string; params: string; at: number }[] = [];
  const spoken: { text: string; at: number }[] = [];
  block.forEach((t, at) => {
    for (const tc of t.toolCalls ?? []) toolCalls.push({ name: tc.toolName, params: tc.paramsAsJson, at });
    if (t.role === "agent" && t.message) spoken.push({ text: t.message, at });
  });
  const reply = spoken.map(s => s.text).join(" ");
  return { lastUser, toolCalls, reply, failures: expect ? check(expect, toolCalls, spoken) : [] };
}

function check(
  expect: Expect,
  toolCalls: { name: string; params: string; at: number }[],
  spoken: { text: string; at: number }[],
): string[] {
  const failures: string[] = [];
  const reply = spoken.map(s => s.text).join(" ");
  const questionCount = (reply.match(/\?+/g) ?? []).length;
  const firstQuestionAt = spoken.find(s => s.text.includes("?"))?.at;

  const calls = expect.toolCalled ? toolCalls.filter(t => t.name === expect.toolCalled) : [];
  const params = calls.map(t => {
    try {
      return JSON.parse(t.params) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  });

  const silent = !calls.length && questionCount === 0;
  if (expect.toolCalled && !(expect.toolOptional && silent)) {
    if (!calls.length) {
      const others = toolCalls.map(t => t.name).join(", ");
      failures.push(`${expect.toolCalled} not called${others ? ` (called: ${others})` : ""}`);
    } else {
      if (firstQuestionAt === undefined) failures.push("no spoken question");
      else if (calls[0].at > firstQuestionAt) failures.push(`question spoken before ${expect.toolCalled}`);
      const p = params[0];
      if (expect.eventId !== undefined && p.event_id !== expect.eventId)
        failures.push(`event_id ${JSON.stringify(p.event_id)} ≠ ${expect.eventId}`);
      const kinds = expect.kind === undefined ? undefined : [expect.kind].flat();
      if (kinds && !kinds.includes(String(p.kind))) failures.push(`kind ${JSON.stringify(p.kind)} ∉ ${kinds.join("|")}`);
    }
  }

  for (const p of params) {
    if (expect.forbidKinds?.includes(String(p.kind))) failures.push(`forbidden kind ${JSON.stringify(p.kind)}`);
  }

  if (expect.requirePatterns?.length && !silent) {
    const asked = [reply, ...params.map(p => (typeof p.question === "string" ? p.question : ""))].join(" ");
    for (const pat of expect.requirePatterns) {
      if (!new RegExp(pat, "i").test(asked)) failures.push(`required /${pat}/ not found`);
    }
  }

  if (expect.forbidPatterns?.length) {
    const texts = [reply, ...params.map(p => (typeof p.question === "string" ? p.question : ""))];
    for (const pat of expect.forbidPatterns) {
      const re = new RegExp(pat, "i");
      const hit = texts.map(t => t.match(re)?.[0]).find(Boolean);
      if (hit) failures.push(`forbidden /${pat}/ matched "${hit}"`);
    }
  }

  const matches = (m: ToolMatch) =>
    toolCalls.filter(t => t.name === m.name && (!m.paramsPattern || new RegExp(m.paramsPattern, "i").test(t.params)));
  for (const m of expect.requireTools ?? []) {
    if (!matches(m).length) failures.push(`${m.name}${m.paramsPattern ? ` /${m.paramsPattern}/` : ""} not called`);
  }
  for (const m of expect.forbidTools ?? []) {
    const hit = matches(m)[0];
    if (hit) failures.push(`forbidden ${m.name} ${hit.params}`);
  }
  if (expect.allowedGapIds) {
    for (const t of toolCalls.filter(t => t.name === "begin_question")) {
      let gap: unknown;
      try {
        gap = (JSON.parse(t.params) as Record<string, unknown>).gap_id;
      } catch {
        gap = undefined;
      }
      if (!expect.allowedGapIds.includes(String(gap))) failures.push(`gap_id ${JSON.stringify(gap)} not on the agenda`);
    }
  }
  if (expect.endsWithQuestion && !/\?["'”’)]*\s*$/.test(reply)) failures.push("reply does not end with a question");

  if (expect.maxQuestions !== undefined) {
    if (questionCount > expect.maxQuestions) failures.push(`${questionCount} questions spoken > ${expect.maxQuestions}`);
    if (calls.length > expect.maxQuestions) failures.push(`${calls.length} ${expect.toolCalled} calls > ${expect.maxQuestions}`);
  }
  return failures;
}
