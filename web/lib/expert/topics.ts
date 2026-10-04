// Pure topic queue for the live interview: which pointing events are the same thing,
// which topic may be released to the agent, and when. No React, no I/O.
// Rules: specs/20261004-015810-ws3-sprint-2-live-interview/data-model.md

import type {
  DeferredReason,
  ExpertExchange,
  InteractionMode,
  InterviewConfig,
  PointingEvent,
  Region,
  TimingMark,
  Topic,
} from "./contracts";
import { formatPointingEventUpdate } from "./context-update";
import { budgetState } from "./question-policy";

type Stamp = { at_utc: string; perf_ms: number };

// Normalized coordinates make exact thresholds (IoU = 0.5) land a few ulps off.
const IOU_EPSILON = 1e-9;

/** Intersection over union of two normalized boxes in the same frame. */
export function regionIoU(a: Region, b: Region): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const inter = w > 0 && h > 0 ? w * h : 0;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * The topic a new event repeats, if any: same known trace (an unknown trace never matches),
 * same channel (null = null), same record state and region IoU ≥ threshold with the topic's
 * primary region. No time window (D3): pointing again later never opens a fresh topic, so it
 * never resets the topic's question allowance.
 */
export function findDuplicateTopic(
  topics: Topic[],
  events: PointingEvent[],
  event: PointingEvent,
  _now: number,
  config: InterviewConfig
): Topic | undefined {
  const primaryOf = (id: string) => events.find(e => e.event_id === id);
  return topics
    .filter(t => {
      const primary = primaryOf(t.primary_event_id);
      return (
        primary !== undefined &&
        primary.trace_id !== null &&
        primary.trace_id === event.trace_id &&
        t.channel_id === event.channel_id &&
        t.record_state === event.record_state &&
        regionIoU(primary.region, event.region) >= config.dedup_min_iou - IOU_EPSILON
      );
    })
    .sort((a, b) => b.last_event_at_perf_ms - a.last_event_at_perf_ms)[0];
}

/** Adds an event as a new topic or as an alias of the topic it repeats. `events` must include it. */
export function ingestEvent(
  topics: Topic[],
  events: PointingEvent[],
  event: PointingEvent,
  at: Stamp,
  config: InterviewConfig,
  session_id: string
): { topics: Topic[]; topic: Topic; merged: boolean } {
  const others = events.filter(e => e.event_id !== event.event_id);
  const duplicate = findDuplicateTopic(topics, others, event, at.perf_ms, config);
  if (duplicate) {
    // Returning to a region that was never discussed (the expert had moved on) makes it askable again.
    const requeue =
      duplicate.state === "deferred_to_debrief" &&
      (duplicate.deferred_reason === "moved_on" || duplicate.deferred_reason === "release_timeout") &&
      duplicate.exchange_ids.length === 0;
    const topic: Topic = {
      ...duplicate,
      alias_event_ids: [...duplicate.alias_event_ids, event.event_id],
      last_event_at_perf_ms: at.perf_ms,
      ...(requeue ? { state: "queued" as const, deferred_reason: null, released_at_utc: null, released_at_perf_ms: null, nudged_at_perf_ms: null, queued_at_utc: at.at_utc, queued_at_perf_ms: at.perf_ms } : {}),
    };
    return { topics: topics.map(t => (t.topic_id === topic.topic_id ? topic : t)), topic, merged: true };
  }
  const topic: Topic = {
    topic_id: `top-${String(topics.length + 1).padStart(3, "0")}`,
    session_id,
    primary_event_id: event.event_id,
    alias_event_ids: [],
    state: event.record_state === "off_record" ? "dropped_off_record" : "queued",
    requires_clarification: event.mapping_status !== "resolved",
    record_state: event.record_state,
    channel_id: event.channel_id,
    queued_at_utc: at.at_utc,
    queued_at_perf_ms: at.perf_ms,
    last_event_at_perf_ms: at.perf_ms,
    released_at_utc: null,
    released_at_perf_ms: null,
    asked_at_perf_ms: null,
    stale_at_release: null,
    release_text: null,
    nudged_at_perf_ms: null,
    exchange_ids: [],
    deferred_reason: null,
  };
  return { topics: [...topics, topic], topic, merged: false };
}

const live = (t: Topic) => t.state !== "dropped_off_record";

/** The expert has moved on: waited too long, or pointed at another region since. */
export function isStale(topic: Topic, topics: Topic[], now: number, config: InterviewConfig): boolean {
  if (now - topic.last_event_at_perf_ms > config.stale_after_ms) return true;
  return topics.some(o => o.topic_id !== topic.topic_id && live(o) && o.queued_at_perf_ms > topic.last_event_at_perf_ms);
}

