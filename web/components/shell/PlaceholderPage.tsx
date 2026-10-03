"use client";

import type { ReactNode } from "react";
import { FixtureBanner } from "@/components/shell/FixtureBanner";
import { useSourceQuery } from "@/lib/data/DataSourceProvider";
import type { DataSource } from "@/lib/data/source";
import type { DataOrigin } from "@/lib/ui/contracts";

type PlaceholderPageProps<T extends { source: DataOrigin }> = {
  title: string;
  sprint: string;
  description: string;
  queryKey: string;
  load: (source: DataSource) => Promise<T>;
  /** One-line summary of what the data source returned, to prove the wiring. */
  summarize: (data: T) => ReactNode;
};

/** Stand-in for a screen a later sprint delivers; already loads its view through the DataSource. */
export function PlaceholderPage<T extends { source: DataOrigin }>({
  title,
  sprint,
  description,
  queryKey,
  load,
  summarize,
}: PlaceholderPageProps<T>) {
  const query = useSourceQuery(queryKey, load);

  return (
    <>
      <FixtureBanner source={query.status === "ready" ? query.data.source : undefined} />
      <section className="placeholder">
        <h1>{title}</h1>
        <p>
          <span className="sprint-tag">Delivered in {sprint}</span>
        </p>
        <p className="muted">{description}</p>
        {query.status === "loading" ? (
          <p className="state-message" aria-live="polite">
            Loading…
          </p>
        ) : query.status === "error" ? (
          <p className="state-message error" role="alert">
            Could not load data: {query.error}
          </p>
        ) : (
          <p className="state-message">{summarize(query.data)}</p>
        )}
      </section>
    </>
  );
}
