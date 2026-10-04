// Fixture stand-in for WS6 revocation and evidence deletion (S4 routes).
// One module-level store is shared by every fixture source in the tab, so a
// revoke on /map is visible on /practice after client-side navigation; a reload
// resets it. Views keep revoked items (history) and mark them "revoked";
// teaching views (practice citations) only ever cite confirmed items.
import type { SourceUpdate } from "@/lib/data/source";
import type { ReviewView, WorkMapView } from "@/lib/ui/contracts";

type KnowledgeUpdate = Extract<SourceUpdate, { type: "knowledge" }>;

export type FixtureKnowledge = {
  revoke(entryId: string, revisionId: string): void;
  /** Deletes an event's evidence; returns the entries revoked because they cited it. */
  deleteEvent(eventId: string, view: WorkMapView): string[];
  isRevoked(entryId: string): boolean;
  apply(view: WorkMapView): WorkMapView;
  applyReview(view: ReviewView): ReviewView;
  subscribe(listener: (update: KnowledgeUpdate) => void): () => void;
  reset(): void;
};

export function createFixtureKnowledge(): FixtureKnowledge {
  const revoked = new Map<string, string>();
  const deletedEvents = new Set<string>();
  const listeners = new Set<(update: KnowledgeUpdate) => void>();

  const revoke = (entryId: string, revisionId: string) => {
    revoked.set(entryId, revisionId);
    for (const l of listeners) l({ type: "knowledge", entry_id: entryId, revision_id: revisionId, status: "revoked" });
  };

  const apply = (view: WorkMapView): WorkMapView => {
    if (revoked.size === 0 && deletedEvents.size === 0) return view;
    return {
      ...view,
      steps: view.steps.map(s => ({
        ...s,
        status: revoked.has(s.entry_id) ? "revoked" : s.status,
        evidence: s.evidence.filter(e => !(e.event_id && deletedEvents.has(e.event_id))),
      })),
    };
  };

  return {
    revoke,
    deleteEvent(eventId, view) {
      deletedEvents.add(eventId);
      const citing = view.steps.filter(s => s.evidence.some(e => e.event_id === eventId) && !revoked.has(s.entry_id));
      for (const s of citing) revoke(s.entry_id, s.revision_id);
      return citing.map(s => s.entry_id);
    },
    isRevoked: entryId => revoked.has(entryId),
    apply,
    applyReview: view => ({
      ...view,
      current: apply(view.current),
      previous: view.previous ? apply(view.previous) : null,
    }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset() {
      revoked.clear();
      deletedEvents.clear();
    },
  };
}

/** Shared by every fixture source in this tab. */
export const sharedFixtureKnowledge = createFixtureKnowledge();
