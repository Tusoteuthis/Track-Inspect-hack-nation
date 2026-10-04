// Pure WS6 wire → WS7 UI mappers. Every WS6↔UI contract mismatch is resolved
// here (and only here) so screens never see WS6 shapes.
import type { PointingEvent } from "@/lib/expert/contracts";
import type {
  AssessmentItem,
  AssessmentView,
  Citation,
  ConnectionState,
  DataOrigin,
  EvidenceRef,
  ExpertQuote,
  KnowledgeStatus,
  LearnerEvaluation,
  SessionView,
  WorkMapStep,
  WorkMapView,
} from "@/lib/ui/contracts";
import type {
  Ws6Assessment,
  Ws6Evaluation,
  Ws6KnowledgeRef,
  Ws6PointingEvent,
  Ws6Session,
  Ws6Source,
  Ws6WorkMapEvidence,
  Ws6WorkMapStep,
  Ws6WorkMapView,
} from "@/lib/data/ws6Wire";

// --- defensive readers for WS5 content (typed `unknown` on the wire) ---------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strings = (v: unknown): string[] => list(v).flatMap(x => (str(x) === null ? [] : [x as string]));

/** WS6 asset/image URLs are relative (`/api/assets/...`); clients prefix their base URL. */
export function withBase(baseUrl: string, url: string): string {
  return url.startsWith("/") ? `${baseUrl}${url}` : url;
}

// --- session -----------------------------------------------------------------

const LIFECYCLE: Record<Ws6Session["lifecycle"], SessionView["lifecycle"]> = {
  created: "not_started",
  active: "active",
  ended: "ended",
  // WS6 distinguishes an incomplete end; the UI only has "ended".
  aborted: "ended",
};

export function mapSession(s: Ws6Session, backend: ConnectionState): SessionView {
  return {
    session_id: s.session_id,
    role: s.role,
    lifecycle: LIFECYCLE[s.lifecycle],
    recording_state: s.record_state,
    // WS6 v0 has no authoritative capture/agent presence signal (WS7-Q1).
    connection: { capture: "unknown", agent: "unknown", backend },
    case_id: s.case_id,
    // WS6 pins a list of revisions; the UI shows one (first pinned).
    knowledge_revision_id: s.pinned_knowledge?.[0]?.revision_id ?? null,
    rev: s.rev,
    source: s.source,
  };
}

// --- Work Map ----------------------------------------------------------------

const ORIGIN_RANK: Record<DataOrigin, number> = { live: 0, stub: 1, fixture: 2 };
const worst = (sources: Ws6Source[]): DataOrigin =>
  sources.reduce<DataOrigin>((acc, s) => (ORIGIN_RANK[s] > ORIGIN_RANK[acc] ? s : acc), "live");

function mapKind(v: unknown): WorkMapStep["kind"] {
  // WS5 adds "escalation" (WS5-Q2); the UI has no such kind, and an escalation
  // instruction is closest to a guardrail. Anything unknown is shown as a plain step.
  if (v === "escalation") return "guardrail";
  return v === "decision" || v === "guardrail" || v === "exception" || v === "step" ? v : "step";
}

function statementText(v: unknown): string | null {
  if (!isObj(v)) return null;
  return v.type === "expert_quote" ? str(v.quote) : str(v.text);
}

function quotesFromContent(c: Obj): ExpertQuote[] {
  return list(c.expert_words).flatMap(w => {
    if (!isObj(w)) return [];
    const exchange_id = str(w.exchange_id);
    const text = str(w.quote);
    return exchange_id && text ? [{ exchange_id, text }] : [];
  });
}

/** Without WS5 content, the answer lines are still the expert's verbatim words. */
function quotesFromExchanges(step: Ws6WorkMapStep): ExpertQuote[] {
  return step.exchanges.flatMap(x => {
    const text = x.answer_lines.map(l => l.text).join(" ").trim();
    return text ? [{ exchange_id: x.exchange_id, text }] : [];
  });
}

function guardrailsFromContent(c: Obj): string[] {
  return list(c.guardrails).flatMap(g => {
    if (!isObj(g)) return [];
    const trigger = statementText(g.trigger);
    const action = statementText(g.action);
    return trigger && action ? [`When ${trigger}: ${action}`] : [];
  });
}

function summaryFromContent(c: Obj): string | null {
  const texts = list(c.synthesis).flatMap(s => (isObj(s) && str(s.text) ? [s.text as string] : []));
  return texts.length ? texts.join(" ") : null;
}

function mapEvidence(e: Ws6WorkMapEvidence, baseUrl: string): EvidenceRef {
  // WS6 has no frame_id on assets or work-map evidence (WS7-Q4), but guarantees the
  // region is on this asset's original frame, so both share a synthetic frame id.
  const frame_id = `asset:${e.asset_id}`;
  return {
    event_id: e.event_id,
    asset: {
      asset_id: e.asset_id,
      original_url: withBase(baseUrl, e.original_url),
      highlighted_url: e.highlighted_url === null ? null : withBase(baseUrl, e.highlighted_url),
      frame_id,
      width_px: e.region.frame_width_px,
      height_px: e.region.frame_height_px,
    },
    region: {
      frame_id,
      coordinate_space: e.region.coordinate_space,
      x: e.region.x,
      y: e.region.y,
      width: e.region.width,
      height: e.region.height,
      // The real mapping_status lives on the PointingEvent (not fetched here);
      // WS6 only stores events that carry a region.
      mapping_status: "resolved",
    },
  };
}

