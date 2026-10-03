"use client";

import {
  ConversationProvider,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { Flow } from "@/lib/voice/flows";
import {
  appendFinal,
  appendTentative,
  finalLineFrom,
  tentativeTextFrom,
  type TranscriptLine,
} from "@/lib/voice/transcript";

export type ClientToolHandler = (
  params: Record<string, unknown>
) => string | number | void | Promise<string | number | void>;

export type VoiceSessionProps = {
  flow: Flow;
  /** Values for `{{placeholders}}` configured on the agent. */
  dynamicVariables?: Record<string, string | number | boolean>;
  /** Client tools; names must match the tools configured on the agent. */
  clientTools?: Record<string, ClientToolHandler>;
  /** Fires once per final (non-tentative) transcript line. */
  onFinalLine?: (line: TranscriptLine) => void;
  /** Fires after connect with the ElevenLabs conversation id. */
  onConnected?: (conversationId: string) => void;
  /**
   * Rendered inside the conversation provider, so children can call
   * `useConversationControls()` — e.g. `sendContextualUpdate` to tell the agent
   * about a pointing event without forcing it to speak.
   */
  children?: ReactNode;
};

type UiState = "idle" | "connecting" | "listening" | "speaking" | "error";

const STATE_LABEL: Record<UiState, string> = {
  idle: "Ready",
  connecting: "Connecting…",
  listening: "Listening",
  speaking: "Agent speaking",
  error: "Error",
};

export function VoiceSession({ children, onFinalLine, ...props }: VoiceSessionProps) {
  const [lines, setLinesState] = useState<TranscriptLine[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Mirror of `lines` so event handlers can compute the next transcript (and fire
  // onFinalLine exactly once) outside a state updater.
  const linesRef = useRef<TranscriptLine[]>([]);
  const lineCounter = useRef(0);
  const finalLineCb = useRef(onFinalLine);
  finalLineCb.current = onFinalLine;

  const nextId = useCallback(() => `line-${++lineCounter.current}`, []);
  const setLines = useCallback((next: TranscriptLine[]) => {
    linesRef.current = next;
    setLinesState(next);
  }, []);

  const handleMessage = useCallback(
    (event: unknown) => {
      const line = finalLineFrom(event);
      if (!line) return;
      const prev = linesRef.current;
      const next = appendFinal(prev, line, nextId);
      if (next === prev) return;
      setLines(next);
      finalLineCb.current?.(next[next.length - 1]);
    },
    [nextId, setLines]
  );

  const handleDebug = useCallback(
    (event: unknown) => {
      const text = tentativeTextFrom(event);
      if (text) setLines(appendTentative(linesRef.current, text, nextId));
    },
    [nextId, setLines]
  );

  const resetTranscript = useCallback(() => {
    lineCounter.current = 0;
    setLines([]);
  }, [setLines]);

  return (
    <ConversationProvider
      onConnect={() => setSessionError(null)}
      onDisconnect={() => setStarting(false)}
      onError={(error: unknown) =>
        setSessionError(error instanceof Error ? error.message : String(error))
      }
      onMessage={handleMessage}
      onDebug={handleDebug}
    >
      <VoicePanel
        {...props}
        lines={lines}
        resetTranscript={resetTranscript}
        sessionError={sessionError}
        setSessionError={setSessionError}
        starting={starting}
        setStarting={setStarting}
      />
      {children}
    </ConversationProvider>
  );
}

type VoicePanelProps = Omit<VoiceSessionProps, "children" | "onFinalLine"> & {
  lines: TranscriptLine[];
  resetTranscript: () => void;
  sessionError: string | null;
  setSessionError: (value: string | null) => void;
  starting: boolean;
  setStarting: (value: boolean) => void;
};

function VoicePanel({
  flow,
  dynamicVariables,
  clientTools,
  onConnected,
  lines,
  resetTranscript,
  sessionError,
  setSessionError,
  starting,
  setStarting,
}: VoicePanelProps) {
  const { startSession, endSession, getId, getOutputByteFrequencyData, getInputVolume } =
    useConversationControls();
  const { status, message } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const [level, setLevel] = useState(0);
  const transcriptEnd = useRef<HTMLDivElement>(null);

  const connected = status === "connected";
  const sessionActive = connected || status === "connecting";

  const uiState: UiState =
    status === "connected"
      ? isSpeaking
        ? "speaking"
        : "listening"
      : status === "connecting" || starting
        ? "connecting"
        : status === "error"
          ? "error"
          : "idle";

  const errorText =
    sessionError ?? (status === "error" ? message?.trim() || "Connection error" : null);

  useEffect(() => {
    if (connected) onConnected?.(getId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines]);

  // The ring follows the agent's voice while it speaks and the mic level while it listens.
  useEffect(() => {
    if (!connected) {
      setLevel(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      try {
        if (isSpeaking) {
          const data = getOutputByteFrequencyData();
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          setLevel(Math.min(1, data.length ? sum / data.length / 90 : 0));
        } else {
          setLevel(Math.min(1, getInputVolume() * 2.4));
        }
      } catch {
        // audio graph not ready yet
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [connected, isSpeaking, getOutputByteFrequencyData, getInputVolume]);

  async function toggleSession() {
    setSessionError(null);
    if (sessionActive) {
      endSession();
      setStarting(false);
      return;
    }

    setStarting(true);
    resetTranscript();
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setSessionError("Microphone access is required to talk to the agent.");
      setStarting(false);
      return;
    }

    try {
      const res = await fetch(`/api/conversation-token?flow=${flow}`);
      const data = await res.json();
      if (!res.ok || typeof data.token !== "string") {
        setSessionError(typeof data.error === "string" ? data.error : "Could not get a conversation token.");
        return;
      }
      startSession({
        conversationToken: data.token,
        connectionType: "webrtc",
        dynamicVariables,
        clientTools,
      });
    } catch (error) {
      setSessionError(error instanceof Error ? error.message : String(error));
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="voice">
      <div className={`voice-stage ${uiState}`}>
        <div className="voice-ring" style={{ transform: `scale(${1 + level * 0.16})` }} />
        <div className="voice-ring outer" style={{ transform: `scale(${1 + level * 0.3})` }} />
        <button
          type="button"
          className="voice-orb"
          onClick={toggleSession}
          disabled={starting && !sessionActive}
          aria-label={sessionActive ? "End conversation" : "Start conversation"}
        >
          {sessionActive ? "Stop" : starting ? "…" : "Start"}
        </button>
      </div>
      <p className="voice-status" aria-live="polite">
        {STATE_LABEL[uiState]}
      </p>

      {errorText ? (
        <div role="alert" className="voice-error">
          {errorText}
        </div>
      ) : null}

      <div className="voice-transcript" aria-live="polite">
        {lines.length === 0 ? (
          <p className="voice-empty">
            {sessionActive ? "Start talking…" : "Start a conversation to see the transcript."}
          </p>
        ) : (
          lines.map(line => (
            <div key={line.id} className={`voice-line ${line.role}${line.tentative ? " tentative" : ""}`}>
              {line.text}
            </div>
          ))
        )}
        <div ref={transcriptEnd} />
      </div>
    </section>
  );
}
