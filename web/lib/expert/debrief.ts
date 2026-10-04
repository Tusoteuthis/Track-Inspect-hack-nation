// Reducer steps after the live interview: debrief, teach-back, correction and confirmation.
// Every agent tool call ends in `last_tool_result` ("ok …" / "error …"), which goes back to the LLM.
// Spec: specs/20261004-003657-ws3-sprint-3-debrief-confirmation

import {
  type BeginQuestionParams,
  type DebriefItem,
  type DebriefItemState,
  type DraftRevision,
  type ExpertConfirmation,
  type ExpertExchange,
  type OpenQuestion,
  type PhaseTrigger,
  type SessionPhase,
  validateConfirmRevisionParams,
  validateProposeDraftParams,
  validateRecordCoverageParams,
} from "./contracts";
import { formatDebriefUpdate, formatStruckRevisionUpdate, formatTeachBackUpdate } from "./context-update";
import { agendaFromGaps, applyCoverage, openQuestionsFromTopics } from "./coverage";
import { activeConfirmations, addRevision, isSuperseded, stepsToTeach } from "./draft";
import { SAY_IT, type SessionState } from "./session";
import { type Stamp, closeActive, mark, updateExchange } from "./session-util";
import { type Synthesis, defaultSynthesis } from "./synthesis";

/** Reminder after record_coverage in the live phase (the probes' tool mock uses the same words). */
export const AFTER_COVERAGE_LIVE =
  "Next: either call begin_question and then say that question out loud, or call skip_turn.";

/** Fewest debrief questions before a draft may be proposed (or the whole agenda, if shorter). */
export const MIN_DEBRIEF_QUESTIONS = 3;

const pad = (n: number) => String(n).padStart(3, "0");
const nextExchangeId = (state: SessionState) => `ex-${pad(state.exchanges.length + 1)}`;
const fail = (state: SessionState, message: string): SessionState => ({ ...state, last_tool_result: `error ${message}` });

export function withPhase(state: SessionState, phase: SessionPhase, trigger: PhaseTrigger, at: Stamp): SessionState {
  if (state.phase === phase) return state;
  return { ...state, phase, phase_log: [...state.phase_log, { phase, at_utc: at.at_utc, trigger }] };
}

export const latestRevision = (state: Pick<SessionState, "revisions">): DraftRevision | undefined => state.revisions.at(-1);

/**
 * The parent whose unchanged steps need no re-teaching. After a strike superseded the parent,
 * the whole procedure is taught again (null), because its confirmation no longer holds.
 */
export function teachParentOf(state: Pick<SessionState, "revisions" | "strikes">, rev: DraftRevision): DraftRevision | null {
  const parent = rev.parent_revision_id ? (state.revisions.find(r => r.revision_id === rev.parent_revision_id) ?? null) : null;
  return parent && isSuperseded(state, parent.revision_id) ? null : parent;
}

/** Opens the exchange that will hold the agent's spoken teach-back of `revisionId` and the expert's reply. */
export function openTeachBackExchange(state: SessionState, revisionId: string, at: Stamp): SessionState {
  const closed = closeActive(state);
  const exchange_id = nextExchangeId(closed);
  const teachBack = newExchange(closed, exchange_id, at, {
    event_id: null,
    topic_id: null,
    related_event_ids: [],
    phase: "teach_back",
    kind: "teach_back",
    question_planned: null,
    revision_id: revisionId,
    record_state: "on_record",
    source: "live",
  });
  return { ...closed, exchanges: [...closed.exchanges, teachBack], active_exchange_id: exchange_id, awaiting_question_exchange_id: exchange_id };
}

const openGapIds = (agenda: DebriefItem[]) => agenda.filter(i => i.state === "open").map(i => i.gap_id);

/** live → debrief: close the live phase, turn leftover topics into open questions, freeze the agenda. */
export function startDebrief(
  state: SessionState,
  trigger: PhaseTrigger,
  at: Stamp,
  synthesis: Synthesis = defaultSynthesis
): SessionState {
  if (state.phase !== "live") return fail(state, `the session is already in phase ${state.phase}`);
  const closed = closeActive(state);
  const topics = closed.topics.map(t =>
    t.state === "queued" || t.state === "released" ? { ...t, state: "deferred_to_debrief" as const, deferred_reason: "task_complete" as const } : t
  );
  const open_questions = openQuestionsFromTopics(topics, closed.open_questions);
  const guardrailAskedLive = closed.exchanges.some(x => x.phase === "live" && x.kind === "guardrail" && x.answer_lines.length > 0);
  const agenda: DebriefItem[] = agendaFromGaps(
    synthesis.getGaps({ ...closed, topics, open_questions }),
    closed.interview_config.debrief_max_gaps,
    !guardrailAskedLive
  );
  // Listen-only ends with the live part: the debrief is the expert's agreed time for questions.
  const next = withPhase({ ...closed, topics, open_questions, debrief_agenda: agenda, interaction_mode: "questions" }, "debrief", trigger, at);
  return { ...next, last_tool_result: `ok phase=debrief. ${formatDebriefUpdate(agenda)}` };
}

