"use client";

import { type ReactNode, useId, useState } from "react";
import { EvidenceViewer } from "@/components/evidence/EvidenceViewer";
import { StatusBadge } from "@/components/workmap/StatusBadge";
import { KIND_LABEL, statusPresentation } from "@/lib/ui/status";
import type { WorkMapStep } from "@/lib/ui/contracts";
import styles from "./workmap.module.css";

/**
 * One Work Map item. Expert quotes (verbatim) and apprentice synthesis are in
 * separate, labelled regions. Revoked/missing items show no teaching content.
 * Remount per entry (key) so the evidence choice starts at the first piece.
 */
export function WorkMapDetail({ step, children }: { step: WorkMapStep; children?: ReactNode }) {
  const id = useId();
  const status = statusPresentation(step.status);

  return (
    <article className={styles.detail} aria-labelledby={`${id}-title`} data-status={step.status}>
      <header className={styles.detailHeader}>
        <span className={`${styles.kind} ${styles[`kind_${step.kind}`]}`}>{KIND_LABEL[step.kind]}</span>
        <h2 id={`${id}-title`}>{step.title}</h2>
        <StatusBadge status={step.status} />
        <p className={styles.statusText}>{status.description}</p>
      </header>

      {!status.teachable ? (
        <p className={styles.notTeaching} role="note">
          <span aria-hidden="true">⊘ </span>
          {step.status === "revoked"
            ? "This item has been revoked. It is not teaching material, so its content is not shown."
            : "This item is missing. Nothing was captured for it, so there is nothing to teach from."}
        </p>
      ) : (
        <TeachingContent step={step} id={id} />
      )}
      {children}
    </article>
  );
}

function TeachingContent({ step, id }: { step: WorkMapStep; id: string }) {
  const [chosen, setChosen] = useState(0);
  const count = step.evidence.length;
  const index = Math.min(chosen, Math.max(count - 1, 0));
  const evidence = step.evidence[index];

  return (
    <>
      {step.status === "unresolved" ? (
        <div className={styles.unresolved} role="note">
          <p>
            <strong>
              <span aria-hidden="true">? </span>Unresolved.
            </strong>{" "}
            This is not verified knowledge.
          </p>
          <p>
            <strong>Open question:</strong> {step.open_question ?? "No open question recorded."}
          </p>
        </div>
      ) : null}

      <section aria-labelledby={`${id}-evidence`} className={styles.section}>
        <h3 id={`${id}-evidence`}>Visual evidence</h3>
        {count === 0 ? (
          <p className={styles.missing} data-missing="evidence">
            <span aria-hidden="true">! </span>Missing visual evidence
          </p>
        ) : (
          <>
            {count > 1 ? (
              <div role="group" aria-label="Choose evidence" className={styles.evidencePicker}>
                {step.evidence.map((_, i) => (
                  <button key={i} type="button" aria-pressed={i === index} onClick={() => setChosen(i)}>
                    Evidence {i + 1}
                  </button>
                ))}
              </div>
            ) : null}
            <EvidenceViewer
              key={`${step.entry_id}:${index}`}
              asset={evidence.asset}
              region={evidence.region}
              mode="focus"
              caption={`Evidence ${index + 1} of ${count}`}
            />
          </>
        )}
      </section>

      <section aria-labelledby={`${id}-quotes`} className={`${styles.section} ${styles.quotes}`}>
        <h3 id={`${id}-quotes`}>Expert&apos;s words</h3>
        <p className={styles.hint}>Verbatim, as the expert said it.</p>
        {step.expert_quotes.length === 0 ? (
          <p className={styles.missing} data-missing="quotes">
            <span aria-hidden="true">! </span>Missing expert words
          </p>
        ) : (
          step.expert_quotes.map((q, i) => (
            <figure key={i} className={styles.quote}>
              <blockquote>{q.text}</blockquote>
              <figcaption>
                <span aria-hidden="true">🗣 </span>Expert
              </figcaption>
            </figure>
          ))
        )}
      </section>

      <section aria-labelledby={`${id}-summary`} className={`${styles.section} ${styles.synthesis}`}>
        <h3 id={`${id}-summary`}>Apprentice summary</h3>
        <p className={styles.hint}>AI synthesis, not the expert&apos;s words.</p>
        <p>{step.ai_summary ?? "No apprentice summary for this item."}</p>
      </section>

      {step.reasoning ? (
        <section aria-labelledby={`${id}-reasoning`} className={`${styles.section} ${styles.synthesis}`}>
          <h3 id={`${id}-reasoning`}>Reasoning</h3>
          <p className={styles.hint}>Apprentice wording, not verbatim.</p>
          <p>{step.reasoning}</p>
        </section>
      ) : null}

      {step.guardrails.length ? (
        <section aria-labelledby={`${id}-guardrails`} className={`${styles.section} ${styles.synthesis}`}>
          <h3 id={`${id}-guardrails`}>Guardrails and exceptions</h3>
          <p className={styles.hint}>Apprentice wording, not verbatim.</p>
          <ul>
            {step.guardrails.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
