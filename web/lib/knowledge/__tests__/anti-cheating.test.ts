// Tutor success must come from captured expert knowledge applied to the visible case —
// never from case ids, answer keys or evaluator material.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDraftFixtures } from "@/fixtures/ws5/drafts/load";
import { evaluate } from "../evaluate";
import type { JudgeInput, JudgeVerdict } from "../evaluation-types";
import { eligibleCandidates, knowledge, scriptedJudge, verdict } from "./helpers";

const KNOWLEDGE_DIR = join(__dirname, "..");
const drafts = loadDraftFixtures();

function runtimeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === "__tests__" ? [] : runtimeFiles(p);
    return /\.(ts|mts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

// The answer-key field names are allowed in exactly one place: the rejection list in case-view.ts.
// `typeof x.case_id !== "string"` is input validation, not a case lookup.
const stripForbiddenList = (src: string) =>
  src
    .replace(/\/\/ ws5:forbidden-fields:start[\s\S]*?\/\/ ws5:forbidden-fields:end/g, "")
    .replace(/typeof\s+[\w.]+\s*[!=]==?\s*"\w+"/g, "TYPE_CHECK");

describe("anti-cheating: runtime modules in web/lib/knowledge/", () => {
  const files = runtimeFiles(KNOWLEDGE_DIR).map(p => ({ path: relative(KNOWLEDGE_DIR, p), src: stripForbiddenList(readFileSync(p, "utf8")) }));

  const banned: [string, RegExp][] = [
    ["a WS4-style case id literal", /\b[EN]0\d\b/],
    ["a case-id comparison with a literal", /case_id\s*[!=]==?\s*["'`]|["'`]\s*[!=]==?\s*[\w.]*case_id/],
    ["a switch on the case id", /switch\s*\([^)]*case_id/],
    ["a lookup keyed by case id", /\[\s*[\w.]*case_id\s*\]/],
    ["EVALUATOR_DIR", /EVALUATOR_DIR/],
    ["an evaluator path", /(?:\.runtime\/evaluator|evaluator\/|cases\/evaluator)/],
    ["the labelled draft fixtures", /fixtures\/ws5\/drafts|drafts\/load/],
    [
      "an answer-key field",
      /\b(?:expected_decision|expected_outcome|acceptable_explanations|common_wrong_decision|answer_key|evaluation_notes|evaluator_notes|must_cite_any|never_cite|uncertain_requires)\b/,
    ],
    ...drafts.map(d => [`fixture case id ${d.case_view.case_id}`, new RegExp(`\\b${d.case_view.case_id}\\b`)] as [string, RegExp]),
  ];

  it("scans a meaningful set of files", () => {
    expect(files.map(f => f.path)).toEqual(expect.arrayContaining(["evaluate.ts", "output-guard.ts", "judge-input.ts", "retrieve.ts"]));
  });

  it.each(banned)("contain no %s", (_label, pattern) => {
    const hits = files.filter(f => pattern.test(f.src)).map(f => f.path);
    expect(hits).toEqual([]);
  });

  it("the only answer-key names are inside the rejection list (and that list exists)", () => {
    const raw = readFileSync(join(KNOWLEDGE_DIR, "case-view.ts"), "utf8");
    expect(raw).toMatch(/ws5:forbidden-fields:start[\s\S]*expected_[\s\S]*ws5:forbidden-fields:end/);
  });
});

// A judge stand-in that decides only from what it is shown: if a shown guardrail's words name
// something the visible case reports, it intervenes citing those words; otherwise it approves,
// citing a shown decision entry. No ids of cases, no labels.
function knowledgeDrivenVerdict(input: JudgeInput): JudgeVerdict {
  const visible = input.visible_case.join(" ");
  for (const k of input.knowledge.filter(k => k.kind === "guardrail")) {
    for (const q of k.expert_quotes) {
      const condition = /when (.+?) is present/.exec(q)?.[1];
      if (condition && visible.includes(`${condition} is present`)) {
        return verdict({ outcome: "intervene", citations: [{ entry_id: k.entry_id, quote: q }] });
      }
    }
  }
  const decision = input.knowledge.find(k => k.kind === "decision");
  return decision
    ? verdict({ outcome: "ok", citations: [{ entry_id: decision.entry_id, quote: decision.expert_quotes.at(-1)! }] })
    : verdict({ outcome: "uncertain" });
}

describe("anti-cheating: behaviour", () => {
  it.each(drafts.map(d => [d.draft_id, d] as const))("%s: renaming the case id and title changes nothing", async (_id, d) => {
    const a = scriptedJudge(knowledgeDrivenVerdict);
    const b = scriptedJudge(knowledgeDrivenVerdict);
    const renamed = { ...d.case_view, case_id: "zz-renamed-case-999", title: "Renamed" };
    const ra = await evaluate({ draft: d.draft, case_view: d.case_view, knowledge: knowledge() }, a);
    const rb = await evaluate({ draft: d.draft, case_view: renamed, knowledge: knowledge() }, b);
    expect(b.inputs).toEqual(a.inputs);
    expect(rb).toEqual(ra);
  });

  it("removing the relevant guardrail from the knowledge changes the outcome away from that citation", async () => {
    const d = drafts.find(x => x.draft_id === "d02-guardrail-violation")!;
    const withIt = await evaluate({ draft: d.draft, case_view: d.case_view, knowledge: knowledge() }, scriptedJudge(knowledgeDrivenVerdict));
    expect(withIt.outcome).toBe("intervene");
    expect(withIt.cited.map(c => c.entry_id)).toEqual(["ent-guardrail-c"]);

    const without = eligibleCandidates.filter(c => c.entry.entry_id !== "ent-guardrail-c");
    const judge = scriptedJudge(knowledgeDrivenVerdict);
    const r = await evaluate({ draft: d.draft, case_view: d.case_view, knowledge: knowledge(without) }, judge);
    expect(JSON.stringify(judge.inputs)).not.toContain("ent-guardrail-c");
    expect(r.cited.map(c => c.entry_id)).not.toContain("ent-guardrail-c");
    expect(r.outcome).not.toBe("intervene");
  });

  it("even a judge that insists on the removed guardrail cannot cite it", async () => {
    const d = drafts.find(x => x.draft_id === "d02-guardrail-violation")!;
    const without = eligibleCandidates.filter(c => c.entry.entry_id !== "ent-guardrail-c");
    const stubborn = scriptedJudge(
      verdict({
        outcome: "intervene",
        citations: [{ entry_id: "ent-guardrail-c", quote: "never save FIXTURE decision A when FIXTURE condition C is present on the second channel." }],
      })
    );
    const r = await evaluate({ draft: d.draft, case_view: d.case_view, knowledge: knowledge(without) }, stubborn);
    expect(r.outcome).toBe("uncertain");
    expect(r.cited).toEqual([]);
  });
});
