/**
 * Off the record = not stored (S4). A write is off the record if its own label says so, if the
 * session is off the record now, or if its capture time falls inside an off-record segment of
 * the server's segment timeline. Pure functions over the session record.
 */
import type { Session } from "@/lib/contracts";

const ms = (utc: string) => Date.parse(utc);

/** True if `utc` lies inside an off-record segment (start inclusive, end exclusive). */
export function isOffRecordAt(session: Session, utc: string | null | undefined): boolean {
  if (!utc) return false;
  const t = ms(utc);
  return session.recording_segments.some(
    s => s.state === "off_record" && ms(s.started_at_utc) <= t && (s.ended_at_utc === null || t < ms(s.ended_at_utc)),
  );
}

export function isOffRecordWrite(session: Session, label: "on_record" | "off_record" | undefined, capturedAtUtc: string | null): boolean {
  return session.record_state === "off_record" || label === "off_record" || isOffRecordAt(session, capturedAtUtc);
}

/** Answer lines spoken inside an off-record segment are dropped before anything is stored. */
export function onRecordLines<L extends { at_utc: string }>(session: Session, lines: readonly L[]): L[] {
  return lines.filter(l => !isOffRecordAt(session, l.at_utc));
}
