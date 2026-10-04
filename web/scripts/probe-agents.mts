/**
 * Text probes against the live agents via ElevenLabs' conversation simulation.
 * Prints the agent's reply (and tool calls) to each scripted case so
 * prompt/knowledge changes can be checked without a microphone. Cases come
 * from ../agents/probes.json.
 *
 *   npm run probe                          # all agents
 *   npm run probe -- expert                # one agent
 *   npm run probe -- expert --runs 5       # each case 5×, with a pass-count summary
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
  // Tutor checks (WS5 Sprint 4); an empty reply passes them unless a question or pattern is required.
  requireQuestion?: boolean; // the spoken reply contains a "?"
  questionBeforeQuote?: boolean; // the first "?" comes before the first quoted span (asks before telling)
  allowedQuotes?: string[]; // every quoted span of ≥ 3 words must be part of one of these (case-insensitive)
  requireAnyPatterns?: string[]; // case-insensitive regexes; at least one must match the spoken reply
  maxWords?: number; // max words in the spoken reply
};
type LegacyCase = { name: string; user: string[] };
type HistoryCase = { name: string; history: { role: "user" | "agent"; text: string }[]; expect?: Expect };
type Case = LegacyCase | HistoryCase;
// { "<agent>": { "envVar": "...", "language": "en", "cases": [...] } }
type Probes = Record<string, { envVar: string; language?: string; cases: Case[] }>;

type RunResult = { lastUser: string; toolCalls: { name: string; params: string }[]; reply: string; failures: string[] };

const TOOL_MOCKS = { begin_question: { defaultReturnValue: "ok exchange_id=ex-sim" } };

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
const only = args.find((a, i) => !a.startsWith("--") && i !== runsIdx + 1);

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

  if (expect.toolCalled) {
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

  if (expect.forbidPatterns?.length) {
    const texts = [reply, ...params.map(p => (typeof p.question === "string" ? p.question : ""))];
    for (const pat of expect.forbidPatterns) {
      const re = new RegExp(pat, "i");
      const hit = texts.map(t => t.match(re)?.[0]).find(Boolean);
      if (hit) failures.push(`forbidden /${pat}/ matched "${hit}"`);
    }
  }

  const quotes = quotedSpans(reply);
  if (expect.requireQuestion && !reply.includes("?")) failures.push("no question asked");
  if (expect.questionBeforeQuote && quotes.length) {
    const q = reply.indexOf("?");
    const firstQuote = Math.min(...[reply.indexOf('"'), reply.indexOf("\u201C")].filter(i => i >= 0));
    if (q < 0 || q > firstQuote) failures.push("quoted the expert before asking");
  }
  if (expect.allowedQuotes) {
    const allowed = expect.allowedQuotes.map(normalizeQuote);
    for (const span of quotes) {
      if (!allowed.some(a => a.includes(normalizeQuote(span)))) failures.push(`quote not delivered: "${span}"`);
    }
  }
  if (expect.requireAnyPatterns?.length && !expect.requireAnyPatterns.some(p => new RegExp(p, "i").test(reply))) {
    failures.push(`none of /${expect.requireAnyPatterns.join("/, /")}/ matched`);
  }
  if (expect.maxWords !== undefined) {
    const words = reply.split(/\s+/).filter(Boolean).length;
    if (words > expect.maxWords) failures.push(`${words} words > ${expect.maxWords}`);
  }

  if (expect.maxQuestions !== undefined) {
    if (questionCount > expect.maxQuestions) failures.push(`${questionCount} questions spoken > ${expect.maxQuestions}`);
    if (calls.length > expect.maxQuestions) failures.push(`${calls.length} ${expect.toolCalled} calls > ${expect.maxQuestions}`);
  }
  return failures;
}

// Quoted spans of at least three words, in straight or curly double quotes.
function quotedSpans(text: string): string[] {
  return [...text.matchAll(/"([^"]+)"|\u201C([^\u201D]+)\u201D/g)]
    .map(m => (m[1] ?? m[2]).trim())
    .filter(span => span.split(/\s+/).length >= 3);
}

// Letters and digits only: simulated transcripts split words at stream-chunk boundaries ("F IXTURE"),
// so spacing and punctuation are ignored, but the exact sequence of words is still required.
function normalizeQuote(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}
