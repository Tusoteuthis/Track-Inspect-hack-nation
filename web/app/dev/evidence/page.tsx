"use client";

import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";
import { FixtureBanner } from "@/components/shell/FixtureBanner";
import type { EvidenceAsset, EvidenceRegion } from "@/lib/ui/contracts";

// Showcase of every EvidenceViewer state, for the Sprint 0 legibility gate on
// the demo monitor. Geometry is illustrative fixture data.
const asset: EvidenceAsset = {
  asset_id: "fixture-asset-a",
  original_url: "/fixtures/ui/trace-a.svg",
  highlighted_url: null,
  frame_id: "fixture-frame-a",
  width_px: 1600,
  height_px: 900,
};

const region = (over: Partial<EvidenceRegion>): EvidenceRegion => ({
  frame_id: asset.frame_id,
  coordinate_space: "original_frame_normalized",
  x: 0.28,
  y: 0.18,
  width: 0.1,
  height: 0.22,
  mapping_status: "resolved",
  ...over,
});

const CASES: { title: string; region: EvidenceRegion | null; mode: "focus" | "full" }[] = [
  { title: "Resolved: focus view", region: region({}), mode: "focus" },
  { title: "Resolved: full image", region: region({ x: 0.62, y: 0.62, width: 0.14, height: 0.2 }), mode: "full" },
  { title: "Ambiguous region", region: region({ x: 0.3, y: 0.15, width: 0.45, height: 0.7, mapping_status: "ambiguous" }), mode: "full" },
  { title: "Unresolved region", region: region({ mapping_status: "unresolved" }), mode: "full" },
  { title: "Region from a different frame", region: region({ frame_id: "fixture-frame-other" }), mode: "full" },
  { title: "Region at the image edge: focus clamps", region: region({ x: 0.93, y: 0.02, width: 0.06, height: 0.1 }), mode: "focus" },
];

export default function EvidenceShowcasePage() {
  return (
    <>
      <FixtureBanner source="fixture" />
      <section className="placeholder">
        <h1>Evidence viewer states</h1>
        <p className="muted">
          Check legibility through the glasses on the demo monitor. Resize the window: outlines must stay aligned.
        </p>
        <div className="showcase">
          {CASES.map(c => (
            <article key={c.title}>
              <h2>{c.title}</h2>
              <EvidenceViewer asset={asset} region={c.region} mode={c.mode} caption={c.title} />
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
