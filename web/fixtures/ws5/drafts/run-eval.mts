// LLM-backed evaluation harness (WS5 Sprint 3). Runs every labelled fixture draft N times
// (default 5) through evaluate() with the real Claude judge and reports pass counts.
// A class passes only if ≥ 4 of 5 runs pass. FIXTURE knowledge and drafts only.
//
//   cd web && npm run eval:ws5                      # all fixture drafts, 5 runs each
//   npm run eval:ws5 -- --runs 1                    # quicker
//   npm run eval:ws5 -- --draft my-draft.json       # your own draft (same JSON shape; label optional)
//
// Needs ANTHROPIC_API_KEY (read from web/.env if present). Writes results/<timestamp>.json and
// results/latest.md (sample feedback per draft for the human gate).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadWs5Fixtures } from "@/fixtures/ws5/load";
import { isTeachable, type EligibilityContext } from "@/lib/knowledge/eligibility";
import { evaluate } from "@/lib/knowledge/evaluate";
import type { TutorEvaluation } from "@/lib/knowledge/evaluation-types";
import { createAnthropicJudge } from "@/lib/knowledge/judge-anthropic";
import { DRAFTS_DIR, loadDraftFixtures, type DraftFixture } from "./load";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const RUNS = Number(arg("--runs") ?? 5);
const customDraft = arg("--draft");

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
  console.error("BLOCKED: no ANTHROPIC_API_KEY in web/.env or the environment. Nothing was run.");
  process.exit(2);
}

const fx = loadWs5Fixtures();
const ctx: EligibilityContext = { current_revision_by_entry: fx.current_revision_by_entry, exchanges: fx.exchanges, events: fx.events, allow_fixture: true };
const candidates = fx.candidates.filter(c => isTeachable(c, ctx).ok);
const judge = createAnthropicJudge();

const drafts: DraftFixture[] = customDraft
  ? [JSON.parse(readFileSync(resolve(process.cwd(), customDraft), "utf8")) as DraftFixture]
  : loadDraftFixtures();

type Run = { pass: boolean | null; failures: string[]; result?: TutorEvaluation; error?: string };

function check(d: DraftFixture, r: TutorEvaluation): string[] {
  const failures: string[] = [];
  const cited = r.cited.map(c => c.entry_id);
  if (!r.feedback_text.startsWith(r.guiding_question)) failures.push("feedback does not start with the guiding question");
  if (!d.label) return failures;
  if (r.outcome !== d.label.outcome) failures.push(`outcome ${r.outcome}, expected ${d.label.outcome}`);
  if (d.label.must_cite_any && !cited.some(id => d.label.must_cite_any!.includes(id))) {
    failures.push(`cited [${cited.join(", ")}], expected one of [${d.label.must_cite_any.join(", ")}]`);
  }
  for (const id of d.label.never_cite) if (cited.includes(id)) failures.push(`cited forbidden ${id}`);
  if (d.label.uncertain_requires && r.outcome === "uncertain" && !r.escalation && !/context|senior|describe|ask/i.test(r.feedback_text)) {
    failures.push("uncertain without escalation or a context request");
  }
  return failures;
}

async function runOnce(d: DraftFixture): Promise<Run> {
  try {
    const result = await evaluate({ draft: d.draft, case_view: d.case_view, knowledge: { candidates, ctx } }, judge);
    const failures = check(d, result);
    return { pass: d.label ? failures.length === 0 : null, failures, result };
  } catch (err) {
    return { pass: false, failures: ["evaluation failed"], error: err instanceof Error ? err.message : String(err) };
  }
}

const started = new Date().toISOString();
const results = await Promise.all(
  drafts.map(async d => {
    const runs: Run[] = [];
    for (let i = 0; i < RUNS; i++) runs.push(await runOnce(d));
    return { d, runs };
  })
);

const lines: string[] = [];
let allPass = true;
console.log(`\nWS5 tutor evaluation harness — judge ${judge.name}, ${RUNS} run(s) per draft, started ${started}\n`);
for (const { d, runs } of results) {
  const passes = runs.filter(r => r.pass).length;
  const needed = Math.ceil(RUNS * 0.8);
  const ok = d.label ? passes >= needed : null;
  if (ok === false) allPass = false;
  const outcomes = runs.map(r => r.result?.outcome ?? "ERROR").join(",");
  console.log(`${ok === null ? "  —  " : ok ? "PASS " : "FAIL "} ${d.draft_id.padEnd(32)} ${d.label ? `${passes}/${RUNS}` : "unlabelled"}  outcomes: ${outcomes}`);
  for (const r of runs) {
    if (r.failures.length || r.error) console.log(`        · ${[...r.failures, r.error].filter(Boolean).join("; ")}`);
    if (r.result?.guard_notes.length) console.log(`        · guard: ${r.result.guard_notes.join(" | ")}`);
  }

  const sample = runs.find(r => r.result)?.result;
  lines.push(`## ${d.draft_id} (${d.class}) — ${d.label ? `${passes}/${RUNS} passed` : "unlabelled"}`, "");
  lines.push(`**Draft:** decision "${d.draft.decision}" — reason "${d.draft.reason}"`, "");
  lines.push(`**Visible case:** ${d.case_view.visible_context.join("; ")}`, "");
  if (sample) {
    lines.push(`**Outcome:** ${sample.outcome}${sample.escalation ? ` · escalation ${sample.escalation.entry_id}` : ""} · cited ${sample.cited.map(c => `${c.entry_id}@${c.revision_id}`).join(", ") || "nothing"}`, "");
    lines.push("**Feedback (first run):**", "", ...sample.feedback_text.split("\n").map(l => `> ${l}`), "");
    if (sample.guard_notes.length) lines.push(`**Guard notes:** ${sample.guard_notes.join(" | ")}`, "");
  }
}

const outDir = join(DRAFTS_DIR, "results");
mkdirSync(outDir, { recursive: true });
const stamp = started.replace(/[:.]/g, "-");
writeFileSync(
  join(outDir, `${stamp}.json`),
  JSON.stringify(
    { started, judge: judge.name, runs_per_draft: RUNS, source: "fixture", results: results.map(({ d, runs }) => ({ draft_id: d.draft_id, label: d.label ?? null, runs })) },
    null,
    2
  )
);
writeFileSync(join(outDir, "latest.md"), [`# Tutor evaluation harness — ${started}`, "", `Judge: ${judge.name}. FIXTURE knowledge and drafts.`, "", ...lines].join("\n"));
console.log(`\nWrote ${join("fixtures/ws5/drafts/results", `${stamp}.json`)} and results/latest.md`);
process.exit(allPass ? 0 : 1);