/** The contextual update that releases a topic (primary event, never an alias). */
export function releaseText(topic: Topic, events: PointingEvent[], exchanges: ExpertExchange[], stale: boolean): string {
  const event = events.find(e => e.event_id === topic.primary_event_id);
  if (!event) throw new Error(`unknown primary event ${topic.primary_event_id}`);
  const guardrailPending = !exchanges.some(x => x.phase === "live" && x.kind === "guardrail");
  return formatPointingEventUpdate(event, { stale, guardrailPending });
}

const newerTopicSince = (topics: Topic[], self: Topic, since: number) =>
  topics.some(o => o.topic_id !== self.topic_id && live(o) && o.queued_at_perf_ms > since);

/**
 * The topic that still blocks the next release: released and not yet asked, or asked and
 * not yet answered — unless the expert has moved on to a newer topic since the last ask.
 */
export function openTopic(topics: Topic[]): Topic | undefined {
  return topics.find(t => {
    if (t.state === "released") return true;
    if (t.state !== "asked") return false;
    const since = t.asked_at_perf_ms ?? t.released_at_perf_ms ?? t.queued_at_perf_ms;
    return !newerTopicSince(topics, t, since);
  });
}

export { budgetState };

export type ReleaseSignals = {
  agent_speaking: boolean;
  user_speaking: boolean;
  /** Time since the expert's last speech signal (0 while speaking). */
  quiet_ms: number;
};

export type BlockReason = "agent_speaking" | "user_speaking" | "pause_not_reached" | "topic_open" | "nothing_queued";

export type ReleaseDecision =
  | { kind: "release"; topic_id: string; stale: boolean }
  | { kind: "nudge"; topic_id: string }
  | { kind: "defer"; topic_ids: string[]; reason: DeferredReason }
  | { kind: "wait"; reasons: BlockReason[] };

function pauseReasons(signals: ReleaseSignals, config: InterviewConfig): BlockReason[] {
  const reasons: BlockReason[] = [];
  if (signals.agent_speaking) reasons.push("agent_speaking");
  if (signals.user_speaking) reasons.push("user_speaking");
  if (signals.quiet_ms < config.pause_ms) reasons.push("pause_not_reached");
  return reasons;
}

/**
 * One step of the release controller; the caller applies the decision and calls again later.
 * Listen-only mode and a used-up budget defer topics to the debrief instead of releasing them,
 * so resuming questions never produces a burst of catch-up questions.
 */
export function planRelease(
  view: { topics: Topic[]; timing: TimingMark[]; exchanges: ExpertExchange[]; interaction_mode: InteractionMode },
  signals: ReleaseSignals,
  now: number,
  config: InterviewConfig
): ReleaseDecision {
  const { topics, timing } = view;
  const listenOnly = view.interaction_mode === "listen_only";
  const exhausted = budgetState(view.exchanges, config).exhausted;

  const released = topics.find(t => t.state === "released");
  if (released) {
    const at = released.released_at_perf_ms ?? released.queued_at_perf_ms;
    if (newerTopicSince(topics, released, at)) return { kind: "defer", topic_ids: [released.topic_id], reason: "moved_on" };
    if (listenOnly) return { kind: "defer", topic_ids: [released.topic_id], reason: "listen_only" };
    if (now - at >= config.release_timeout_ms) {
      return { kind: "defer", topic_ids: [released.topic_id], reason: "release_timeout" };
    }
    const agentActed = timing.some(
      m => (m.mark === "agent_speech_started" || m.mark === "question_tool_called") && m.at_perf_ms >= at
    );
    // D9: silence is never a reason to ask on its own. Nudge only when the expert pointed and has
    // said nothing since, so the gesture itself is the invitation; at most once, within budget.
    const expertSpokeSincePointing = timing.some(m => m.mark === "user_speech_started" && m.at_perf_ms >= released.last_event_at_perf_ms);
    if (
      !exhausted &&
      !expertSpokeSincePointing &&
      config.nudge_after_ms > 0 &&
      released.nudged_at_perf_ms === null &&
      now - at >= config.nudge_after_ms &&
      !agentActed &&
      pauseReasons(signals, config).length === 0
    ) {
      return { kind: "nudge", topic_id: released.topic_id };
    }
  }

  if (openTopic(topics)) return { kind: "wait", reasons: ["topic_open"] };

  const candidate = topics
    .filter(t => t.state === "queued")
    .sort((a, b) => a.queued_at_perf_ms - b.queued_at_perf_ms)[0];
  if (!candidate) return { kind: "wait", reasons: ["nothing_queued"] };

  if (listenOnly) return { kind: "defer", topic_ids: [candidate.topic_id], reason: "listen_only" };
  if (exhausted) return { kind: "defer", topic_ids: [candidate.topic_id], reason: "budget" };

  const reasons = pauseReasons(signals, config);
  if (reasons.length) return { kind: "wait", reasons };
  return { kind: "release", topic_id: candidate.topic_id, stale: isStale(candidate, topics, now, config) };
}
