"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientToolHandler } from "@/components/voice/VoiceSession";
import {
  type ElevenLabsDeletionReport,
  type EndCause,
  type InterviewConfig,
  type PointingEvent,
  type RecordState,
  validatePointingEvent,
} from "@/lib/expert/contracts";
import type { ChecklistRow } from "@/lib/expert/demo-evidence";
import { currentRecordState } from "@/lib/expert/record-state";
import { RESUME_CONTEXT_ID, resumeSummary } from "@/lib/expert/resume";
import {
  PHASE_CONTEXT_ID,
  RECORD_CONTEXT_ID,
  budgetStateLine,
  controlNote,
  controlRecordState,
  recordStateLine,
  controlDebriefStart,
  controlNudge,
  controlTeachBack,
  isControlText,
} from "@/lib/expert/context-update";
import { latestRevision, phaseBlock } from "@/lib/expert/debrief";
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
  /** Keeps the agent's turn timeout from firing while the expert is off the record. */
  sendUserActivity?: () => void;
};

export type RequestStatus<T> = { status: "idle" } | { status: "running" } | { status: "done"; value: T } | { status: "error"; message: string };
export type EvidenceExport = { markdown: string; checklist: ChecklistRow[]; file: string };

const SAVE_DEBOUNCE_MS = 1000;
/** sendUserActivity cadence while off the record (capabilities doc (f): every ≤ 5 s). */
const OFF_RECORD_ACTIVITY_MS = 4000;
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
  /** Last phase block sent as a `ws3-phase` contextual update. */
  const phaseSent = useRef<string | null>(null);
  const scenarioTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);
  /** How the current conversation ends: set by Stop / an error before the disconnect arrives. */
  const endCause = useRef<EndCause>("disconnect");
  /** Last record state sent as a `ws3-record` contextual update. */
  const recordSent = useRef<RecordState>("on_record");
  const lastActivity = useRef(0);
  /** The next connect continues the ended session instead of starting a new one. */
  const resumeNext = useRef(false);
  const resumePending = useRef(false);
  const autoDeleteRef = useRef(true);
  const [autoDelete, setAutoDeleteState] = useState(true);
  const [evidence, setEvidence] = useState<RequestStatus<EvidenceExport>>({ status: "idle" });
  const [deletion, setDeletion] = useState<RequestStatus<ElevenLabsDeletionReport>>({ status: "idle" });
  const [resumeArmed, setResumeArmed] = useState(false);

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

  /** Resolves once no save is running or pending (the final snapshot is on disk). */
  const flushFully = useCallback(async () => {
    await flush();
    for (let i = 0; i < 100 && (saving.current || dirty.current); i++) await new Promise(r => setTimeout(r, 100));
  }, [flush]);

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
    phaseSent.current = null;
    recordSent.current = "on_record";
    setState(next);
    setSave({ status: "idle" });
    setEvidence({ status: "idle" });
    setDeletion({ status: "idle" });
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

  /** Deletes the ended session's ElevenLabs conversation(s) via the server route (session-scoped). */
  const deleteConversations = useCallback(async () => {
    const current = stateRef.current;
    if (!current) return;
    setDeletion({ status: "running" });
    try {
      const res = await fetch(`/api/expert-sessions/${current.session_id}/elevenlabs-deletion`, { method: "POST" });
      const data: ElevenLabsDeletionReport & { error?: string } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }) as never);
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      dispatch({ type: "deletion_recorded", report: data });
      setDeletion({ status: "done", value: data });
    } catch (error) {
      setDeletion({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [dispatch]);

  const exportEvidence = useCallback(async () => {
    const current = stateRef.current;
    if (!current) return;
    setEvidence({ status: "running" });
    try {
      await flushFully();
      const res = await fetch(`/api/expert-sessions/${current.session_id}/demo-evidence`, { method: "POST" });
      const data: EvidenceExport & { error?: string } = await res.json().catch(() => ({ error: `HTTP ${res.status}` }) as never);
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setEvidence({ status: "done", value: data });
    } catch (error) {
      setEvidence({ status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }, [flushFully]);

  const onConnected = useCallback(
    (conversationId: string) => {
      endCause.current = "disconnect";
      const current = stateRef.current;
      if (resumeNext.current && current?.ended_at_utc && current.phase === "incomplete") {
        resumeNext.current = false;
        setResumeArmed(false);
        dispatch({ type: "resumed", ...stamp() });
        resumePending.current = true;
        phaseSent.current = null;
        recordSent.current = "on_record";
      } else if (!current || current.ended_at_utc) {
        startNewSession();
      }
      dispatch({ type: "connected", conversation_id: conversationId });
    },
    [dispatch, startNewSession]
  );

  const onDisconnected = useCallback(() => {
    cancelScenario();
    const current = stateRef.current;
    if (!current || current.ended_at_utc) return;
    dispatch({ type: "session_ended", cause: endCause.current, ...stamp() });
    // after the final save: delete the conversation if anything was said off the record (option)
    const offRecord = stateRef.current?.recording_segments.some(s => s.state === "off_record");
    if (autoDeleteRef.current && offRecord) void flushFully().then(() => deleteConversations());
  }, [cancelScenario, deleteConversations, dispatch, flushFully]);

  const onStop = useCallback(() => {
    endCause.current = "stop";
  }, []);
  const onSessionError = useCallback(() => {
    endCause.current = "error";
  }, []);

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
      record_coverage: params => {
        dispatch({ type: "coverage_recorded", params, ...stamp() });
        return stateRef.current?.last_tool_result ?? "error no active session";
      },
      signal_task_complete: () => {
        dispatch({ type: "task_completed", trigger: "agent_tool", ...stamp() });
        return stateRef.current?.last_tool_result ?? "error no active session";
      },
      propose_draft: params => {
        dispatch({ type: "draft_proposed", params, trigger: "agent_tool", ...stamp() });
        return stateRef.current?.last_tool_result ?? "error no active session";
      },
      confirm_revision: params => {
        dispatch({ type: "revision_confirmed", params, ...stamp() });
        return stateRef.current?.last_tool_result ?? "error no active session";
      },
      set_record_state: params => {
        dispatch({ type: "record_state_tool", params, ...stamp() });
        return stateRef.current?.last_tool_result ?? "error no active session";
      },
      strike_last_answer: () => {
        dispatch({ type: "strike_requested", trigger: "agent_tool", ...stamp() });
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

  /** Sends the current phase block (`ws3-phase`) whenever it changed, whichever path changed it. */
  const syncPhase = useCallback((io: ConversationIo) => {
    const current = stateRef.current;
    if (!current) return;
    const text = phaseBlock(current);
    if (text && text !== phaseSent.current) {
      phaseSent.current = text;
      io.sendContextualUpdate(text, { contextId: PHASE_CONTEXT_ID });
    }
  }, []);

  /** Sends the record state (`ws3-record`) whenever it changed, whichever trigger changed it. */
  const syncRecord = useCallback((io: ConversationIo) => {
    const current = stateRef.current;
    if (!current) return;
    const recordState = currentRecordState(current);
    if (recordState !== recordSent.current) {
      recordSent.current = recordState;
      io.sendContextualUpdate(recordStateLine(recordState), { contextId: RECORD_CONTEXT_ID });
    }
  }, []);

  /** Console toggle: the acknowledged state is the stored segment; the agent is asked to acknowledge aloud. */
  const setRecordState = useCallback(
    (io: ConversationIo, to: RecordState) => {
      const before = stateRef.current && currentRecordState(stateRef.current);
      dispatch({ type: "record_state_changed", to, trigger: "console", ...stamp() });
      if (!stateRef.current || currentRecordState(stateRef.current) === before) return;
      syncRecord(io);
      if (!stateRef.current.ended_at_utc) io.sendUserMessage(controlRecordState(to));
    },
    [dispatch, syncRecord]
  );

  /** Console: strike the expert's last answer (same rules as the agent tool). */
  const strikeLast = useCallback(
    (io: ConversationIo) => {
      dispatch({ type: "strike_requested", trigger: "console", ...stamp() });
      const result = stateRef.current?.last_tool_result ?? "";
      if (result.startsWith("ok") && stateRef.current && !stateRef.current.ended_at_utc) {
        syncPhase(io);
        io.sendUserMessage(controlNote(`The expert struck their last answer from the console. ${result.replace(/^ok /, "")}`));
      }
      return result;
    },
    [dispatch, syncPhase]
  );

  /** Arms a best-effort resume: the next Start continues this session (same id, same phase). */
  const armResume = useCallback(() => {
    resumeNext.current = true;
    setResumeArmed(true);
  }, []);

  const setAutoDelete = useCallback((on: boolean) => {
    autoDeleteRef.current = on;
    setAutoDeleteState(on);
  }, []);

  /** Console: the expert is done (dev path; normally the agent calls signal_task_complete). */
  const endTask = useCallback(
    (io: ConversationIo) => {
      dispatch({ type: "task_completed", trigger: "console", ...stamp() });
      if (stateRef.current?.phase !== "debrief") return;
      syncPhase(io);
      io.sendUserMessage(controlDebriefStart());
    },
    [dispatch, syncPhase]
  );

  /** Console: build a draft without the agent (deterministic fallback text) and start the teach-back. */
  const startTeachBack = useCallback(
    (io: ConversationIo) => {
      dispatch({ type: "draft_proposed", params: null, trigger: "console", ...stamp() });
      const rev = stateRef.current && latestRevision(stateRef.current);
      if (!rev || stateRef.current?.phase !== "teach_back") return;
      syncPhase(io);
      io.sendUserMessage(controlTeachBack(rev.revision_id));
    },
    [dispatch, syncPhase]
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

      if (resumePending.current) {
        resumePending.current = false;
        io.sendContextualUpdate(resumeSummary(stateRef.current!), { contextId: RESUME_CONTEXT_ID });
      }
      syncRecord(io);
      syncPhase(io);
      const s = stateRef.current!;
      const speech = speechRef.current;
      if (currentRecordState(s) === "off_record") {
        if (io.sendUserActivity && now - lastActivity.current >= OFF_RECORD_ACTIVITY_MS) {
          lastActivity.current = now;
          io.sendUserActivity();
        }
        setGate({ decision: "wait", reasons: ["off record"], expert_speaking: speech.speaking, quiet_ms: -1, budget: { used: 0, max: cfg.budget_max_questions } });
        return;
      }
      if (s.phase !== "live") {
        // After the live part nothing is released any more; debrief questions come from the agenda.
        setGate({ decision: "wait", reasons: [`phase ${s.phase}`], expert_speaking: speech.speaking, quiet_ms: -1, budget: { used: 0, max: cfg.budget_max_questions } });
        return;
      }
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
    [dispatch, observe, syncPhase, syncRecord]
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
    endTask,
    startTeachBack,
    setRecordState,
    strikeLast,
    armResume,
    resumeArmed,
    autoDelete,
    setAutoDelete,
    deleteConversations,
    deletion,
    exportEvidence,
    evidence,
    voiceProps: {
      clientTools,
      onFinalLine,
      onConnected,
      onDisconnected,
      onAgentModeChange,
      onVadScore,
      onUserTentative,
      onStop,
      onSessionError,
    },
  };
}

export type ExpertSession = ReturnType<typeof useExpertSession>;
