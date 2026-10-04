"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientToolHandler } from "@/components/voice/VoiceSession";
import { type InterviewConfig, type PointingEvent, validatePointingEvent } from "@/lib/expert/contracts";
import { budgetStateLine, controlNudge, isControlText } from "@/lib/expert/context-update";
import { FIXTURE_EVENTS } from "@/lib/expert/fixtures";
import { DEFAULT_INTERVIEW_CONFIG, withConfig } from "@/lib/expert/interview-config";
import type { ScenarioStep } from "@/lib/expert/scenario";
import {
  type SessionAction,
  type SessionState,
  initialSession,
  injectFixture,
  newSessionId,
  reduceSession,
  toSnapshot,
} from "@/lib/expert/session";
import { type SpeechObservation, initialSpeech, observeSpeech, quietForMs, settleSpeech } from "@/lib/expert/speech";
import { type ReleaseDecision, budgetState, planRelease } from "@/lib/expert/topics";
import type { TranscriptLine } from "@/lib/voice/transcript";

export type SaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: string }
  | { status: "error"; message: string };

/** What the release controller saw on its last tick, for the console. */
export type GateStatus = {
  decision: ReleaseDecision["kind"];
  reasons: string[];
  expert_speaking: boolean;
  quiet_ms: number;
  budget: { used: number; max: number };
};

export type ScenarioStatus = { running: false } | { running: true; started_perf: number; delivered: string[]; total: number };

/** Conversation controls the controller needs; ExpertConsole passes them from inside the provider. */
export type ConversationIo = {
  sendContextualUpdate: (text: string, options?: { contextId?: string }) => void;
  sendUserMessage: (text: string) => void;
  getInputVolume: () => number;
};

const SAVE_DEBOUNCE_MS = 1000;
/** Fixed context id for "current state" updates; only the newest one is current. */
const STATE_CONTEXT_ID = "ws3-state";

const stamp = () => ({ at_utc: new Date().toISOString(), perf_ms: performance.now() });
/** Wall-clock time of an earlier performance.now() reading. */
const stampAt = (perf_ms: number) => ({
  at_utc: new Date(Date.now() - (performance.now() - perf_ms)).toISOString(),
  perf_ms,
});

/**
 * Expert-session state for the voice flow. The reducer lives in a ref so client
 * tools (captured once when the conversation starts) always see the latest state.
 * Pointing events are only queued on arrival; `tick` releases them at pauses.
 */
