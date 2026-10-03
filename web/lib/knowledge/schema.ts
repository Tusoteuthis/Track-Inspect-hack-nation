// WS5 knowledge entry schema "ws5.v0". Field names are snake_case to match the JSON
// and Markdown frontmatter on disk. Expert words (verbatim quotes) and AI synthesis
// are separate types, so they can never be mixed silently. `null` means unknown.
// Human-readable summary: notes/ws5-sprints/docs/knowledge-schema-v0.md

import type {
  ConfirmationStatus,
  ExpertExchange,
  PointingEvent,
  Region,
  SignalInterval,
  Source,
} from "@/lib/expert/contracts";

export const WS5_SCHEMA_VERSION = "ws5.v0";

export type EntryStatus = "draft" | "confirmed" | "unresolved" | "revoked";
/** Superset of WS3 `StepKind`: adds "escalation" (a confirmed instruction to escalate is valid knowledge). */
export type EntryKind = "step" | "decision" | "guardrail" | "exception" | "escalation";

export const ENTRY_STATUSES: readonly EntryStatus[] = ["draft", "confirmed", "unresolved", "revoked"];
export const ENTRY_KINDS: readonly EntryKind[] = ["step", "decision", "guardrail", "exception", "escalation"];

/** A verbatim span of one answer line of the linked exchange. */
export type ExpertQuote = { exchange_id: string; quote: string };

/** Either a reference to the expert's verbatim words or AI synthesis, always explicitly tagged. */
export type Statement =
  | { type: "expert_quote"; exchange_id: string; quote: string }
  | { type: "ai_synthesis"; text: string };

export type ExceptionRule = { trigger: Statement; action: Statement };

export type VisualEvidence = {
  event_id: string;
  asset_id: string | null;
  /** Relative path from the entry's Markdown file to the original frame. */
  image_ref: string;
  highlighted_image_ref: string;
  region: Region;
  /** Elapsed recording time. Never derived from, or converted to, signal time. */
  session_time_ms: number | null;
  /** Position on the trace axis, only if calibrated. Never derived from session time. */
  signal_interval: SignalInterval | null;
};

export type ConfirmationEvidence = {
  confirmation_id: string;
  /** Must equal the entry's `revision_id`: a confirmation binds to the exact revision reviewed. */
  revision_id_reviewed: string;
  result: ConfirmationStatus;
  expert_response_exchange_id: string;
};

export type KnowledgeEntryContent = {
  // frontmatter
  schema_version: typeof WS5_SCHEMA_VERSION;
  entry_id: string;
  revision_id: string;
  parent_revision_id: string | null;
  /** Why this revision exists (set by synthesis on rev-2+; references the exchanges that changed). */
  change_reason?: string | null;
  status: EntryStatus;
  kind: EntryKind;
  workflow_position: number | null;
  source: Source;
  produced_by: { module: string; version: string };
  created_at_utc: string;
  revoked_at_utc: string | null;
  revoked_reason: string | null;
  // body
  workflow_step: Statement | null;
  observation: Statement | null;
  expert_words: ExpertQuote[];
  interpretation: Statement[];
  reasoning: Statement[];
  exceptions: ExceptionRule[];
  visual_evidence: VisualEvidence[];
  confirmation: ConfirmationEvidence | null;
  /** Qualifier words ("usually", "only if") preserved from the quotes. */
  qualifiers: string[];
  open_questions: string[];
};

export type ViolationCode =
  | "invalid_shape"
  | "missing_visual_evidence"
  | "missing_expert_quote"
  | "quote_not_verbatim"
  | "unknown_exchange"
  | "unknown_event"
  | "confirmed_without_confirmation"
  | "confirmation_result_mismatch"
  | "confirmation_revision_mismatch"
  | "revoked_missing_fields"
  | "non_revoked_has_revoked_fields"
  | "absolute_image_ref"
  | "qualifier_not_in_quotes";

export type Violation = { code: ViolationCode; path: string; message: string };

