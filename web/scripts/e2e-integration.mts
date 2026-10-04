/**
 * WS6 end-to-end integration check against a running backend (S4).
 *
 *   npm run e2e                                    # http://localhost:3006
 *   npm run e2e -- --base http://192.168.1.20:3006 --token "$BACKEND_ACCESS_TOKEN" --runtime-dir .runtime
 *
 * Runs the whole flow with labelled FIXTURE data: capture → exchanges → synthesis → teach-back
 * confirmation (+ correction) → Work Map → newcomer → wrong draft → intervene → blocked commit →
 * edit → ok → commit → assessment. On top: duplicate/retry injection at every write, an SSE
 * disconnect + resume, an off-record segment (drop + retroactive purge), a deletion mid-synthesis
 * and a revocation after evaluation. Prints a pass/fail table mapped to the acceptance criteria in
 * notes/06-backend-integration.md §10 and the ID chain of one event. Exit code 1 on any failure.
 * Output is IDs, statuses and codes only — never content.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const BASE = (arg("base") ?? "http://localhost:3006").replace(/\/$/, "");
const TOKEN = arg("token") ?? process.env.BACKEND_ACCESS_TOKEN?.trim() ?? "";
const RUNTIME_DIR = resolve(webDir, arg("runtime-dir") ?? process.env.RUNTIME_DIR ?? ".runtime");
const RUN = Date.now().toString(36);

// --- report ---------------------------------------------------------------------

const CRITERIA: Record<string, string> = {
  C1: "One pointing event traced through answer, confirmed entry, Work Map, newcomer feedback (stable IDs)",
  C2: "Images and evidence references resolve",
  C3: "Repeated delivery, disconnect and delayed processing do not duplicate or misattach",
  C4: "Confirmation applies only to the reviewed revision",
  C5: "A wrong learner decision is intercepted before save; pending/stale/changed drafts cannot bypass",
  C6: "Correction, deletion and off-record propagate to storage, pending work and eligibility",
  C7: "Evaluator-only answers and provider secrets are not accessible to clients",
  C8: "Startable from the docs; a failed component is identifiable without guessing",
};
type Row = { criterion: keyof typeof CRITERIA; check: string; pass: boolean; detail: string };
const rows: Row[] = [];
let currentStep = "start";

function check(criterion: Row["criterion"], name: string, pass: boolean, detail = ""): boolean {
  rows.push({ criterion, check: name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${criterion}  ${name}${detail ? `  — ${detail}` : ""}`);
  return pass;
}

// --- http -----------------------------------------------------------------------

// Response bodies are probed field by field and every check validates what it reads, so the
// script treats them as loose JSON instead of re-declaring every contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Res = { status: number; body: J; headers: Headers };

class Unreachable extends Error {}

async function call(method: string, path: string, init: { json?: unknown; form?: FormData; headers?: Record<string, string>; auth?: boolean } = {}): Promise<Res> {
  const headers: Record<string, string> = { ...init.headers };
  if (TOKEN && init.auth !== false) headers.Authorization = `Bearer ${TOKEN}`;
  let body: string | FormData | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) body = init.form;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body });
  } catch (err) {
    const c = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
    const cause = c?.code ?? c?.message ?? String(err);
    throw new Unreachable(`backend unreachable at ${BASE} during "${currentStep}" (${cause})`);
  }
  const text = await res.text();
  let parsed: J = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

const code = (r: Res): string => r.body?.error?.code ?? "-";
const policy = (r: Res): string => r.body?.error?.details?.policy_code ?? "-";
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function bytesStatus(url: string): Promise<number> {
  const headers: Record<string, string> = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  try {
    const res = await fetch(`${BASE}${url}`, { headers });
    await res.arrayBuffer();
    return res.status;
  } catch {
    return 0;
  }
}

async function until<T>(fn: () => Promise<T>, done: (v: T) => boolean, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!done(v) && Date.now() < end) {
    await sleep(100);
    v = await fn();
  }
  return v;
}

// --- SSE ------------------------------------------------------------------------

/** Reads `id:` seqs from the session stream until `count` arrive or `ms` pass, then disconnects. */
async function readSeqs(sid: string, opts: { lastEventId?: number; after?: number; count: number; ms?: number }): Promise<number[]> {
  const ctrl = new AbortController();
  const headers: Record<string, string> = { Accept: "text/event-stream" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  if (opts.lastEventId !== undefined) headers["Last-Event-ID"] = String(opts.lastEventId);
  const q = opts.after !== undefined ? `?after=${opts.after}` : "";
  const seqs: number[] = [];
  const timer = setTimeout(() => ctrl.abort(), opts.ms ?? 3000);
  try {
    const res = await fetch(`${BASE}/api/sessions/${sid}/stream${q}`, { headers, signal: ctrl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (seqs.length < opts.count) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) > -1) {
        const msg = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const id = /^id: (\d+)$/m.exec(msg)?.[1];
        if (id) seqs.push(Number(id));
      }
    }
  } catch {
    // aborted on timeout or by us
  } finally {
    clearTimeout(timer);
    ctrl.abort();
  }
  return seqs;
}