/**
 * `begin_question` outside the live phase. Returns null for the live phase (handled by
 * session.ts). Debrief questions need an open agenda gap; their event comes from the gap.
 */
export function beginPhaseQuestion(state: SessionState, params: BeginQuestionParams, at: Stamp): SessionState | null {
  if (params.phase !== null && params.phase !== state.phase && !(params.phase === "orient" && state.phase === "live")) {
    return fail(state, `the current phase is ${state.phase}, not ${params.phase}`);
  }
  switch (state.phase) {
    case "live":
      if (params.gap_id !== null) return fail(state, "gap_id is only used in the debrief");
      // orientation questions are asked while the session is live (before any pointing)
      if (params.kind === "teach_back" || params.kind === "correction") return fail(state, `kind ${params.kind} is not a live question`);
      return null;
    case "debrief":
      return beginDebriefQuestion(state, params, at);
    case "teach_back":
      return beginCorrectionQuestion(state, params, at);
    default:
      return fail(state, `the session is ${state.phase}; ask no more questions`);
  }
}

function beginDebriefQuestion(state: SessionState, params: BeginQuestionParams, at: Stamp): SessionState {
  const open = openGapIds(state.debrief_agenda);
  if (params.gap_id === null) {
    return fail(state, `in the debrief every question needs a gap_id; open gaps: ${open.join(", ") || "none, call propose_draft"}`);
  }
  const item = state.debrief_agenda.find(i => i.gap_id === params.gap_id);
  if (!item) return fail(state, `gap_id ${params.gap_id} is not on the agenda; open gaps: ${open.join(", ") || "none"}`);
  if (item.state === "resolved" || item.state === "unknown") {
    return fail(state, `gap ${item.gap_id} is already answered; do not ask it again. Open gaps: ${open.join(", ") || "none, call propose_draft"}`);
  }
  if (item.state === "dropped") {
    return fail(state, `gap ${item.gap_id} was dropped (debrief limit or skipped by the expert); do not ask it. Open gaps: ${open.join(", ") || "none, call propose_draft"}`);
  }
  const topic = state.topics.find(t => t.topic_id === item.topic_id);
  const event = state.events.find(e => e.event_id === item.event_id);
  const exchange_id = nextExchangeId(state);
  const exchange = newExchange(state, exchange_id, at, {
    event_id: item.event_id,
    topic_id: item.topic_id,
    related_event_ids: topic ? [...topic.alias_event_ids] : [],
    phase: "debrief",
    kind: "gap",
    question_planned: params.question,
    gap_id: item.gap_id,
    record_state: event?.record_state ?? "on_record",
    source: event?.source ?? "live",
  });
  const closed = closeActive(state);
  return {
    ...closed,
    exchanges: [...closed.exchanges, exchange],
    debrief_agenda: closed.debrief_agenda.map(i =>
      i.gap_id === item.gap_id ? { ...i, state: i.state === "open" ? "asked" : i.state, exchange_ids: [...i.exchange_ids, exchange_id] } : i
    ),
    active_exchange_id: exchange_id,
    awaiting_question_exchange_id: exchange_id,
    last_tool_result: `ok exchange_id=${exchange_id}. ${SAY_IT}`,
    timing: [...closed.timing, mark(state, "question_tool_called", item.event_id, exchange_id, at)],
  };
}

