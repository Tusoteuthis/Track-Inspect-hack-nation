// Coverage tracking and the debrief gap selector: what the captured material does and
// does not explain yet. Pure and deterministic. WS5 can replace it behind synthesis.ts;
// evidence ids (event_id, exchange_id) must stay the same.

import {
  COVERAGE_DIMENSIONS,
  type CoverageDimension,
  type CoverageItem,
  type CoverageResolution,
  type CoverageStatus,
  type DebriefItem,
  type ExchangeKind,
  type Gap,
  type OpenQuestion,
  type SessionSnapshot,
  type Topic,
} from "./contracts";

/** Default debrief cap (strategy §6/§11, D6); the session's `interview_config.debrief_max_gaps` wins. */
export const DEBRIEF_MAX_GAPS = 3;

/** A question of this kind, once answered, addresses that dimension of its region. */
export const KIND_DIMENSION: Partial<Record<ExchangeKind, CoverageDimension>> = {
  explain: "decision",
  reasoning: "reason",
  context: "cues",
  distinction: "alternatives",
  guardrail: "guardrails",
};

const STATUS_RANK: Record<CoverageStatus, number> = { missing: 0, partial: 1, covered: 2 };
const DIM_RANK: Record<CoverageDimension, number> = {
  guardrails: 0,
  alternatives: 1,
  reason: 2,
  decision: 3,
  cues: 4,
  unresolved: 5,
};

export type CoverageUpdate = {
  event_id: string | null;
  dimension: CoverageDimension;
  status: "partial" | "covered";
  exchange_id: string;
  /** AI synthesis; kept apart from verbatim answer lines. */
  note: string | null;
  resolution: CoverageResolution | null;
};

/** Upgrades one cell. Status never goes down; the exchange is always linked as support. */
export function applyCoverage(items: CoverageItem[], u: CoverageUpdate): CoverageItem[] {
  const existing = items.find(c => c.event_id === u.event_id && c.dimension === u.dimension);
  const base: CoverageItem = existing ?? {
    dimension: u.dimension,
    event_id: u.event_id,
    status: "missing",
    supporting_exchange_ids: [],
    note: null,
    resolution: null,
  };
  const upgrade = STATUS_RANK[u.status] > STATUS_RANK[base.status];
  const next: CoverageItem = {
    ...base,
    status: upgrade ? u.status : base.status,
    supporting_exchange_ids: base.supporting_exchange_ids.includes(u.exchange_id)
      ? base.supporting_exchange_ids
      : [...base.supporting_exchange_ids, u.exchange_id],
    note: u.note ?? base.note,
    // "unknown, I'd escalate" is the stronger, explicit statement and is kept once made
    resolution: base.resolution === "unknown_escalate" ? base.resolution : (u.resolution ?? base.resolution),
  };
  return existing ? items.map(c => (c === existing ? next : c)) : [...items, next];
}

/**
 * Topics that get coverage rows: on record and discussed. A deferred topic gets its rows once
 * something was recorded for it (its open question was answered in the debrief).
 */
const discussedTopics = (topics: Topic[], coverage: CoverageItem[]) =>
  topics.filter(
    t =>
      t.record_state === "on_record" &&
      t.state !== "dropped_off_record" &&
      (t.state !== "deferred_to_debrief" || coverage.some(c => c.event_id === t.primary_event_id))
  );

/** Full event × dimension grid (missing where nothing was recorded), topics in queue order, session row last. */
export function coverageGrid(snap: Pick<SessionSnapshot, "topics" | "coverage">): CoverageItem[] {
  const rows: (string | null)[] = [...discussedTopics(snap.topics, snap.coverage).map(t => t.primary_event_id), null];
  return rows.flatMap(event_id =>
    COVERAGE_DIMENSIONS.map(
      dimension =>
        snap.coverage.find(c => c.event_id === event_id && c.dimension === dimension) ?? {
          dimension,
          event_id,
          status: "missing" as const,
          supporting_exchange_ids: [],
          note: null,
          resolution: null,
        }
    )
  );
}

const where = (topic: Topic | undefined) =>
  topic ? `the region you pointed at on ${topic.channel_id ?? "the trace"}` : "the task as a whole";

const SESSION_GAPS: Record<CoverageDimension, string> = {
  decision: "What you decide or do at the end of the task as a whole.",
  reason: "What, overall, makes you reach that decision.",
  cues: "Which extra context you need before deciding on the task as a whole.",
  alternatives: "Which situations in this task could be confused with each other, and how you tell them apart.",
  guardrails: "When you would stop, escalate or not trust the traces in this task as a whole.",
  unresolved: "Cases in this task that you are unsure about or would leave open.",
};

/** Plain description of a gap: a fixed template plus the channel, never an interpretation. */
export function gapDescription(dimension: CoverageDimension, topic: Topic | undefined): string {
  if (!topic) return SESSION_GAPS[dimension];
  const w = where(topic);
  switch (dimension) {
    case "decision":
      return `What you decide or do about ${w}.`;
    case "reason":
      return `What makes you read ${w} the way you do.`;
    case "cues":
      return `Which visible cues or extra context you rely on for ${w}.`;
    case "alternatives":
      return `What could look similar to ${w}, and how you tell them apart.`;
    case "guardrails":
      return `When you would stop, escalate or not trust what you see for ${w}.`;
    case "unresolved":
      return `Cases around ${w} that you are unsure about or would leave open.`;
  }
}

