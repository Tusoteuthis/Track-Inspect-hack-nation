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

const quote = (text: string) => text.split("\n").map(l => `> ${l}`).join("\n");

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
  ];

  for (const x of snap.exchanges) {
    const event = x.event_id ? events.get(x.event_id) : undefined;
    out.push("", `## ${x.exchange_id} · ${x.event_id ?? "no event"} · ${x.kind}`, "");
    const details = event
      ? ` · mapping_status ${event.mapping_status} · channel ${event.channel_id ?? "unknown"} · ${event.record_state}`
      : "";
    out.push(`- Event: ${eventLabel(event, x.event_id)}${details}`);
    if (event) out.push(`- Image: ![${event.event_id} highlighted](${href(event.highlighted_image_ref)})`);
    out.push(`- Asked: ${x.asked_at_utc} · phase ${x.phase}`, "");
    out.push(`**Question (verbatim):** ${x.question || "_(not spoken yet)_"}`, "");
    if (x.question_planned) out.push(`_Planned (AI, not evidence):_ ${x.question_planned}`, "");
    out.push("**Expert answer (verbatim):**", "");
    out.push(x.answer_lines.length ? quote(x.answer_lines.map(l => l.text).join("\n")) : "_(no answer)_");
    const marks = snap.timing.filter(m => m.exchange_id === x.exchange_id);
    if (marks.length) out.push("", `Timing: ${marks.map(m => `${m.mark} ${time(m.at_utc)}`).join(" · ")}`);
  }

  if (snap.preamble.length) {
    out.push("", "## Preamble (expert, before any question)", "", quote(snap.preamble.map(l => l.text).join("\n")));
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
