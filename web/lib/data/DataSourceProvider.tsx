"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { fixtureSource } from "@/lib/data/fixtureSource";
import type { DataSource } from "@/lib/data/source";

const DataSourceContext = createContext<DataSource>(fixtureSource);

/** The one place that decides which source screens use (fixture now, WS6 api later). */
export function DataSourceProvider({
  source = fixtureSource,
  children,
}: {
  source?: DataSource;
  children: ReactNode;
}) {
  return <DataSourceContext.Provider value={source}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): DataSource {
  return useContext(DataSourceContext);
}

export type QueryState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; error: string };

/**
 * Loads one view from the current source. `key` identifies the request; a
 * response for an outdated key is dropped so a slow load can't overwrite newer state.
 */
export function useSourceQuery<T>(key: string, load: (source: DataSource) => Promise<T>) {
  const source = useDataSource();
  const [state, setState] = useState<{ key: string; value: QueryState<T> }>({
    key,
    value: { status: "loading" },
  });

  useEffect(() => {
    let current = true;
    load(source).then(
      data => current && setState({ key, value: { status: "ready", data } }),
      (error: unknown) =>
        current &&
        setState({
          key,
          value: { status: "error", error: error instanceof Error ? error.message : String(error) },
        })
    );
    return () => {
      current = false;
    };
    // `load` is expected to be an inline closure; `key` captures what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, source]);

  return state.key === key ? state.value : ({ status: "loading" } as QueryState<T>);
}
