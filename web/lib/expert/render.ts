// Human-readable Markdown views of a session snapshot. Expert words are quoted
// verbatim; anything AI-generated is labeled as such.

import type { PointingEvent, RecordingSegment, SessionSnapshot } from "./contracts";

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
    const struck = snap.strikes.find(st => st.exchange_id === x.exchange_id);
    out.push(x.answer_lines.length ? quote(x.answer_lines.map(l => l.text)) : struck ? `_(struck at the expert's request, ${struck.strike_id})_` : "_(no answer)_");
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
  out.push("", ...renderExcludedMd(snap));
  return out.join("\n") + "\n";
}

export function renderTranscriptMd(snap: SessionSnapshot): string {
  const out = [`# Transcript — ${snap.session_id}`, "", "Roles: **expert** = the human expert, **agent** = the AI apprentice.", ""];
  const markers = snap.recording_segments.filter(s => s.state === "off_record").map(s => ({ at: s.started_at_utc, text: `- ${time(s.started_at_utc)} — _${offRecordMarker(s)}_` }));
  for (const e of snap.transcript) {
    while (markers.length && markers[0].at <= e.at_utc) out.push(markers.shift()!.text);
    const role = e.role === "user" ? "expert" : "agent";
    out.push(`- ${time(e.at_utc)} **${role}** [${e.exchange_id ?? "—"}] ${e.text}`);
  }
  for (const m of markers) out.push(m.text);
  return out.join("\n") + "\n";
}

/** Neutral off-record markers and strikes. Times and ids only: excluded content is never written. */
export function renderExcludedMd(snap: SessionSnapshot): string[] {
  const off = snap.recording_segments.filter(s => s.state === "off_record");
  const x = snap.off_record_excluded;
  const out = ["## Excluded material", ""];
  if (!off.length && !snap.strikes.length) return [...out, "_none: the whole session was on the record and nothing was struck_"];
  for (const s of off) out.push(`- ${offRecordMarker(s)}`);
  if (off.length) {
    out.push(`- Dropped while off the record: ${x.transcript_lines} transcript line(s), ${x.events} pointing event(s), ${x.timing_marks} timing mark(s); ${x.refused_tool_calls} agent tool call(s) refused.`);
  }
  for (const st of snap.strikes) {
    const extra = [
      st.superseded_revision_ids.length && `superseded ${st.superseded_revision_ids.join(", ")}`,
      st.invalidated_confirmation_ids.length && `invalidated ${st.invalidated_confirmation_ids.join(", ")}`,
    ].filter(Boolean);
    out.push(`- ${st.strike_id}: the expert's words in ${st.exchange_id} were struck at their request at ${st.at_utc} (${st.removed_line_count} line(s))${extra.length ? `; ${extra.join("; ")}` : ""}.`);
  }
  return out;
}

export const offRecordMarker = (s: RecordingSegment) =>
  `off-record segment from ${s.started_at_utc} to ${s.ended_at_utc ?? "session end"} (content excluded; trigger: ${s.trigger.replace("_", " ")})`;