export function mapWorkMapStep(step: Ws6WorkMapStep, baseUrl: string): WorkMapStep {
  const content = isObj(step.content) ? step.content : null;
  const status: KnowledgeStatus = step.revision_id === null || step.status === null ? "missing" : step.status;
  return {
    entry_id: step.entry_id,
    // The UI type requires a string; a missing revision is shown via status "missing".
    revision_id: step.revision_id ?? "",
    kind: mapKind(content?.kind),
    title: step.title ?? "Untitled item",
    ai_summary: content ? summaryFromContent(content) : null,
    expert_quotes: content ? quotesFromContent(content) : quotesFromExchanges(step),
    reasoning: null,
    guardrails: content ? guardrailsFromContent(content) : [],
    evidence: step.evidence.map(e => mapEvidence(e, baseUrl)),
    status,
    open_question: null,
  };
}

export function mapWorkMap(view: Ws6WorkMapView, sessionId: string, baseUrl: string): WorkMapView {
  const stepSources = view.steps.flatMap(s => (s.source ? [s.source] : []));
  return {
    // WS6's Work Map is global (WS7-Q3); the UI view is session-scoped.
    session_id: view.session_id ?? sessionId,
    // WS6 has no single Work Map revision id; the synthesis job (or its time) identifies it.
    revision_id: view.job_id ?? view.generated_at_utc ?? "workmap",
    revision_label: "Current Work Map",
    parent_revision_id: null,
    change_reason: null,
    steps: view.steps.map(s => mapWorkMapStep(s, baseUrl)),
    source: view.steps.length ? worst(stepSources) : (view.produced_by?.source ?? "live"),
  };
}

// --- pointing events ---------------------------------------------------------

export function mapPointingEvent(e: Ws6PointingEvent, baseUrl: string): PointingEvent {
  const { asset_id: _assetId, ...event } = e;
  return {
    ...event,
    image_ref: withBase(baseUrl, e.image_ref),
    highlighted_image_ref: withBase(baseUrl, e.highlighted_image_ref),
  };
}

// --- assessment --------------------------------------------------------------

const refCitation = (r: Ws6KnowledgeRef): Citation => ({
  entry_id: r.entry_id,
  revision_id: r.revision_id,
  quote: null,
  evidence: null,
});

function refs(v: unknown): Ws6KnowledgeRef[] {
  return list(v).flatMap(r => {
    if (!isObj(r)) return [];
    const entry_id = str(r.entry_id);
    const revision_id = str(r.revision_id);
    return entry_id && revision_id ? [{ entry_id, revision_id }] : [];
  });
}

type Bucket = "independent" | "assisted" | "unresolved";

function bucketFor(outcomeClass: unknown, interventions: string[]): Bucket {
  // Trust guard: any intervention means assisted, whatever the class says; unknown classes are never independent.
  if (outcomeClass === "correct_unassisted") return interventions.length ? "assisted" : "independent";
  if (outcomeClass === "correct_after_help") return "assisted";
  return "unresolved";
}

function decisionItem(d: unknown): { bucket: Bucket; item: AssessmentItem } {
  const o = isObj(d) ? d : {};
  const interventions = strings(o.interventions);
  const rev = typeof o.draft_rev_initial === "number" ? o.draft_rev_initial : null;
  return {
    bucket: bucketFor(o.outcome_class, interventions),
    item: {
      description: rev === null ? "Decision" : `Decision on draft ${rev}`,
      citations: refs(o.cited_entries).map(refCitation),
      interventions,
    },
  };
}

export function mapAssessment(a: Ws6Assessment): AssessmentView {
  const view: AssessmentView = {
    session_id: a.session_id,
    independent: [],
    assisted: [],
    unresolved: [],
    practice_next: a.practice_next,
    evidence_used: a.evidence_used.map(refCitation),
    limitations: [],
    source: a.source,
  };
  const content = a.content;
  if (!content) {
    // Minimal WS6 fields cannot prove independence, so the best case is "unresolved".
    const outcome = a.final_outcome ?? "unknown outcome";
    const item: AssessmentItem = { description: `Final decision: ${outcome}`, citations: [], interventions: a.assistance };
    (a.assistance.length ? view.assisted : view.unresolved).push(item);
    return view;
  }
  for (const d of list(content.decisions)) {
    const { bucket, item } = decisionItem(d);
    view[bucket].push(item);
  }
  const practice = strings(content.practice_next);
  if (practice.length) view.practice_next = practice;
  view.limitations = strings(content.limitations);
  return view;
}

// --- evaluation --------------------------------------------------------------

export function mapEvaluation(e: Ws6Evaluation): LearnerEvaluation {
  return {
    evaluation_id: e.evaluation_id,
    draft_revision: e.draft_rev,
    // UI type is singular (WS7-Q5); all pinned revisions are kept, comma-joined.
    knowledge_revision_id: e.knowledge_revision_ids.join(","),
    outcome: e.outcome ?? "failed",
    message: e.feedback_text ?? "",
    guiding_question: e.guiding_question ?? null,
    citations: e.cited.map(c => ({
      entry_id: c.entry_id,
      revision_id: c.revision_id,
      quote: c.quote ? { exchange_id: c.exchange_ids[0] ?? "", text: c.quote } : null,
      evidence: null,
    })),
  };
}

// --- errors ------------------------------------------------------------------

export function parseApiError(body: unknown, status: number): { code: string | null; message: string } {
  const err = isObj(body) && isObj(body.error) ? body.error : null;
  const message = err ? str(err.message) : null;
  if (!err || !message) return { code: null, message: `HTTP ${status}` };
  return { code: str(err.code), message };
}
