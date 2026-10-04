import type { DataOrigin } from "@/lib/ui/contracts";

/** Shown whenever a screen renders fixture or stub data, so it is never mistaken for captured knowledge. */
export function FixtureBanner({ source }: { source: DataOrigin | undefined }) {
  if (source === "stub")
    return (
      <div className="fixture-banner" role="status">
        <span aria-hidden="true">⚠</span>
        <strong>STUB OUTPUT</strong>
        <span>Produced by a placeholder module, not by the knowledge pipeline.</span>
      </div>
    );
  if (source !== "fixture") return null;
  return (
    <div className="fixture-banner" role="status">
      <span aria-hidden="true">⚠</span>
      <strong>FIXTURE DATA</strong>
      <span>Development placeholders, not captured expert knowledge.</span>
    </div>
  );
}
