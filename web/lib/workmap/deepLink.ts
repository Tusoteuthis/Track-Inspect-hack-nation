import type { WorkMapView } from "@/lib/ui/contracts";

export type DeepLinkNotice = null | "unknown_entry" | "other_revision";

/** Turns `?entry=&rev=` into a selection on the revision actually loaded. */
export function resolveDeepLink(
  view: WorkMapView,
  entryId: string | null,
  revisionId: string | null
): { selectedId: string | null; notice: DeepLinkNotice } {
  const otherRevision = revisionId !== null && revisionId !== view.revision_id;
  if (entryId === null) return { selectedId: null, notice: otherRevision ? "other_revision" : null };
  if (!view.steps.some(s => s.entry_id === entryId)) return { selectedId: null, notice: "unknown_entry" };
  return { selectedId: entryId, notice: otherRevision ? "other_revision" : null };
}

export function mapHref(entryId: string, revisionId: string): string {
  return `/map?${new URLSearchParams({ entry: entryId, rev: revisionId })}`;
}
