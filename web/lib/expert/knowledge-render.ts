// Markdown for the draft workflow: one file per immutable revision, plus knowledge-draft.md,
// the confirmed (or latest) revision for WS5. Every step is shown with its screen moments
// (images) and the expert's verbatim words; step text is labeled as AI synthesis.

import type { DraftRevision, DraftStep, ExpertExchange, PointingEvent, SessionSnapshot } from "./contracts";
import { diffRevisions, stepVerification } from "./draft";

export type KnowledgeRenderOptions = { imageHref?: (ref: string) => string };

const quote = (lines: string[]) => lines.map(l => `> ${l}`).join("\n>\n");

/** One revision on its own: stable, depends only on the revision (so it never changes once written). */
export function renderRevisionMd(rev: DraftRevision): string {
  const out = [
    `# Draft revision ${rev.revision_id} — ${rev.session_id}`,
    "",
    `- Created: ${rev.created_at_utc}`,
    `- Parent: ${rev.parent_revision_id ?? "—"}`,
    `- Change reason: ${rev.change_reason ?? "—"}`,
    `- Correction exchanges: ${rev.change_exchange_ids.join(", ") || "—"}`,
    "",
    "_Step text is AI synthesis of the expert's answers. Immutable: a correction creates a new revision._",
    "",
  ];
  rev.steps.forEach((s, i) => {
    out.push(
      `${i + 1}. **${s.step_id}** (${s.kind})${s.supported ? "" : " — UNSUPPORTED, not taught as fact"}: ${s.text}`,
      `   - events: ${s.supporting_event_ids.join(", ") || "—"} · exchanges: ${s.supporting_exchange_ids.join(", ") || "—"}`
    );
  });
  return out.join("\n") + "\n";
}

export function renderKnowledgeDraftMd(snap: SessionSnapshot, options: KnowledgeRenderOptions = {}): string {
  const href = options.imageHref ?? (ref => ref);
  const rev = snap.revisions.at(-1);
  const out = [`# Knowledge draft — ${snap.session_id}`, ""];
  if (!rev) {
    out.push(`No draft revision yet (session phase: ${snap.phase}).`);
    return out.join("\n") + "\n";
  }
  const parent = snap.revisions.find(r => r.revision_id === rev.parent_revision_id) ?? null;
  const verification = stepVerification(snap.revisions, snap.confirmations);
  const final = snap.confirmations.find(c => c.revision_id === rev.revision_id && c.status === "confirmed");
  const events = new Map(snap.events.map(e => [e.event_id, e]));
  const exchanges = new Map(snap.exchanges.map(x => [x.exchange_id, x]));
  const fixtures = snap.events.filter(e => e.source === "fixture").length;

  out.push(
    `- Revision: **${rev.revision_id}**${parent ? ` (corrects ${parent.revision_id}: ${rev.change_reason ?? "—"})` : ""}`,
    `- Expert confirmation: ${final ? `**confirmed** in ${final.confirmation_id}, response ${final.expert_response_exchange_id}, ${final.at_utc}` : "**not confirmed**"}`,
    `- Session phase: ${snap.phase}`,
    `- Events: ${snap.events.length}${fixtures ? ` (${fixtures} FIXTURE — simulated pointing, not live capture)` : ""}`,
    "",
    "_Step text is AI synthesis. Anything in quotation marks is the expert's own words, copied verbatim from the linked answers below. " +
      "Verification: `confirmed` = explicitly confirmed by the expert for this revision; `unresolved` = not (yet) confirmed._",
    "",
    "## Workflow",
  );

  rev.steps.forEach((s, i) => out.push("", ...renderStep(s, i + 1, verification[s.step_id] ?? "unresolved", events, exchanges, href)));

  const guardrails = rev.steps.filter(s => s.kind === "guardrail");
  out.push("", "## Guardrails", "");
  out.push(guardrails.length ? guardrails.map(s => `- ${s.step_id}: ${s.text} (${verification[s.step_id]})`).join("\n") : "_none recorded_");

  const open = snap.open_questions.filter(q => q.answered_by_exchange_id === null);
  out.push("", "## Open questions", "");
  out.push(open.length ? open.map(q => `- ${q.open_question_id}: ${q.missing_fact} _(${q.why_it_matters})_`).join("\n") : "_none_");

  if (parent) {
    const d = diffRevisions(parent, rev);
    out.push("", `## Changes from ${parent.revision_id}`, "", `- added/changed: ${d.added.join(", ") || "—"}`, `- removed: ${d.removed.join(", ") || "—"}`, `- unchanged: ${d.unchanged.join(", ") || "—"}`);
  }

  out.push("", "## Confirmations", "");
  out.push(
    snap.confirmations.length
      ? snap.confirmations
          .map(c => {
            const words = exchanges.get(c.expert_response_exchange_id)?.answer_lines.map(l => l.text).join(" ") ?? "";
            return `- ${c.confirmation_id} · ${c.revision_id} · **${c.status}** · steps ${c.step_ids_reviewed.join(", ") || "—"} · ${c.expert_response_exchange_id}: "${words}"`;
          })
          .join("\n")
      : "_none: nothing is confirmed (silence never confirms)_"
  );
  return out.join("\n") + "\n";
}

function renderStep(
  s: DraftStep,
  n: number,
  status: string,
  events: Map<string, PointingEvent>,
  exchanges: Map<string, ExpertExchange>,
  href: (ref: string) => string
): string[] {
  const out = [`### ${n}. ${s.step_id} · ${s.kind} · ${status}`, "", s.text, ""];
  if (!s.supported) out.push("**Unsupported:** missing a screen moment or the expert's words. Not taught as fact; kept as an open question.", "");
  out.push("Screen moments:");
  if (!s.supporting_event_ids.length) out.push("- _none_");
  for (const id of s.supporting_event_ids) {
    const e = events.get(id);
    if (!e) continue;
    const label = e.source === "fixture" ? "FIXTURE" : "live";
    out.push(`- ${id} (${label}, channel ${e.channel_id ?? "unknown"}): ![${id} highlighted](${href(e.highlighted_image_ref)}) · [full frame](${href(e.image_ref)})`);
  }
  out.push("", "Expert's words (verbatim):");
  if (!s.supporting_exchange_ids.length) out.push("- _none_");
  for (const id of s.supporting_exchange_ids) {
    const x = exchanges.get(id);
    if (!x) continue;
    out.push("", `- ${id} (${x.phase}, ${x.kind}${x.event_id ? `, ${x.event_id}` : ""}) — asked: ${x.question || "—"}`, "");
    out.push(x.answer_lines.length ? quote(x.answer_lines.map(l => l.text)) : "_(no answer)_");
  }
  return out;
}