// --- fixtures -------------------------------------------------------------------

const FRAME = { width_px: 320, height_px: 180 };
const png = (name: string) => new Blob([readFileSync(join(webDir, "fixtures", "ws6", name))], { type: "image/png" });
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();

function assetForm(capturedAt: string, eventId: string | null, recordState: "on_record" | "off_record" = "on_record"): FormData {
  const form = new FormData();
  form.set("meta", JSON.stringify({ kind: "frame", captured_at_utc: capturedAt, source: "fixture", event_id: eventId, record_state: recordState, original: FRAME, highlighted: FRAME }));
  form.set("original", png("fixture-frame.png"), "original.png");
  form.set("highlighted", png("fixture-frame-highlighted.png"), "highlighted.png");
  return form;
}

function event(sid: string, eid: string, aid: string, capturedAt: string, sessionTimeMs: number) {
  return {
    schema_version: "ws3.v0",
    session_id: sid,
    event_id: eid,
    source: "fixture",
    captured_at_utc: capturedAt,
    session_time_ms: sessionTimeMs,
    frame_id: `frame-${eid}`,
    image_ref: "placeholder",
    highlighted_image_ref: "placeholder",
    region: { x: 0.2, y: 0.15, width: 0.15, height: 0.25, coordinate_space: "original_frame_normalized", ...{ frame_width_px: 320, frame_height_px: 180 } },
    mapping_status: "resolved",
    trace_id: "fixture-trace-e2e",
    channel_id: "FIXTURE-CH1",
    signal_interval: null,
    record_state: "on_record",
    asset_id: aid,
  };
}

function exchange(sid: string, xid: string, eventId: string | null, lines: string[], at: string, rev = 1, phase = "live", kind = "explain") {
  return {
    exchange_id: xid,
    session_id: sid,
    event_id: eventId,
    phase,
    kind,
    question: `FIXTURE e2e question ${xid}`,
    question_planned: null,
    answer_lines: lines.map((text, i) => ({ text, at_utc: new Date(Date.parse(at) + 1000 * (i + 1)).toISOString(), transcript_line_id: `${xid}-l${i + 1}` })),
    asked_at_utc: at,
    answer_started_at_utc: new Date(Date.parse(at) + 500).toISOString(),
    answer_ended_at_utc: null,
    audio_offset_secs: null,
    record_state: "on_record",
    source: "fixture",
    rev,
  };
}

/** The same write twice: the second must be an idempotent no-op with the same body. */
async function twice(label: string, criterion: Row["criterion"], send: () => Promise<Res>, ok: number[], idOf: (b: J) => unknown = b => JSON.stringify(b)): Promise<Res> {
  const a = await send();
  const b = await send();
  const pass = ok.includes(a.status) && (b.status === 200 || (a.status === 202 && b.status === 202)) && idOf(a.body) === idOf(b.body);
  check(criterion, `${label} (sent twice)`, pass, `${a.status} → ${b.status}${code(a) !== "-" ? ` ${code(a)}` : ""}`);
  return a;
}

async function newSession(body: unknown, key: string, query = ""): Promise<J> {
  const r = await call("POST", `/api/sessions${query}`, { json: body, headers: { "Idempotency-Key": `${key}-${RUN}` } });
  if (r.status !== 201 && r.status !== 200) throw new Error(`POST /api/sessions → ${r.status} ${code(r)}`);
  return r.body;
}

async function start(sid: string, rev: number): Promise<void> {
  await call("POST", `/api/sessions/${sid}/lifecycle`, { json: { action: "start", rev } });
}

async function synth(sid: string): Promise<J> {
  const r = await call("POST", `/api/sessions/${sid}/synthesis`);
  const job = r.body?.job_id;
  return until(() => call("GET", `/api/jobs/${job}`).then(x => x.body), j => ["done", "failed", "discarded"].includes(j?.status), 30000);
}

async function settledEvaluation(sid: string, eid: string): Promise<J> {
  return until(() => call("GET", `/api/sessions/${sid}/evaluations/${eid}`).then(x => x.body), e => e?.status && e.status !== "pending");
}

// --- steps ----------------------------------------------------------------------

