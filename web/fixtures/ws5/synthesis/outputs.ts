// The committed synthesis output for the fixture scenario (web/fixtures/ws5/synthesis/out/), as
// path → file content. Two runs: (1) synthesis of the live session + debrief, (2) re-synthesis
// after the expert corrected the teach-back (cnf-sx-001 / sx-010). Regenerate with
// `npx tsx lib/knowledge/dev/synthesize-fixtures.mts`; synthesis-out.test.ts fails on drift.

import { renderEntryMarkdown } from "@/lib/knowledge/markdown";
import { synthesize, renderWorkflowMarkdown } from "@/lib/knowledge/synthesize";
import type { Gap, SynthesisOutput, TeachBack } from "@/lib/knowledge/synthesis-types";
import { buildWorkMap } from "@/lib/knowledge/workmap";
import { fixtureImageRef, loadSynthesisScenario } from "./load";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function gapsMarkdown(gaps: Gap[]): string {
  return [
    "# Gaps for the debrief (FIXTURE)",
    "",
    "Only what the expert has not answered yet, highest priority first. Never padded.",
    "",
    ...(gaps.length
      ? gaps.map(g => `${g.priority}. **${g.kind}** \`${g.gap_id}\`: ${g.description} (events: ${g.related_event_ids.join(", ") || "none"}; exchanges: ${g.related_exchange_ids.join(", ") || "none"})`)
      : ["_No gaps._"]),
    "",
  ].join("\n");
}

function teachBackMarkdown(runs: [string, TeachBack | null][]): string {
  return [
    "# Teach-back (FIXTURE)",
    "",
    ...runs.flatMap(([title, tb]) => [
      `## ${title}`,
      "",
      tb ? tb.text : "_Nothing to teach back._",
      "",
      "Reviewed revisions (a confirmation binds to exactly these):",
      "",
      ...(tb?.reviewed.map(r => `- \`${r.entry_id}\` · ${r.revision_id}`) ?? ["_none_"]),
      "",
    ]),
  ].join("\n");
}

export function buildSynthesisFixtureOutputs(): Record<string, string> {
  const s = loadSynthesisScenario();
  const base = { events: s.events, exchanges: s.exchanges, resolve_image_ref: fixtureImageRef };
  const run1: SynthesisOutput = synthesize({ ...base, confirmations: [], prior: [] });
  const run2: SynthesisOutput = synthesize({ ...base, confirmations: [s.correction], prior: run1.entries });
  const revisions = [...run1.entries, ...run2.entries];

  const files: Record<string, string> = {};
  for (const e of revisions) files[`entries/${e.entry_id}/${e.revision_id}.md`] = renderEntryMarkdown(e);
  files["workflow.md"] = renderWorkflowMarkdown(run2.workflow);
  files["gaps.md"] = gapsMarkdown(run2.gaps);
  files["gaps.json"] = json(run2.gaps);
  files["teach-back.md"] = teachBackMarkdown([
    ["Run 1: after the live session and debrief", run1.teach_back],
    ["Run 2: after the expert's correction (sx-010)", run2.teach_back],
  ]);
  files["flagged-for-reconfirmation.json"] = json(run2.flagged_for_reconfirmation);
  files["workmap.json"] = json(buildWorkMap({ workflow: run2.workflow, revisions, events: s.events, exchanges: s.exchanges, include_draft: true }));
  return files;
}
