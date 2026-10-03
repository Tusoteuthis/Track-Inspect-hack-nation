import { statusPresentation } from "@/lib/ui/status";
import type { KnowledgeStatus } from "@/lib/ui/contracts";
import styles from "./workmap.module.css";

/** Status as icon + text (never colour alone). Only "confirmed" reads "Confirmed". */
export function StatusBadge({ status }: { status: KnowledgeStatus }) {
  const p = statusPresentation(status);
  return (
    <span className={`${styles.badge} ${styles[`badge_${status}`]}`} data-status={status}>
      <span aria-hidden="true">{p.icon}</span> {p.label}
    </span>
  );
}
