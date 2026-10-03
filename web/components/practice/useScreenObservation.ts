"use client";

// Learner screen share for the tutor (verified route: notes/ws7-screen-observation.md).
// Still frames are sent through the data source every few seconds and on
// demand; only acknowledged frames count as sent.
import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialCaptureState, screenCapture } from "@/lib/practice/screenCapture";

export const FRAME_INTERVAL_MS = 5000;
const MAX_FRAME_WIDTH = 1280;

export type FrameSender = (frame: Blob, capturedAtUtc: string) => Promise<boolean>;

function grab(video: HTMLVideoElement): Promise<Blob | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, MAX_FRAME_WIDTH / w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.7));
}

export function useScreenObservation(send: FrameSender) {
  const [state, dispatch] = useReducer(screenCapture, initialCaptureState(true));
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!navigator.mediaDevices?.getDisplayMedia) dispatch({ type: "MARK_UNSUPPORTED" });
  }, []);

  const release = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    video.current = null;
  }, []);

  const captureNow = useCallback(async () => {
    if (!video.current) return;
    const blob = await grab(video.current);
    if (!blob) return;
    const at = new Date().toISOString();
    try {
      const ok = await sendRef.current(blob, at);
      dispatch(ok ? { type: "FRAME_SENT", at_utc: at } : { type: "FRAME_FAILED", error: "Frame was not accepted." });
    } catch (error) {
      dispatch({ type: "FRAME_FAILED", error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  const start = useCallback(async () => {
    dispatch({ type: "START" });
    try {
      const media = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      stream.current = media;
      const [track] = media.getVideoTracks();
      // Fires when the learner stops sharing from the browser's own bar.
      track?.addEventListener("ended", () => {
        release();
        dispatch({ type: "ENDED" });
      });
      const el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.srcObject = media;
      await el.play();
      video.current = el;
      dispatch({ type: "GRANTED" });
      void captureNow();
      timer.current = setInterval(() => void captureNow(), FRAME_INTERVAL_MS);
    } catch (error) {
      release();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError") dispatch({ type: "DENIED" });
      else dispatch({ type: "FAILED", error: error instanceof Error ? error.message : String(error) });
    }
  }, [captureNow, release]);

  const stop = useCallback(() => {
    release();
    dispatch({ type: "ENDED" });
  }, [release]);

  useEffect(() => release, [release]);

  return { state, start, stop, captureNow };
}