function beginCorrectionQuestion(state: SessionState, params: BeginQuestionParams, at: Stamp): SessionState {
  const rev = latestRevision(state);
  if (!rev) return fail(state, "no revision to review yet");
  // The client already opened an exchange for the teach-back; reuse it until it is spoken.
  const awaiting = state.exchanges.find(x => x.exchange_id === state.awaiting_question_exchange_id);
  if (awaiting && awaiting.kind === "teach_back" && awaiting.revision_id === rev.revision_id && awaiting.answer_lines.length === 0) {
    return {
      ...state,
      exchanges: updateExchange(state.exchanges, awaiting.exchange_id, x => ({ ...x, question_planned: params.question })),
      last_tool_result: `ok exchange_id=${awaiting.exchange_id}`,
    };
  }
  const event = params.event_id ? state.events.find(e => e.event_id === params.event_id) : undefined;
  if (params.event_id && !event) return fail(state, `unknown event_id ${params.event_id}`);
  const exchange_id = nextExchangeId(state);
  const exchange = newExchange(state, exchange_id, at, {
    event_id: event?.event_id ?? null,
    topic_id: null,
    related_event_ids: [],
    phase: "teach_back",
    kind: "correction",
    question_planned: params.question,
    revision_id: rev.revision_id,
    record_state: event?.record_state ?? "on_record",
    source: event?.source ?? "live",
  });
  const closed = closeActive(state);
  return {
    ...closed,
    exchanges: [...closed.exchanges, exchange],
    active_exchange_id: exchange_id,
    awaiting_question_exchange_id: exchange_id,
    last_tool_result: `ok exchange_id=${exchange_id}. ${SAY_IT}`,
    timing: [...closed.timing, mark(state, "question_tool_called", exchange.event_id, exchange_id, at)],
  };
}

function newExchange(
  state: SessionState,
  exchange_id: string,
  at: Stamp,
  fields: Pick<ExpertExchange, "event_id" | "topic_id" | "related_event_ids" | "phase" | "kind" | "question_planned" | "record_state" | "source"> &
    Partial<Pick<ExpertExchange, "gap_id" | "revision_id">>
): ExpertExchange {
  return {
    exchange_id,
    session_id: state.session_id,
    question: "",
    answer_lines: [],
    gap_id: null,
    revision_id: null,
    asked_at_utc: at.at_utc,
    answer_started_at_utc: null,
    answer_ended_at_utc: null,
    audio_offset_secs: null,
    outcome: null,
    ...fields,
  };
}

const AGENDA_STATE: Record<"partial" | "covered" | "unknown_escalate", DebriefItemState> = {
  partial: "partial",
  covered: "resolved",
  unknown_escalate: "unknown",
};
const STATE_RANK: Record<DebriefItemState, number> = { open: 0, asked: 1, partial: 2, resolved: 3, unknown: 3, dropped: 3 };

/** `record_coverage`: called after the expert answered; upgrades coverage and the agenda item. */
export function recordCoverage(state: SessionState, params: unknown): SessionState {
  const parsed = validateRecordCoverageParams(params);
  if (!parsed.ok) return fail(state, parsed.errors.join("; "));
  const { exchange_id, dimensions } = parsed.value;
  const x = state.exchanges.find(e => e.exchange_id === exchange_id);
  if (!x) return fail(state, `unknown exchange_id ${exchange_id}`);
  if (x.answer_lines.length === 0) return fail(state, `${exchange_id} has no answer from the expert yet; call record_coverage after they answer`);
  if (x.kind === "clarify_reference") return fail(state, `${exchange_id} only identified a region; it covers nothing`);

  let coverage = state.coverage;
  for (const d of dimensions) {
    const status = d.status === "partial" ? "partial" : "covered";
    const resolution = d.status === "unknown_escalate" ? "unknown_escalate" : d.status === "covered" ? "answered" : null;
    coverage = applyCoverage(coverage, { event_id: x.event_id, dimension: d.dimension, status, exchange_id, note: d.note, resolution });
    // "I don't know, I'd escalate" is itself a guardrail for that region
    if (d.status === "unknown_escalate" && d.dimension !== "guardrails") {
      coverage = applyCoverage(coverage, { event_id: x.event_id, dimension: "guardrails", status: "covered", exchange_id, note: d.note, resolution });
    }
  }

  let debrief_agenda = state.debrief_agenda;
  let open_questions = state.open_questions;
  const item = x.gap_id ? state.debrief_agenda.find(i => i.gap_id === x.gap_id) : undefined;
  if (item) {
    const relevant = item.open_question_id ? dimensions : dimensions.filter(d => d.dimension === item.dimension);
    const best = relevant
      .map(d => AGENDA_STATE[d.status])
      .sort((a, b) => STATE_RANK[b] - STATE_RANK[a])[0];
    if (best && STATE_RANK[best] > STATE_RANK[item.state]) {
      debrief_agenda = debrief_agenda.map(i => (i.gap_id === item.gap_id ? { ...i, state: best } : i));
    }
    if (item.open_question_id && best && best !== "partial") {
      open_questions = answerOpenQuestion(open_questions, item.open_question_id, exchange_id);
    }
  }

  const summary = dimensions.map(d => `${d.dimension}=${d.status}`).join(", ");
  const tail =
    state.phase === "debrief"
      ? ` Open gaps: ${openGapIds(debrief_agenda).join(", ") || "none; call propose_draft"}`
      : state.phase === "live"
        ? ` ${AFTER_COVERAGE_LIVE}`
        : "";
  return { ...state, coverage, debrief_agenda, open_questions, last_tool_result: `ok coverage ${x.event_id ?? "session"}: ${summary}.${tail}` };
}

