// Markdown form of a knowledge entry (WS6 stores it as entries/<entry_id>/rev-<n>.md).
// Readable for humans, lossless for machines:
// - frontmatter is one `key: <JSON>` per line (valid YAML, no parser dependency);
// - expert words are blockquotes carrying the exchange id;
// - AI synthesis from interpretation/reasoning lives under its own heading;
// - `<!-- ws5:... -->` comments carry what the visible text can't (item order, region data).

import {
  WS5_SCHEMA_VERSION,
  type ConfirmationEvidence,
  type ExceptionRule,
  type ExpertQuote,
  type KnowledgeEntryContent,
  type Statement,
  type VisualEvidence,
} from "./schema";

export const HEADINGS = {
  workflow_step: "Workflow step/decision",
  observation: "Observation",
  expert_words: "Expert's words",
  interpretation: "Expert interpretation",
  reasoning: "Reasoning",
  synthesis: "Synthesis (AI, not expert words)",
  exceptions: "Exceptions / guardrails",
  visual_evidence: "Visual evidence",
  confirmation: "Confirmation evidence",
  qualifiers: "Qualifiers",
  open_questions: "Open questions",
} as const;

type SectionKey = keyof typeof HEADINGS;
const SECTION_BY_HEADING = new Map(Object.entries(HEADINGS).map(([k, h]) => [`## ${h}`, k as SectionKey]));

const FRONTMATTER_KEYS = [
  "schema_version",
  "entry_id",
  "revision_id",
  "parent_revision_id",
  "status",
  "kind",
  "workflow_position",
  "source",
  "produced_by",
  "created_at_utc",
  "revoked_at_utc",
  "revoked_reason",
] as const satisfies readonly (keyof KnowledgeEntryContent)[];

const NONE = "_none_";
const UNKNOWN = "_unknown_";

export class EntryMarkdownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntryMarkdownError";
  }
}

// --- text encoding -------------------------------------------------------------

/** One-line prose: escapes backslashes, newlines and "<", and any leading Markdown marker. */
function encodeText(text: string): string {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/</g, "\\<");
  return /^[#>*_\-+\d![`|~=]/.test(escaped) ? `\\${escaped}` : escaped;
}

function decodeText(text: string): string {
  return text.replace(/\\(.)/g, (_m, c: string) => (c === "n" ? "\n" : c === "r" ? "\r" : c));
}

/** JSON safe inside an HTML comment and on one line. */
const commentJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
const quoteJson = (quote: string) => JSON.stringify(quote).replace(/</g, "\\u003c");

function parseJson(text: string, where: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new EntryMarkdownError(`invalid JSON in ${where}: ${text}`);
  }
}

function parseQuote(text: string, where: string): string {
  const value = parseJson(text, where);
  if (typeof value !== "string") throw new EntryMarkdownError(`expected a quoted string in ${where}`);
  return value;
}

// --- statements ----------------------------------------------------------------

const EXPERT_TAG = /^\[expert words · ([^\]\s]+)\] (".*")$/;
const SYNTHESIS_TAG = /^\[AI synthesis\] (.*)$/;

function renderStatement(s: Statement): string {
  return s.type === "expert_quote"
    ? `[expert words · ${s.exchange_id}] ${quoteJson(s.quote)}`
    : `[AI synthesis] ${encodeText(s.text)}`;
}

function parseStatement(text: string, where: string): Statement {
  const expert = EXPERT_TAG.exec(text);
  if (expert) return { type: "expert_quote", exchange_id: expert[1], quote: parseQuote(expert[2], where) };
  const synthesis = SYNTHESIS_TAG.exec(text);
  if (synthesis) return { type: "ai_synthesis", text: decodeText(synthesis[1]) };
  throw new EntryMarkdownError(`${where}: expected "[expert words · <exchange_id>] \\"…\\"" or "[AI synthesis] …"`);
}

const renderOptionalStatement = (s: Statement | null) => (s ? renderStatement(s) : UNKNOWN);

// --- render --------------------------------------------------------------------

function renderExpertWords(quotes: ExpertQuote[]): string[] {
  if (!quotes.length) return [NONE];
  return quotes.flatMap((q, i) => [...(i ? [""] : []), `> ${quoteJson(q.quote)}`, `> — exchange \`${q.exchange_id}\``]);
}

/** Expert quotes stay in their section; synthesis items move under the Synthesis heading. */
function renderStatementList(key: "interpretation" | "reasoning", items: Statement[]): { own: string[]; synthesis: string[] } {
  const own: string[] = [];
  const synthesis: string[] = [];
  items.forEach((s, i) => {
    const marker = `<!-- ws5:${key} ${i} -->`;
    if (s.type === "expert_quote") own.push(`- ${renderStatement(s)} ${marker}`);
    else synthesis.push(`- (${HEADINGS[key]}) ${renderStatement(s)} ${marker}`);
  });
  return { own, synthesis };
}

function renderExceptions(rules: ExceptionRule[]): string[] {
  if (!rules.length) return [NONE];
  return rules.flatMap(r => [`- **When:** ${renderStatement(r.trigger)}`, `  **Then:** ${renderStatement(r.action)}`]);
}

