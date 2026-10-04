"use client";

import { useConversationControls, useConversationStatus } from "@elevenlabs/react";
import { type ReactNode, useState } from "react";
import type { ExpertExchange, TimingMark } from "@/lib/expert/contracts";
import { FIXTURE_EVENTS } from "@/lib/expert/fixtures";
import type { ExpertSession, SaveStatus } from "./useExpertSession";

type Props = {
  session: ExpertSession;
  /** Free-text contextual-update sender, shown behind the "raw" toggle. */
  raw?: ReactNode;
};

const time = (iso: string) => iso.slice(11, 23);

/**
 * Dev console for the expert flow: inject fixture pointing events and watch the
 * event ↔ question ↔ answer linkage, timing marks and save state live.
 * Must render inside VoiceSession (uses the conversation controls).
 */
export function ExpertConsole({ session, raw }: Props) {
  const { sendContextualUpdate } = useConversationControls();
  const { status } = useConversationStatus();
  const [showRaw, setShowRaw] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const { state, save } = session;
  const connected = status === "connected";

  return (
    <section className="expert-console" aria-label="Expert dev console">
      <header className="ec-head">
        <div>
          <span className="ec-k">Session</span> <code>{state?.session_id ?? "— (starts on connect)"}</code>
          {state?.conversation_id ? (
            <span className="ec-muted"> · conv {state.conversation_id}</span>
          ) : null}
        </div>
        <SaveBadge save={save} onRetry={() => void session.retrySave()} />
      </header>

      <div>
        <h2 className="ec-h">Pointing events</h2>
        <p className="ec-muted ec-small">
          Simulated gestures. Each click sends a contextual update (no forced reply) and is recorded as{" "}
          <code>source: &quot;fixture&quot;</code>.
        </p>
        <div className="ec-fixtures">
          {FIXTURE_EVENTS.map(f => (
            <button
              key={f.event_id}
              type="button"
              className="ec-fixture"
              disabled={!connected}
              onClick={() => {
                setDeliverError(null);
                try {
                  session.deliverFixture(f, sendContextualUpdate);
                } catch (e) {
                  setDeliverError(e instanceof Error ? e.message : String(e));
                }
              }}
              title={f.label}
            >
              <img src={f.highlighted_image_ref} alt="" width={120} height={68} />
              <span className="ec-badge fixture">FIXTURE</span>
              <strong>{f.event_id}</strong>
              <span className="ec-muted ec-small">
                {f.mapping_status} · {f.channel_id ?? "?"} · {f.record_state === "off_record" ? "OFF-RECORD" : "on record"}
              </span>
            </button>
          ))}
        </div>
        {!connected ? <p className="ec-muted ec-small">Start the conversation to send events.</p> : null}
        {deliverError ? <p role="alert" className="voice-error">{deliverError}</p> : null}
      </div>

      {state ? (
        <>
          <div>
            <h2 className="ec-h">Events received ({state.events.length})</h2>
            <ul className="ec-list">
              {state.events.map(e => (
                <li key={e.event_id}>
                  <code>{e.event_id}</code>{" "}
                  <span className={`ec-badge ${e.source}`}>{e.source === "fixture" ? "FIXTURE" : "LIVE"}</span>{" "}
                  <span className="ec-muted">
                    {e.mapping_status} · {e.channel_id ?? "unknown"} · {e.record_state}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="ec-h">
              Exchanges ({state.exchanges.length})
              {state.unlinked_agent_questions.length ? (
                <span className="ec-badge warn"> {state.unlinked_agent_questions.length} unlinked</span>
              ) : null}
            </h2>
            {state.exchanges.map(x => (
              <ExchangeCard key={x.exchange_id} exchange={x} active={x.exchange_id === state.active_exchange_id} />
            ))}
            {state.unlinked_agent_questions.map(q => (
              <div key={q.line_id} className="ec-card unlinked">
                <div className="ec-small">
                  <span className="ec-badge warn">UNLINKED</span> agent asked without <code>begin_question</code> ·{" "}
                  {time(q.at_utc)}
                </div>
                <div>{q.text}</div>
              </div>
            ))}
            {state.preamble.length ? (
              <p className="ec-muted ec-small">Preamble: {state.preamble.length} expert line(s) before any question.</p>
            ) : null}
          </div>

          <div>
            <h2 className="ec-h">Timing marks ({state.timing.length})</h2>
            <TimingTable marks={state.timing} />
          </div>
        </>
      ) : null}

      <div className="ec-raw">
        <label className="ec-small">
          <input type="checkbox" checked={showRaw} onChange={e => setShowRaw(e.target.checked)} /> raw contextual
          update (dev)
        </label>
        {showRaw ? raw : null}
      </div>
    </section>
  );
}

function ExchangeCard({ exchange: x, active }: { exchange: ExpertExchange; active: boolean }) {
  return (
    <div className={`ec-card${active ? " active" : ""}`}>
      <div className="ec-small">
        <code>{x.exchange_id}</code> ↔ <code>{x.event_id ?? "no event"}</code> · {x.kind}
        {x.source === "fixture" ? <span className="ec-badge fixture">FIXTURE</span> : null}
        {active ? <span className="ec-badge live">ACTIVE</span> : null}
      </div>
      <div className="ec-q">{x.question || <em className="ec-muted">question not spoken yet…</em>}</div>
      {x.question_planned ? <div className="ec-muted ec-small">planned: {x.question_planned}</div> : null}
      {x.answer_lines.length ? (
        <blockquote className="ec-answer">
          {x.answer_lines.map(l => (
            <p key={l.transcript_line_id}>{l.text}</p>
          ))}
        </blockquote>
      ) : (
        <div className="ec-muted ec-small">no answer yet</div>
      )}
    </div>
  );
}

function TimingTable({ marks }: { marks: TimingMark[] }) {
  if (!marks.length) return <p className="ec-muted ec-small">none yet</p>;
  const t0 = marks[0].at_perf_ms;
  return (
    <table className="ec-table">
      <thead>
        <tr>
          <th>mark</th>
          <th>event</th>
          <th>exchange</th>
          <th>utc</th>
          <th>+ms</th>
        </tr>
      </thead>
      <tbody>
        {marks.map((m, i) => (
          <tr key={i}>
            <td>{m.mark}</td>
            <td>{m.event_id ?? "—"}</td>
            <td>{m.exchange_id ?? "—"}</td>
            <td>{time(m.at_utc)}</td>
            <td>{Math.round(m.at_perf_ms - t0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SaveBadge({ save, onRetry }: { save: SaveStatus; onRetry: () => void }) {
  switch (save.status) {
    case "idle":
      return <span className="ec-muted ec-small">not saved yet</span>;
    case "saving":
      return <span className="ec-small">saving…</span>;
    case "saved":
      return <span className="ec-small ec-ok">saved {time(save.at)}</span>;
    case "error":
      return (
        <span role="alert" className="ec-small ec-err">
          save failed: {save.message}{" "}
          <button type="button" onClick={onRetry}>
            retry
          </button>
        </span>
      );
  }
}
