"use client";

import { useState } from "react";
import type { ExpertScriptControls } from "@/lib/data/fixtureExpertScript";
import styles from "./companion.module.css";

/** Fixture-only: simulate a dropped live-update connection to check Reconnecting… and resync. */
export function CompanionFixtureControls({ controls }: { controls: ExpertScriptControls }) {
  const [dropped, setDropped] = useState(!controls.connected());
  return (
    <section className={styles.section} aria-labelledby="fixture-behaviour-heading">
      <h2 id="fixture-behaviour-heading">Fixture behaviour</h2>
      <p className={styles.hint}>Simulates the live connection. Not part of a real session.</p>
      <div className={styles.actions}>
        {dropped ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              controls.restore();
              setDropped(false);
            }}
          >
            Restore connection
          </button>
        ) : (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              controls.dropConnection();
              setDropped(true);
            }}
          >
            Simulate connection drop
          </button>
        )}
      </div>
    </section>
  );
}