/** Deferred topics (pointed at, never discussed) become open questions; existing ones are kept. */
export function openQuestionsFromTopics(topics: Topic[], existing: OpenQuestion[]): OpenQuestion[] {
  const out = [...existing];
  for (const t of topics) {
    if (t.state !== "deferred_to_debrief" || t.record_state !== "on_record") continue;
    if (out.some(q => q.related_event_ids[0] === t.primary_event_id && q.related_exchange_ids.length === 0)) continue;
    out.push({
      open_question_id: `oq-${String(out.length + 1).padStart(3, "0")}`,
      missing_fact: `What you see and decide at ${where(t)}: it was pointed at but not discussed during the task.`,
      why_it_matters: "Every workflow step needs your own explanation of a screen moment.",
      related_event_ids: [t.primary_event_id, ...t.alias_event_ids],
      related_exchange_ids: [],
      answered_by_exchange_id: null,
    });
  }
  return out;
}

type GapSnap = Pick<SessionSnapshot, "topics" | "coverage" | "exchanges" | "open_questions">;

/**
 * Ordered debrief gaps. Excludes covered cells and dimensions already asked and answered on
 * the same region. Order: open questions, then guardrails / alternatives / missing reasons,
 * then the rest; within a tier topic rows before the session row, missing before partial,
 * then dimension, then topic order.
 */
export function selectGaps(snap: GapSnap): Gap[] {
  const topics = discussedTopics(snap.topics, snap.coverage);
  const topicOf = (event: string | null) => snap.topics.find(t => t.primary_event_id === event);
  const asked = new Set(
    snap.exchanges
      .filter(x => x.answer_lines.length > 0 && KIND_DIMENSION[x.kind])
      .map(x => `${x.event_id ?? "session"}|${KIND_DIMENSION[x.kind]}`)
  );

  type Ranked = { gap: Gap; key: number[] };
  const ranked: Ranked[] = [];

  snap.open_questions
    .filter(q => q.answered_by_exchange_id === null)
    .forEach((q, i) => {
      const event_id = q.related_event_ids[0] ?? null;
      ranked.push({
        gap: {
          gap_id: `gap-${q.open_question_id}`,
          event_id,
          topic_id: topicOf(event_id)?.topic_id ?? null,
          dimension: q.related_exchange_ids.length ? "unresolved" : "decision",
          open_question_id: q.open_question_id,
          description: q.missing_fact,
          status_at_start: "missing",
        },
        key: [0, 0, 0, -1, i],
      });
    });

  const rows: (Topic | undefined)[] = [...topics, undefined];
  for (const cell of coverageGrid({ topics: snap.topics, coverage: snap.coverage })) {
    if (cell.status === "covered" || asked.has(`${cell.event_id ?? "session"}|${cell.dimension}`)) continue;
    const topic = topics.find(t => t.primary_event_id === cell.event_id);
    const row = rows.indexOf(topic);
    const high = cell.dimension === "guardrails" || cell.dimension === "alternatives" || (cell.dimension === "reason" && cell.status === "missing");
    ranked.push({
      gap: {
        gap_id: `gap-${cell.event_id ?? "session"}-${cell.dimension}`,
        event_id: cell.event_id,
        topic_id: topic?.topic_id ?? null,
        dimension: cell.dimension,
        open_question_id: null,
        description: gapDescription(cell.dimension, topic),
        status_at_start: cell.status === "partial" ? "partial" : "missing",
      },
      // session-row answers have no screen moment of their own, so topic gaps come first
      key: [high ? 1 : 2, topic ? 0 : 1, STATUS_RANK[cell.status], DIM_RANK[cell.dimension], row],
    });
  }

  return ranked
    .sort((a, b) => {
      for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i];
      return 0;
    })
    .map(r => r.gap);
}

/**
 * The frozen agenda: the top `max` gaps are open; the rest are kept as `dropped` (unresolved,
 * never asked). With `guardrailFirst` (no guardrail question answered live, D6) the best guardrail
 * gap takes the first slot so the challenge's guardrail is covered without an extra question.
 */
export function agendaFromGaps(gaps: Gap[], max: number, guardrailFirst: boolean): DebriefItem[] {
  const ordered = [...gaps];
  const g = guardrailFirst ? ordered.findIndex(x => x.dimension === "guardrails") : -1;
  if (g > 0) ordered.unshift(...ordered.splice(g, 1));
  return ordered.map((gap, i) => ({ ...gap, state: i < max ? ("open" as const) : ("dropped" as const), exchange_ids: [] }));
}

/** The frozen agenda for the debrief, from this module's own gap selector. */
export function debriefAgenda(snap: GapSnap, max = DEBRIEF_MAX_GAPS, guardrailFirst = false): DebriefItem[] {
  return agendaFromGaps(selectGaps(snap), max, guardrailFirst);
}
