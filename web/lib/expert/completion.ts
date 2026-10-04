// SessionCompletion: derived only from the stored records when a session ends. "completed"
// needs an explicit, still-valid confirmation of the latest revision; anything else is
// incomplete (or aborted on error) and says plainly what was not finished.

import { type SessionCompletion, type SessionSnapshot, SCHEMA_VERSION } from "./contracts";
import { coverageGrid } from "./coverage";
import { activeConfirmations, isSuperseded } from "./draft";
import { offRecordMarker } from "./render";
import { liveCounters } from "./timing";

const UNRESOLVED_GAP_STATES = new Set(["open", "asked", "partial"]);

export function deriveCompletion(snap: SessionSnapshot): SessionCompletion {
  if (snap.ended_at_utc === null) throw new Error(`session ${snap.session_id} has not ended`);
  const latest = snap.revisions.at(-1) ?? null;
  const valid = activeConfirmations(snap);
  const latestConfirmed =
    latest !== null && !isSuperseded(snap, latest.revision_id) && valid.some(c => c.revision_id === latest.revision_id && c.status === "confirmed");
  const confirmed_revision_id = snap.phase === "confirmed" && latestConfirmed ? latest!.revision_id : null;
  const end_reason = confirmed_revision_id ? "completed" : snap.end_cause === "error" ? "aborted" : "incomplete";

  const open_gap_ids = snap.debrief_agenda.filter(g => UNRESOLVED_GAP_STATES.has(g.state)).map(g => g.gap_id);
  const unresolved = snap.open_questions.filter(q => q.answered_by_exchange_id === null).map(q => q.open_question_id);
  const reachedDebrief = snap.phase !== "live" && snap.phase_log.some(p => p.phase === "debrief");

  const unfinished: string[] = [];
  if (!reachedDebrief) unfinished.push("debrief not started: the session ended during the live task");
  if (open_gap_ids.length) unfinished.push(`${open_gap_ids.length} debrief gap(s) unresolved: ${open_gap_ids.join(", ")}`);
  if (reachedDebrief && !latest) unfinished.push("no draft workflow was proposed, so there was no teach-back");
  if (latest && isSuperseded(snap, latest.revision_id)) unfinished.push(`${latest.revision_id} was superseded by a strike and not replaced and re-confirmed`);
  else if (latest && !confirmed_revision_id) unfinished.push(`teach-back not confirmed (${latest.revision_id}): no explicit confirmation by the expert`);
  if (unresolved.length) unfinished.push(`${unresolved.length} open question(s) unanswered: ${unresolved.join(", ")}`);
  const last = snap.recording_segments.at(-1);
  if (last?.state === "off_record") unfinished.push("the session ended while off the record");
  if (end_reason === "aborted") unfinished.push("the session ended with an error");

  const live = liveCounters(snap);
  const off = snap.recording_segments.filter(s => s.state === "off_record");
  return {
    schema_version: SCHEMA_VERSION,
    session_id: snap.session_id,
    conversation_ids: [...snap.conversation_ids],
    started_at_utc: snap.started_at_utc,
    ended_at_utc: snap.ended_at_utc,
    end_reason,
    end_cause: snap.end_cause,
    final_phase: snap.phase,
    confirmed_revision_id,
    latest_revision_id: latest?.revision_id ?? null,
    coverage: coverageGrid(snap),
    unresolved_open_question_ids: unresolved,
    open_gap_ids,
    unfinished,
    excluded: {
      off_record_segments: off.length,
      segments: off.map(s => ({ from_utc: s.started_at_utc, to_utc: s.ended_at_utc })),
      excluded_exchange_ids: snap.strikes.map(s => s.exchange_id),
      ...snap.off_record_excluded,
    },
    counts: {
      live_questions: live.live_questions,
      live_guardrail_questions: live.guardrail_questions,
      debrief_questions: live.debrief_questions,
      teach_backs: live.teach_backs,
      confirmations: valid.length,
      strikes: snap.strikes.length,
    },
  };
}

export function renderCompletionMd(c: SessionCompletion): string {
  const head =
    c.end_reason === "completed"
      ? `**COMPLETED** — the expert explicitly confirmed ${c.confirmed_revision_id}. This confirms that revision, not that every question about the task is answered.`
      : `**${c.end_reason === "aborted" ? "ABORTED" : "INCOMPLETE"}** — the session ended before everything was finished. Nothing here is confirmed by the expert${c.latest_revision_id ? ` (latest draft: ${c.latest_revision_id}, unconfirmed)` : ""}.`;
  const covered = c.coverage.filter(x => x.status === "covered").length;
  const out = [
    `# Session completion — ${c.session_id}`,
    "",
    head,
    "",
    `- Ended: ${c.ended_at_utc} (${c.end_cause ?? "unknown cause"}) · final phase: ${c.final_phase}`,
    `- Conversations: ${c.conversation_ids.join(", ") || "—"}`,
    `- Questions: ${c.counts.live_questions} live (${c.counts.live_guardrail_questions} guardrail), ${c.counts.debrief_questions} debrief, ${c.counts.teach_backs} teach-back(s), ${c.counts.confirmations} valid confirmation(s), ${c.counts.strikes} strike(s)`,
    `- Coverage: ${covered} of ${c.coverage.length} cells covered`,
    "",
    "## Not finished",
    "",
    c.unfinished.length ? c.unfinished.map(u => `- ${u}`).join("\n") : "_nothing listed_",
    "",
    "## Excluded material",
    "",
  ];
  if (!c.excluded.off_record_segments && !c.excluded.excluded_exchange_ids.length) out.push("_none_");
  for (const s of c.excluded.segments) {
    out.push(`- ${offRecordMarker({ segment_id: "", state: "off_record", started_at_utc: s.from_utc, ended_at_utc: s.to_utc, trigger: "console" }).replace(/; trigger: [^)]*/, "")}`);
  }
  if (c.excluded.off_record_segments) {
    out.push(`- Dropped while off the record: ${c.excluded.transcript_lines} transcript line(s), ${c.excluded.events} event(s), ${c.excluded.timing_marks} timing mark(s), ${c.excluded.refused_tool_calls} refused tool call(s)`);
  }
  if (c.excluded.excluded_exchange_ids.length) out.push(`- Struck at the expert's request: ${c.excluded.excluded_exchange_ids.join(", ")}`);
  return out.join("\n") + "\n";
}