const answerOpenQuestion = (qs: OpenQuestion[], id: string, exchange_id: string) =>
  qs.map(q => (q.open_question_id === id && q.answered_by_exchange_id === null ? { ...q, answered_by_exchange_id: exchange_id } : q));

/**
 * `propose_draft` (params) or the console (params null → synthesis writes the text).
 * debrief → rev-1 and teach_back; in teach_back after a correction → rev-(n+1).
 */
export function proposeDraft(
  state: SessionState,
  params: unknown | null,
  trigger: PhaseTrigger,
  at: Stamp,
  synthesis: Synthesis = defaultSynthesis
): SessionState {
  let proposal = null;
  if (params !== null) {
    const parsed = validateProposeDraftParams(params);
    if (!parsed.ok) return fail(state, parsed.errors.join("; "));
    proposal = parsed.value;
  }

  const parent = latestRevision(state) ?? null;
  let change_exchange_ids: string[] = [];
  let change_reason: string | null = null;

  if (state.phase === "debrief") {
    // a gap the expert skipped counts as handled: their "skip" is an answer about priorities
    const asked = state.exchanges.filter(x => x.phase === "debrief" && (x.answer_lines.length > 0 || x.outcome === "declined")).length;
    const askable = state.debrief_agenda.filter(i => i.state !== "dropped" || i.exchange_ids.length > 0).length;
    const needed = Math.min(MIN_DEBRIEF_QUESTIONS, askable);
    if (trigger === "agent_tool" && asked < needed) {
      return fail(state, `ask at least ${needed} debrief questions first (${asked} answered); open gaps: ${openGapIds(state.debrief_agenda).join(", ")}`);
    }
  } else if (state.phase === "teach_back" && parent && isSuperseded(state, parent.revision_id)) {
    const strike = [...state.strikes].reverse().find(st => st.superseded_revision_ids.includes(parent.revision_id))!;
    change_reason = `Strike ${strike.strike_id}: the expert asked to remove the words in ${strike.exchange_id}. ${proposal?.change_reason ?? ""}`.trim();
  } else if (state.phase === "teach_back" && parent) {
    const last = [...activeConfirmations(state)].reverse().find(c => c.revision_id === parent.revision_id);
    if (!last || last.status !== "corrected") {
      return fail(state, `the expert has not corrected ${parent.revision_id}; only a correction creates a new revision`);
    }
    // the correction itself, plus any later answers given while clarifying it
    const correctionAt = state.exchanges.findIndex(x => x.exchange_id === last.expert_response_exchange_id);
    change_exchange_ids = state.exchanges
      .filter((x, i) => i >= correctionAt && x.phase === "teach_back" && x.revision_id === parent.revision_id && x.answer_lines.length > 0)
      .map(x => x.exchange_id);
    change_reason = `Correction by the expert in ${change_exchange_ids.join(", ")} (${last.confirmation_id}): ${proposal?.change_reason ?? "see the expert's words"}`;
  } else {
    return fail(state, `propose_draft is not possible in phase ${state.phase}`);
  }

  const built = synthesis.buildDraft(state, state.phase === "teach_back" ? parent : null, {
    proposal,
    at_utc: at.at_utc,
    change_reason,
    change_exchange_ids,
  });
  if (!built.ok) return fail(state, `draft rejected: ${built.errors.join("; ")}`);
  const revision = built.revision;

  const open_questions = [...state.open_questions];
  for (const s of built.unsupported) {
    open_questions.push({
      open_question_id: `oq-${pad(open_questions.length + 1)}`,
      missing_fact: `Draft step ${s.step_id} (${revision.revision_id}) has no screen moment and expert words behind it: ${s.text}`,
      why_it_matters: "A step without a screen moment and the expert's own words cannot be taught as fact.",
      related_event_ids: [...s.supporting_event_ids],
      related_exchange_ids: [...s.supporting_exchange_ids],
      answered_by_exchange_id: null,
    });
  }

  const withRevision = { ...state, revisions: addRevision(state.revisions, revision), open_questions };
  const next = withPhase(openTeachBackExchange(withRevision, revision.revision_id, at), "teach_back", trigger, at);
  return { ...next, last_tool_result: `ok revision_id=${revision.revision_id}. ${formatTeachBackUpdate(revision, stepsToTeach(revision, teachParentOf(next, revision)))}` };
}

