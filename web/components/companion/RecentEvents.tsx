"use client";

import { formatSessionTime, MAPPING_COPY } from "@/lib/companion/copy";
import type { CompanionEvent, MappingStatus } from "@/lib/ui/contracts";
import styles from "./companion.module.css";

const MAPPING_ICON: Record<MappingStatus, string> = { resolved: "●", ambiguous: "◌", unresolved: "⊘" };

/** Small strip of recent pointing, newest first. Display only. */
export function RecentEvents({ events }: { events: CompanionEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="recent-heading">
      <h2 id="recent-heading" className={styles.hint}>
        Recent pointing (newest first)
      </h2>
      <ol className={styles.events} data-testid="recent-events">
        {events.map((e, i) => (
          <li
            key={e.event_id}
            className={styles.event}
            data-mapping={e.region.mapping_status}
            data-latest={i === 0}
            data-testid="recent-event"
          >
            <span className={styles.eventTitle}>
              <span aria-hidden="true">{MAPPING_ICON[e.region.mapping_status]}</span>
              {i === 0 ? "Latest: " : ""}
              {MAPPING_COPY[e.region.mapping_status]}
            </span>
            <span>Session time {formatSessionTime(e.session_time_ms)}</span>
            <span>Channel {e.channel_label ?? "unknown"}</span>
            {e.record_state === "off_record" ? <span className={styles.tag}>Off record</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
