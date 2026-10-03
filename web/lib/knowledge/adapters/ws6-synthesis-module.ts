// WS6 swap-in for the SynthesisModule hosted in web/lib/backend/modules.ts
// (notes/ws6-sprints/sprint-2-knowledge-confirmation.md). WS6's module host is not merged yet, so
// the Ws6* types below mirror the documented signature and WS6's KnowledgeRevision contract
// (branch 001-ws6-foundation-contracts, web/lib/contracts/knowledge.ts) structurally.
// WS6 owns ids, files and locks; this module only computes content.

import type { ExpertConfirmation, ExpertExchange, PointingEvent, Source } from "@/lib/expert/contracts";
import { renderEntryMarkdown } from "../markdown";
import { collectQuotes, type EntryStatus, type KnowledgeEntryContent } from "../schema";
import { renderWorkflowMarkdown, synthesize } from "../synthesize";
import { SYNTHESIS_MODULE, type Gap, type GapAnswer, type ReconfirmationFlag, type ReviewedRevision } from "../synthesis-types";
import { knowledgeImageRef } from "./image-ref";

/** The fields of WS6 `Session` this module reads. */
export type Ws6Session = { session_id: string; source: Source };

/** WS6 `KnowledgeRevision`: frontmatter of entries/<entry_id>/rev-<revision_no>.md. */
export type Ws6KnowledgeRevision = {
  schema_version: string;
  entry_id: string;
  /** Server-generated, globally unique. Not the WS5 "rev-<n>". */
  revision_id: string;
  revision_no: number;
  parent_revision_id: string | null;
  status: EntryStatus;
  content_path: string;
  evidence: { event_ids: string[]; exchange_ids: string[]; asset_ids: string[] };
  produced_by: { module: string; version: string; source: Source };
  created_at_utc: string;
};

/** One new draft revision for WS6 to persist as entries/<entry_id>/rev-<revision_no>.md. */
export type Ws6DraftKnowledgeOut = {
  entry_id: string;
  revision_no: number;
  /** WS6 revision_id of the parent (mapped from the WS5 parent "rev-<n>"), or null for a new entry. */
  parent_revision_id: string | null;
  status: "draft";
  change_reason: string | null;
  evidence: Ws6KnowledgeRevision["evidence"];
  produced_by: Ws6KnowledgeRevision["produced_by"];
  /** Markdown body (WS5 entry format; parse with parseEntryMarkdown). */
  markdown: string;
  content: KnowledgeEntryContent;
};

export type Ws6SynthesisInput = {
  session: Ws6Session;
  events: PointingEvent[];
  exchanges: ExpertExchange[];
  prior: Ws6KnowledgeRevision[];
  /** Not in WS6's documented input yet; needed so a teach-back correction produces rev-(n+1). */
  confirmations?: ExpertConfirmation[];
  /** Not in WS6's documented input yet; links debrief answers to gap ids. */
  gap_answers?: GapAnswer[];
};

export type Ws6SynthesisResult = {
  revisions: Ws6DraftKnowledgeOut[];
  workflow_markdown: string;
  gaps: Gap[];
  teach_back: string | null;
  /** Extensions: a confirmation of the teach-back binds to exactly these WS6 revision ids. */
  teach_back_reviewed: ReviewedRevision[];
  flagged_for_reconfirmation: ReconfirmationFlag[];
};

export type Ws6SynthesisModule = {
  id: string;
  version: string;
  synthesize(input: Ws6SynthesisInput): Promise<Ws6SynthesisResult>;
};

export type Ws6SynthesisOptions = {
  /** Reads a stored revision's Markdown body (WS6 store + parseEntryMarkdown). Null if unreadable. */
  load_content(revision: Ws6KnowledgeRevision): KnowledgeEntryContent | null | Promise<KnowledgeEntryContent | null>;
  resolve_image_ref?: (ref: string, entry_id: string) => string;
};

const revNo = (id: string) => Number(/^rev-(\d+)$/.exec(id)?.[1] ?? 0);

export function createWs6SynthesisModule(opts: Ws6SynthesisOptions): Ws6SynthesisModule {
  return {
    id: SYNTHESIS_MODULE.module,
    version: SYNTHESIS_MODULE.version,
    async synthesize(input) {
      // WS6 ids ↔ WS5 "rev-<n>": the revision number is the shared key. Status lives in WS6's records.
      const byNo = new Map(input.prior.map(r => [`${r.entry_id}#${r.revision_no}`, r]));
      const prior: KnowledgeEntryContent[] = [];
      for (const r of input.prior) {
        const content = await opts.load_content(r);
        if (content) prior.push({ ...content, entry_id: r.entry_id, revision_id: `rev-${r.revision_no}`, status: r.status });
      }

      const out = synthesize({
        events: input.events,
        exchanges: input.exchanges,
        confirmations: input.confirmations ?? [],
        prior,
        gap_answers: input.gap_answers,
        resolve_image_ref: opts.resolve_image_ref ?? knowledgeImageRef,
      });

      const ws6Id = (entryId: string, revisionId: string) => byNo.get(`${entryId}#${revNo(revisionId)}`)?.revision_id ?? revisionId;
      const revisions = out.entries.map(e => ({
        entry_id: e.entry_id,
        revision_no: revNo(e.revision_id),
        parent_revision_id: e.parent_revision_id ? ws6Id(e.entry_id, e.parent_revision_id) : null,
        status: "draft" as const,
        change_reason: e.change_reason ?? null,
        evidence: {
          event_ids: [...new Set(e.visual_evidence.map(v => v.event_id))].sort(),
          exchange_ids: [...new Set(collectQuotes(e).map(q => q.exchange_id))].sort(),
          asset_ids: [...new Set(e.visual_evidence.flatMap(v => (v.asset_id ? [v.asset_id] : [])))].sort(),
        },
        produced_by: { ...SYNTHESIS_MODULE, source: e.source },
        markdown: renderEntryMarkdown(e),
        content: e,
      }));

      return {
        revisions,
        workflow_markdown: renderWorkflowMarkdown(out.workflow),
        gaps: out.gaps,
        teach_back: out.teach_back?.text ?? null,
        // New revisions have no WS6 id until stored; WS6 maps "rev-<n>" after writing them.
        teach_back_reviewed: out.teach_back?.reviewed.map(r => ({ entry_id: r.entry_id, revision_id: ws6Id(r.entry_id, r.revision_id) })) ?? [],
        flagged_for_reconfirmation: out.flagged_for_reconfirmation.map(f => ({ ...f, revision_id: ws6Id(f.entry_id, f.revision_id) })),
      };
    },
  };
}