/** Exchange holding the expert's explicit words about the current teach-back, if any. */
function responseExchange(state: SessionState, revisionId: string): ExpertExchange | undefined {
  const used = new Set(state.confirmations.map(c => c.expert_response_exchange_id));
  return [...state.exchanges]
    .reverse()
    .find(
      x => x.phase === "teach_back" && x.revision_id === revisionId && x.question !== "" && x.answer_lines.length > 0 && !used.has(x.exchange_id)
    );
}

/** `confirm_revision`: only for the latest revision and only after an explicit expert response. */
export function confirmRevision(state: SessionState, params: unknown, at: Stamp): SessionState {
  if (state.phase !== "teach_back") return fail(state, `confirm_revision is only possible during the teach-back (phase is ${state.phase})`);
  const parsed = validateConfirmRevisionParams(params);
  if (!parsed.ok) return fail(state, parsed.errors.join("; "));
  const { revision_id, status, step_ids_reviewed } = parsed.value;
  const rev = latestRevision(state)!;
  if (revision_id !== rev.revision_id) {
    return fail(state, `stale revision_id ${revision_id}: the current revision is ${rev.revision_id}; teach it back and confirm that one`);
  }
  if (isSuperseded(state, rev.revision_id)) {
    return fail(state, `${rev.revision_id} relied on words the expert struck; call propose_draft without them and teach the new revision back first`);
  }
  const response = responseExchange(state, rev.revision_id);
  if (!response) {
    return fail(state, `no explicit expert response to the teach-back of ${rev.revision_id} yet; silence is not confirmation, nothing was recorded`);
  }
  const ids = step_ids_reviewed ?? stepsToTeach(rev, teachParentOf(state, rev)).map(s => s.step_id);
  const unknown = ids.filter(id => !rev.steps.some(s => s.step_id === id));
  if (unknown.length) return fail(state, `step ids not in ${rev.revision_id}: ${unknown.join(", ")}`);

  const confirmation: ExpertConfirmation = {
    confirmation_id: `conf-${pad(state.confirmations.length + 1)}`,
    revision_id: rev.revision_id,
    status,
    step_ids_reviewed: ids,
    expert_response_exchange_id: response.exchange_id,
    at_utc: at.at_utc,
  };
  let next: SessionState = { ...state, confirmations: [...state.confirmations, confirmation] };
  const head = `ok confirmation_id=${confirmation.confirmation_id} status=${status} revision=${rev.revision_id}.`;
  // D7: one correction pass. After it, a further correction or "can't say" ends the teach-back;
  // the latest revision stays an unconfirmed draft and the session is incomplete.
  const correctionPasses = state.confirmations.filter(
    c => c.status === "corrected" && state.revisions.some(r => r.parent_revision_id === c.revision_id)
  ).length;
  if (status !== "confirmed" && correctionPasses >= state.interview_config.teach_back_max_corrections) {
    next = withPhase(closeActive(next), "incomplete", "confirmation", at);
    return {
      ...next,
      last_tool_result:
        `${head} The correction pass is used up, so the teach-back ends here: do not propose another draft and ask nothing more. ` +
        "Thank the expert in one short sentence and say the draft is saved for their review, with the open points marked as not confirmed.",
    };
  }
  if (status === "confirmed") {
    next = withPhase(closeActive(next), "confirmed", "confirmation", at);
    return { ...next, last_tool_result: `${head} Thank the expert in one short sentence; the session is complete.` };
  }
  if (status === "corrected") {
    return {
      ...next,
      last_tool_result:
        `${head} If it is not yet clear what should change, ask one short question (begin_question kind correction). ` +
        "Then call propose_draft with the full corrected step list, changing only what the expert corrected, and re-teach only the changed steps.",
    };
  }
  return { ...next, last_tool_result: `${head} Recorded as unresolved. Ask what is missing, or let the expert end the session.` };
}

/** A session that ends without confirmation of its latest revision is incomplete. */
export function endPhase(state: SessionState, at: Stamp): SessionState {
  return state.phase === "confirmed" ? state : withPhase(state, "incomplete", "session_end", at);
}

/** The phase block the console sends as a contextual update (`ws3-phase`) for the current phase. */
export function phaseBlock(state: SessionState): string | null {
  if (state.phase === "debrief") return formatDebriefUpdate(state.debrief_agenda);
  const rev = latestRevision(state);
  if (state.phase === "teach_back" && rev) {
    if (isSuperseded(state, rev.revision_id)) return formatStruckRevisionUpdate(rev.revision_id);
    return formatTeachBackUpdate(rev, stepsToTeach(rev, teachParentOf(state, rev)));
  }
  return null;
}

