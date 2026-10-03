import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixtureEntry, loadWs5Fixtures, WS5_FIXTURES_DIR } from "@/fixtures/ws5/load";
import { EntryMarkdownError, HEADINGS, parseEntryMarkdown, renderEntryMarkdown } from "./markdown";
import type { KnowledgeEntryContent } from "./schema";

const fx = loadWs5Fixtures();
const entries = fx.candidates.map(c => [`${c.entry.entry_id}/${c.entry.revision_id}`, c.entry] as const);

describe("Markdown round trip", () => {
  it.each(entries)("%s: parse(render(e)) equals e, and rendering is stable", (_id, entry) => {
    const md = renderEntryMarkdown(entry);
    const parsed = parseEntryMarkdown(md);
    expect(parsed).toEqual(entry);
    expect(renderEntryMarkdown(parsed)).toBe(md);
  });

  it("survives awkward text: quotes, markers, comments, newlines, backslashes, unicode", () => {
    const awkward = [
      'He said "usually" — only if',
      "# not a heading",
      "## Observation",
      "- not a list item",
      "> not a quote",
      "_none_",
      "_unknown_",
      "1. not a numbered list",
      "line one\nline two\r\nline three",
      "back\\slash \\n literal",
      "trailing <!-- ws5:reasoning 7 -->",
      "[expert words · exc-001] \"fake tag\"",
      "Ünïcödé · 日本語 · emoji 🚆",
      "   leading spaces",
    ];
    const base = structuredClone(fixtureEntry("ent-decision-a", "rev-2"));
    const entry: KnowledgeEntryContent = {
      ...base,
      workflow_step: { type: "ai_synthesis", text: awkward.join(" | ") },
      observation: null,
      expert_words: awkward.map((quote, i) => ({ exchange_id: `exc-${i}`, quote })),
      interpretation: awkward.map((text, i) =>
        i % 2 ? { type: "ai_synthesis", text } : { type: "expert_quote", exchange_id: "exc-x", quote: text }
      ),
      reasoning: awkward.map(text => ({ type: "ai_synthesis", text })),
      exceptions: awkward.map(text => ({
        trigger: { type: "expert_quote", exchange_id: "exc-y", quote: text },
        action: { type: "ai_synthesis", text },
      })),
      visual_evidence: [{ ...base.visual_evidence[0], image_ref: "imgs/a (1).svg", asset_id: "asset-1" }],
      qualifiers: awkward,
      open_questions: awkward,
    };
    const md = renderEntryMarkdown(entry);
    expect(parseEntryMarkdown(md)).toEqual(entry);
  });
});

describe("rendered layout", () => {
  const md = renderEntryMarkdown(fixtureEntry("ent-step-a"));

  it("has every fixed heading in order", () => {
    const headings = md.split("\n").filter(l => l.startsWith("## "));
    expect(headings).toEqual(Object.values(HEADINGS).map(h => `## ${h}`));
  });

  it("renders the expert's words as blockquotes carrying the exchange id", () => {
    expect(md).toContain('> "This usually shows FIXTURE pattern A."\n> — exchange `exc-001`');
  });

  it("keeps AI synthesis out of the interpretation and reasoning sections", () => {
    const section = (name: string) => md.split(`## ${name}\n`)[1].split("\n## ")[0];
    expect(section(HEADINGS.interpretation)).not.toContain("[AI synthesis]");
    expect(section(HEADINGS.reasoning)).not.toContain("[AI synthesis]");
    expect(section(HEADINGS.synthesis)).toContain("[AI synthesis] FIXTURE synthesis: region A");
    expect(section(HEADINGS.synthesis)).not.toContain("[expert words");
  });

  it("links images with relative paths", () => {
    const links = [...md.matchAll(/\]\(<([^>]+)>\)/g)].map(m => m[1]);
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect(link.startsWith("../")).toBe(true);
  });

  it("marks revoked entries in a banner while keeping their content", () => {
    const revoked = renderEntryMarkdown(fixtureEntry("ent-revoked-a"));
    expect(revoked).toContain("> **REVOKED** at");
    expect(revoked).toContain('> "I choose FIXTURE decision A"');
  });
});

describe("committed fixture Markdown", () => {
  it.each(entries)("%s.md matches its JSON (regenerate with fixtures/ws5/render-fixtures.mts)", (_id, entry) => {
    const file = join(WS5_FIXTURES_DIR, "entries", entry.entry_id, `${entry.revision_id}.md`);
    expect(readFileSync(file, "utf8")).toBe(renderEntryMarkdown(entry));
  });
});

describe("parse errors", () => {
  const md = renderEntryMarkdown(fixtureEntry("ent-step-a"));

  it("rejects missing frontmatter, sections or unknown schema versions", () => {
    expect(() => parseEntryMarkdown("# no frontmatter")).toThrow(EntryMarkdownError);
    expect(() => parseEntryMarkdown(md.replace("## Qualifiers\n", ""))).toThrow(/missing section Qualifiers/);
    expect(() => parseEntryMarkdown(md.replace('"ws5.v0"', '"ws5.v9"'))).toThrow(/schema_version/);
  });

  it("rejects AI synthesis placed in an expert section", () => {
    const tampered = md.replace(
      "- [expert words · exc-001] \"usually shows FIXTURE pattern A\"",
      "- [AI synthesis] usually shows FIXTURE pattern A"
    );
    expect(() => parseEntryMarkdown(tampered)).toThrow(/must not be mixed/);
  });
});
