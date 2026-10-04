// App-side question limits for the live and orientation parts (notes/voice-agent-strategy-handoff.md
// §6, §10; user decisions D1–D5 in notes/ws3-sprints/sprint-5-strategy-alignment.md). The prompt asks
// the agent to be brief; this is what actually holds when it is not. Pure, no I/O.

import type { BeginQuestionParams, ExpertExchange, InterviewConfig, SessionSnapshot, Topic } from "./contracts";

export type DeclineReason =
  | "listen_only"
  | "session_budget"
  | "topic_followup_used"
  | "topic_closed"
  | "repeat"
  | "phase_budget";

export type QuestionCheck = { ok: true } | { ok: false; reason: DeclineReason; detail: string };

type PolicyView = Pick<SessionSnapshot, "exchanges" | "interaction_mode" | "events"> & { interview_config: InterviewConfig };

const ok: QuestionCheck = { ok: true };
const no = (reason: DeclineReason, detail: string): QuestionCheck => ({ ok: false, reason, detail });

/** Live questions so far (screen-grounded part; clarify_reference included, orientation excluded). */
export const liveQuestionCount = (exchanges: ExpertExchange[]) => exchanges.filter(x => x.phase === "live").length;

export const orientQuestionCount = (exchanges: ExpertExchange[]) => exchanges.filter(x => x.phase === "orient").length;

/** Session-level budget for the live part: a fixed cap, never a rolling window. */
export function budgetState(exchanges: ExpertExchange[], config: InterviewConfig) {
  const used = liveQuestionCount(exchanges);
  return { used, max: config.budget_max_questions, exhausted: used >= config.budget_max_questions };
}

/** Questions on a topic that use its allowance (clarify_reference only fixes the reference). */
const topicQuestions = (exchanges: ExpertExchange[], topicId: string) =>
  exchanges.filter(x => x.topic_id === topicId && x.phase === "live" && x.kind !== "clarify_reference");

/** Orientation is possible only before the expert has pointed at anything. */
export const orientOpen = (s: Pick<SessionSnapshot, "events" | "exchanges">) =>
  s.events.length === 0 && !s.exchanges.some(x => x.phase === "live");

/**
 * Whether a live or orientation `begin_question` may go ahead. Checked in a fixed order so the
 * reason the agent gets back is the most fundamental one. `topic` is the topic the question is
 * about (already resolved from aliases), undefined for a question about no event.
 */
export function checkQuestionAllowed(s: PolicyView, params: BeginQuestionParams, topic: Topic | undefined): QuestionCheck {
  const cfg = s.interview_config;
  if (s.interaction_mode === "listen_only") {
    return no("listen_only", "the expert asked you to just listen; ask nothing until they invite questions again");
  }

  if (params.phase === "orient") {
    if (!orientOpen(s)) return no("phase_budget", "orientation is over (the expert has started pointing)");
    if (orientQuestionCount(s.exchanges) >= cfg.orient_max_questions) {
      return no("phase_budget", `orientation is limited to ${cfg.orient_max_questions} questions`);
    }
    return ok;
  }

  if (budgetState(s.exchanges, cfg).exhausted) {
    return no("session_budget", `the live question budget (${cfg.budget_max_questions}) is used up; remaining topics go to the debrief`);
  }
  if (!topic) return ok;

  if (topic.state === "closed") return no("topic_closed", "the expert moved on from this region");

  const same = s.exchanges.find(
    x => x.topic_id === topic.topic_id && x.kind === params.kind && (x.answer_lines.length > 0 || x.outcome === "declined")
  );
  if (same) {
    return no("repeat", `a ${params.kind} question about this region was already ${same.outcome === "declined" ? "declined" : "answered"}`);
  }

  if (params.kind !== "clarify_reference" && topicQuestions(s.exchanges, topic.topic_id).length >= 1 + cfg.topic_max_followups) {
    return no("topic_followup_used", "this region already had its question and one follow-up");
  }
  return ok;
}

/** The tool result for a refused question (the probes' mock uses the same prefix). */
export const declinedResult = (c: Extract<QuestionCheck, { ok: false }>) =>
  `declined ${c.reason}: ${c.detail}. Do not ask it and do not rephrase it; call skip_turn and say nothing.`;

const CHANNEL_WORDS = /\b(sys\s*\d+|both|the upper|the lower|the top|the bottom)\b/i;

/**
 * An ambiguous topic no longer needs a "which region do you mean?" question once the expert's
 * own words since the gesture name a channel (D4). Deterministic; the agent's judgement is the prompt.
 */
export function referenceResolvedByWords(topic: Topic, userLines: { text: string; at_utc: string }[]): boolean {
  const since = Date.parse(topic.queued_at_utc);
  const channel = topic.channel_id ? new RegExp(`\\b${topic.channel_id.replace(/[^a-z0-9]/gi, "")}\\b`, "i") : null;
  return userLines.some(l => Date.parse(l.at_utc) >= since && (CHANNEL_WORDS.test(l.text) || (channel?.test(l.text) ?? false)));
}
