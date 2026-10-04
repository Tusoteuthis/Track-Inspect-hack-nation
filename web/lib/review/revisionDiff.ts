// Presentation-only comparison of the revision under review with its parent:
// which displayed fields of which items changed. It makes no domain judgement.
import { KIND_LABEL, statusPresentation } from "@/lib/ui/status";
import type { EvidenceRef, WorkMapStep, WorkMapView } from "@/lib/ui/contracts";

export type DiffField =
  | "title"
  | "kind"
  | "status"
  | "ai_summary"
  | "reasoning"
  | "expert_quotes"
  | "guardrails"
  | "evidence"
  | "open_question";

export type FieldChange = { field: DiffField; label: string; before: string; after: string };

export type RevisionDiff = {
  hasPrevious: boolean;
  changed: Record<string, FieldChange[]>;
  added: string[];
  removed: { entry_id: string; title: string }[];
  anyChange: boolean;
};

const NONE = "(none)";
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

// Describes evidence by position and status only, never by record id.
function describeEvidence(evidence: EvidenceRef[]): string {
  if (evidence.length === 0) return NONE;
  return evidence
    .map((e, i) => {
      const r = e.region;
      const where = r ? `${r.mapping_status} region at ${pct(r.x)}, ${pct(r.y)}, size ${pct(r.width)} × ${pct(r.height)}` : "no region";
      return `Evidence ${i + 1}: ${where}`;
    })
    .join("; ");
}

const FIELDS: { field: DiffField; label: string; text: (s: WorkMapStep) => string }[] = [
  { field: "title", label: "Title", text: s => s.title },
  { field: "kind", label: "Kind", text: s => KIND_LABEL[s.kind] },
  { field: "status", label: "Status", text: s => statusPresentation(s.status).label },
  { field: "ai_summary", label: "Apprentice summary", text: s => s.ai_summary ?? NONE },
  { field: "reasoning", label: "Reasoning", text: s => s.reasoning ?? NONE },
  { field: "expert_quotes", label: "Expert's words", text: s => s.expert_quotes.map(q => `“${q.text}”`).join(" ") || NONE },
  { field: "guardrails", label: "Guardrails and exceptions", text: s => s.guardrails.join("; ") || NONE },
  {
    field: "evidence",
    label: "Visual evidence",
    // Assets are compared too, so a swapped image is reported even at the same position.
    text: s => `${describeEvidence(s.evidence)}${s.evidence.length ? ` [${s.evidence.map(e => e.asset.original_url).join(",")}]` : ""}`,
  },
  { field: "open_question", label: "Open question", text: s => s.open_question ?? NONE },
];

export function diffRevisions(previous: WorkMapView | null, current: WorkMapView): RevisionDiff {
  if (!previous) return { hasPrevious: false, changed: {}, added: [], removed: [], anyChange: false };

  const before = new Map(previous.steps.map(s => [s.entry_id, s]));
  const nowIds = new Set(current.steps.map(s => s.entry_id));
  const changed: Record<string, FieldChange[]> = {};
  const added: string[] = [];

  for (const step of current.steps) {
    const old = before.get(step.entry_id);
    if (!old) {
      added.push(step.entry_id);
      continue;
    }
    const changes = FIELDS.filter(f => f.text(old) !== f.text(step)).map(f => ({
      field: f.field,
      label: f.label,
      before: f.field === "evidence" ? describeEvidence(old.evidence) : f.text(old),
      after: f.field === "evidence" ? describeEvidence(step.evidence) : f.text(step),
    }));
    if (changes.length) changed[step.entry_id] = changes;
  }

  const removed = previous.steps.filter(s => !nowIds.has(s.entry_id)).map(s => ({ entry_id: s.entry_id, title: s.title }));
  return {
    hasPrevious: true,
    changed,
    added,
    removed,
    anyChange: Object.keys(changed).length > 0 || added.length > 0 || removed.length > 0,
  };
}
