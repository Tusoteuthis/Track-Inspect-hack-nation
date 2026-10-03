"use client";

import { useEffect, useRef, useState } from "react";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";
import type { Citation, LearnerEvaluation } from "@/lib/ui/contracts";
import styles from "./practice.module.css";

type Props = {
  guidance: LearnerEvaluation | null;
  /** Draft revision currently being edited, to say when guidance refers to an older draft. */
  currentRevision: number;
};

export function GuidancePanel({ guidance, currentRevision }: Props) {
  const [open, setOpen] = useState<Citation | null>(null);

  if (!guidance) return null;
  const older = guidance.draft_revision !== currentRevision;

  return (
    <section className={styles.panel} aria-labelledby="guidance-heading" data-testid="guidance-panel">
      <h2 id="guidance-heading">Tutor guidance</h2>
      {older ? <p className={styles.hint}>This guidance was given on your earlier draft.</p> : null}
      <p className={styles.aiText}>
        <span className={styles.sourceTag}>Tutor</span> {guidance.message}
      </p>
      {guidance.guiding_question ? (
        <p className={styles.question}>
          <span aria-hidden="true">?</span> {guidance.guiding_question}
        </p>
      ) : null}
      {guidance.citations.length > 0 ? (
        <>
          <h3>Expert examples cited</h3>
          <ul className={styles.citations}>
            {guidance.citations.map((c, i) => (
              <li key={`${c.entry_id}:${c.revision_id}:${i}`}>
                <button type="button" onClick={() => setOpen(c)}>
                  Open expert example {i + 1}
                </button>
                {c.quote ? <span className={styles.citeQuote}>“{c.quote.text}”</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <ExampleDialog citation={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function ExampleDialog({ citation, onClose }: { citation: Citation | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (citation && !dialog.open) dialog.showModal();
    if (!citation && dialog.open) dialog.close();
  }, [citation]);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="example-title" onClose={onClose}>
      {citation ? (
        <div className={styles.dialogBody}>
          <div className={styles.dialogBar}>
            <h2 id="example-title">Expert example</h2>
            <button type="button" onClick={onClose} autoFocus>
              Close
            </button>
          </div>
          <p className={styles.hint}>From the expert&apos;s confirmed knowledge, recorded on a different trace.</p>
          {citation.evidence ? (
            <EvidenceViewer
              asset={citation.evidence.asset}
              region={citation.evidence.region}
              mode="focus"
              caption="Expert's evidence"
            />
          ) : (
            <p className={styles.hint}>No image is linked to this example.</p>
          )}
          {citation.quote ? (
            <figure className={styles.expertQuote}>
              <figcaption>Expert&apos;s words (verbatim)</figcaption>
              <blockquote>{citation.quote.text}</blockquote>
            </figure>
          ) : (
            <p className={styles.hint}>No expert quote is linked to this example.</p>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
