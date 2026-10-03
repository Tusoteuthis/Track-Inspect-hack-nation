"use client";

import { useState } from "react";
import type { ReviewScriptControls } from "@/lib/data/fixtureReviewScript";
import styles from "./review.module.css";

/**
 * Development-only stand-in for WS3/WS5 events: steps the scripted fixture
 * debrief. It simulates what the spoken review would deliver; it is not a
 * confirmation control.
 */
export function FixturePlayback({ controls }: { controls: ReviewScriptControls }) {
  const [index, setIndex] = useState(controls.stageIndex());
  const [fail, setFail] = useState(controls.failMarks());
  const last = controls.stageLabels.length - 1;

  return (
    <section className={styles.playback} aria-labelledby="playback-title">
      <h2 id="playback-title">Fixture playback (development only)</h2>
      <p className={styles.hint}>Simulates updates that the spoken review would deliver.</p>
      <p>
        Step {index + 1} of {controls.stageLabels.length}: {controls.stageLabels[index]}
      </p>
      <div className={styles.playbackControls}>
        <button
          type="button"
          disabled={index >= last}
          onClick={() => {
            controls.advance();
            setIndex(controls.stageIndex());
          }}
        >
          {index >= last ? "End of script" : `Next: ${controls.stageLabels[index + 1]}`}
        </button>
        <button
          type="button"
          onClick={() => {
            controls.reset();
            setIndex(controls.stageIndex());
          }}
        >
          Restart
        </button>
        <label>
          <input
            type="checkbox"
            checked={fail}
            onChange={e => {
              setFail(e.target.checked);
              controls.setFailMarks(e.target.checked);
            }}
          />{" "}
          Simulate action failures
        </label>
      </div>
    </section>
  );
}