export type EntryValidation = { ok: true; value: KnowledgeEntryContent } | { ok: false; violations: Violation[] };

/** Linked records to check against. Checks needing a list are skipped when it is omitted. */
export type EvidenceContext = { exchanges?: readonly ExpertExchange[]; events?: readonly PointingEvent[] };

// --- shape checks ------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isNullableString = (v: unknown): v is string | null => v === null || isNonEmptyString(v);

function oneOf<T extends string>(allowed: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

function checkStatement(v: unknown, path: string, push: (path: string, message: string) => void): void {
  if (!isRecord(v)) return push(path, "must be a statement object");
  if (v.type === "expert_quote") {
    if (!isNonEmptyString(v.exchange_id)) push(`${path}.exchange_id`, "must be a non-empty string");
    if (!isNonEmptyString(v.quote)) push(`${path}.quote`, "must be a non-empty string");
  } else if (v.type === "ai_synthesis") {
    if (!isNonEmptyString(v.text)) push(`${path}.text`, "must be a non-empty string");
  } else {
    push(`${path}.type`, 'must be "expert_quote" or "ai_synthesis"');
  }
}

function checkList(
  v: unknown,
  path: string,
  push: (path: string, message: string) => void,
  item: (v: unknown, path: string) => void
): void {
  if (!Array.isArray(v)) return push(path, "must be an array");
  v.forEach((x, i) => item(x, `${path}[${i}]`));
}

function shapeViolations(input: unknown): Violation[] {
  const out: Violation[] = [];
  const push = (path: string, message: string) => out.push({ code: "invalid_shape", path, message });
  if (!isRecord(input)) return [{ code: "invalid_shape", path: "", message: "entry must be an object" }];
  const e = input;

  if (e.schema_version !== WS5_SCHEMA_VERSION) push("schema_version", `must be "${WS5_SCHEMA_VERSION}"`);
  for (const key of ["entry_id", "revision_id", "created_at_utc"] as const) {
    if (!isNonEmptyString(e[key])) push(key, "must be a non-empty string");
  }
  for (const key of ["parent_revision_id", "revoked_at_utc", "revoked_reason"] as const) {
    if (!isNullableString(e[key])) push(key, "must be a non-empty string or null");
  }
  if ("change_reason" in e && !isNullableString(e.change_reason)) {
    push("change_reason", "must be a non-empty string or null when present");
  }
  if (!oneOf(ENTRY_STATUSES, e.status)) push("status", `must be one of ${ENTRY_STATUSES.join(", ")}`);
  if (!oneOf(ENTRY_KINDS, e.kind)) push("kind", `must be one of ${ENTRY_KINDS.join(", ")}`);
  if (e.workflow_position !== null && !Number.isInteger(e.workflow_position)) {
    push("workflow_position", "must be an integer or null");
  }
  if (e.source !== "live" && e.source !== "fixture") push("source", 'must be "live" or "fixture"');
  if (!isRecord(e.produced_by) || !isNonEmptyString(e.produced_by.module) || !isNonEmptyString(e.produced_by.version)) {
    push("produced_by", "must be { module, version } with non-empty strings");
  }

  for (const key of ["workflow_step", "observation"] as const) {
    if (e[key] !== null) checkStatement(e[key], key, push);
  }
  checkList(e.expert_words, "expert_words", push, (q, p) => {
    if (!isRecord(q) || !isNonEmptyString(q.exchange_id) || !isNonEmptyString(q.quote)) {
      push(p, "must be { exchange_id, quote } with non-empty strings");
    }
  });
  for (const key of ["interpretation", "reasoning"] as const) {
    checkList(e[key], key, push, (s, p) => checkStatement(s, p, push));
  }
  checkList(e.exceptions, "exceptions", push, (x, p) => {
    if (!isRecord(x)) return push(p, "must be { trigger, action }");
    checkStatement(x.trigger, `${p}.trigger`, push);
    checkStatement(x.action, `${p}.action`, push);
  });
  checkList(e.visual_evidence, "visual_evidence", push, (v, p) => {
    if (!isRecord(v)) return push(p, "must be an object");
    for (const key of ["event_id", "image_ref", "highlighted_image_ref"] as const) {
      if (!isNonEmptyString(v[key])) push(`${p}.${key}`, "must be a non-empty string");
    }
    if (!isNullableString(v.asset_id)) push(`${p}.asset_id`, "must be a non-empty string or null");
    if (!isRecord(v.region)) push(`${p}.region`, "must be an object");
    if (v.session_time_ms !== null && !(typeof v.session_time_ms === "number" && v.session_time_ms >= 0)) {
      push(`${p}.session_time_ms`, "must be a number ≥ 0 or null");
    }
    if (!("signal_interval" in v) || (v.signal_interval !== null && !isRecord(v.signal_interval))) {
      push(`${p}.signal_interval`, "must be present (an object or null)");
    }
  });
  if (e.confirmation !== null) {
    const c = e.confirmation;
    if (
      !isRecord(c) ||
      !isNonEmptyString(c.confirmation_id) ||
      !isNonEmptyString(c.revision_id_reviewed) ||
      !isNonEmptyString(c.expert_response_exchange_id) ||
      !oneOf(["confirmed", "corrected", "unresolved"], c.result)
    ) {
      push("confirmation", "must be null or { confirmation_id, revision_id_reviewed, result, expert_response_exchange_id }");
    }
  }
  for (const key of ["qualifiers", "open_questions"] as const) {
    checkList(e[key], key, push, (s, p) => {
      if (!isNonEmptyString(s)) push(p, "must be a non-empty string");
    });
  }
  return out;
}

// --- semantic invariants -----------------------------------------------------

/** Every verbatim quote in the entry, with its path, in document order. */
export function collectQuotes(entry: KnowledgeEntryContent): { path: string; exchange_id: string; quote: string }[] {
  const out: { path: string; exchange_id: string; quote: string }[] = [];
  const add = (s: Statement | null, path: string) => {
    if (s?.type === "expert_quote") out.push({ path, exchange_id: s.exchange_id, quote: s.quote });
  };
  entry.expert_words.forEach((q, i) => out.push({ path: `expert_words[${i}]`, ...q }));
  add(entry.workflow_step, "workflow_step");
  add(entry.observation, "observation");
  entry.interpretation.forEach((s, i) => add(s, `interpretation[${i}]`));
  entry.reasoning.forEach((s, i) => add(s, `reasoning[${i}]`));
  entry.exceptions.forEach((x, i) => {
    add(x.trigger, `exceptions[${i}].trigger`);
    add(x.action, `exceptions[${i}].action`);
  });
  return out;
}

/**
 * Returns a violation for every quote that is not an exact substring of one answer line of its
 * own exchange. No normalization: changing case, punctuation or a qualifier makes it non-verbatim.
 */
export function findNonVerbatimQuotes(entry: KnowledgeEntryContent, exchanges: readonly ExpertExchange[]): Violation[] {
  const byId = new Map(exchanges.map(x => [x.exchange_id, x]));
  const out: Violation[] = [];
  for (const q of collectQuotes(entry)) {
    const exchange = byId.get(q.exchange_id);
    if (!exchange) {
      out.push({ code: "unknown_exchange", path: q.path, message: `exchange ${q.exchange_id} not found` });
    } else if (!exchange.answer_lines.some(line => line.text.includes(q.quote))) {
      out.push({
        code: "quote_not_verbatim",
        path: q.path,
        message: `quote is not a verbatim span of an answer line of ${q.exchange_id}`,
      });
    }
  }
  return out;
}

export class QuoteNotVerbatimError extends Error {
  constructor(readonly violations: Violation[]) {
    super(`non-verbatim quotes: ${violations.map(v => `${v.path} (${v.message})`).join("; ")}`);
    this.name = "QuoteNotVerbatimError";
  }
}

/** Throws QuoteNotVerbatimError listing every quote that is not verbatim in its linked exchange. */
export function assertQuotesVerbatim(entry: KnowledgeEntryContent, exchanges: readonly ExpertExchange[]): void {
  const violations = findNonVerbatimQuotes(entry, exchanges);
  if (violations.length) throw new QuoteNotVerbatimError(violations);
}

// A leading "/" or a URL scheme ("http:", "data:", "file:") is not a relative path.
const isAbsoluteRef = (ref: string) => ref.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(ref);

function invariantViolations(entry: KnowledgeEntryContent, ctx: EvidenceContext): Violation[] {
  const out: Violation[] = [];
  const add = (code: ViolationCode, path: string, message: string) => out.push({ code, path, message });

  if (entry.visual_evidence.length === 0) {
    add("missing_visual_evidence", "visual_evidence", `a ${entry.kind} needs at least one screen moment`);
  }
  if (entry.expert_words.length === 0) {
    add("missing_expert_quote", "expert_words", `a ${entry.kind} needs at least one verbatim expert quote`);
  }

  if (entry.status === "confirmed") {
    if (!entry.confirmation) {
      add("confirmed_without_confirmation", "confirmation", "confirmed requires confirmation evidence");
    } else if (entry.confirmation.result !== "confirmed") {
      add("confirmation_result_mismatch", "confirmation.result", `confirmed requires result "confirmed"`);
    }
  }
  if (entry.confirmation && entry.confirmation.revision_id_reviewed !== entry.revision_id) {
    add(
      "confirmation_revision_mismatch",
      "confirmation.revision_id_reviewed",
      `reviewed ${entry.confirmation.revision_id_reviewed}, but this is ${entry.revision_id}`
    );
  }

  const hasRevokedFields = entry.revoked_at_utc !== null || entry.revoked_reason !== null;
  if (entry.status === "revoked" && (entry.revoked_at_utc === null || entry.revoked_reason === null)) {
    add("revoked_missing_fields", "revoked_at_utc", "revoked entries need revoked_at_utc and revoked_reason");
  } else if (entry.status !== "revoked" && hasRevokedFields) {
    add("non_revoked_has_revoked_fields", "revoked_at_utc", "only revoked entries carry revocation fields");
  }

  entry.visual_evidence.forEach((v, i) => {
    for (const key of ["image_ref", "highlighted_image_ref"] as const) {
      if (isAbsoluteRef(v[key])) add("absolute_image_ref", `visual_evidence[${i}].${key}`, "image links must be relative");
    }
  });

  const quotes = collectQuotes(entry);
  entry.qualifiers.forEach((qualifier, i) => {
    if (!quotes.some(q => q.quote.includes(qualifier))) {
      add("qualifier_not_in_quotes", `qualifiers[${i}]`, `"${qualifier}" does not appear in any expert quote`);
    }
  });

  if (ctx.exchanges) {
    out.push(...findNonVerbatimQuotes(entry, ctx.exchanges));
    if (
      entry.confirmation &&
      !ctx.exchanges.some(x => x.exchange_id === entry.confirmation?.expert_response_exchange_id)
    ) {
      add(
        "unknown_exchange",
        "confirmation.expert_response_exchange_id",
        `exchange ${entry.confirmation.expert_response_exchange_id} not found`
      );
    }
  }
  if (ctx.events) {
    const known = new Set(ctx.events.map(e => e.event_id));
    entry.visual_evidence.forEach((v, i) => {
      if (!known.has(v.event_id)) add("unknown_event", `visual_evidence[${i}].event_id`, `event ${v.event_id} not found`);
    });
  }
  return out;
}

/**
 * Checks shape first (returns every shape problem), then every invariant. Never fills a missing
 * field: a step without an image or a quote is reported, not repaired.
 */
export function validateEntry(input: unknown, ctx: EvidenceContext = {}): EntryValidation {
  const shape = shapeViolations(input);
  if (shape.length) return { ok: false, violations: shape };
  const entry = input as KnowledgeEntryContent;
  const violations = invariantViolations(entry, ctx);
  return violations.length ? { ok: false, violations } : { ok: true, value: entry };
}
