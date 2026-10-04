"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Ack, DataSource } from "@/lib/data/source";
import { deleteKey, revokeKey, trustReducer, trustStatus, type TrustMap, type TrustStatus } from "@/lib/trust/trustState";
import type { WorkMapStep } from "@/lib/ui/contracts";
import styles from "./trust.module.css";

/** Revoke/delete state lives with the screen, so a pending request survives changing the selection. */
export function useTrustActions(source: DataSource) {
  const [map, dispatch] = useReducer(trustReducer, {} as TrustMap);
  // Guards a second click that lands before React re-renders the disabled button.
  const inFlight = useRef(new Set<string>());
  const run = useCallback((key: string, request: () => Promise<Ack<unknown>>) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    dispatch({ type: "submit", key });
    const resolved = (ack: Ack<unknown>) => {
      inFlight.current.delete(key);
      dispatch({ type: "resolved", key, ack });
    };
    request().then(resolved, (error: unknown) =>
      resolved({ status: "failed", error: error instanceof Error ? error.message : String(error) })
    );
  }, []);
  return {
    map,
    revoke: (entryId: string, revisionId: string) => run(revokeKey(entryId), () => source.revokeEntry(entryId, revisionId)),
    deleteEvidence: (sessionId: string, eventId: string) =>
      run(deleteKey(eventId), () => source.deleteEvidence(sessionId, eventId)),
  };
}

export type TrustActions = ReturnType<typeof useTrustActions>;

const ARM_MS = 5000;

type Copy = { action: string; confirm: string; pending: string; done: string; failed: string };

const REVOKE_COPY: Copy = {
  action: "Remove from teaching",
  confirm: "Press again to remove from teaching",
  pending: "Removing… waiting for confirmation",
  done: "Removed from teaching (confirmed). It stays listed here, marked Revoked, and is no longer used for teaching.",
  failed: "Removal not confirmed. The item is unchanged.",
};

const deleteCopy = (n: number): Copy => ({
  action: `Delete evidence ${n}`,
  confirm: `Press again to delete evidence ${n}`,
  pending: "Deleting… waiting for confirmation",
  done: "Evidence deleted (confirmed). Items that relied on it were removed from teaching.",
  failed: "Deletion not confirmed. The evidence is unchanged.",
});

/** One destructive action: two presses, then pending until the source acknowledges. */
function TrustAction({ status, copy, onConfirm }: { status: TrustStatus; copy: Copy; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), ARM_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  if (status.state === "acknowledged")
    return (
      <p className={styles.done} data-trust-state="acknowledged">
        <span aria-hidden="true">✓ </span>
        {copy.done}
      </p>
    );

  const pending = status.state === "pending";
  return (
    <div className={styles.row} data-trust-state={armed && !pending ? "armed" : status.state}>
      <button
        type="button"
        className={armed ? styles.armed : undefined}
        disabled={pending}
        onClick={() => {
          if (!armed) return setArmed(true);
          setArmed(false);
          onConfirm();
        }}
        onKeyDown={e => {
          if (e.key === "Escape") setArmed(false);
        }}
      >
        {armed && !pending ? copy.confirm : copy.action}
      </button>
      <span aria-live="polite">
        {pending ? (
          <span className={styles.pending}>
            <span aria-hidden="true">⧗ </span>
            {copy.pending}
          </span>
        ) : null}
      </span>
      {status.state === "failed" ? (
        <p className={styles.failed} role="alert">
          <span aria-hidden="true">✕ </span>
          {copy.failed} {status.error} You can try again.
        </p>
      ) : null}
    </div>
  );
}

type TrustControlsProps = { sessionId: string; step: WorkMapStep; trust: TrustActions };

/**
 * Removal and deletion for one item. Nothing is shown as removed before the
 * acknowledgement; the item's own status changes only when the source pushes it.
 */
export function TrustControls({ sessionId, step, trust }: TrustControlsProps) {
  const revokeStatus = trustStatus(trust.map, revokeKey(step.entry_id));
  if (step.status === "missing") return null;
  // A revoked item shows no content; only a just-confirmed removal message remains.
  if (step.status === "revoked")
    return revokeStatus.state === "acknowledged" ? (
      <section className={styles.trust} aria-label="Remove or delete">
        <TrustAction status={revokeStatus} copy={REVOKE_COPY} onConfirm={() => undefined} />
      </section>
    ) : null;

  const evidence = step.evidence
    .map((e, i) => ({ eventId: e.event_id, n: i + 1 }))
    .filter((e): e is { eventId: string; n: number } => e.eventId !== null);

  return (
    <section className={styles.trust} aria-labelledby={`trust-${step.entry_id}`}>
      <h3 id={`trust-${step.entry_id}`}>Remove or delete</h3>
      <p className={styles.hint}>
        Takes effect only after the backend confirms it. Removed items stay listed, marked Revoked, and are never used
        for teaching.
      </p>
      <TrustAction
        status={revokeStatus}
        copy={REVOKE_COPY}
        onConfirm={() => trust.revoke(step.entry_id, step.revision_id)}
      />
      {evidence.map(e => (
        <TrustAction
          key={e.eventId}
          status={trustStatus(trust.map, deleteKey(e.eventId))}
          copy={deleteCopy(e.n)}
          onConfirm={() => trust.deleteEvidence(sessionId, e.eventId)}
        />
      ))}
    </section>
  );
}