async function healthAndAccess(): Promise<void> {
  currentStep = "health";
  const h = await call("GET", "/api/health", { auth: false });
  check("C8", "GET /api/health ok", h.status === 200 && h.body?.ok === true, `modules ${Object.entries(h.body?.modules ?? {}).map(([k, v]: [string, any]) => `${k}=${v.id}@${v.version}(${v.source})`).join(" ")}`);
  const secretsHidden = typeof h.body?.elevenlabs?.api_key_configured === "boolean" && !JSON.stringify(h.body).match(/sk_[a-z0-9]{8,}/i);
  check("C7", "health reports secrets as booleans only", secretsHidden, `elevenlabs ${JSON.stringify(h.body?.elevenlabs)}`);
  if (h.body?.access_token_required) {
    if (!TOKEN) throw new Error("the backend requires BACKEND_ACCESS_TOKEN; pass --token");
    const anon = await call("GET", "/api/diagnostics", { auth: false });
    check("C7", "with the access token set, a request without it → 401", anon.status === 401, `${anon.status} ${code(anon)}`);
  } else {
    check("C7", "access token not configured (LAN-open demo mode)", true, "set BACKEND_ACCESS_TOKEN to enable the boundary");
  }
}

async function offRecord(): Promise<void> {
  currentStep = "off-record";
  const s = await newSession({ role: "expert", source: "fixture", trace_ref: "FIXTURE e2e off-record" }, "e2e-offrec");
  const sid = s.session_id;
  await start(sid, s.rev);
  await call("POST", `/api/sessions/${sid}/record-state`, { json: { state: "off_record" } });
  const asset = await call("PUT", `/api/sessions/${sid}/assets/or-${RUN}-a1`, { form: assetForm(iso(), null) });
  const ev = await call("PUT", `/api/sessions/${sid}/events/evt-or-1`, { json: event(sid, "evt-or-1", `or-${RUN}-a1`, iso(), 1000) });
  const img = await bytesStatus(`/api/assets/or-${RUN}-a1/original`);
  check("C6", "off-record upload/event → 202 dropped_off_record, no bytes stored", asset.status === 202 && asset.body?.status === "dropped_off_record" && ev.status === 202 && img === 404, `asset ${asset.status}, event ${ev.status}, image GET ${img}`);
  await call("POST", `/api/sessions/${sid}/record-state`, { json: { state: "on_record" } });
  const retry = await call("PUT", `/api/sessions/${sid}/assets/or-${RUN}-a1`, { form: assetForm(iso(), null) });
  check("C3", "late retry of a dropped asset stays dropped (idempotent)", retry.status === 202, `${retry.status}`);

  // "That last part was off the record": purge what was stored since `since` (inside the
  // current on-record segment, which started with the toggle above).
  await sleep(50);
  const since = iso();
  await sleep(50);
  const evt2 = event(sid, "evt-or-2", `or-${RUN}-a2`, iso(), 2000);
  await call("PUT", `/api/sessions/${sid}/assets/or-${RUN}-a2`, { form: assetForm(iso(), "evt-or-2") });
  await call("PUT", `/api/sessions/${sid}/events/evt-or-2`, { json: evt2 });
  const xr = await call("PUT", `/api/sessions/${sid}/exchanges/x-or-2`, { json: exchange(sid, "x-or-2", "evt-or-2", ["FIXTURE e2e words said off the record"], iso()) });
  const purge = await call("POST", `/api/sessions/${sid}/record-state`, { json: { state: "off_record", since_utc: since } });
  const gone = await call("GET", `/api/sessions/${sid}/exchanges/x-or-2`);
  const again = await call("PUT", `/api/sessions/${sid}/events/evt-or-2`, { json: evt2 });
  check(
    "C6",
    "retroactive off-record purge removes stored content and leaves tombstones",
    xr.status === 201 && purge.status === 200 && purge.body?.purge?.deleted?.exchange_ids?.includes("x-or-2") && gone.status === 404 && again.status === 202,
    `purge ${purge.status}${code(purge) !== "-" ? ` ${code(purge)}` : ""} deleted ${JSON.stringify(purge.body?.purge?.deleted ?? {})}, GET ${gone.status}, re-PUT ${again.status}`,
  );
  const sse = await readSeqs(sid, { after: 0, count: 50, ms: 1500 });
  check("C6", "SSE carries record_state.changed for the acknowledged state", sse.length > 0, `${sse.length} events replayed`);
}