function renderVisual(items: VisualEvidence[]): string[] {
  if (!items.length) return [NONE];
  return items.flatMap(v => [
    `- Event \`${v.event_id}\`${v.asset_id ? ` · asset \`${v.asset_id}\`` : ""}`,
    `  ![highlighted region of ${v.event_id}](<${v.highlighted_image_ref}>) [original frame](<${v.image_ref}>)`,
    `  <!-- ws5:visual ${commentJson(v)} -->`,
  ]);
}

function renderConfirmation(c: ConfirmationEvidence | null): string[] {
  if (!c) return [NONE];
  return [
    `- \`${c.confirmation_id}\`: **${c.result}** for revision \`${c.revision_id_reviewed}\`, expert response \`${c.expert_response_exchange_id}\``,
    `  <!-- ws5:confirmation ${commentJson(c)} -->`,
  ];
}

const orNone = (lines: string[]) => (lines.length ? lines : [NONE]);

export function renderEntryMarkdown(entry: KnowledgeEntryContent): string {
  const interpretation = renderStatementList("interpretation", entry.interpretation);
  const reasoning = renderStatementList("reasoning", entry.reasoning);
  const banner =
    entry.status === "revoked"
      ? `> **REVOKED** at ${entry.revoked_at_utc}: ${encodeText(entry.revoked_reason ?? "")}. Not taught.`
      : `> **Status:** ${entry.status} · **Kind:** ${entry.kind} · **Source:** ${entry.source}`;

  const sections: [SectionKey, string[]][] = [
    ["workflow_step", [renderOptionalStatement(entry.workflow_step)]],
    ["observation", [renderOptionalStatement(entry.observation)]],
    ["expert_words", renderExpertWords(entry.expert_words)],
    ["interpretation", orNone(interpretation.own)],
    ["reasoning", orNone(reasoning.own)],
    ["synthesis", orNone([...interpretation.synthesis, ...reasoning.synthesis])],
    ["exceptions", renderExceptions(entry.exceptions)],
    ["visual_evidence", renderVisual(entry.visual_evidence)],
    ["confirmation", renderConfirmation(entry.confirmation)],
    ["qualifiers", orNone(entry.qualifiers.map(q => `- ${quoteJson(q)}`))],
    ["open_questions", orNone(entry.open_questions.map(q => `- ${encodeText(q)}`))],
  ];

  return [
    "---",
    ...FRONTMATTER_KEYS.map(k => `${k}: ${JSON.stringify(entry[k])}`),
    "---",
    "",
    `# ${entry.kind} \`${entry.entry_id}\` · ${entry.revision_id}`,
    "",
    banner,
    "",
    ...sections.flatMap(([key, lines]) => [`## ${HEADINGS[key]}`, "", ...lines, ""]),
  ].join("\n");
}

// --- parse ---------------------------------------------------------------------

function splitFrontmatter(md: string): { front: string[]; body: string[] } {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") throw new EntryMarkdownError("missing frontmatter");
  const end = lines.indexOf("---", 1);
  if (end < 0) throw new EntryMarkdownError("unterminated frontmatter");
  return { front: lines.slice(1, end), body: lines.slice(end + 1) };
}

function parseFrontmatter(lines: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = /^([a-z_]+): (.*)$/.exec(line);
    if (!m) throw new EntryMarkdownError(`invalid frontmatter line: ${line}`);
    out[m[1]] = parseJson(m[2], `frontmatter ${m[1]}`);
  }
  for (const key of FRONTMATTER_KEYS) {
    if (!(key in out)) throw new EntryMarkdownError(`frontmatter is missing ${key}`);
  }
  return out;
}

function splitSections(body: string[]): Map<SectionKey, string[]> {
  const sections = new Map<SectionKey, string[]>();
  let current: string[] | null = null;
  for (const line of body) {
    const key = SECTION_BY_HEADING.get(line);
    if (key) {
      if (sections.has(key)) throw new EntryMarkdownError(`duplicate section ${HEADINGS[key]}`);
      current = [];
      sections.set(key, current);
    } else if (current && line.trim()) {
      current.push(line);
    }
  }
  for (const key of Object.keys(HEADINGS) as SectionKey[]) {
    if (!sections.has(key)) throw new EntryMarkdownError(`missing section ${HEADINGS[key]}`);
  }
  return sections;
}

const isNone = (lines: string[]) => lines.length === 1 && lines[0] === NONE;

function parseOptionalStatement(lines: string[], key: SectionKey): Statement | null {
  if (lines.length !== 1) throw new EntryMarkdownError(`${HEADINGS[key]} must be one line`);
  return lines[0] === UNKNOWN ? null : parseStatement(lines[0], HEADINGS[key]);
}

