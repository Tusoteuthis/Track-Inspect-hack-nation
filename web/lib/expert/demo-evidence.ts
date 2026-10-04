// demo-evidence.md: the challenge checklist, an annotated transcript, the timing table and what
// was live vs fixture — derived purely from the stored session records.

import { type SessionSnapshot, validateSessionSnapshot } from "./contracts";
import { activeConfirmations, isSuperseded } from "./draft";
import { offRecordMarker } from "./render";
import { countInterruptions, exchangeTimings, renderTimingTable } from "./timing";

export type ChecklistRow = {
  id: "live_questions" | "live_guardrail" | "debrief_questions" | "teach_back" | "evidence_links" | "off_record";
  label: string;
  ok: boolean;
  detail: string;
  /** Markdown links to the supporting records. */
  links: string[];
};

export type EvidenceOptions = { imageHref?: (ref: string) => string };

const MIN_LIVE = 3;
const MIN_DEBRIEF = 3;

export function demoChecklist(snap: SessionSnapshot, options: EvidenceOptions = {}): ChecklistRow[] {
  const href = options.imageHref ?? (ref => ref);
  const events = new Map(snap.events.map(e => [e.event_id, e]));
  const exLink = (id: string) => `[${id}](exchanges.md)`;
  const evLink = (id: string | null) => {
    const e = id ? events.get(id) : undefined;
    return e ? `[${e.event_id}${e.source === "fixture" ? " FIXTURE" : ""}](${href(e.highlighted_image_ref)})` : "no event";
  };

  // "at a pause": the agent did not start speaking while the expert was speaking
  const interrupted = new Set(countInterruptions(snap.timing).at_utc);
  const interruptedExchanges = new Set(
    snap.timing.filter(m => m.mark === "agent_speech_started" && m.exchange_id && interrupted.has(m.at_utc)).map(m => m.exchange_id!)
  );
  const live = snap.exchanges.filter(x => x.phase === "live" && x.question !== "" && x.event_id !== null);
  const atPause = live.filter(x => !interruptedExchanges.has(x.exchange_id));
  const guardrails = atPause.filter(x => x.kind === "guardrail" && x.answer_lines.length > 0);

  const agendaIds = new Set(snap.debrief_agenda.map(g => g.gap_id));
  const debrief = snap.exchanges.filter(x => x.phase === "debrief" && x.question !== "" && x.answer_lines.length > 0 && x.gap_id !== null && agendaIds.has(x.gap_id));
  const debriefGaps = new Set(debrief.map(x => x.gap_id));

  const exchanges = new Map(snap.exchanges.map(x => [x.exchange_id, x]));
  const responses = activeConfirmations(snap).filter(
    c => (c.status === "confirmed" || c.status === "corrected") && (exchanges.get(c.expert_response_exchange_id)?.answer_lines.length ?? 0) > 0
  );
  const latest = snap.revisions.at(-1);
  const finalConfirmed = latest && responses.some(c => c.revision_id === latest.revision_id && c.status === "confirmed");

  const steps = latest && !isSuperseded(snap, latest.revision_id) ? latest.steps : [];
  const linked = steps.filter(s => s.supported && s.supporting_event_ids.length > 0 && s.supporting_exchange_ids.length > 0);

  const off = snap.recording_segments.filter(s => s.state === "off_record");
  const closed = off.every(s => s.ended_at_utc !== null);
  const leakFree = validateSessionSnapshot(snap).ok;
  const deletion = snap.elevenlabs_deletions.at(-1);
  const deletionText = deletion
    ? `ElevenLabs conversation deletion: ${deletion.results.map(r => `${r.conversation_id} ${r.status}`).join(", ")}`
    : "ElevenLabs conversation not deleted (yet)";

  return [
    {
      id: "live_questions",
      label: `≥ ${MIN_LIVE} live questions at natural pauses, each about a pointing event`,
      ok: atPause.length >= MIN_LIVE,
      detail: `${atPause.length} of ${live.length} live questions asked without interrupting the expert`,
      links: atPause.map(x => `${exLink(x.exchange_id)} → ${evLink(x.event_id)} (${x.kind})`),
    },
    {
      id: "live_guardrail",
      label: "≥ 1 live guardrail question",
      ok: guardrails.length >= 1,
      detail: `${guardrails.length} answered live guardrail question(s)`,
      links: guardrails.map(x => `${exLink(x.exchange_id)} → ${evLink(x.event_id)}`),
    },
    {
      id: "debrief_questions",
      label: `≥ ${MIN_DEBRIEF} debrief questions on matters not answered live`,
      ok: debriefGaps.size >= MIN_DEBRIEF,
      detail: `${debriefGaps.size} distinct agenda gap(s) asked and answered (each gap was missing or partial when the debrief started)`,
      links: debrief.map(x => `${exLink(x.exchange_id)} → ${x.gap_id}`),
    },
    {
      id: "teach_back",
      label: "Teach-back explicitly confirmed or corrected by the expert",
      ok: responses.length > 0,
      detail: responses.length
        ? `${responses.map(c => `${c.revision_id} ${c.status}`).join(", ")}${finalConfirmed ? `; final: ${latest!.revision_id} confirmed` : "; latest revision not confirmed"}`
        : "no explicit confirmation or correction (silence never confirms)",
      links: responses.map(c => `${c.confirmation_id}: ${exLink(c.expert_response_exchange_id)}`),
    },
    {
      id: "evidence_links",
      label: "Every workflow step and guardrail links to a screen moment and the expert's words",
      ok: steps.length > 0 && linked.length === steps.length,
      detail: latest ? `${linked.length} of ${steps.length} step(s) of ${latest.revision_id} linked${steps.length ? "" : " (revision superseded or empty)"}` : "no draft revision",
      links: steps.map(s => `${s.step_id} (${s.kind}): ${s.supporting_event_ids.map(evLink).join(", ") || "no event"} · ${s.supporting_exchange_ids.map(exLink).join(", ") || "no words"}`),
    },
    {
      id: "off_record",
      label: "Off-record handling: content excluded from every saved record",
      ok: off.length > 0 && closed && leakFree,
      detail: off.length
        ? `${off.length} segment(s); ${snap.off_record_excluded.transcript_lines} line(s), ${snap.off_record_excluded.events} event(s), ${snap.off_record_excluded.timing_marks} mark(s) dropped${closed ? "" : "; a segment is still open"}${leakFree ? "" : "; LEAK CHECK FAILED"}. ${deletionText}`
        : "not exercised in this session",
      links: off.map(s => offRecordMarker(s)),
    },
  ];
}