async function deletionMidSynthesis(): Promise<void> {
  currentStep = "deletion mid-synthesis";
  const s = await newSession({ role: "expert", source: "fixture", trace_ref: "FIXTURE e2e deletion" }, "e2e-delete");
  const sid = s.session_id;
  await start(sid, s.rev);
  const aid = `dl-${RUN}-a1`;
  await call("PUT", `/api/sessions/${sid}/assets/${aid}`, { form: assetForm(iso(), "evt-dl-1") });
  await call("PUT", `/api/sessions/${sid}/events/evt-dl-1`, { json: event(sid, "evt-dl-1", aid, iso(), 1000) });
  await call("PUT", `/api/sessions/${sid}/exchanges/x-dl-1`, { json: exchange(sid, "x-dl-1", "evt-dl-1", ["FIXTURE e2e answer that will be deleted"], iso()) });
  const req = await call("POST", `/api/sessions/${sid}/synthesis`);
  const del = await call("DELETE", `/api/sessions/${sid}/exchanges/x-dl-1`);
  const job = await until(() => call("GET", `/api/jobs/${req.body?.job_id}`).then(x => x.body), j => ["done", "failed", "discarded"].includes(j?.status), 30000);
  // Either the job saw the deletion (discarded) or it finished first and the cascade revoked its output.
  const entries: J[] = (await call("GET", "/api/knowledge/entries")).body ?? [];
  const createdLive = entries.filter(e => (job?.revision_ids ?? []).includes(e.current_revision_id) && e.status !== "revoked").length;
  const retry = await call("PUT", `/api/sessions/${sid}/exchanges/x-dl-1`, { json: exchange(sid, "x-dl-1", "evt-dl-1", ["FIXTURE e2e answer that will be deleted"], iso(), 2) });
  check(
    "C6",
    "deletion mid-synthesis: the delayed job recreates nothing",
    del.status === 200 && createdLive === 0 && (job?.status === "discarded" || job?.status === "done"),
    `job ${job?.status}${job?.discard_reason ? ` (${job.discard_reason})` : ""}, live revisions citing it ${createdLive}`,
  );
  check("C3", "late retry of a deleted exchange → 410 gone", retry.status === 410, `${retry.status} ${code(retry)}`);
}

type Main = { sid: string; aid: string; revisionIds: string[]; stepRevision: string };

