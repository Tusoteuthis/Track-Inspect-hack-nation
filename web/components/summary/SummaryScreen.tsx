"use client";

import Link from "next/link";
import { FixtureBanner } from "@/components/shell/FixtureBanner";
import { SessionConnectionStatus } from "@/components/shell/ConnectionStatus";
import { useDataSource, useSourceQuery } from "@/lib/data/DataSourceProvider";
import { summaryGroups } from "@/lib/summary/groups";
import type { AssessmentItem, AssessmentView, Citation } from "@/lib/ui/contracts";
import { mapHref } from "@/lib/workmap/deepLink";
import styles from "./summary.module.css";

/**
 * Renders the WS5 assessment as returned. No overall score: WS5 does not supply
 * one, and a single coached case is not a benchmark.
 */
export function SummaryScreen({ sessionId }: { sessionId: string | null }) {
  const source = useDataSource();
  const query = useSourceQuery(`assessment:${sessionId ?? ""}`, s =>
    sessionId ? s.getAssessment(sessionId) : Promise.resolve(null)
  );

  return (
    <>
      <FixtureBanner source={query.status === "ready" ? query.data?.source : undefined} />
      <section className={styles.screen}>
        <header>
          <h1>Learning summary</h1>
          <p className="muted">
            What the newcomer did on the unseen case, as assessed by the tutor. Decisions corrected after help are
            listed separately: they show useful assistance, not independent mastery.
          </p>
        </header>
        <SessionConnectionStatus source={source} sessionId={sessionId} />
        {!sessionId ? (
          <p className="state-message">No practice session selected. Save a decision on a practice case first.</p>
        ) : query.status === "loading" ? (
          <p className="state-message" aria-live="polite">
            Loading the learning summary…
          </p>
        ) : query.status === "error" ? (
          <p className="state-message error" role="alert">
            Could not load the learning summary: {query.error}
          </p>
        ) : query.data ? (
          <Assessment view={query.data} />
        ) : null}
      </section>
    </>
  );
}

const GROUPS = [
  {
    key: "independent",
    icon: "✓",
    title: "Done independently",
    hint: "Decided without hints or corrections.",
  },
  {
    key: "assisted",
    icon: "↺",
    title: "Needed help",
    hint: "Corrected or completed after guidance. Shows assistance, not independent mastery.",
  },
  {
    key: "unresolved",
    icon: "?",
    title: "Unresolved",
    hint: "Not settled, or should be escalated.",
  },
] as const;

function Assessment({ view }: { view: AssessmentView }) {
  const groups = summaryGroups(view);
  if (groups.empty)
    return <p className="state-message">No assessment yet. It appears after a reviewed decision is saved.</p>;

  return (
    <>
      <div className={styles.groups}>
        {GROUPS.map(g => (
          <section key={g.key} className={styles.group} data-group={g.key} aria-labelledby={`group-${g.key}`}>
            <h2 id={`group-${g.key}`}>
              <span aria-hidden="true" className={styles.icon}>
                {g.icon}
              </span>{" "}
              {g.title} <span className={styles.count}>({groups[g.key].length})</span>
            </h2>
            <p className={styles.hint}>{g.hint}</p>
            {groups[g.key].length === 0 ? (
              <p className={styles.none}>None recorded.</p>
            ) : (
              <ul className={styles.items}>
                {groups[g.key].map((item, i) => (
                  <Item key={i} item={item} showHelp={g.key === "assisted"} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className={styles.group} data-group="practice_next" aria-labelledby="group-practice-next">
        <h2 id="group-practice-next">
          <span aria-hidden="true" className={styles.icon}>
            →
          </span>{" "}
          What to practise next
        </h2>
        {groups.practice_next.length === 0 ? (
          <p className={styles.none}>No suggestion recorded.</p>
        ) : (
          <ul className={styles.items}>
            {groups.practice_next.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </section>

      {view.limitations?.length ? (
        <section className={styles.limitations} aria-labelledby="limitations">
          <h2 id="limitations">What this summary cannot show</h2>
          <ul>
            {view.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function Item({ item, showHelp }: { item: AssessmentItem; showHelp: boolean }) {
  const help = item.interventions ?? [];
  return (
    <li className={styles.item}>
      <p className={styles.description}>
        <span className={styles.tag}>Tutor assessment</span> {item.description}
      </p>
      {showHelp ? (
        <div className={styles.help}>
          <h3>Help given</h3>
          {help.length === 0 ? (
            <p className={styles.none}>The intervention was not recorded.</p>
          ) : (
            <ul>
              {help.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {item.citations.length > 0 ? (
        <div className={styles.citations}>
          <h3>Expert knowledge cited</h3>
          <ul>
            {item.citations.map((c, i) => (
              <CitationLine key={`${c.entry_id}:${c.revision_id}:${i}`} citation={c} />
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}

function CitationLine({ citation }: { citation: Citation }) {
  return (
    <li>
      {citation.quote ? (
        <blockquote className={styles.quote}>
          <span className={styles.tag}>Expert</span> “{citation.quote.text}”
        </blockquote>
      ) : null}
      <Link href={mapHref(citation.entry_id, citation.revision_id)} data-entry={citation.entry_id}>
        Open the cited expert entry in the Work Map
      </Link>
    </li>
  );
}
