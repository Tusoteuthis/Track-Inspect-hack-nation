"use client";

import { useConversationControls, useConversationInput, useConversationStatus } from "@elevenlabs/react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { deriveCompletion } from "@/lib/expert/completion";
import { currentSegment } from "@/lib/expert/record-state";
import { COVERAGE_DIMENSIONS, type ExpertExchange, type InterviewConfig, type TimingMark, type Topic } from "@/lib/expert/contracts";
import { coverageGrid } from "@/lib/expert/coverage";
import { activeConfirmations, diffRevisions, stepVerification } from "@/lib/expert/draft";
import { FIXTURE_EVENTS } from "@/lib/expert/fixtures";
import { DEFAULT_SCENARIO, formatScenarioOffsets, parseScenarioOffsets } from "@/lib/expert/scenario";
import type { SessionState } from "@/lib/expert/session";
import { exchangeTimings, liveCounters } from "@/lib/expert/timing";
import type { ConversationIo, ExpertSession, GateStatus, SaveStatus } from "./useExpertSession";

type Props = {
  session: ExpertSession;
  /** Free-text contextual-update sender, shown behind the "raw" toggle. */
  raw?: ReactNode;
};

const time = (iso: string) => iso.slice(11, 23);
const TICK_MS = 200;
/** Tuned live in the human gate; stored with the session (interview_config). */
const TUNABLES: [keyof InterviewConfig, number][] = [
  ["pause_ms", 100],
  ["nudge_after_ms", 500],
  ["mic_threshold", 0.01],
];

/**
 * Dev console for the expert flow: inject fixture pointing events, watch the topic
 * queue and pause gate, the event ↔ question ↔ answer linkage, timing and save state.
 * Must render inside VoiceSession (uses the conversation controls); it also drives the
 * release controller tick.
 */
