"use client";

import { useRef, useState } from "react";
import type { EvidenceAsset, EvidenceRegion } from "@/lib/ui/contracts";
import {
  FULL_VIEWPORT,
  focusViewport,
  regionRenderState,
  regionToPercentRect,
  type RegionRenderState,
  type Viewport,
} from "@/lib/ui/regionGeometry";
import styles from "./EvidenceViewer.module.css";

export type EvidenceViewerProps = {
  asset: EvidenceAsset;
  region?: EvidenceRegion | null;
  /** Initial mode; focus is only possible for a drawable region. */
  mode?: "focus" | "full";
  caption?: string;
};

// Explanations for every case where no confident highlight may be drawn.
const NOTICE: Partial<Record<RegionRenderState, string>> = {
  ambiguous: "Ambiguous region: the exact location is uncertain",
  unresolved: "Region unresolved: no highlight",
  frame_mismatch: "Region belongs to a different frame",
  invalid: "Region data invalid: no highlight shown",
};

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// A modal <dialog> makes the page inert, but Tab can still leave it for the
// browser chrome; wrap focus at both ends so the keyboard stays in the dialog.
function trapTab(container: HTMLElement, e: { shiftKey: boolean; preventDefault: () => void }) {
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => !el.hasAttribute("disabled"));
  if (items.length === 0) return e.preventDefault();
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !container.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !container.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

const drawable = (state: RegionRenderState) => state === "resolved" || state === "ambiguous";

export function EvidenceViewer({ asset, region, mode = "full", caption }: EvidenceViewerProps) {
  const [requestedMode, setRequestedMode] = useState(mode);
  const [imageFailed, setImageFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inspectButtonRef = useRef<HTMLButtonElement>(null);

  const state = regionRenderState(asset, region);
  const canDraw = drawable(state) && !imageFailed;
  const canFocus = drawable(state);
  const activeMode = canFocus ? requestedMode : "full";
  const viewport = activeMode === "focus" && region ? focusViewport(region) : FULL_VIEWPORT;

  const openInspect = () => dialogRef.current?.showModal();
  const closeInspect = () => dialogRef.current?.close();

  return (
    <figure className={styles.viewer} data-render-state={state} data-mode={activeMode}>
      <div className={styles.toolbar}>
        {canFocus ? (
          <div role="group" aria-label="View" className={styles.segmented}>
            <button
              type="button"
              aria-pressed={activeMode === "focus"}
              onClick={() => setRequestedMode("focus")}
            >
              Focus on region
            </button>
            <button
              type="button"
              aria-pressed={activeMode === "full"}
              onClick={() => setRequestedMode("full")}
            >
              Full image
            </button>
          </div>
        ) : null}
        <button
          ref={inspectButtonRef}
          type="button"
          className={styles.inspect}
          onClick={openInspect}
        >
          Inspect full screen
        </button>
      </div>

      <Frame
        asset={asset}
        viewport={viewport}
        region={canDraw ? region! : null}
        dashed={state === "ambiguous"}
        onImageError={() => setImageFailed(true)}
      />

      {imageFailed ? (
        <p className={`${styles.notice} ${styles.error}`} role="alert">
          Image could not be loaded
        </p>
      ) : NOTICE[state] ? (
        <p className={styles.notice} data-notice={state}>
          <span aria-hidden="true">{state === "ambiguous" ? "◌ " : "⊘ "}</span>
          {NOTICE[state]}
        </p>
      ) : null}

      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-label="Inspect evidence"
        onKeyDown={e => {
          if (e.key === "Escape") {
            e.preventDefault();
            closeInspect();
          } else if (e.key === "Tab") {
            trapTab(e.currentTarget, e);
          }
        }}
        onClose={() => inspectButtonRef.current?.focus()}
      >
        <div className={styles.dialogBar}>
          <span>{caption ?? "Evidence"}</span>
          <button type="button" onClick={closeInspect}>
            Close
          </button>
        </div>
        <Frame
          asset={asset}
          viewport={FULL_VIEWPORT}
          region={canDraw ? region! : null}
          dashed={state === "ambiguous"}
          onImageError={() => setImageFailed(true)}
          decorative
        />
      </dialog>
    </figure>
  );
}

type FrameProps = {
  asset: EvidenceAsset;
  viewport: Viewport;
  region: EvidenceRegion | null;
  dashed: boolean;
  onImageError: () => void;
  /** Second copy (inspect dialog): hidden from tests' outline queries and from a11y duplicates. */
  decorative?: boolean;
};

// The frame has the viewport's aspect ratio; the image is scaled and offset so
// the viewport fills it. All positions are percentages, so resizing needs no JS.
function Frame({ asset, viewport, region, dashed, onImageError, decorative }: FrameProps) {
  const aspect = (viewport.width * asset.width_px) / (viewport.height * asset.height_px);
  const rect = region ? regionToPercentRect(region, viewport) : null;

  return (
    <div className={styles.frame} style={{ aspectRatio: String(aspect) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- evidence must render at exact geometry */}
      <img
        src={asset.original_url}
        alt={decorative ? "" : "Captured trace evidence"}
        className={styles.image}
        style={{
          width: `${100 / viewport.width}%`,
          height: `${100 / viewport.height}%`,
          left: `${(-viewport.x / viewport.width) * 100}%`,
          top: `${(-viewport.y / viewport.height) * 100}%`,
        }}
        onError={onImageError}
        draggable={false}
      />
      {rect ? (
        <div
          data-testid={decorative ? undefined : "region-outline"}
          data-style={dashed ? "dashed" : "solid"}
          className={`${styles.outline} ${dashed ? styles.dashed : ""}`}
          style={{
            left: `${rect.left}%`,
            top: `${rect.top}%`,
            width: `${rect.width}%`,
            height: `${rect.height}%`,
          }}
        >
          {/* Near the top edge the label would be clipped, so it moves inside the outline. */}
          <span className={`${styles.label} ${rect.top < 10 ? styles.labelInside : ""}`}>
            {dashed ? "Ambiguous region" : "Indicated region"}
          </span>
        </div>
      ) : null}
    </div>
  );
}
