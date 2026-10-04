"use client";

// Tutor voice: the WS3 VoiceSession with flow="tutor", plus learner-facing
// agent status, separate microphone permission, and a bridge that forwards
// practice events as silent context. Nothing here makes the agent speak.
import { useConversationControls, useConversationMode, useConversationStatus } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import { VoiceSession } from "@/components/voice/VoiceSession";
import { practiceContext, type PracticeContextEvent } from "@/lib/practice/contextMessages";
import type { PracticeEventBus } from "@/lib/practice/practiceEvents";
import { agentState, type AgentState } from "@/lib/ui/agentState";
import styles from "./practice.module.css";

const AGENT_COPY: Record<AgentState, { icon: string; text: string }> = {
  listening: { icon: "◉", text: "Tutor is listening" },
  speaking: { icon: "♪", text: "Tutor is speaking" },
  waiting: { icon: "⏳", text: "Waiting for the tutor to connect…" },
  disconnected: { icon: "○", text: "Tutor not connected" },
};

export function TutorPanel({ bus }: { bus: PracticeEventBus }) {
  return (
    <section className={styles.panel} aria-labelledby="tutor-heading">
      <h2 id="tutor-heading">Voice tutor</h2>
      <MicPermission />
      <VoiceSession flow="tutor">
        <AgentStatus />
        <TutorContextBridge bus={bus} />
      </VoiceSession>
    </section>
  );
}

function AgentStatus() {
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const state = agentState(status, isSpeaking);
  return (
    <p className={styles.status} role="status" data-status={state} data-testid="agent-status">
      <span aria-hidden="true" className={styles.statusIcon}>
        {AGENT_COPY[state].icon}
      </span>
      <span>{AGENT_COPY[state].text}</span>
    </p>
  );
}

type MicState = "granted" | "prompt" | "denied" | "unknown";
const MIC_COPY: Record<MicState, string> = {
  granted: "Microphone allowed",
  prompt: "Microphone not yet allowed: your browser will ask when you start",
  denied: "Microphone blocked: allow it in the browser's site settings to talk to the tutor",
  unknown: "Microphone permission unknown",
};

function MicPermission() {
  const [mic, setMic] = useState<MicState>("unknown");
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let active = true;
    const update = () => status && setMic(status.state as MicState);
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then(s => {
        if (!active) return;
        status = s;
        update();
        s.addEventListener("change", update);
      })
      .catch(() => setMic("unknown"));
    return () => {
      active = false;
      status?.removeEventListener("change", update);
    };
  }, []);
  return (
    <p className={styles.hint} data-testid="mic-permission" data-mic={mic}>
      <span aria-hidden="true">🎙 </span>
      {MIC_COPY[mic]}
    </p>
  );
}

const EDIT_DEBOUNCE_MS = 1500;

function TutorContextBridge({ bus }: { bus: PracticeEventBus }) {
  const { sendContextualUpdate } = useConversationControls();
  const { status } = useConversationStatus();
  const connected = useRef(false);
  connected.current = status === "connected";
  const sendRef = useRef(sendContextualUpdate);
  sendRef.current = sendContextualUpdate;

  useEffect(() => {
    let pendingEdit: { timer: ReturnType<typeof setTimeout>; event: PracticeContextEvent } | null = null;
    const send = (event: PracticeContextEvent) => {
      if (!connected.current) return;
      const msg = practiceContext(event);
      try {
        sendRef.current(msg.text, { contextId: msg.contextId });
      } catch {
        // Session ended between the check and the send; context is best-effort.
      }
    };
    // Typing is debounced; any other event first flushes the latest edit so order is kept.
    const flushEdit = () => {
      if (!pendingEdit) return;
      clearTimeout(pendingEdit.timer);
      const { event } = pendingEdit;
      pendingEdit = null;
      send(event);
    };
    const unsubscribe = bus.subscribe(event => {
      if (event.kind === "draft_edited") {
        if (pendingEdit) clearTimeout(pendingEdit.timer);
        pendingEdit = { event, timer: setTimeout(flushEdit, EDIT_DEBOUNCE_MS) };
        return;
      }
      flushEdit();
      send(event);
    });
    return () => {
      unsubscribe();
      if (pendingEdit) clearTimeout(pendingEdit.timer);
    };
  }, [bus]);

  return null;
}
