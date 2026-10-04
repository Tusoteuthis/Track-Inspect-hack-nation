// Timing evidence derived only from stored records: our processing latency, the
// deliberate wait for a pause, and agent latency are kept apart, so good restraint
// never hides slow processing (and the reverse). Format:
// specs/20261004-015810-ws3-sprint-2-live-interview/contracts/timing-report.md

import type { ExchangeKind, SessionSnapshot, TimingMark, TimingMarkName } from "./contracts";

export type ExchangeTiming = {
  exchange_id: string;
  event_id: string | null;
  kind: ExchangeKind;
  fixture: boolean;
  /** Not the first question on its topic: no release of its own. */
  follow_up: boolean;
  released: boolean;
  stale: boolean | null;
  nudged: boolean;
  /** event_received → topic_queued (topic ready). */
  processing_ms: number | null;
  /** topic_queued → topic_released. */
  intentional_wait_ms: number | null;
  release_to_tool_ms: number | null;
  tool_to_speech_ms: number | null;
  release_to_speech_ms: number | null;
};

const diff = (a: TimingMark | undefined, b: TimingMark | undefined) =>
  a && b ? Math.round(b.at_perf_ms - a.at_perf_ms) : null;

export function exchangeTimings(snap: SessionSnapshot): ExchangeTiming[] {
  const first = (name: TimingMarkName, pred: (m: TimingMark) => boolean) =>
    snap.timing.find(m => m.mark === name && pred(m));

  return snap.exchanges.map(x => {
    const topic = snap.topics.find(t => t.topic_id === x.topic_id);
    const follow_up = topic !== undefined && topic.exchange_ids[0] !== x.exchange_id;
    const tool = first("question_tool_called", m => m.exchange_id === x.exchange_id);
    const speech = tool && first("agent_speech_started", m => m.exchange_id === x.exchange_id && m.at_perf_ms >= tool.at_perf_ms);

    const ownsRelease = topic !== undefined && !follow_up;
    const eventId = topic?.primary_event_id;
    const received = ownsRelease ? first("event_received", m => m.event_id === eventId) : undefined;
    const queued = ownsRelease ? first("topic_queued", m => m.event_id === eventId) : undefined;
    const release = ownsRelease ? first("topic_released", m => m.event_id === eventId) : undefined;
    // A question asked before its topic was released has no meaningful release latency.
    const usableRelease = release && tool && release.at_perf_ms <= tool.at_perf_ms ? release : undefined;

    return {
      exchange_id: x.exchange_id,
      event_id: x.event_id,
      kind: x.kind,
      fixture: x.source === "fixture",
      follow_up,
      released: usableRelease !== undefined,
      stale: ownsRelease ? (topic.stale_at_release ?? null) : null,
      nudged: ownsRelease && topic.nudged_at_perf_ms !== null,
      processing_ms: diff(received, queued),
      intentional_wait_ms: diff(queued, usableRelease),
      release_to_tool_ms: diff(usableRelease, tool),
      tool_to_speech_ms: diff(tool, speech),
      release_to_speech_ms: diff(usableRelease, speech),
    };
  });
}

/** Agent speech that started while an expert speech interval was open (target: 0). */
export function countInterruptions(timing: TimingMark[]): { count: number; at_utc: string[] } {
  // Speech ends are logged after a hold but stamped at the last activity, so order by time.
  const ordered = timing
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.at_perf_ms - b.m.at_perf_ms || a.i - b.i)
    .map(({ m }) => m);
  let expertSpeaking = false;
  const at_utc: string[] = [];
  for (const m of ordered) {
    if (m.mark === "user_speech_started") expertSpeaking = true;
    else if (m.mark === "user_speech_ended") expertSpeaking = false;
    else if (m.mark === "agent_speech_started" && expertSpeaking) at_utc.push(m.at_utc);
  }
  return { count: at_utc.length, at_utc };
}

export type LiveCounters = {
  live_questions: number;
  guardrail_questions: number;
  deferred_topics: number;
  unlinked_agent_questions: number;
  interruptions: number;
  /** Extra questions of the same kind on the same topic. */
  duplicate_questions: number;
  /** Spoken debrief questions; never counted as live questions (and the reverse). */
  debrief_questions: number;
  /** Debrief questions whose gap was missing or partial when the debrief started (all, by construction). */
  debrief_gap_questions: number;
  teach_backs: number;
};

