// Human-readable Markdown views of a session snapshot. Expert words are quoted
// verbatim; anything AI-generated is labeled as such.

import type { PointingEvent, SessionSnapshot } from "./contracts";

export type RenderOptions = {
  /** Maps an event's image ref (e.g. "/fixtures/x.svg") to a link usable from the Markdown file. */
  imageHref?: (ref: string) => string;
};

const time = (iso: string) => iso.slice(11); // "01:00:05.000Z"

function eventLabel(event: PointingEvent | undefined, eventId: string | null): string {
  if (eventId === null) return "no event";
  if (!event) return `${eventId} (unknown event)`;
  return `${eventId} (${event.source === "fixture" ? "FIXTURE" : "live"})`;
}

// One paragraph per transcript line, so separate utterances don't run together when rendered.
const quote = (lines: string[]) => lines.map(l => `> ${l}`).join("\n>\n");

export function renderExchangesMd(snap: SessionSnapshot, options: RenderOptions = {}): string {
  const href = options.imageHref ?? (ref => ref);
  const events = new Map(snap.events.map(e => [e.event_id, e]));
  const fixtures = snap.events.filter(e => e.source === "fixture").length;
  const out: string[] = [
    `# Expert exchanges — ${snap.session_id}`,
    "",
    `- Conversation: ${snap.conversation_id ?? "—"}`,
    `- Started: ${snap.started_at_utc} · Ended: ${snap.ended_at_utc ?? "(in progress)"}`,
    `- Events: ${snap.events.length} (fixture: ${fixtures}) · Exchanges: ${snap.exchanges.length} · ` +
      `Unlinked agent questions: ${snap.unlinked_agent_questions.length}`,
    `- Phase: ${snap.phase} · Revisions: ${snap.revisions.map(r => r.revision_id).join(", ") || "—"} · ` +
      `Confirmations: ${snap.confirmations.length}`,
  ];

  for (const x of snap.exchanges) {
    const event = x.event_id ? events.get(x.event_id) : undefined;
    out.push("", `## ${x.exchange_id} · ${x.event_id ?? "no event"} · ${x.kind}`, "");
    const details = event
      ? ` · mapping_status ${event.mapping_status} · channel ${event.channel_id ?? "unknown"} · ${event.record_state}`
      : "";
    out.push(`- Event: ${eventLabel(event, x.event_id)}${details}`);
    if (event) out.push(`- Image: ![${event.event_id} highlighted](${href(event.highlighted_image_ref)})`);
    if (x.topic_id) {
      const also = x.related_event_ids.length ? ` · also pointed at: ${x.related_event_ids.join(", ")} (merged duplicate)` : "";
      out.push(`- Topic: ${x.topic_id}${also}`);
    }
    if (x.kind === "clarify_reference") out.push("- Clarification: the answer identifies the region only; not an interpretation.");
    if (x.gap_id) {
      const gap = snap.debrief_agenda.find(g => g.gap_id === x.gap_id);
      out.push(`- Debrief gap: ${x.gap_id}${gap ? ` (${gap.state}) — ${gap.description}` : ""}`);
    }
    if (x.revision_id) out.push(`- Reviews draft revision: ${x.revision_id}`);
    out.push(`- Asked: ${x.asked_at_utc} · phase ${x.phase}`, "");
    out.push(`**Question (verbatim):** ${x.question || "_(not spoken yet)_"}`, "");
    if (x.question_planned) out.push(`_Planned (AI, not evidence):_ ${x.question_planned}`, "");
    out.push("**Expert answer (verbatim):**", "");
    out.push(x.answer_lines.length ? quote(x.answer_lines.map(l => l.text)) : "_(no answer)_");
    const marks = snap.timing.filter(m => m.exchange_id === x.exchange_id);
    if (marks.length) out.push("", `Timing: ${marks.map(m => `${m.mark} ${time(m.at_utc)}`).join(" · ")}`);
  }

  if (snap.confirmations.length) {
    out.push("", "## Confirmations", "");
    for (const c of snap.confirmations) {
      out.push(`- ${c.confirmation_id} · ${c.revision_id} · **${c.status}** · response ${c.expert_response_exchange_id} · steps ${c.step_ids_reviewed.join(", ") || "—"} · ${c.at_utc}`);
    }
  }
  if (snap.preamble.length) {
    out.push("", "## Preamble (expert, before any question)", "", quote(snap.preamble.map(l => l.text)));
  }
  if (snap.unlinked_agent_questions.length) {
    out.push("", "## Unlinked agent questions (asked without begin_question)", "");
    for (const q of snap.unlinked_agent_questions) out.push(`- ${time(q.at_utc)} — ${q.text}`);
  }
  return out.join("\n") + "\n";
}

export function renderTranscriptMd(snap: SessionSnapshot): string {
  const out = [`# Transcript — ${snap.session_id}`, "", "Roles: **expert** = the human expert, **agent** = the AI apprentice.", ""];
  for (const e of snap.transcript) {
    const role = e.role === "user" ? "expert" : "agent";
    out.push(`- ${time(e.at_utc)} **${role}** [${e.exchange_id ?? "—"}] ${e.text}`);
  }
  return out.join("\n") + "\n";
}
