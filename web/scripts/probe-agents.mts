/**
 * Text probes against the live agents via ElevenLabs' conversation simulation.
 * Prints the agent's reply to each scripted user line so prompt/knowledge
 * changes can be checked without a microphone. Cases come from ../agents/probes.json.
 *
 *   npm run probe              # all agents
 *   npm run probe -- expert    # one agent
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type { ConversationHistoryTranscriptCommonModelInput as Turn } from "@elevenlabs/elevenlabs-js/api";

// { "<agent>": { "envVar": "...", "language": "en", "cases": [{ "name": "...", "user": ["...", "..."] }] } }
type Probes = Record<string, { envVar: string; language?: string; cases: { name: string; user: string[] }[] }>;

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

const only = process.argv[2];
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
    // history = first message, then user lines with a neutral agent turn between them;
    // the simulator continues from there, so the next turn is the agent's real reply.
    const history: Turn[] = [{ role: "agent", message: first, timeInCallSecs: 0 }];
    c.user.forEach((u, i) => {
      if (i > 0) history.push({ role: "agent", message: "Understood.", timeInCallSecs: i * 10 - 5 });
      history.push({ role: "user", message: u, timeInCallSecs: i * 10 });
    });
    const res = await client.conversationalAi.agents.simulateConversation(agentId, {
      simulationSpecification: {
        simulatedUserConfig: {
          firstMessage: c.user[c.user.length - 1],
          language: spec.language ?? "en",
          prompt: { prompt: "You are the human in this conversation. Reply only with 'ok'." },
        },
        partialConversationHistory: history,
      },
      // a language switch costs two tool turns before the spoken reply
      newTurnsLimit: 3,
    });
    const turns = res.simulatedConversation.slice(history.length);
    const reply = turns.find(t => t.role === "agent" && t.message)?.message;
    const toolCalls = turns.flatMap(t => t.toolCalls ?? []);
    console.log(`\n▸ ${c.name}\n  👤 ${c.user[c.user.length - 1]}`);
    for (const tc of toolCalls) console.log(`  ⚙ ${tc.toolName} ${tc.paramsAsJson}`);
    console.log(`  🤖 ${reply ?? "(no agent turn)"}`);
  }
}