export function liveCounters(snap: SessionSnapshot): LiveCounters {
  const spoken = snap.exchanges.filter(x => x.phase === "live" && x.question !== "");
  const debrief = snap.exchanges.filter(x => x.phase === "debrief" && x.question !== "");
  const perTopicKind = new Map<string, number>();
  for (const x of spoken) {
    if (x.topic_id === null) continue;
    const key = `${x.topic_id}|${x.kind}`;
    perTopicKind.set(key, (perTopicKind.get(key) ?? 0) + 1);
  }
  return {
    live_questions: spoken.length,
    guardrail_questions: spoken.filter(x => x.kind === "guardrail").length,
    deferred_topics: snap.topics.filter(t => t.state === "deferred_to_debrief").length,
    unlinked_agent_questions: snap.unlinked_agent_questions.length,
    interruptions: countInterruptions(snap.timing).count,
    duplicate_questions: [...perTopicKind.values()].reduce((sum, n) => sum + n - 1, 0),
    debrief_questions: debrief.length,
    debrief_gap_questions: debrief.filter(x => snap.debrief_agenda.some(g => g.gap_id === x.gap_id)).length,
    teach_backs: snap.exchanges.filter(x => x.kind === "teach_back" && x.question !== "").length,
  };
}

const cell = (v: number | null) => (v === null ? "—" : String(v));

export function renderTimingReportMd(snap: SessionSnapshot): string {
  const c = snap.interview_config;
  const rows = exchangeTimings(snap);
  const interruptions = countInterruptions(snap.timing);
  const counters = liveCounters(snap);
  const out = [
    `# Timing report — ${snap.session_id}`,
    "",
    `Config: pause_ms ${c.pause_ms} · nudge_after_ms ${c.nudge_after_ms} · stale_after_ms ${c.stale_after_ms} · ` +
      `dedup ${c.dedup_window_ms} ms / IoU ${c.dedup_min_iou} · budget ${c.budget_max_questions} per ${Math.round(c.budget_window_ms / 60_000)} min`,
    "",
    "- **processing ms**: event received → topic ready (our own processing).",
    "- **intentional wait ms**: topic ready → released to the agent (deliberately waiting for a pause or for the previous topic).",
    "- **release→tool / tool→speech / release→speech**: agent latency.",
    "",
    "| exchange | event | kind | processing ms | intentional wait ms | release→tool ms | tool→speech ms | release→speech ms | notes |",
    "|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const notes = [
      r.follow_up && "follow-up",
      !r.follow_up && !r.released && "not released",
      r.stale && "stale",
      r.nudged && "nudged",
      r.fixture && "FIXTURE",
    ].filter(Boolean);
    out.push(
      `| ${r.exchange_id} | ${r.event_id ?? "—"} | ${r.kind} | ${cell(r.processing_ms)} | ${cell(r.intentional_wait_ms)} | ` +
        `${cell(r.release_to_tool_ms)} | ${cell(r.tool_to_speech_ms)} | ${cell(r.release_to_speech_ms)} | ${notes.join(", ")} |`
    );
  }
  if (!rows.length) out.push("| — | — | — | — | — | — | — | — | no questions |");

  out.push("", `Interruptions (agent speech started while the expert was speaking): ${interruptions.count}`);
  for (const t of interruptions.at_utc) out.push(`- at ${t}`);

  out.push(
    "",
    "## Counters",
    "",
    `- Live questions: ${counters.live_questions}`,
    `- Guardrail questions: ${counters.guardrail_questions}`,
    `- Deferred topics: ${counters.deferred_topics}`,
    `- Unlinked agent questions: ${counters.unlinked_agent_questions}`,
    `- Duplicate questions: ${counters.duplicate_questions}`,
    `- Debrief questions: ${counters.debrief_questions}`,
    "",
    "## Topics",
    "",
    "| topic | primary event | aliases | state | stale at release | deferred reason |",
    "|---|---|---|---|---|---|"
  );
  for (const t of snap.topics) {
    const stale = t.stale_at_release === null ? "—" : t.stale_at_release ? "yes" : "no";
    out.push(
      `| ${t.topic_id} | ${t.primary_event_id} | ${t.alias_event_ids.join(", ") || "—"} | ${t.state} | ${stale} | ${t.deferred_reason ?? "—"} |`
    );
  }
  out.push(
    "",
    "_Limitation: \"expert speaking\" comes from server VAD, tentative transcripts and the local mic level. " +
      "Silence is not proof that the expert has finished thinking._"
  );
  return out.join("\n") + "\n";
}