async function expertCapture(): Promise<Main> {
  currentStep = "expert capture";
  const s = await newSession({ role: "expert", source: "fixture", trace_ref: "FIXTURE e2e main" }, "e2e-main");
  const sid = s.session_id;
  await start(sid, s.rev);
  const t0 = Date.now();
  const at = (ms: number) => new Date(t0 + ms).toISOString();
  const aid = `mn-${RUN}-a1`;
  const aid2 = `mn-${RUN}-a2`;

  const sseBefore = (await readSeqs(sid, { after: 0, count: 100, ms: 800 })).at(-1) ?? 0;
  await twice("PUT asset (evidence frame)", "C3", () => call("PUT", `/api/sessions/${sid}/assets/${aid}`, { form: assetForm(at(0), "evt-001") }), [201], b => b?.asset_id);
  await twice("PUT asset 2", "C3", () => call("PUT", `/api/sessions/${sid}/assets/${aid2}`, { form: assetForm(at(10000), "evt-002") }), [201], b => b?.asset_id);
  await twice("PUT event evt-001", "C3", () => call("PUT", `/api/sessions/${sid}/events/evt-001`, { json: event(sid, "evt-001", aid, at(0), 5000) }), [201], b => b?.seq);

  // SSE disconnect: read a few, drop the connection, keep writing, resume with Last-Event-ID.
  const first = await readSeqs(sid, { after: sseBefore, count: 2, ms: 2000 });
  const last = first.at(-1) ?? sseBefore;
  await twice("PUT event evt-002", "C3", () => call("PUT", `/api/sessions/${sid}/events/evt-002`, { json: event(sid, "evt-002", aid2, at(10000), 15000) }), [201], b => b?.seq);
  const x1 = exchange(sid, "x-1", "evt-001", ["FIXTURE e2e: here I read FIXTURE pattern A."], at(2000));
  await twice("PUT exchange x-1 rev 1", "C3", () => call("PUT", `/api/sessions/${sid}/exchanges/x-1`, { json: x1 }), [201], b => b?.rev);
  const x2 = exchange(sid, "x-2", "evt-002", ["Because FIXTURE cue B is present.", "I never save it when FIXTURE condition C is visible."], at(12000), 1, "live", "reasoning");
  await twice("PUT exchange x-2 (reason + guardrail)", "C3", () => call("PUT", `/api/sessions/${sid}/exchanges/x-2`, { json: x2 }), [201], b => b?.rev);
  const resumed = await readSeqs(sid, { lastEventId: last, count: 100, ms: 1500 });
  const contiguous = resumed.length > 0 && resumed[0] === last + 1 && resumed.every((v, i) => i === 0 || v === resumed[i - 1] + 1);
  check("C3", "SSE disconnect + resume (Last-Event-ID) replays exactly the missed events", contiguous, `resumed after seq ${last}: ${resumed[0] ?? "-"}…${resumed.at(-1) ?? "-"} (${resumed.length}, no gaps/dupes)`);

  // A delayed answer (rev 2 of x-1, after newer events) keeps its original event.
  const x1b = { ...x1, rev: 2, answer_lines: [...x1.answer_lines, { text: "FIXTURE e2e: and only on the upper channel.", at_utc: at(4000), transcript_line_id: "x-1-l2" }] };
  const late = await call("PUT", `/api/sessions/${sid}/exchanges/x-1`, { json: x1b });
  const moved = await call("PUT", `/api/sessions/${sid}/exchanges/x-1`, { json: { ...x1b, rev: 3, event_id: "evt-002" } });
  check("C3", "delayed answer keeps its event; re-attaching it is refused", late.status === 200 && late.body?.event_id === "evt-001" && moved.status === 409, `rev2 ${late.status}, re-attach ${moved.status} ${code(moved)}`);

  currentStep = "synthesis";
  const job = await synth(sid);
  check("C1", "synthesis job done", job?.status === "done", `${job?.job_id} ${job?.status} revisions ${job?.revision_ids?.length ?? 0}`);
  const rerun = await synth(sid);
  check("C3", "re-running synthesis on unchanged inputs creates no new revision", rerun?.status === "done" && (rerun?.revision_ids?.length ?? -1) === 0, `${rerun?.status} +${rerun?.revision_ids?.length}`);

  currentStep = "teach-back confirmation";
  const draft = await call("GET", `/api/sessions/${sid}/draft`);
  const reviewed: string[] = draft.body?.revision_ids ?? [];
  await call("PUT", `/api/sessions/${sid}/exchanges/x-tb`, { json: exchange(sid, "x-tb", null, ["Yes, that is right."], at(30000), 1, "teach_back", "clarify_reference") });
  const confirm = (ids: string[], key: string, xid = "x-tb") =>
    call("POST", "/api/knowledge/confirmations", { json: { reviewed_revision_ids: ids, result: "confirmed", expert_response_exchange_id: xid, idempotency_key: `${key}-${RUN}` } });
  const c1 = await twice("confirm teach-back", "C4", () => confirm(reviewed, "tb1"), [201], b => JSON.stringify(b?.confirmations?.map((c: J) => c.confirmation_id)));
  check("C4", "confirmation bound to the exact reviewed revisions", c1.body?.confirmations?.every((c: J) => reviewed.includes(c.reviewed_revision_id)) === true, `${reviewed.length} revision(s)`);

  // Correction: the expert adds a condition → new revision; confirming the old one again is refused.
  const x2b = { ...x2, rev: 2, answer_lines: [...x2.answer_lines, { text: "FIXTURE e2e correction: only if cue D is present too.", at_utc: at(16000), transcript_line_id: "x-2-l3" }] };
  await call("PUT", `/api/sessions/${sid}/exchanges/x-2`, { json: x2b });
  const job2 = await synth(sid);
  const stale = await confirm(reviewed, "tb-stale");
  check("C4", "after a correction, confirming the superseded revision → 409 stale_revision", job2?.status === "done" && stale.status === 409 && code(stale) === "stale_revision", `${stale.status} ${code(stale)}`);
  const draft2 = await call("GET", `/api/sessions/${sid}/draft`);
  await call("PUT", `/api/sessions/${sid}/exchanges/x-tb2`, { json: exchange(sid, "x-tb2", null, ["Yes, with the correction that is right."], at(40000), 1, "teach_back", "clarify_reference") });
  const c2 = await confirm(draft2.body?.revision_ids ?? [], "tb2", "x-tb2");
  check("C4", "the corrected revision is confirmed", c2.status === 201, `${c2.status} ${(draft2.body?.revision_ids ?? []).length} revision(s)`);

  currentStep = "work map";
  const map = await call("GET", "/api/workmap");
  const steps: J[] = map.body?.steps ?? [];
  const urls = steps.flatMap(s => s.evidence.flatMap((e: J) => [e.original_url, e.highlighted_url].filter(Boolean)));
  const statuses = await Promise.all(urls.map(bytesStatus));
  check("C2", "Work Map evidence images resolve (HTTP 200)", steps.length > 0 && statuses.length > 0 && statuses.every(s => s === 200), `${steps.length} step(s), ${statuses.length} image URL(s): ${[...new Set(statuses)].join(",")}`);
  check("C1", "every Work Map step links verbatim expert words and no broken links", steps.every(s => s.exchanges.length > 0 && s.broken_links.length === 0), steps.map(s => `${s.entry_id}@${s.revision_id}`).join(" "));
  const step = steps.find(s => s.evidence.some((e: J) => e.event_id === "evt-001")) ?? steps[0];
  return { sid, aid, revisionIds: steps.map(s => s.revision_id), stepRevision: step?.revision_id ?? "" };
}

