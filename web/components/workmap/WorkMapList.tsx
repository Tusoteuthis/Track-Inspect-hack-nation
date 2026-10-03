"use client";

import { useRef, useState } from "react";
import { StatusBadge } from "@/components/workmap/StatusBadge";
import { navigate, rovingId } from "@/lib/workmap/listNav";
import { KIND_LABEL } from "@/lib/ui/status";
import type { WorkMapStep } from "@/lib/ui/contracts";
import styles from "./workmap.module.css";

export type WorkMapListProps = {
  steps: WorkMapStep[];
  selectedId: string | null;
  onSelect: (entryId: string) => void;
  /** Accessible name of the list, e.g. "Work Map process". */
  label: string;
  /** Per-entry change marker text shown next to the item (review view). */
  markers?: Readonly<Record<string, string>>;
};

/** The workflow as an ordered process. Arrows/Home/End move focus; Enter or Space opens. */
export function WorkMapList({ steps, selectedId, onSelect, label, markers }: WorkMapListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const ids = steps.map(s => s.entry_id);
  const tabStop = rovingId(ids, activeId, selectedId);

  return (
    <ol className={styles.list} aria-label={label}>
      {steps.map((step, i) => {
        const marker = markers?.[step.entry_id];
        return (
          <li key={step.entry_id} data-kind={step.kind}>
            <button
              type="button"
              ref={el => {
                if (el) buttons.current.set(step.entry_id, el);
                else buttons.current.delete(step.entry_id);
              }}
              className={`${styles.item} ${styles[`item_${step.status}`] ?? ""}`}
              tabIndex={tabStop === step.entry_id ? 0 : -1}
              aria-current={selectedId === step.entry_id ? "true" : undefined}
              onFocus={() => setActiveId(step.entry_id)}
              onClick={() => onSelect(step.entry_id)}
              onKeyDown={e => {
                const next = navigate(ids, step.entry_id, e.key);
                if (next === undefined) return;
                e.preventDefault();
                setActiveId(next);
                buttons.current.get(next)?.focus();
              }}
            >
              <span className={styles.number} aria-hidden="true">
                {i + 1}
              </span>
              <span className={`${styles.kind} ${styles[`kind_${step.kind}`]}`}>{KIND_LABEL[step.kind]}</span>
              <span className={styles.title}>{step.title}</span>
              <StatusBadge status={step.status} />
              {marker ? (
                <span className={styles.marker} data-marker={marker}>
                  <span aria-hidden="true">● </span>
                  {marker}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
