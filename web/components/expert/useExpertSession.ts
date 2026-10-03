"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientToolHandler } from "@/components/voice/VoiceSession";
import { type PointingEvent, validatePointingEvent } from "@/lib/expert/contracts";
import { formatPointingEventUpdate } from "@/lib/expert/context-update";
import {
  type SessionAction,
  type SessionState,
  initialSession,
  injectFixture,
  newSessionId,
  reduceSession,
  toSnapshot,
} from "@/lib/expert/session";
import type { TranscriptLine } from "@/lib/voice/transcript";

export type SaveStatus =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved"; at: string }
  | { status: "error"; message: string };

type SendContextualUpdate = (text: string, options?: { contextId?: string }) => void;

const SAVE_DEBOUNCE_MS = 1000;

const stamp = () => ({ at_utc: new Date().toISOString(), perf_ms: performance.now() });

/**
 * Expert-session state for the voice flow. The reducer lives in a ref so client
 * tools (captured once when the conversation starts) always see the latest state.
 */
export function useExpertSession() {
  const [state, setState] = useState<SessionState | null>(null);
  const [save, setSave] = useState<SaveStatus>({ status: "idle" });
  const stateRef = useRef<SessionState | null>(null);
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

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const startNewSession = useCallback(() => {
    const now = new Date();
    const next = initialSession(newSessionId(now), now.toISOString());
    stateRef.current = next;
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

  const onConnected = useCallback(
    (conversationId: string) => {
      if (!stateRef.current || stateRef.current.ended_at_utc) startNewSession();
      dispatch({ type: "connected", conversation_id: conversationId });
    },
    [dispatch, startNewSession]
  );

  const onDisconnected = useCallback(() => {
    if (stateRef.current && !stateRef.current.ended_at_utc) dispatch({ type: "session_ended", ...stamp() });
  }, [dispatch]);

  const onFinalLine = useCallback(
    (line: TranscriptLine) => {
      const at = { at_utc: new Date(line.at).toISOString(), perf_ms: performance.now() };
      const type = line.role === "agent" ? "agent_final_line" : "user_final_line";
      dispatch({ type, line_id: line.id, text: line.text, ...at });
    },
    [dispatch]
  );

  const onAgentModeChange = useCallback(
    (mode: "speaking" | "listening") => dispatch({ type: "agent_speaking_changed", speaking: mode === "speaking", ...stamp() }),
    [dispatch]
  );

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

  /** Adds a fixture event to the live session and tells the agent about it without forcing a reply. */
  const deliverFixture = useCallback(
    (fixture: PointingEvent, sendContextualUpdate: SendContextualUpdate) => {
      const session = stateRef.current ?? startNewSession();
      const event = injectFixture(fixture, session.session_id);
      const valid = validatePointingEvent(event);
      if (!valid.ok) throw new Error(`Invalid pointing event: ${valid.errors.join("; ")}`);
      dispatch({ type: "event_received", event, ...stamp() });
      sendContextualUpdate(formatPointingEventUpdate(event), { contextId: event.event_id });
    },
    [dispatch, startNewSession]
  );

  return {
    state,
    save,
    retrySave: flush,
    deliverFixture,
    voiceProps: { clientTools, onFinalLine, onConnected, onDisconnected, onAgentModeChange },
  };
}

export type ExpertSession = ReturnType<typeof useExpertSession>;
