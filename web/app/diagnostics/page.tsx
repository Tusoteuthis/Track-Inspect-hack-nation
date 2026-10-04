"use client";

// WS6 dev tool (not WS7's UI): renders /api/health and /api/diagnostics. IDs and timings only.
import { useCallback, useEffect, useState } from "react";

type Json = Record<string, unknown>;

async function getJson(url: string): Promise<{ status: number; body: Json | null }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return { status: res.status, body: (await res.json().catch(() => null)) as Json | null };
  } catch {
    return { status: 0, body: null };
  }
}

const cell: React.CSSProperties = { border: "1px solid #ccc", padding: "2px 6px", verticalAlign: "top", fontSize: 13 };
const mono: React.CSSProperties = { fontFamily: "ui-monospace, monospace", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" };

function ComponentTable({ components, failing }: { components: Json; failing: string[] }) {
  const rows = Object.entries(components) as [string, Json][];
  if (!rows.length) return <p>No diagnostics lines yet.</p>;
  return (
    <table style={{ borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["component", "requests", "errors", "last ok", "last error"].map(h => (
            <th key={h} style={cell}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([name, s]) => {
          const err = s.last_error as Json | null;
          return (
            <tr key={name} style={failing.includes(name) ? { background: "#fdd" } : undefined}>
              <td style={cell}>{failing.includes(name) ? `⚠ ${name}` : name}</td>
              <td style={cell}>{String(s.requests)}</td>
              <td style={cell}>{String(s.errors)}</td>
              <td style={cell}>{String(s.last_ok_at_utc ?? "—")}</td>
              <td style={{ ...cell, ...mono }}>{err ? `${err.at_utc} ${err.op ?? ""} ${err.error_code ?? ""} ${JSON.stringify(err.ids)}` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function DiagnosticsPage() {
  const [health, setHealth] = useState<{ status: number; body: Json | null } | null>(null);
  const [overview, setOverview] = useState<Json | null>(null);
  const [sid, setSid] = useState("");
  const [session, setSession] = useState<{ status: number; body: Json | null } | null>(null);

  const refresh = useCallback(async () => {
    setHealth(await getJson("/api/health"));
    setOverview((await getJson("/api/diagnostics")).body);
    if (sid) setSession(await getJson(`/api/diagnostics?session_id=${encodeURIComponent(sid)}`));
  }, [sid]);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("session_id");
    if (initial) setSid(initial);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const h = health?.body;
  const sessions = (overview?.sessions as Json[] | undefined) ?? [];
  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <h1>WS6 diagnostics</h1>
      <p>
        Dev tool. IDs, statuses and timings only — never content. <button onClick={() => void refresh()}>Refresh</button>
      </p>

      <section>
        <h2>Health {health ? `(${health.status === 0 ? "backend unreachable" : `HTTP ${health.status}`})` : ""}</h2>
        {h ? (
          <>
            <ul>
              <li>storage: knowledge dir writable {String(h.knowledge_dir_writable)}, runtime dir writable {String(h.runtime_dir_writable)}</li>
              <li style={mono}>modules: {JSON.stringify(h.modules)}</li>
              <li style={mono}>elevenlabs: {JSON.stringify(h.elevenlabs)}</li>
              <li>access token required: {String(h.access_token_required)}</li>
              <li>
                failing components: <strong>{((h.failing_components as string[]) ?? []).join(", ") || "none"}</strong>
              </li>
            </ul>
            <ComponentTable components={(h.components as Json) ?? {}} failing={(h.failing_components as string[]) ?? []} />
          </>
        ) : (
          <p>{health?.status === 0 ? "The backend did not answer: is `npm run dev -- -p 3006` running?" : "Loading…"}</p>
        )}
      </section>

      <section>
        <h2>Session</h2>
        <label>
          session_id{" "}
          <input value={sid} onChange={e => setSid(e.target.value.trim())} size={40} list="ws6-sessions" />
        </label>
        <datalist id="ws6-sessions">
          {sessions.map(s => (
            <option key={String(s.session_id)} value={String(s.session_id)}>{`${s.role} ${s.lifecycle}`}</option>
          ))}
        </datalist>
        <table style={{ borderCollapse: "collapse", marginTop: 8 }}>
          <tbody>
            {sessions.slice(0, 20).map(s => (
              <tr key={String(s.session_id)}>
                <td style={cell}>
                  <a href={`?session_id=${String(s.session_id)}`} onClick={e => (e.preventDefault(), setSid(String(s.session_id)))}>
                    {String(s.session_id)}
                  </a>
                </td>
                <td style={cell}>{String(s.role)}</td>
                <td style={cell}>{String(s.lifecycle)}</td>
                <td style={cell}>{String(s.created_at_utc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {session?.body ? (
          <>
            <h3>
              {String(session.body.role ?? "")} {String(session.body.session_id ?? "")} — failing:{" "}
              {((session.body.failing_components as string[]) ?? []).join(", ") || "none"}
            </h3>
            <ComponentTable components={(session.body.components as Json) ?? {}} failing={(session.body.failing_components as string[]) ?? []} />
            <h3>ID chain</h3>
            <pre style={mono}>{JSON.stringify(session.body.chain ?? session.body, null, 2)}</pre>
            <h3>Timeline (diag log)</h3>
            <pre style={mono}>{JSON.stringify(session.body.timeline ?? [], null, 1)}</pre>
          </>
        ) : null}
      </section>
    </div>
  );
}
