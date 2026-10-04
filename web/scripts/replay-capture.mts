/**
 * Replays a FIXTURE expert capture against a running WS6 backend (research R14), twice, and
 * asserts the acks are idempotent. All records are labelled `source: "fixture"`.
 *
 *   npm run replay-capture                          # against http://localhost:3006
 *   npm run replay-capture -- --base http://127.0.0.1:3006
 *
 * Prints one line per request (status + IDs only, never content). Exit code 1 on any
 * unexpected status.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventAck, ExchangePut, PointingEventIngest, Session } from "@/lib/contracts";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(webDir, "fixtures");
const baseArg = process.argv.indexOf("--base");
const BASE = (baseArg > -1 ? process.argv[baseArg + 1] : undefined) ?? "http://localhost:3006";

const EVENT_FILES = [
  "evt-001-resolved.json",
  "evt-002-resolved-sys2.json",
  "evt-003-repeat-of-001.json",
  "evt-004-ambiguous.json",
  // evt-005 is off-record: never sent.
];
const FRAME = { width_px: 320, height_px: 180 };
const EXCHANGE_ID = "fx-exchange-001";

type Result = { status: number; body: unknown };

class Unexpected extends Error {}

const readJson = <T,>(rel: string): T => JSON.parse(readFileSync(join(fixtures, rel), "utf8")) as T;
const png = (name: string) => new Blob([readFileSync(join(fixtures, "ws6", name))], { type: "image/png" });

function errorCode(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const err = (body as { error: { code?: unknown } }).error;
    if (typeof err?.code === "string") return err.code;
  }
  return "-";
}

async function call(method: string, path: string, init: { json?: unknown; form?: FormData; headers?: Record<string, string> } = {}): Promise<Result> {
  const headers: Record<string, string> = { ...init.headers };
  let body: string | FormData | undefined;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  } else if (init.form) body = init.form;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers, body });
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : String(err);
    throw new Unexpected(`cannot reach ${BASE} (${cause})`);
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

/** Logs one line; throws unless the status (and optional error code) is expected. */
function expectStatus(label: string, r: Result, ok: Array<number | `${number} ${string}`>, extra = ""): void {
  const code = errorCode(r.body);
  const pass = ok.some((o) => (typeof o === "number" ? o === r.status && code === "-" : o === `${r.status} ${code}`));
  console.log(`${pass ? "PASS" : "FAIL"}  ${label.padEnd(36)}  ${r.status}${code !== "-" ? ` ${code}` : ""}${extra ? `  ${extra}` : ""}`);
  if (!pass) throw new Unexpected(`${label}: unexpected ${r.status} ${code}`);
}

function exchange(sid: string, rev: 1 | 2): ExchangePut {
  const fx = readJson<ExchangePut>("ws6/expert-exchange.json");
  return {
    ...fx,
    exchange_id: EXCHANGE_ID,
    session_id: sid,
    event_id: "evt-001",
    source: "fixture",
    answer_lines: rev === 1 ? fx.answer_lines.slice(0, 1) : fx.answer_lines,
    answer_ended_at_utc: rev === 1 ? null : fx.answer_ended_at_utc,
    rev,
  };
}

async function putExchange(sid: string, rev: 1 | 2, pass: 1 | 2): Promise<void> {
  const r = await call("PUT", `/api/sessions/${sid}/exchanges/${EXCHANGE_ID}`, { json: exchange(sid, rev) });
  // rev 1 is only new on the very first run; once rev 2 is stored it is stale.
  const ok: Array<number | `${number} ${string}`> =
    rev === 1 ? (pass === 1 ? [201, "409 stale_revision"] : ["409 stale_revision"]) : pass === 1 ? [200, 201] : [200];
  expectStatus(`PUT exchanges/${EXCHANGE_ID} rev ${rev}`, r, ok);
}

