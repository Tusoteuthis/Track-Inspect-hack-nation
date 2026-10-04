// Types for WS5 synthesis (Sprint 2): what goes in, what comes out, and the Work Map content
// WS6 serves from GET /api/workmap and WS7 renders. Semantics: notes/ws5-sprints/docs/knowledge-schema-v0.md

import type { ExpertConfirmation, ExpertExchange, PointingEvent, Region } from "@/lib/expert/contracts";
import type { EntryKind, EntryStatus, KnowledgeEntryContent, Statement } from "./schema";

export const SYNTHESIS_MODULE = { module: "ws5-synthesis", version: "0.2.0" } as const;

/** Links an answered debrief exchange to the gap it was asked for (WS3 `begin_question` gap_id). */
export type GapAnswer = { exchange_id: string; gap_id: string };

export type SynthesisInput = {
  events: readonly PointingEvent[];
  exchanges: readonly ExpertExchange[];
  confirmations: readonly ExpertConfirmation[];
  /** Every stored revision of every entry (WS6 store). The latest per entry is compared against. */
  prior: readonly KnowledgeEntryContent[];
  gap_answers?: readonly GapAnswer[];
  /** Turns an event's image ref into a path relative to `entries/<entry_id>/rev-<n>.md`. */
  resolve_image_ref: (ref: string, entry_id: string) => string;
};

export type GapKind =
  | "missing_reason"
  | "unclear_guardrail"
  | "conflict"
  | "unqualified_exception"
  | "missing_evidence"
  | "ambiguous_reference";

export type Gap = {
  /** Deterministic: `gap-<kind>-<subject id>`. */
  gap_id: string;
  kind: GapKind;
  /** Plain statement of what is missing. No interpretation. */
  description: string;
  related_event_ids: string[];
  related_exchange_ids: string[];
  /** 1 is asked first. */
  priority: 1 | 2 | 3;
};

export type ReviewedRevision = { entry_id: string; revision_id: string };

export type TeachBack = {
  /** Spoken text: process-shaped, quotes the expert verbatim, ends with the confirmation question. */
  text: string;
  /** One sentence per entry, in workflow order. */
  items: { entry_id: string; revision_id: string; kind: EntryKind; text: string }[];
  question: string;
  /** A confirmation of this teach-back binds to exactly these revisions. */
  reviewed: ReviewedRevision[];
};

export type WorkflowStep = {
  position: number;
  entry_id: string;
  revision_id: string;
  kind: EntryKind;
  status: EntryStatus;
  /** AI-written label, not expert words. */
  title: string;
  event_ids: string[];
};

export type WorkflowDoc = {
  produced_by: { module: string; version: string };
  /** Logical decision order (steps, exceptions, guardrails, escalations), not recording order. */
  steps: WorkflowStep[];
  /** Recording order, kept as secondary metadata. Session time is not signal time. */
  timeline: { event_id: string; session_time_ms: number; exchange_ids: string[] }[];
};

export type ReconfirmationFlag = { entry_id: string; revision_id: string; reason: string };

export type SynthesisOutput = {
  /** New draft revisions only. Unchanged entries produce nothing. */
  entries: KnowledgeEntryContent[];
  workflow: WorkflowDoc;
  gaps: Gap[];
  teach_back: TeachBack | null;
  /** Current revisions that share evidence with a corrected entry, or lost their support. */
  flagged_for_reconfirmation: ReconfirmationFlag[];
};

// --- Work Map (WS7 renders, WS6 serves) ---------------------------------------

export type WorkMapExpertWords = { exchange_id: string; question: string | null; quote: string };

export type WorkMapStep = {
  position: number;
  entry_id: string;
  revision_id: string;
  status: EntryStatus;
  kind: EntryKind;
  title: string;
  /** Verbatim expert words. A quote that is not verbatim is left out and reported in broken_links. */
  expert_words: WorkMapExpertWords[];
  /** AI synthesis, always tagged as such. */
  synthesis: { type: "ai_synthesis"; text: string }[];
  guardrails: { trigger: Statement; action: Statement; expert_words: WorkMapExpertWords[] }[];
  visual: { event_id: string; asset_id: string | null; original_ref: string; highlighted_ref: string; region: Region }[];
  confirmation: KnowledgeEntryContent["confirmation"];
  /** Missing evidence, never dropped silently. Empty when every link resolves. */
  broken_links: string[];
};

export type WorkMapContent = {
  steps: WorkMapStep[];
  /** Workflow steps not shown, with the reason (not eligible, revoked, missing revision). */
  excluded: { entry_id: string; revision_id: string; reason: string }[];
};

export type WorkMapAsset = { asset_id: string; event_id: string | null; original_ref: string; highlighted_ref: string };