function parseExpertWords(lines: string[]): ExpertQuote[] {
  if (isNone(lines)) return [];
  if (lines.length % 2) throw new EntryMarkdownError("Expert's words: each quote needs a quote line and an exchange line");
  const out: ExpertQuote[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const quote = /^> (".*")$/.exec(lines[i]);
    const exchange = /^> — exchange `([^`]+)`$/.exec(lines[i + 1]);
    if (!quote || !exchange) throw new EntryMarkdownError(`Expert's words: unexpected lines ${lines[i]} / ${lines[i + 1]}`);
    out.push({ exchange_id: exchange[1], quote: parseQuote(quote[1], "Expert's words") });
  }
  return out;
}

const ITEM_MARKER = /^- (?:\((?:Expert interpretation|Reasoning)\) )?(.*) <!-- ws5:(interpretation|reasoning) (\d+) -->$/;

function parseStatementItems(lines: string[], into: Record<"interpretation" | "reasoning", Statement[]>, where: SectionKey) {
  if (isNone(lines)) return;
  for (const line of lines) {
    const m = ITEM_MARKER.exec(line);
    if (!m) throw new EntryMarkdownError(`${HEADINGS[where]}: unexpected line ${line}`);
    const statement = parseStatement(m[1], HEADINGS[where]);
    const key = m[2] as "interpretation" | "reasoning";
    if (where !== "synthesis" && where !== key) throw new EntryMarkdownError(`${line} is in the wrong section`);
    if ((where === "synthesis") !== (statement.type === "ai_synthesis")) {
      throw new EntryMarkdownError(`${HEADINGS[where]}: expert words and AI synthesis must not be mixed (${line})`);
    }
    into[key][Number(m[3])] = statement;
  }
}

function denseList(items: Statement[], key: string): Statement[] {
  for (let i = 0; i < items.length; i++) {
    if (!(i in items)) throw new EntryMarkdownError(`${key} item ${i} is missing`);
  }
  return items;
}

function parseExceptions(lines: string[]): ExceptionRule[] {
  if (isNone(lines)) return [];
  if (lines.length % 2) throw new EntryMarkdownError("Exceptions: each rule needs a When and a Then line");
  const out: ExceptionRule[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const when = /^- \*\*When:\*\* (.*)$/.exec(lines[i]);
    const then = /^ {2}\*\*Then:\*\* (.*)$/.exec(lines[i + 1]);
    if (!when || !then) throw new EntryMarkdownError(`Exceptions: unexpected lines ${lines[i]} / ${lines[i + 1]}`);
    out.push({ trigger: parseStatement(when[1], "Exceptions (When)"), action: parseStatement(then[1], "Exceptions (Then)") });
  }
  return out;
}

function parseCommentRecords<T>(lines: string[], tag: string): T[] {
  if (isNone(lines)) return [];
  const re = new RegExp(`^ {2}<!-- ws5:${tag} (.*) -->$`);
  return lines.flatMap(line => {
    const m = re.exec(line);
    return m ? [parseJson(m[1], tag) as T] : [];
  });
}

function parseStringList(lines: string[], key: SectionKey, decode: (s: string) => string): string[] {
  if (isNone(lines)) return [];
  return lines.map(line => {
    if (!line.startsWith("- ")) throw new EntryMarkdownError(`${HEADINGS[key]}: unexpected line ${line}`);
    return decode(line.slice(2));
  });
}

/**
 * Reads what renderEntryMarkdown wrote. Throws EntryMarkdownError on structural problems; it does
 * not check invariants (run validateEntry on the result).
 */
export function parseEntryMarkdown(md: string): KnowledgeEntryContent {
  const { front, body } = splitFrontmatter(md);
  const meta = parseFrontmatter(front);
  if (meta.schema_version !== WS5_SCHEMA_VERSION) {
    throw new EntryMarkdownError(`unsupported schema_version ${String(meta.schema_version)}`);
  }
  const s = splitSections(body);
  const get = (k: SectionKey) => s.get(k) ?? [];

  const lists: Record<"interpretation" | "reasoning", Statement[]> = { interpretation: [], reasoning: [] };
  parseStatementItems(get("interpretation"), lists, "interpretation");
  parseStatementItems(get("reasoning"), lists, "reasoning");
  parseStatementItems(get("synthesis"), lists, "synthesis");

  const confirmations = parseCommentRecords<ConfirmationEvidence>(get("confirmation"), "confirmation");
  if (confirmations.length > 1) throw new EntryMarkdownError("at most one confirmation");

  const entry = {
    ...Object.fromEntries(FRONTMATTER_KEYS.map(k => [k, meta[k]])),
    workflow_step: parseOptionalStatement(get("workflow_step"), "workflow_step"),
    observation: parseOptionalStatement(get("observation"), "observation"),
    expert_words: parseExpertWords(get("expert_words")),
    interpretation: denseList(lists.interpretation, "interpretation"),
    reasoning: denseList(lists.reasoning, "reasoning"),
    exceptions: parseExceptions(get("exceptions")),
    visual_evidence: parseCommentRecords<VisualEvidence>(get("visual_evidence"), "visual"),
    confirmation: confirmations[0] ?? null,
    qualifiers: parseStringList(get("qualifiers"), "qualifiers", q => parseQuote(q, "Qualifiers")),
    open_questions: parseStringList(get("open_questions"), "open_questions", decodeText),
  };
  return entry as KnowledgeEntryContent;
}