export function ExpertConsole({ session, raw }: Props) {
  const { sendContextualUpdate, sendUserMessage, getInputVolume, sendUserActivity } = useConversationControls();
  const { setMuted } = useConversationInput();
  const { status } = useConversationStatus();
  const [showRaw, setShowRaw] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [offsets, setOffsets] = useState(formatScenarioOffsets(DEFAULT_SCENARIO));
  const [muteWhileOff, setMuteWhileOff] = useState(false);
  const { state, save, tick } = session;
  const connected = status === "connected";
  const io = useMemo<ConversationIo>(
    () => ({ sendContextualUpdate, sendUserMessage, getInputVolume, sendUserActivity }),
    [sendContextualUpdate, sendUserMessage, getInputVolume, sendUserActivity]
  );
  const offRecord = state ? currentSegment(state).state === "off_record" : false;

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => tick(io), TICK_MS);
    return () => clearInterval(id);
  }, [connected, tick, io]);

  // Optional: mute the mic while off the record, so that audio never reaches ElevenLabs
  // (capabilities doc (f); unverified in voice). A muted expert must use the console to resume.
  useEffect(() => {
    if (!connected) return;
    try {
      setMuted(offRecord && muteWhileOff);
    } catch {
      // not connected yet
    }
  }, [connected, offRecord, muteWhileOff, setMuted]);

  const parsedOffsets = parseScenarioOffsets(offsets);

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

      {state ? <Counters state={state} /> : null}
      {state ? (
        <PhaseBar
          state={state}
          connected={connected}
          onEndTask={() => session.endTask(io)}
          onTeachBack={() => session.startTeachBack(io)}
        />
      ) : null}
      {state ? (
        <TrustPanel session={session} state={state} io={io} connected={connected} muteWhileOff={muteWhileOff} setMuteWhileOff={setMuteWhileOff} />
      ) : null}
      {state?.ended_at_utc ? <CompletionPanel session={session} state={state} connected={connected} /> : null}
      <GateLine gate={connected ? session.gate : null} />

      <div className="ec-controls">
        {TUNABLES.map(([key, step]) => (
          <label key={key} className="ec-small">
            {key}{" "}
            <input
              type="number"
              min={0}
              step={step}
              value={session.config[key]}
              onChange={e => session.setConfig({ [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="ec-small">
          scenario offsets (s) <span className="ec-muted">evt-001, evt-003, evt-002, evt-004</span>{" "}
          <input value={offsets} onChange={e => setOffsets(e.target.value)} disabled={session.scenario.running} />
        </label>
        {session.scenario.running ? (
          <button type="button" onClick={session.cancelScenario}>
            Cancel scenario ({session.scenario.delivered.length}/{session.scenario.total})
          </button>
        ) : (
          <button
            type="button"
            disabled={!connected || !parsedOffsets.ok}
            onClick={() => parsedOffsets.ok && session.runScenario(parsedOffsets.value)}
          >
            Run fixture scenario
          </button>
        )}
        {!parsedOffsets.ok ? <span className="ec-small ec-err">{parsedOffsets.errors.join("; ")}</span> : null}
      </div>

      <div>
        <h2 className="ec-h">Pointing events</h2>
        <p className="ec-muted ec-small">
          Simulated gestures, recorded as <code>source: &quot;fixture&quot;</code>. Each becomes a topic; the agent
          hears about it only when the expert pauses.
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
                  session.deliverFixture(f);
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
            <h2 className="ec-h">Topics ({state.topics.length})</h2>
            <TopicList topics={state.topics} />
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

          {state.phase !== "live" || state.coverage.length ? <DebriefPanels state={state} /> : null}

          <div>
            <h2 className="ec-h">Timing per question</h2>
            <ExchangeTimingTable state={state} />
            <details>
              <summary className="ec-small">All timing marks ({state.timing.length})</summary>
              <TimingTable marks={state.timing} />
            </details>
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
        <code>{x.exchange_id}</code> ↔ <code>{x.event_id ?? "no event"}</code>
        {x.related_event_ids.length ? <span className="ec-muted"> (+{x.related_event_ids.join(", ")})</span> : null} · {x.kind}
        {x.phase !== "live" ? <span className="ec-badge">{x.phase.replace("_", "-")}</span> : null}
        {x.gap_id ? <span className="ec-muted"> · {x.gap_id}</span> : null}
        {x.revision_id ? <span className="ec-muted"> · {x.revision_id}</span> : null}
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

/** Counters derived from the stored records (the same function writes session.json). */
function Counters({ state }: { state: SessionState }) {
  const c = liveCounters(state);
  const items: [string, number, boolean][] = [
    ["live questions", c.live_questions, false],
    ["guardrail", c.guardrail_questions, false],
    ["deferred topics", c.deferred_topics, false],
    ["unlinked", c.unlinked_agent_questions, c.unlinked_agent_questions > 0],
    ["interruptions", c.interruptions, c.interruptions > 0],
    ["duplicates", c.duplicate_questions, c.duplicate_questions > 0],
    ["debrief questions", c.debrief_questions, false],
  ];
  return (
    <div className="ec-counters" aria-label="Live counters">
      {items.map(([label, n, bad]) => (
        <span key={label} className={bad ? "ec-err" : undefined}>
          <strong>{n}</strong> {label}
        </span>
      ))}
    </div>
  );
}

const REASON_TEXT: Record<string, string> = {
  agent_speaking: "agent speaking",
  user_speaking: "expert speaking",
  pause_not_reached: "pause not reached",
  topic_open: "previous topic still open",
  nothing_queued: "nothing queued",
  budget: "budget used up → debrief",
  moved_on: "expert moved on → debrief",
  release_timeout: "not asked in time → debrief",
};

function GateLine({ gate }: { gate: GateStatus | null }) {
  if (!gate) return <p className="ec-small ec-muted">Release gate: idle (not connected)</p>;
  const quiet = gate.quiet_ms < 0 ? "no speech yet" : `quiet ${gate.quiet_ms} ms`;
  return (
    <p className="ec-small ec-gate" aria-live="off">
      Release gate: <strong>{gate.decision}</strong>
      {gate.reasons.length ? ` (${gate.reasons.map(r => REASON_TEXT[r] ?? r).join(", ")})` : ""} ·{" "}
      {gate.expert_speaking ? "expert speaking" : quiet} · budget {gate.budget.used}/{gate.budget.max}
    </p>
  );
}

function TopicList({ topics }: { topics: Topic[] }) {
  if (!topics.length) return <p className="ec-muted ec-small">none yet</p>;
  return (
    <ul className="ec-list">
      {topics.map(t => (
        <li key={t.topic_id}>
          <code>{t.topic_id}</code> {t.primary_event_id}
          {t.alias_event_ids.length ? <span className="ec-muted"> + duplicates {t.alias_event_ids.join(", ")}</span> : null} ·{" "}
          <span className={`ec-state ${t.state}`}>{t.state.replaceAll("_", " ")}</span>
          {t.requires_clarification ? <span className="ec-muted"> · clarify first</span> : null}
          {t.stale_at_release ? <span className="ec-muted"> · released stale</span> : null}
          {t.nudged_at_perf_ms !== null ? <span className="ec-muted"> · nudged</span> : null}
          {t.deferred_reason ? <span className="ec-muted"> · {t.deferred_reason}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function ExchangeTimingTable({ state }: { state: SessionState }) {
  const rows = exchangeTimings(state);
  if (!rows.length) return <p className="ec-muted ec-small">no questions yet</p>;
  const ms = (v: number | null) => (v === null ? "—" : v);
  return (
    <table className="ec-table">
      <thead>
        <tr>
          <th>exchange</th>
          <th>kind</th>
          <th>processing</th>
          <th>intentional wait</th>
          <th>release→tool</th>
          <th>tool→speech</th>
          <th>notes</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.exchange_id}>
            <td>
              {r.exchange_id} · {r.event_id ?? "—"}
            </td>
            <td>{r.kind}</td>
            <td>{ms(r.processing_ms)}</td>
            <td>{ms(r.intentional_wait_ms)}</td>
            <td>{ms(r.release_to_tool_ms)}</td>
            <td>{ms(r.tool_to_speech_ms)}</td>
            <td>
              {[r.follow_up && "follow-up", !r.follow_up && !r.released && "not released", r.stale && "stale", r.nudged && "nudged"]
                .filter(Boolean)
                .join(", ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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

const PHASES = ["live", "debrief", "teach_back", "confirmed"] as const;

function PhaseBar({
  state,
  connected,
  onEndTask,
  onTeachBack,
}: {
  state: SessionState;
  connected: boolean;
  onEndTask: () => void;
  onTeachBack: () => void;
}) {
  const latest = state.revisions.at(-1);
  const final = latest && activeConfirmations(state).find(c => c.revision_id === latest.revision_id && c.status === "confirmed");
  return (
    <div className="ec-controls" aria-label="Phase">
      <span className="ec-small">
        Phase:{" "}
        {state.phase === "incomplete" ? (
          <strong className="ec-err">incomplete (ended without confirmation)</strong>
        ) : (
          PHASES.map(p => (
            <span key={p} className={p === state.phase ? "ec-badge live" : "ec-muted"}>
              {" "}
              {p.replace("_", "-")}{" "}
            </span>
          ))
        )}
      </span>
      <span className="ec-small">
        Confirmation:{" "}
        {final ? (
          <strong className="ec-ok">
            {final.revision_id} confirmed ({final.confirmation_id}, {final.expert_response_exchange_id})
          </strong>
        ) : latest ? (
          <strong>{latest.revision_id} not confirmed</strong>
        ) : (
          "—"
        )}
      </span>
      <button type="button" disabled={!connected || state.phase !== "live"} onClick={onEndTask}>
        Expert is done → debrief
      </button>
      <button type="button" disabled={!connected || state.phase !== "debrief"} onClick={onTeachBack} title="Builds a deterministic draft from verbatim answers; normally the agent proposes it">
        Start teach-back (fallback draft)
      </button>
    </div>
  );
}

const STATUS_MARK: Record<string, string> = { missing: "·", partial: "½", covered: "✓" };

function DebriefPanels({ state }: { state: SessionState }) {
  const grid = coverageGrid(state);
  const rows = [...new Set(grid.map(c => c.event_id))];
  const verification = stepVerification(state.revisions, activeConfirmations(state));
  const done = state.debrief_agenda.filter(i => i.state !== "open").length;
  return (
    <>
      <div>
        <h2 className="ec-h">Coverage (event × dimension)</h2>
        <table className="ec-table">
          <thead>
            <tr>
              <th>event</th>
              {COVERAGE_DIMENSIONS.map(d => (
                <th key={d}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row ?? "session"}>
                <td>{row ?? "session"}</td>
                {COVERAGE_DIMENSIONS.map(d => {
                  const c = grid.find(g => g.event_id === row && g.dimension === d)!;
                  const title = [c.status, c.resolution, c.supporting_exchange_ids.join(", "), c.note && `AI note: ${c.note}`].filter(Boolean).join(" · ");
                  return (
                    <td key={d} title={title} className={c.status === "covered" ? "ec-ok" : undefined}>
                      {STATUS_MARK[c.status]}
                      {c.resolution === "unknown_escalate" ? " ⚠" : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ec-muted ec-small">· missing · ½ partial · ✓ covered · ⚠ expert: unknown / escalate. Hover for exchanges and the AI note.</p>
      </div>

      {state.debrief_agenda.length ? (
        <div>
          <h2 className="ec-h">
            Debrief agenda ({done}/{state.debrief_agenda.length} done)
          </h2>
          <ul className="ec-list">
            {state.debrief_agenda.map(i => (
              <li key={i.gap_id}>
                <span className={`ec-state ${i.state}`}>{i.state}</span> <code>{i.gap_id}</code> {i.description}
                {i.exchange_ids.length ? <span className="ec-muted"> · {i.exchange_ids.join(", ")}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.revisions.length ? (
        <div>
          <h2 className="ec-h">Revisions ({state.revisions.length})</h2>
          {state.revisions.map(rev => {
            const parent = state.revisions.find(r => r.revision_id === rev.parent_revision_id) ?? null;
            const diff = diffRevisions(parent, rev);
            const isLatest = rev === state.revisions.at(-1);
            return (
              <div key={rev.revision_id} className="ec-card">
                <div className="ec-small">
                  <strong>{rev.revision_id}</strong>
                  {parent ? ` ← ${parent.revision_id} · ${rev.change_reason ?? ""}` : ""}
                  {parent ? (
                    <span className="ec-muted">
                      {" "}
                      · changed {diff.added.join(", ") || "—"} · removed {diff.removed.join(", ") || "—"}
                    </span>
                  ) : null}
                </div>
                <ol className="ec-small">
                  {rev.steps.map(st => (
                    <li key={st.step_id} className={diff.added.includes(st.step_id) && parent ? "ec-ok" : undefined}>
                      <code>{st.step_id}</code> ({st.kind}){!st.supported ? <span className="ec-err"> UNSUPPORTED</span> : null}{" "}
                      {isLatest ? <span className="ec-muted">[{verification[st.step_id]}]</span> : null} {st.text}{" "}
                      <span className="ec-muted">
                        · {st.supporting_event_ids.join(", ") || "no event"} · {st.supporting_exchange_ids.join(", ") || "no exchange"}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
      ) : null}

      {state.confirmations.length ? (
        <div>
          <h2 className="ec-h">Confirmations</h2>
          <ul className="ec-list">
            {state.confirmations.map(c => (
              <li key={c.confirmation_id}>
                <code>{c.confirmation_id}</code> {c.revision_id} · <strong>{c.status}</strong> · response {c.expert_response_exchange_id} · steps{" "}
                {c.step_ids_reviewed.join(", ") || "—"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/**
 * Off-record and strike controls, the acknowledged record state (the stored segment, not a local
 * toggle), what was excluded, and the ElevenLabs-side retention status.
 */
function TrustPanel({
  session,
  state,
  io,
  connected,
  muteWhileOff,
  setMuteWhileOff,
}: {
  session: ExpertSession;
  state: SessionState;
  io: ConversationIo;
  connected: boolean;
  muteWhileOff: boolean;
  setMuteWhileOff: (on: boolean) => void;
}) {
  const seg = currentSegment(state);
  const off = seg.state === "off_record";
  const segments = state.recording_segments.filter(s => s.state === "off_record");
  const x = state.off_record_excluded;
  const [strikeResult, setStrikeResult] = useState<string | null>(null);
  const running = !state.ended_at_utc;
  return (
    <div className="ec-card" aria-label="Record state">
      <div className="ec-controls">
        <span className="ec-small">
          Record state:{" "}
          <strong className={off ? "ec-err" : "ec-ok"}>{off ? "OFF THE RECORD" : "on the record"}</strong>{" "}
          <span className="ec-muted">
            (acknowledged · since {time(seg.started_at_utc)} · {seg.trigger.replace("_", " ")})
          </span>
        </span>
        <button type="button" disabled={!running} onClick={() => session.setRecordState(io, off ? "on_record" : "off_record")}>
          {off ? "Back on the record" : "Go off the record"}
        </button>
        <label className="ec-small">
          <input type="checkbox" checked={muteWhileOff} onChange={e => setMuteWhileOff(e.target.checked)} /> mute mic while off the record
        </label>
        <button
          type="button"
          disabled={!running || off}
          onClick={() => setStrikeResult(session.strikeLast(io))}
          title="Removes the expert's last answer from every record; dependent revisions are superseded"
        >
          Strike last answer
        </button>
      </div>
      {off && muteWhileOff && connected ? (
        <p className="ec-small ec-err">Mic muted: the expert cannot be heard. Use “Back on the record” to resume.</p>
      ) : null}
      {strikeResult ? <p className="ec-small ec-muted">Strike: {strikeResult}</p> : null}
      <p className="ec-small ec-muted">
        {segments.length} off-record segment(s) · dropped {x.transcript_lines} line(s), {x.events} event(s), {x.timing_marks} mark(s) · refused{" "}
        {x.refused_tool_calls} tool call(s) · {state.strikes.length} strike(s)
        {state.strikes.length
          ? ` (${state.strikes.map(s => `${s.exchange_id}${s.invalidated_confirmation_ids.length ? `, invalidated ${s.invalidated_confirmation_ids.join(", ")}` : ""}`).join("; ")})`
          : ""}
      </p>
      <ul className="ec-list ec-small">
        {segments.map(s => (
          <li key={s.segment_id}>
            off-record segment from {time(s.started_at_utc)} to {s.ended_at_utc ? time(s.ended_at_utc) : "now"} (content excluded)
          </li>
        ))}
      </ul>
      <ElevenLabsRetention session={session} state={state} />
    </div>
  );
}

function ElevenLabsRetention({ session, state }: { session: ExpertSession; state: SessionState }) {
  const hadOff = state.recording_segments.some(s => s.state === "off_record");
  const d = session.deletion;
  const last = state.elevenlabs_deletions.at(-1);
  return (
    <div className="ec-small">
      <p className="ec-muted">
        ElevenLabs side: the conversation audio and transcript are stored by ElevenLabs under the shared agent&apos;s
        default retention (record_voice on, no retention limit set; not changed here). Off-record words are excluded
        locally; ElevenLabs cannot delete part of a conversation, so the session&apos;s whole conversation is deleted
        after it ends. See notes/ws3-sprints/docs/trust.md.
      </p>
      <label>
        <input type="checkbox" checked={session.autoDelete} onChange={e => session.setAutoDelete(e.target.checked)} /> delete this
        session&apos;s ElevenLabs conversation(s) when it ends, if it went off the record
      </label>{" "}
      <button
        type="button"
        disabled={!state.ended_at_utc || !hadOff || d.status === "running"}
        onClick={() => void session.deleteConversations()}
        title={!hadOff ? "Only for sessions with an off-record segment" : !state.ended_at_utc ? "Stop the session first" : undefined}
      >
        Delete ElevenLabs conversation(s) now
      </button>
      {d.status === "running" ? <span> deleting…</span> : null}
      {d.status === "error" ? <span className="ec-err"> deletion failed: {d.message}</span> : null}
      {last ? (
        <span className={last.results.every(r => r.status !== "failed") ? "ec-ok" : "ec-err"}>
          {" "}
          ElevenLabs deletion ({time(last.at_utc)}): {last.results.map(r => `${r.conversation_id} ${r.status}${r.detail ? ` (${r.detail})` : ""}`).join(", ")}
        </span>
      ) : hadOff ? (
        <span className="ec-err"> ElevenLabs conversation not deleted yet.</span>
      ) : null}
    </div>
  );
}

function CompletionPanel({ session, state, connected }: { session: ExpertSession; state: SessionState; connected: boolean }) {
  const c = deriveCompletion(state);
  const ev = session.evidence;
  return (
    <div className="ec-card" aria-label="Session completion">
      <div className="ec-small">
        <strong className={c.end_reason === "completed" ? "ec-ok" : "ec-err"}>
          {c.end_reason === "completed" ? `Completed: ${c.confirmed_revision_id} explicitly confirmed` : `${c.end_reason.toUpperCase()}: not everything was finished`}
        </strong>{" "}
        <span className="ec-muted">
          ended {time(c.ended_at_utc)} ({c.end_cause ?? "?"}) · {c.counts.live_questions} live ({c.counts.live_guardrail_questions} guardrail) ·{" "}
          {c.counts.debrief_questions} debrief · written to completion.json / completion.md
        </span>
      </div>
      {c.unfinished.length ? (
        <ul className="ec-list ec-small">
          {c.unfinished.map(u => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      ) : null}
      <div className="ec-controls">
        <button type="button" disabled={ev.status === "running"} onClick={() => void session.exportEvidence()}>
          Export demo evidence
        </button>
        {state.phase === "incomplete" && !connected ? (
          <button type="button" disabled={session.resumeArmed} onClick={session.armResume} title="Best effort: the next Start continues this session id in the same phase">
            {session.resumeArmed ? "Resume armed: press Start" : "Resume this session"}
          </button>
        ) : null}
      </div>
      {ev.status === "error" ? <p className="ec-small ec-err">Export failed: {ev.message}</p> : null}
      {ev.status === "done" ? (
        <div className="ec-small">
          <p className="ec-muted">Written to knowledge/sessions/{state.session_id}/{ev.value.file} (derived from the saved files).</p>
          <ul className="ec-list">
            {ev.value.checklist.map(r => (
              <li key={r.id}>
                <span className={r.ok ? "ec-ok" : "ec-err"}>{r.ok ? "✓" : "✗"}</span> {r.label} — <span className="ec-muted">{r.detail}</span>
              </li>
            ))}
          </ul>
          <details>
            <summary>demo-evidence.md</summary>
            <pre className="ec-pre">{ev.value.markdown}</pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