async function newcomer(main: Main): Promise<{ nsid: string; evaluationId: string; commitId: string }> {
  currentStep = "newcomer session";
  const strict = await call("POST", "/api/sessions", { json: { role: "newcomer" } });
  check("C6", "fixture knowledge is not used silently (strict newcomer session refused)", strict.status === 409 && code(strict) === "no_confirmed_knowledge", `${strict.status} ${code(strict)}`);
  const shown = await call("POST", "/api/sessions?allow_fixture_knowledge=1", { json: { role: "newcomer", case_id: "fx-e01" } });
  check("C7", "a case shown to the expert is refused for the newcomer", shown.status === 409 && code(shown) === "case_not_permitted", `${shown.status} ${code(shown)}`);
  const n = await newSession({ role: "newcomer", source: "fixture" }, "e2e-newcomer", "?allow_fixture_knowledge=1");
  const nsid = n.session_id;
  const caseView = await call("GET", `/api/cases/${n.case_id}`);
  const traceStatus = await bytesStatus(caseView.body?.trace?.url ?? "/none");
  const evaluatorKeys = Object.keys(caseView.body ?? {}).filter(k => /expected|answer|evaluat|scoring|rubric|correct/i.test(k));
  check("C7", "learner case view carries no evaluator fields; trace resolves", caseView.status === 200 && evaluatorKeys.length === 0 && traceStatus === 200, `case ${n.case_id}, trace ${traceStatus}`);
  const traversal = await bytesStatus("/api/assets/..%2F..%2F.runtime%2Fevaluator/original");
  check("C7", "evaluator path is not reachable through the asset route", traversal === 400 || traversal === 404, `${traversal}`);
  check("C1", "newcomer pinned the confirmed revisions", (n.pinned_knowledge ?? []).some((p: J) => main.revisionIds.includes(p.revision_id)), `${(n.pinned_knowledge ?? []).length} pinned`);

  currentStep = "wrong draft";
  const putDraft = (base: number, decision: string) => call("PUT", `/api/sessions/${nsid}/draft`, { json: { base_draft_rev: base, decision, reason: "FIXTURE e2e learner reason", visual_context: [] } });
  await twice("PUT learner draft (wrong)", "C3", () => putDraft(0, "FIXTURE_WRONG"), [201], b => b?.draft_rev);
  const noEval = await call("POST", `/api/sessions/${nsid}/commit`, { json: { draft_rev: 1, idempotency_key: `ne-${RUN}` } });
  check("C5", "commit without an evaluation → evaluation_required", noEval.status === 409 && code(noEval) === "evaluation_required", `${noEval.status} ${code(noEval)}`);
  const ev1 = await twice("POST evaluation", "C3", () => call("POST", `/api/sessions/${nsid}/evaluations`, { json: { draft_rev: 1 } }), [202], b => b?.evaluation_id);
  const e1 = await settledEvaluation(nsid, ev1.body?.evaluation_id);
  const cited = e1?.cited?.[0];
  check("C5", "wrong decision → intervene, citing pinned knowledge and the expert's words", e1?.outcome === "intervene" && cited && main.revisionIds.includes(cited.revision_id) && typeof cited.quote === "string", `${e1?.evaluation_id} ${e1?.outcome} cites ${cited?.entry_id}@${cited?.revision_id}`);
  const blocked = await call("POST", `/api/sessions/${nsid}/commit`, { json: { draft_rev: 1, evaluation_id: e1?.evaluation_id, idempotency_key: `bl-${RUN}` } });
  check("C5", "commit after intervene → commit_blocked / blocked_by_outcome", blocked.status === 409 && policy(blocked) === "blocked_by_outcome", `${blocked.status} ${code(blocked)}/${policy(blocked)}`);

  currentStep = "edit and re-evaluate";
  await putDraft(1, "FIXTURE e2e corrected decision");
  const staleCommit = await call("POST", `/api/sessions/${nsid}/commit`, { json: { draft_rev: 2, evaluation_id: e1?.evaluation_id, idempotency_key: `st-${RUN}` } });
  check("C5", "edited draft cannot use the old evaluation → evaluation_stale", staleCommit.status === 409 && code(staleCommit) === "evaluation_stale", `${staleCommit.status} ${code(staleCommit)}/${policy(staleCommit)}`);
  const ev2 = await call("POST", `/api/sessions/${nsid}/evaluations`, { json: { draft_rev: 2 } });
  const pendingCommit = await call("POST", `/api/sessions/${nsid}/commit`, { json: { draft_rev: 2, evaluation_id: ev2.body?.evaluation_id, idempotency_key: `pd-${RUN}` } });
  const e2 = await settledEvaluation(nsid, ev2.body?.evaluation_id);
  check("C5", "pending evaluation cannot be bypassed", pendingCommit.status === 201 || (pendingCommit.status === 409 && code(pendingCommit) === "evaluation_pending"), pendingCommit.status === 201 ? "evaluation finished before the commit arrived (201)" : `${pendingCommit.status} ${code(pendingCommit)}`);
  if (pendingCommit.status === 201) {
    return { nsid, evaluationId: e2?.evaluation_id, commitId: pendingCommit.body?.commit_id };
  }

  currentStep = "commit";
  const body = { draft_rev: 2, evaluation_id: e2?.evaluation_id, idempotency_key: `save-${RUN}` };
  const [a, b] = await Promise.all([
    call("POST", `/api/sessions/${nsid}/commit`, { json: body }),
    call("POST", `/api/sessions/${nsid}/commit`, { json: { ...body, idempotency_key: `save2-${RUN}` } }),
  ]);
  const committed = [a, b].filter(r => r.status === 201);
  const refused = [a, b].filter(r => r.status === 409 && policy(r) === "already_committed");
  check("C5", "two concurrent commits → exactly one commit", committed.length === 1 && refused.length === 1, `${a.status}/${b.status}`);
  const replay = await call("POST", `/api/sessions/${nsid}/commit`, { json: committed[0] === a ? body : { ...body, idempotency_key: `save2-${RUN}` } });
  check("C3", "commit double-submit with the same key → the same commit", replay.status === 200 && replay.body?.commit_id === committed[0]?.body?.commit_id, `${replay.status} ${replay.body?.commit_id}`);
  const assessment = await call("GET", `/api/sessions/${nsid}/assessment`);
  const timeline = (assessment.body?.content?.timeline ?? []).map((t: J) => t.kind);
  check("C5", "assessment records the intervention caught before save", assessment.status === 200 && assessment.body?.content?.interventions === 1 && (assessment.body?.content?.timeline ?? []).some((t: J) => t.intervention === "caught_before_save"), timeline.join("→"));
  return { nsid, evaluationId: e2?.evaluation_id, commitId: committed[0]?.body?.commit_id };
}

