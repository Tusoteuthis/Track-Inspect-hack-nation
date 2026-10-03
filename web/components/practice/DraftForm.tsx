"use client";

import styles from "./practice.module.css";
import type { DraftFields } from "./usePracticeLoop";

type Props = {
  fields: DraftFields;
  /** Choice list from the case; null means a free-text decision. */
  options: string[] | null;
  locked: boolean;
  onEdit: (patch: Partial<DraftFields>) => void;
};

export function DraftForm({ fields, options, locked, onEdit }: Props) {
  return (
    <fieldset className={styles.draft} disabled={locked}>
      <legend>Your draft</legend>
      <label htmlFor="practice-decision">Decision</label>
      {options ? (
        <select
          id="practice-decision"
          value={fields.decision}
          onChange={e => onEdit({ decision: e.target.value })}
        >
          <option value="">Choose…</option>
          {options.map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id="practice-decision"
          type="text"
          value={fields.decision}
          onChange={e => onEdit({ decision: e.target.value })}
          autoComplete="off"
        />
      )}
      <label htmlFor="practice-reason">Reason</label>
      <textarea
        id="practice-reason"
        rows={3}
        value={fields.reason}
        onChange={e => onEdit({ reason: e.target.value })}
      />
    </fieldset>
  );
}
