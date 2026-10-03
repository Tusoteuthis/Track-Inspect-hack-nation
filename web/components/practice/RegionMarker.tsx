"use client";

// Optional learner mark: drag a rectangle on the practice trace. Deliberately
// simple — one rectangle on this trace's own frame, not a chart editor.
import { useRef, useState } from "react";
import { clientToNormalized, pointsToRegion, type Point } from "@/lib/practice/regionDraw";
import { regionToPercentRect, FULL_VIEWPORT } from "@/lib/ui/regionGeometry";
import type { EvidenceAsset, EvidenceRegion } from "@/lib/ui/contracts";
import styles from "./practice.module.css";

type Props = {
  asset: EvidenceAsset;
  region: EvidenceRegion | null;
  onChange: (region: EvidenceRegion | null) => void;
  onDone: () => void;
};

export function RegionMarker({ asset, region, onChange, onDone }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<Point | null>(null);
  const [preview, setPreview] = useState<EvidenceRegion | null>(null);

  const point = (e: React.PointerEvent) =>
    clientToNormalized(e.clientX, e.clientY, frame.current!.getBoundingClientRect());

  const shown = preview ?? region;
  const rect = shown ? regionToPercentRect(shown, FULL_VIEWPORT) : null;

  return (
    <div className={styles.marker}>
      <p id="marker-help" className={styles.hint}>
        Drag on the trace to mark the region your decision is about. This is optional.
      </p>
      <div
        ref={frame}
        className={styles.markerFrame}
        style={{ aspectRatio: `${asset.width_px} / ${asset.height_px}` }}
        aria-describedby="marker-help"
        data-testid="region-marker"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          setStart(point(e));
          setPreview(null);
        }}
        onPointerMove={e => {
          if (start) setPreview(pointsToRegion(start, point(e), asset.frame_id));
        }}
        onPointerUp={e => {
          if (!start) return;
          const next = pointsToRegion(start, point(e), asset.frame_id);
          setStart(null);
          setPreview(null);
          if (next) onChange(next);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.original_url} alt="Practice trace" draggable={false} />
        {rect ? (
          <div
            className={styles.markRect}
            data-testid="learner-region"
            style={{ left: `${rect.left}%`, top: `${rect.top}%`, width: `${rect.width}%`, height: `${rect.height}%` }}
          >
            <span>Your marked region</span>
          </div>
        ) : null}
      </div>
      <div className={styles.row}>
        <button type="button" onClick={() => onChange(null)} disabled={!region}>
          Clear marked region
        </button>
        <button type="button" onClick={onDone}>
          Done marking
        </button>
      </div>
    </div>
  );
}
