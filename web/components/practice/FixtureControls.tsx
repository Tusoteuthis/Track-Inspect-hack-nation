"use client";

import Link from "next/link";
import type { FixtureSettings } from "@/lib/practice/fixtureSettings";
import styles from "./practice.module.css";

/** Fixture-only: shows and changes simulated latency/failure for the human gate. */
export function FixtureControls({
  settings,
  onSimulateKnowledgeChange,
}: {
  settings: FixtureSettings;
  onSimulateKnowledgeChange: () => void;
}) {
  const fail = settings.failReview ? "review" : settings.failCommit ? "save" : "none";
  return (
    <details className={styles.fixtureControls}>
      <summary>
        Fixture behaviour: scripted review, {settings.latencyMs} ms delay, forced failure: {fail}
      </summary>
      <p className={styles.hint}>
        The first review of a draft always returns guidance and a later review returns “review complete”. Nothing
        here checks whether a decision is right.
      </p>
      <ul className={styles.row}>
        <li><Link href="/practice">Normal</Link></li>
        <li><Link href="/practice?fixture_latency=4000">Slow (4 s)</Link></li>
        <li><Link href="/practice?fixture_fail=commit">Force save failure</Link></li>
        <li><Link href="/practice?fixture_fail=review">Force review failure</Link></li>
        <li>
          <button type="button" onClick={onSimulateKnowledgeChange}>
            Simulate knowledge update
          </button>
        </li>
      </ul>
    </details>
  );
}
