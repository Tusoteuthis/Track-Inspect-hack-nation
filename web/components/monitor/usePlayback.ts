"use client";

// Drives a <video> with the pure playback machine (lib/monitor/playback): the
// element reports media ticks, commands come from keys or buttons, and the
// returned effect is applied to the element. Shared by the full-screen monitor
// and the inline player on the companion.
import { useCallback, useEffect, useRef, useState } from "react";
import type { MonitorStateMessage } from "@/lib/monitor/monitorChannel";
import {
  initialPlayback,
  step,
  type PlaybackAction,
  type PlaybackEffect,
  type PlaybackState,
} from "@/lib/monitor/playback";
import type { CaseMedia } from "@/lib/ui/contracts";

export function usePlayback(media: CaseMedia) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState<PlaybackState>(initialPlayback);
  const stateRef = useRef(playback);

  const apply = useCallback((effect: PlaybackEffect | null) => {
    const video = videoRef.current;
    if (!effect || !video) return;
    if (effect.kind === "play") {
      void video.play()?.catch?.(() => undefined);
    } else {
      if (effect.kind === "pause_at") video.pause();
      video.currentTime = effect.time_ms / 1000;
    }
  }, []);

  const dispatch = useCallback(
    (action: PlaybackAction) => {
      const next = step(stateRef.current, action, media.holds, media.duration_ms);
      if (next.state !== stateRef.current) {
        stateRef.current = next.state;
        setPlayback(next.state);
      }
      apply(next.effect);
    },
    [apply, media.duration_ms, media.holds]
  );

  // Frame-accurate hold detection while playing (timeupdate fires only ~4 times a second).
  useEffect(() => {
    if (playback.status !== "playing") return;
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video) dispatch({ type: "tick", time_ms: video.currentTime * 1000 });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [dispatch, playback.status]);

  /** Element handlers that feed the machine. */
  const videoEvents = {
    onEnded: () => dispatch({ type: "ended" }),
    onError: () => dispatch({ type: "error", message: "The video could not be loaded." }),
    onSeeked: (e: React.SyntheticEvent<HTMLVideoElement>) =>
      dispatch({ type: "tick", time_ms: e.currentTarget.currentTime * 1000 }),
  };

  return { videoRef, playback, stateRef, dispatch, videoEvents };
}

/** The monitor_state message for a playback state (sent to the companion, or reported inline). */
export function monitorStateMessage(caseId: string, media: CaseMedia, s: PlaybackState): MonitorStateMessage {
  return {
    type: "monitor_state",
    case_id: caseId,
    status: s.status,
    media_time_ms: Math.round(s.time_ms),
    duration_ms: media.duration_ms,
    hold_id: s.hold_index !== null ? media.holds[s.hold_index].hold_id : null,
    hold_index: s.hold_index !== null ? s.hold_index + 1 : null,
    hold_count: media.holds.length,
    auto_holds: s.auto_holds,
  };
}