async function revocation(main: Main): Promise<void> {
  currentStep = "revocation after evaluation";
  const n = await newSession({ role: "newcomer", source: "fixture" }, "e2e-newcomer-2", "?allow_fixture_knowledge=1");
  const nsid = n.session_id;
  await call("PUT", `/api/sessions/${nsid}/draft`, { json: { base_draft_rev: 0, decision: "FIXTURE e2e fine decision", reason: "r", visual_context: [] } });
  const ev = await call("POST", `/api/sessions/${nsid}/evaluations`, { json: { draft_rev: 1 } });
  const e = await settledEvaluation(nsid, ev.body?.evaluation_id);
  const pin = (n.pinned_knowledge ?? [])[0];
  const revoke = await call("POST", `/api/knowledge/entries/${pin?.entry_id}/revoke`, { json: { reason: "FIXTURE e2e revocation", revision_id: pin?.revision_id } });
  const commit = await call("POST", `/api/sessions/${nsid}/commit`, { json: { draft_rev: 1, evaluation_id: e?.evaluation_id, idempotency_key: `rv-${RUN}` } });
  check("C6", "revocation after evaluation blocks the pending commit", revoke.status === 200 && commit.status === 409 && policy(commit) === "knowledge_changed", `revoke ${revoke.status}, commit ${commit.status} ${code(commit)}/${policy(commit)}`);
  const map = await call("GET", "/api/workmap");
  const excluded = (map.body?.excluded ?? []).some((x: J) => x.revision_id === pin?.revision_id && x.reason === "revoked");
  const shown = (map.body?.steps ?? []).some((s: J) => s.revision_id === pin?.revision_id);
  const n3 = await call("POST", "/api/sessions?allow_fixture_knowledge=1", { json: { role: "newcomer" } });
  const repinned = n3.status === 201 ? !(n3.body?.pinned_knowledge ?? []).some((p: J) => p.revision_id === pin?.revision_id) : n3.status === 409;
  check("C6", "revoked knowledge leaves the Work Map and newcomer pinning", excluded && !shown && repinned, `excluded=${excluded}, new session ${n3.status}`);
  void main;
}