/** One pass of assets + events + exchanges. Returns the ack seq per event. */
async function capturePass(sid: string, pass: 1 | 2, seqs: Map<string, number>): Promise<string[]> {
  const assetIds: string[] = [];
  for (const [i, file] of EVENT_FILES.entries()) {
    const fx = readJson<PointingEventIngest>(`pointing-events/${file}`);
    const aid = `fx-${sid.slice(-6)}-a${i + 1}`;
    assetIds.push(aid);

    const form = new FormData();
    form.set("meta", JSON.stringify({ kind: "frame", captured_at_utc: fx.captured_at_utc, source: "fixture", event_id: fx.event_id, original: FRAME, highlighted: FRAME }));
    form.set("original", png("fixture-frame.png"), "original.png");
    form.set("highlighted", png("fixture-frame-highlighted.png"), "highlighted.png");
    const ra = await call("PUT", `/api/sessions/${sid}/assets/${aid}`, { form });
    expectStatus(`PUT assets/${aid}`, ra, pass === 1 ? [200, 201] : [200]);

    const event: PointingEventIngest = {
      ...fx,
      session_id: sid,
      asset_id: aid,
      region: { ...fx.region, frame_width_px: FRAME.width_px, frame_height_px: FRAME.height_px },
    };
    const re = await call("PUT", `/api/sessions/${sid}/events/${fx.event_id}`, { json: event });
    const ack = re.body as Partial<EventAck> | null;
    const seq = typeof ack?.seq === "number" ? ack.seq : NaN;
    expectStatus(`PUT events/${fx.event_id}`, re, pass === 1 ? [200, 201] : [200], `seq=${seq}`);
    if (ack?.event_id !== fx.event_id || ack.status !== "stored" || !Number.isInteger(seq)) {
      throw new Unexpected(`PUT events/${fx.event_id}: malformed ack`);
    }
    const earlier = seqs.get(fx.event_id);
    if (earlier !== undefined && earlier !== seq) throw new Unexpected(`events/${fx.event_id}: seq changed ${earlier} → ${seq}`);
    seqs.set(fx.event_id, seq);

    // Exchange rev 1 right after the event it is about; rev 2 arrives late, after newer events.
    if (i === 0) await putExchange(sid, 1, pass);
  }
  await putExchange(sid, 2, pass);
  return assetIds;
}

async function verify(sid: string): Promise<void> {
  const re = await call("GET", `/api/sessions/${sid}/events`);
  const events = Array.isArray(re.body) ? (re.body as PointingEventIngest[]) : [];
  expectStatus("GET events", re, [200], `count=${events.length}`);
  if (events.length !== EVENT_FILES.length) throw new Unexpected(`GET events: expected ${EVENT_FILES.length}, got ${events.length}`);

  const rx = await call("GET", `/api/sessions/${sid}/exchanges`);
  const exchanges = Array.isArray(rx.body) ? (rx.body as ExchangePut[]) : [];
  const ex = exchanges.find((x) => x.exchange_id === EXCHANGE_ID);
  expectStatus("GET exchanges", rx, [200], `count=${exchanges.length} event_id=${ex?.event_id ?? "-"} rev=${ex?.rev ?? "-"}`);
  if (ex?.event_id !== "evt-001") throw new Unexpected(`GET exchanges: ${EXCHANGE_ID} must reference evt-001`);
}

async function main(): Promise<void> {
  console.log(`replay-capture → ${BASE}  (all records source: "fixture")`);
  const rs = await call("POST", "/api/sessions", {
    json: { role: "expert", source: "fixture", trace_ref: "FIXTURE replay-capture" },
    headers: { "Idempotency-Key": "replay-capture-fixture-v1" },
  });
  const session = rs.body as Session | null;
  expectStatus("POST sessions", rs, [200, 201], `sid=${session?.session_id ?? "-"}`);
  if (!session?.session_id) throw new Unexpected("POST sessions: no session_id");
  const sid = session.session_id;

  const rl = await call("POST", `/api/sessions/${sid}/lifecycle`, { json: { action: "start", rev: session.rev } });
  expectStatus("POST lifecycle start", rl, [200]);

  const seqs = new Map<string, number>();
  console.log("-- pass 1");
  const assetIds = await capturePass(sid, 1, seqs);
  await verify(sid);
  console.log("-- pass 2 (identical retries)");
  await capturePass(sid, 2, seqs);
  await verify(sid);

  console.log(`\nOK  session ${sid}`);
  console.log(`    assets  ${assetIds.join(", ")}`);
  console.log(`    events  ${[...seqs].map(([e, s]) => `${e}@${s}`).join(", ")}`);
  console.log(`    stream  curl -N "${BASE}/api/sessions/${sid}/stream?after=0"`);
}

main().catch((err: unknown) => {
  console.error(`FAILED  ${err instanceof Unexpected ? err.message : "unexpected error"}`);
  if (!(err instanceof Unexpected)) console.error(err);
  process.exit(1);
});