const phaseAt = (snap: SessionSnapshot, at: string) => [...snap.phase_log].reverse().find(p => p.at_utc <= at)?.phase ?? "live";
const offset = (snap: SessionSnapshot, at: string) => {
  const s = Math.max(0, Math.round((Date.parse(at) - Date.parse(snap.started_at_utc)) / 1000));
  return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const cellText = (t: string) => t.replaceAll("|", "\\|").replaceAll("\n", " ");

export function renderDemoEvidenceMd(snap: SessionSnapshot, options: EvidenceOptions = {}): string {
  const rows = demoChecklist(snap, options);
  const fixtures = snap.events.filter(e => e.source === "fixture");
  const liveEvents = snap.events.filter(e => e.source === "live");
  const draftBy = snap.phase_log.find(p => p.phase === "teach_back")?.trigger;
  const out = [
    `# Demo evidence — ${snap.session_id}`,
    "",
    `_Derived only from the saved session records (session.json, events.json, exchanges.json, timing.json). Started ${snap.started_at_utc}, ended ${snap.ended_at_utc ?? "(in progress)"}, phase ${snap.phase}._`,
    "",
    "## Challenge checklist",
    "",
    "| | requirement | evidence |",
    "|---|---|---|",
    ...rows.map(r => `| ${r.ok ? "✓" : "✗"} | ${r.label} | ${cellText(r.detail)} |`),
    "",
  ];
  for (const r of rows) {
    if (!r.links.length) continue;
    out.push(`**${r.ok ? "✓" : "✗"} ${r.label}**`, "", ...r.links.map(l => `- ${l}`), "");
  }

  out.push("## Annotated transcript", "", "| time | phase | role | exchange | event | kind | text |", "|---|---|---|---|---|---|---|");
  const exchanges = new Map(snap.exchanges.map(x => [x.exchange_id, x]));
  const markers = snap.recording_segments
    .filter(s => s.state === "off_record")
    .map(s => ({ at: s.started_at_utc, row: `| ${offset(snap, s.started_at_utc)} | — | — | — | — | — | _${offRecordMarker(s)}_ |` }));
  for (const t of snap.transcript) {
    while (markers.length && markers[0].at <= t.at_utc) out.push(markers.shift()!.row);
    const x = t.exchange_id ? exchanges.get(t.exchange_id) : undefined;
    const role = t.role === "user" ? "expert" : "agent";
    out.push(`| ${offset(snap, t.at_utc)} | ${x?.phase ?? phaseAt(snap, t.at_utc)} | ${role} | ${t.exchange_id ?? "—"} | ${x?.event_id ?? "—"} | ${x?.kind ?? "—"} | ${cellText(t.text)} |`);
  }
  for (const m of markers) out.push(m.row);

  out.push("", "## Timing per question", "", ...renderTimingTable(exchangeTimings(snap)), "");
  out.push(
    "## Live vs fixture",
    "",
    `- Voice conversation: ${snap.conversation_ids.length ? `live ElevenLabs conversation(s) ${snap.conversation_ids.join(", ")}` : "no ElevenLabs conversation recorded (scripted/test session)"}`,
    `- Pointing events: ${liveEvents.length} live (WS2 capture), ${fixtures.length} FIXTURE (simulated)${fixtures.length ? `: ${fixtures.map(e => e.event_id).join(", ")}` : ""}`,
    `- Draft text: ${draftBy === "agent_tool" ? "proposed by the agent (propose_draft), checked by the app" : draftBy === "console" ? "console fallback (deterministic, from verbatim answers)" : "no draft"}`,
    "- Expert words, questions and confirmations: from the live conversation transcript (verbatim).",
    ""
  );
  return out.join("\n");
}
