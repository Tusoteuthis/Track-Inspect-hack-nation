"use client";

// Companion end of the monitor link: tracks what the monitor window is showing
// and tells it the session's recording state. Works whichever window opens first.
import { useEffect, useRef, useState } from "react";
import {
  openMonitorChannel,
  type MonitorLink,
  type MonitorStateMessage,
  type SessionRecording,
} from "@/lib/monitor/monitorChannel";

/** No message for this long while the monitor said it was playing → treat it as closed. */
export const MONITOR_SILENCE_MS = 3000;
/** While no monitor is known, ask for one this often. */
export const MONITOR_HELLO_MS = 5000;

export function useMonitorLink(recording: SessionRecording): MonitorStateMessage | null {
  const [monitor, setMonitor] = useState<MonitorStateMessage | null>(null);
  const linkRef = useRef<MonitorLink | null>(null);
  const recordingRef = useRef(recording);
  const lastHeard = useRef(0);

  useEffect(() => {
    const link = openMonitorChannel(m => {
      if (m.type === "monitor_state") {
        lastHeard.current = Date.now();
        setMonitor(m);
      } else if (m.type === "bye") {
        setMonitor(null);
      } else if (m.type === "hello" && m.from === "monitor") {
        link.post({ type: "session_state", recording: recordingRef.current });
        link.post({ type: "hello", from: "companion" });
      }
    });
    linkRef.current = link;
    link.post({ type: "hello", from: "companion" });
    link.post({ type: "session_state", recording: recordingRef.current });
    return () => {
      link.close();
      linkRef.current = null;
    };
  }, []);

  useEffect(() => {
    recordingRef.current = recording;
    linkRef.current?.post({ type: "session_state", recording });
  }, [recording]);

  // Re-ask while unknown; drop a monitor that went silent mid-playback (closed without a bye).
  useEffect(() => {
    if (!monitor) {
      const timer = setInterval(() => linkRef.current?.post({ type: "hello", from: "companion" }), MONITOR_HELLO_MS);
      return () => clearInterval(timer);
    }
    if (monitor.status !== "playing") return;
    const timer = setTimeout(() => {
      if (Date.now() - lastHeard.current >= MONITOR_SILENCE_MS) setMonitor(null);
    }, MONITOR_SILENCE_MS);
    return () => clearTimeout(timer);
  }, [monitor]);

  return monitor;
}
