/**
 * Push agent configuration from ../agents/manifest.json into ElevenLabs:
 * upload knowledge docs as text documents, attach them to each agent with the
 * configured usage mode, enable RAG, and (when given) set system prompt, first
 * message and per-language first-message presets.
 *
 *   npm run sync-agents                          # all agents
 *   npm run sync-agents -- --agent expert        # one agent
 *   npm run sync-agents -- --create-missing      # create agents whose env var is unset
 *
 * All paths in the manifest are relative to the manifest's folder. Fields left
 * out are not touched, so settings made in the ElevenLabs dashboard survive.
 * Reads ELEVENLABS_API_KEY and the per-agent id env vars from web/.env.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import type {
  DocumentUsageModeEnum,
  EmbeddingModelEnum,
  KnowledgeBaseLocator,
  LanguagePresetInput,
} from "@elevenlabs/elevenlabs-js/api";

type DocEntry =
  | { path: string; usageMode: DocumentUsageModeEnum }
  | { glob: string; usageMode: DocumentUsageModeEnum };

type Manifest = {
  namePrefix: string; // prefix for uploaded doc names; used to find and replace earlier uploads
  embeddingModel: EmbeddingModelEnum;
  defaultLanguage: string;
  additionalLanguages?: string[]; // switched to via the language_detection system tool
  languageDetectionDescription?: string; // tool description shown to the LLM
  agents: Record<
    string,
    {
      displayName: string;
      envVar: string;
      fallbackEnvVar?: string;
      cloneFrom?: string; // agent key whose voice/LLM/security config a new agent copies
      systemPrompt?: string; // path to a text/Markdown file
      firstMessage?: string; // path; "<name>.<lang>.md" next to it is used per extra language
      docs: DocEntry[];
    }
  >;
};

type ResolvedDoc = { name: string; relPath: string; usageMode: DocumentUsageModeEnum; text: string };

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentsDir = resolve(webDir, "..", "agents");

const args = process.argv.slice(2);
const createMissing = args.includes("--create-missing");
const agentFilter = args.includes("--agent") ? args[args.indexOf("--agent") + 1] : undefined;

const envPath = join(webDir, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
if (!apiKey) fail("Missing ELEVENLABS_API_KEY in web/.env");

const manifestPath = join(agentsDir, "manifest.json");
if (!existsSync(manifestPath)) fail(`Missing ${manifestPath} (copy manifest.example.json)`);
const manifest: Manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const additionalLanguages = manifest.additionalLanguages ?? [];
const client = new ElevenLabsClient({ apiKey });

const readText = (relPath: string) => readFileSync(join(agentsDir, relPath), "utf8").trim();

// --- resolve manifest → list of docs per agent -----------------------------

function docName(relPath: string): string {
  return `${manifest.namePrefix}/${relPath.replace(/\.md$/, "")}`;
}

function expandEntry(entry: DocEntry): ResolvedDoc[] {
  if ("glob" in entry) {
    // only "<dir>/*.md" is supported
    const dir = dirname(entry.glob);
    return readdirSync(join(agentsDir, dir))
      .filter(f => f.endsWith(".md"))
      .sort()
      .map(f => loadDoc(join(dir, f), entry.usageMode));
  }
  return [loadDoc(entry.path, entry.usageMode)];
}

function loadDoc(relPath: string, usageMode: DocumentUsageModeEnum): ResolvedDoc {
  return { name: docName(relPath), relPath, usageMode, text: readFileSync(join(agentsDir, relPath), "utf8") };
}

const agentNames = Object.keys(manifest.agents).filter(n => !agentFilter || n === agentFilter);
if (agentNames.length === 0) fail(`Unknown agent "${agentFilter}"`);

const perAgent = new Map<string, ResolvedDoc[]>();
const byName = new Map<string, ResolvedDoc>(); // dedupe docs shared between agents
for (const agent of agentNames) {
  const docs = manifest.agents[agent].docs.flatMap(expandEntry);
  perAgent.set(agent, docs);
  for (const d of docs) byName.set(d.name, d);
}

// --- 1. find previously synced docs (by name prefix) -----------------------

async function listOurDocs() {
  const found: { id: string; name: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.conversationalAi.knowledgeBase.list({ pageSize: 100, types: "text", cursor });
    for (const d of page.documents) {
      if (d.name.startsWith(`${manifest.namePrefix}/`)) found.push({ id: d.id, name: d.name });
    }
    cursor = page.hasMore ? page.nextCursor : undefined;
  } while (cursor);
  return found;
}

const previous = await listOurDocs();
console.log(`Found ${previous.length} previously synced docs`);

// --- 2. upload fresh copies ------------------------------------------------

const uploaded = new Map<string, string>(); // name → id
for (const doc of byName.values()) {
  const res = await client.conversationalAi.knowledgeBase.documents.createFromText({ name: doc.name, text: doc.text });
  uploaded.set(doc.name, res.id);
  console.log(`  ↑ ${doc.name}  (${doc.usageMode})  ${res.id}`);
}

// --- 3. point each agent at the new docs -----------------------------------

function envAgentId(agent: string): string | undefined {
  const cfg = manifest.agents[agent];
  return (
    process.env[cfg.envVar]?.trim() ||
    (cfg.fallbackEnvVar ? process.env[cfg.fallbackEnvVar]?.trim() : undefined)
  );
}

// Create an agent by copying voice/LLM/TTS/security settings from a sibling,
// so both agents sound and behave the same apart from prompt + knowledge.
async function createAgent(agent: string): Promise<string> {
  const cfg = manifest.agents[agent];
  const sourceId = cfg.cloneFrom ? envAgentId(cfg.cloneFrom) : undefined;
  if (!sourceId) fail(`${agent}: cannot create — cloneFrom agent "${cfg.cloneFrom}" has no id in env`);
  const src = await client.conversationalAi.agents.get(sourceId);
  const res = await client.conversationalAi.agents.create({
    name: cfg.displayName,
    conversationConfig: src.conversationConfig,
    platformSettings: src.platformSettings,
  });
  console.log(`+ created agent "${cfg.displayName}" → ${res.agentId}`);
  console.log(`  add to web/.env:  ${cfg.envVar}=${res.agentId}`);
  return res.agentId;
}

for (const agent of agentNames) {
  const cfg = manifest.agents[agent];
  let agentId = envAgentId(agent);
  if (!agentId && createMissing) agentId = await createAgent(agent);
  if (!agentId) {
    console.warn(`! ${agent}: ${cfg.envVar} not set — skipping (use --create-missing to create it)`);
    continue;
  }

  const knowledgeBase: KnowledgeBaseLocator[] = perAgent.get(agent)!.map(d => ({
    type: "text",
    id: uploaded.get(d.name)!,
    name: d.name,
    usageMode: d.usageMode,
  }));

  const firstMessage = cfg.firstMessage ? readText(cfg.firstMessage) : undefined;
  const systemPrompt = cfg.systemPrompt ? readText(cfg.systemPrompt) : undefined;

  // One preset per extra language: same agent, translated first message when a
  // conversation switches to that language (<firstMessage>.<lang>.md, else the default one).
  const languagePresets: Record<string, LanguagePresetInput> = {};
  for (const lang of additionalLanguages) {
    const translated = cfg.firstMessage?.replace(/\.md$/, `.${lang}.md`);
    const message =
      translated && existsSync(join(agentsDir, translated)) ? readText(translated) : firstMessage;
    languagePresets[lang] = {
      overrides: { agent: { language: lang, ...(message ? { firstMessage: message } : {}) } },
    };
  }

  // merge into the existing config so LLM/voice settings from the dashboard survive
  const current = await client.conversationalAi.agents.get(agentId);
  const prompt = current.conversationConfig.agent?.prompt ?? {};
  await client.conversationalAi.agents.update(agentId, {
    conversationConfig: {
      ...(additionalLanguages.length ? { languagePresets } : {}),
      agent: {
        ...current.conversationConfig.agent,
        language: manifest.defaultLanguage,
        ...(firstMessage ? { firstMessage } : {}),
        prompt: {
          ...prompt,
          ...(systemPrompt ? { prompt: systemPrompt } : {}),
          knowledgeBase,
          builtInTools: {
            ...prompt.builtInTools,
            ...(additionalLanguages.length
              ? {
                  // lets the agent switch ASR/TTS language mid-conversation
                  languageDetection: {
                    name: "language_detection",
                    description: manifest.languageDetectionDescription ?? "",
                    params: { systemToolType: "language_detection" },
                  },
                }
              : {}),
          },
          rag: { ...prompt.rag, enabled: true, embeddingModel: manifest.embeddingModel },
        },
      },
    },
  });
  const langs = [manifest.defaultLanguage, ...additionalLanguages].join("/");
  console.log(`✓ ${agent} (${agentId}): ${knowledgeBase.length} docs attached, languages ${langs}`);
}

// --- 4. kick off RAG indexing for auto-mode docs ---------------------------

for (const doc of byName.values()) {
  if (doc.usageMode !== "auto") continue;
  const id = uploaded.get(doc.name)!;
  try {
    const r = await client.conversationalAi.knowledgeBase.document.computeRagIndex(id, {
      model: manifest.embeddingModel,
    });
    console.log(`  ⟳ rag ${doc.name}: ${r.status}`);
  } catch (e) {
    console.warn(`  ! rag ${doc.name}: ${(e as Error).message}`);
  }
}

// --- 5. remove the stale copies (now detached) -----------------------------

if (agentFilter) {
  console.log("--agent given: leaving old docs in place (they may still be attached to another agent)");
} else {
  const newIds = new Set(uploaded.values());
  for (const old of previous) {
    if (newIds.has(old.id)) continue;
    try {
      await client.conversationalAi.knowledgeBase.documents.delete(old.id, { force: true });
      console.log(`  ✕ removed old ${old.name} (${old.id})`);
    } catch (e) {
      console.warn(`  ! could not delete ${old.name}: ${(e as Error).message}`);
    }
  }
}

console.log("\nDone.");

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}