async function diagnostics(main: Main, nc: { nsid: string; commitId: string }): Promise<void> {
  currentStep = "diagnostics";
  const d = await call("GET", `/api/diagnostics?session_id=${main.sid}`);
  const evt = (d.body?.chain?.events ?? []).find((e: J) => e.event_id === "evt-001");
  const newcomerHit = (evt?.newcomer_sessions ?? []).find((s: J) => s.session_id === nc.nsid);
  const chainOk = evt && evt.exchanges.length > 0 && evt.revisions.length > 0 && evt.confirmations.length > 0 && newcomerHit && newcomerHit.commit?.commit_id === nc.commitId;
  check("C1", "diagnostics ID chain: event → exchange → revision → confirmation → newcomer → evaluation → commit", Boolean(chainOk));
  console.log("\nID chain of evt-001:");
  console.log(`  event      ${evt?.event_id} (asset ${evt?.asset_id}, captured ${evt?.captured_at_utc}, session_time_ms ${evt?.session_time_ms})`);
  for (const x of evt?.exchanges ?? []) console.log(`  exchange   ${x.exchange_id} rev ${x.rev} (${x.phase}, ${x.answer_lines} line(s))`);
  for (const r of evt?.revisions ?? []) console.log(`  revision   ${r.entry_id} @ ${r.revision_id} rev-${r.revision_no} ${r.status} (${r.produced_by?.module} ${r.produced_by?.source})`);
  for (const c of evt?.confirmations ?? []) console.log(`  confirm    ${c.confirmation_id} → ${c.revision_id} ${c.result} via ${c.expert_response_exchange_id}`);
  for (const s of evt?.newcomer_sessions ?? []) {
    console.log(`  newcomer   ${s.session_id} case ${s.case_id}`);
    for (const e of s.evaluations) console.log(`    evaluation ${e.evaluation_id} draft_rev ${e.draft_rev} ${e.status} ${e.outcome ?? ""} (${e.produced_by?.module})`);
    if (s.commit) console.log(`    commit     ${s.commit.commit_id} draft_rev ${s.commit.draft_rev} ← ${s.commit.evaluation_id}`);
  }
  console.log(`  Work Map   ${main.stepRevision}\n`);

  const h = await call("GET", "/api/health", { auth: false });
  check("C8", "no component is failing after the run", (h.body?.failing_components ?? []).length === 0, `failing: ${(h.body?.failing_components ?? []).join(",") || "none"}`);

  // No content in diagnostics: neither in the API output nor in the diag files (if reachable).
  const words = ["FIXTURE pattern A", "FIXTURE cue B", "FIXTURE condition C", "FIXTURE e2e learner reason", "words said off the record", "Yes, that is right"];
  const apiText = JSON.stringify([d.body, (await call("GET", `/api/diagnostics?session_id=${nc.nsid}`)).body, (await call("GET", "/api/diagnostics")).body]);
  const diagDir = join(RUNTIME_DIR, "diag");
  const fileText = existsSync(diagDir) ? readdirSync(diagDir).map(f => readFileSync(join(diagDir, f), "utf8")).join("\n") : "";
  const hits = words.filter(w => apiText.includes(w) || fileText.includes(w));
  check("C8", "diagnostics and diag files contain no content", hits.length === 0, `${hits.length} hit(s); scanned API output${fileText ? ` and ${diagDir}` : " (diag dir not found locally: pass --runtime-dir)"}`);
}

// --- main -----------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`e2e-integration → ${BASE}  (run ${RUN}; all records source: "fixture")\n`);
  await healthAndAccess();
  await offRecord();
  await deletionMidSynthesis();
  const m = await expertCapture();
  const nc = await newcomer(m);
  await revocation(m);
  await diagnostics(m, nc);
}

function printTable(): void {
  console.log("\n| § 10 criterion | Check | Result |");
  console.log("|---|---|---|");
  for (const r of rows) console.log(`| ${r.criterion} | ${r.check}${r.detail ? ` (${r.detail})` : ""} | ${r.pass ? "PASS" : "**FAIL**"} |`);
  console.log("\n| Criterion | Result |\n|---|---|");
  for (const [c, text] of Object.entries(CRITERIA)) {
    const mine = rows.filter(r => r.criterion === c);
    const result = mine.length === 0 ? "no check" : mine.every(r => r.pass) ? `PASS (${mine.length})` : `**FAIL** (${mine.filter(r => !r.pass).length}/${mine.length})`;
    console.log(`| ${c} ${text} | ${result} |`);
  }
}

main()
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    check("C8", `step "${currentStep}" aborted`, false, msg);
  })
  .finally(() => {
    printTable();
    const failed = rows.filter(r => !r.pass).length;
    console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}  (${rows.length} checks)`);
    process.exit(failed === 0 ? 0 : 1);
  });