export function useExpertSession() {
  const [state, setState] = useState<SessionState | null>(null);
  const [save, setSave] = useState<SaveStatus>({ status: "idle" });
  const [gate, setGate] = useState<GateStatus | null>(null);
  const [scenario, setScenario] = useState<ScenarioStatus>({ running: false });
  const [config, setConfigState] = useState<InterviewConfig>(DEFAULT_INTERVIEW_CONFIG);
  const stateRef = useRef<SessionState | null>(null);
  const configRef = useRef<InterviewConfig>(DEFAULT_INTERVIEW_CONFIG);
  const speechRef = useRef(initialSpeech());
  const budgetUsedUp = useRef(false);
  const scenarioTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const current = stateRef.current;
    if (!current) return;
    if (saving.current) {
      dirty.current = true; // save again once the running request finishes
      return;
    }
    saving.current = true;
    dirty.current = false;
    setSave({ status: "saving" });
    try {
      const res = await fetch(`/api/expert-sessions/${current.session_id}/snapshot`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toSnapshot(current)),
      });
      const data: { saved_at?: string; error?: string; details?: string[] } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error([data.error ?? `HTTP ${res.status}`, ...(data.details ?? [])].join(" "));
      setSave({ status: "saved", at: data.saved_at ?? new Date().toISOString() });
    } catch (error) {
      setSave({ status: "error", message: error instanceof Error ? error.message : String(error) });
    } finally {
      saving.current = false;
      if (dirty.current) void flush();
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [flush]);

  const cancelScenario = useCallback(() => {
    for (const t of scenarioTimers.current) clearTimeout(t);
    scenarioTimers.current = [];
    setScenario({ running: false });
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      for (const t of scenarioTimers.current) clearTimeout(t);
    },
    []
  );

  const startNewSession = useCallback(() => {
    const now = new Date();
    const next = initialSession(newSessionId(now), now.toISOString(), configRef.current);
    stateRef.current = next;
    speechRef.current = initialSpeech();
    budgetUsedUp.current = false;
    setState(next);
    setSave({ status: "idle" });
    return next;
  }, []);

  const dispatch = useCallback(
    (action: SessionAction) => {
      // A line can race ahead of onConnected; never drop it, start the session instead.
      const current = stateRef.current ?? startNewSession();
      const next = reduceSession(current, action);
      if (next === current) return;
      stateRef.current = next;
      setState(next);
      if (action.type === "session_ended") void flush();
      else scheduleSave();
    },
    [flush, scheduleSave, startNewSession]
  );

  /** Feeds one speech signal to the detector; only start/end transitions reach the reducer. */
  const observe = useCallback(
    (obs: SpeechObservation, now = performance.now()) => {
      const agent_speaking = stateRef.current?.agent_speaking ?? false;
      const r = observeSpeech(speechRef.current, obs, now, { agent_speaking }, configRef.current);
      speechRef.current = r.state;
      if (r.transition && stateRef.current && !stateRef.current.ended_at_utc) {
        dispatch({ type: "user_speech_changed", speaking: r.transition.speaking, ...stampAt(r.transition.at_perf) });
      }
    },
    [dispatch]
  );

  const onConnected = useCallback(
    (conversationId: string) => {
      if (!stateRef.current || stateRef.current.ended_at_utc) startNewSession();
      dispatch({ type: "connected", conversation_id: conversationId });
    },
    [dispatch, startNewSession]
  );

  const onDisconnected = useCallback(() => {
    cancelScenario();
    if (stateRef.current && !stateRef.current.ended_at_utc) dispatch({ type: "session_ended", ...stamp() });
  }, [cancelScenario, dispatch]);

  const onFinalLine = useCallback(
    (line: TranscriptLine) => {
      // Our own "[CONTROL]" nudges can come back as user turns; they are never expert words.
      if (line.role === "user" && isControlText(line.text)) return;
      const at = { at_utc: new Date(line.at).toISOString(), perf_ms: performance.now() };
      if (line.role === "user") observe({ kind: "final" }, at.perf_ms);
      const type = line.role === "agent" ? "agent_final_line" : "user_final_line";
      dispatch({ type, line_id: line.id, text: line.text, ...at });
    },
    [dispatch, observe]
  );

  const onAgentModeChange = useCallback(
    (mode: "speaking" | "listening") => dispatch({ type: "agent_speaking_changed", speaking: mode === "speaking", ...stamp() }),
    [dispatch]
  );

  const onVadScore = useCallback((score: number) => observe({ kind: "vad", score }), [observe]);
  const onUserTentative = useCallback(() => observe({ kind: "tentative" }), [observe]);

  // Stable object: VoiceSession hands it to startSession once per conversation.
  const clientTools = useMemo<Record<string, ClientToolHandler>>(
    () => ({
      begin_question: params => {
        dispatch({ type: "question_begun", params, ...stamp() });
        return stateRef.current?.last_tool_result ?? "error no active session";
      },
    }),
    [dispatch]
  );

  /**
   * Adds a pointing event (here: a fixture) to the live session. It becomes a topic;
   * the agent hears about it only when `tick` releases it at a pause.
   */
  const deliverFixture = useCallback(
    (fixture: PointingEvent) => {
      const session = stateRef.current ?? startNewSession();
      const event = injectFixture(fixture, session.session_id);
      const valid = validatePointingEvent(event);
      if (!valid.ok) throw new Error(`Invalid pointing event: ${valid.errors.join("; ")}`);
      dispatch({ type: "event_received", event, ...stamp() });
    },
    [dispatch, startNewSession]
  );

  /** One step of the release controller (ExpertConsole calls this every 200 ms while connected). */
  const tick = useCallback(
    (io: ConversationIo) => {
      const current = stateRef.current;
      if (!current || current.ended_at_utc) return;
      const cfg = current.interview_config;
      const now = performance.now();
      try {
        observe({ kind: "mic", level: io.getInputVolume() }, now);
      } catch {
        // audio graph not ready yet
      }
      const settled = settleSpeech(speechRef.current, now, cfg);
      speechRef.current = settled.state;
      if (settled.transition) {
        dispatch({ type: "user_speech_changed", speaking: false, ...stampAt(settled.transition.at_perf) });
      }

      const s = stateRef.current!;
      const speech = speechRef.current;
      const signals = { agent_speaking: s.agent_speaking, user_speaking: speech.speaking, quiet_ms: quietForMs(speech, now) };
      const decision = planRelease(s, signals, now, cfg);
      const topicOf = (id: string) => stateRef.current!.topics.find(t => t.topic_id === id)!;

      if (decision.kind === "release") {
        dispatch({ type: "topic_released", topic_id: decision.topic_id, stale: decision.stale, ...stamp() });
        const topic = topicOf(decision.topic_id);
        if (topic.release_text) io.sendContextualUpdate(topic.release_text, { contextId: topic.primary_event_id });
      } else if (decision.kind === "nudge") {
        dispatch({ type: "topic_nudged", topic_id: decision.topic_id, ...stamp() });
        io.sendUserMessage(controlNudge(topicOf(decision.topic_id).primary_event_id));
      } else if (decision.kind === "defer") {
        dispatch({ type: "topics_deferred", topic_ids: decision.topic_ids, reason: decision.reason, ...stamp() });
      }

      const budget = budgetState(stateRef.current!.timing, now, cfg);
      if (budget.exhausted !== budgetUsedUp.current) {
        budgetUsedUp.current = budget.exhausted;
        io.sendContextualUpdate(budgetStateLine(budget.exhausted), { contextId: STATE_CONTEXT_ID });
      }

      setGate({
        decision: decision.kind,
        reasons: decision.kind === "wait" ? decision.reasons : decision.kind === "defer" ? [decision.reason] : [],
        expert_speaking: speech.speaking,
        quiet_ms: Number.isFinite(signals.quiet_ms) ? Math.round(signals.quiet_ms / 100) * 100 : -1,
        budget: { used: budget.used, max: budget.max },
      });
    },
    [dispatch, observe]
  );

  /** Tunables (pause_ms in the human gate); applied to the running session and the next one. */
  const setConfig = useCallback(
    (partial: Partial<InterviewConfig>) => {
      configRef.current = withConfig(partial, configRef.current);
      setConfigState(configRef.current);
      if (stateRef.current && !stateRef.current.ended_at_utc) dispatch({ type: "config_changed", config: partial });
    },
    [dispatch]
  );

  /** Injects the scenario's fixture events at their offsets; the human talks through the task meanwhile. */
  const runScenario = useCallback(
    (steps: readonly ScenarioStep[]) => {
      cancelScenario();
      const started_perf = performance.now();
      const delivered: string[] = [];
      setScenario({ running: true, started_perf, delivered: [], total: steps.length });
      scenarioTimers.current = steps.map(step =>
        setTimeout(() => {
          const fixture = FIXTURE_EVENTS.find(f => f.event_id === step.event_id);
          if (fixture && stateRef.current && !stateRef.current.ended_at_utc) deliverFixture(fixture);
          delivered.push(step.event_id);
          const done = delivered.length === steps.length;
          setScenario(done ? { running: false } : { running: true, started_perf, delivered: [...delivered], total: steps.length });
        }, step.offset_s * 1000)
      );
    },
    [cancelScenario, deliverFixture]
  );

  return {
    state,
    save,
    gate,
    config,
    scenario,
    retrySave: flush,
    deliverFixture,
    tick,
    setConfig,
    runScenario,
    cancelScenario,
    voiceProps: { clientTools, onFinalLine, onConnected, onDisconnected, onAgentModeChange, onVadScore, onUserTentative },
  };
}

export type ExpertSession = ReturnType<typeof useExpertSession>;
