/**
 * Module host: typed interfaces for partner logic that WS6 invokes in-process, and the registry
 * that picks the implementation. WS5 defines the semantics; WS6 only maps shapes.
 *
 * Synthesis: `WS5_MODULES=stub` forces the stub; anything else (or unset) uses the real WS5 module.
 * Tutor: the stub by default; `WS5_MODULES=real` uses WS5's evaluator (Anthropic judge, needs
 * `ANTHROPIC_API_KEY`), so tests and the e2e run stay deterministic without a key.
 * Assessment: the stub until WS5 ships an assessment module. `/api/health.modules` reports all three.
 */
import type {
  Citation,
  Confirmation,
  Evaluation,
  Gap,
  KnowledgeRef,
  KnowledgeRevision,
  LearnerDraft,
  ModuleInfo,
  PointingEventIngest,
  ProducedBy,
  Session,
  Source,
} from "@/lib/contracts";
import type { ExpertConfirmation, ExpertExchange } from "@/lib/expert/contracts";
import {
  createWs6SynthesisModule,
  createWs6TutorEvaluator,
  parseEntryMarkdown,
  SYNTHESIS_MODULE,
  TUTOR_EVALUATOR,
  type Judge,
  type Ws6KnowledgeRevision,
} from "@/lib/knowledge";
import { createStubSynthesis, STUB_MODULE } from "./synthesis-stub";
import { createStubTutor, STUB_TUTOR } from "./tutor-stub";
import { ws5Content, type Revocation } from "./ws5-content";

/** One draft revision for WS6 to store as `entries/<entry_id>/rev-<n>.md`. */
export type DraftKnowledgeOut = {
  entry_id: string;
  /** Module Markdown (body of the revision file). Image links relative to the revision file. */
  markdown: string;
  evidence: KnowledgeRevision["evidence"];
  produced_by: ProducedBy;
  change_reason: string | null;
  /** If the module numbers revisions, WS6 checks it against its own numbering. */
  revision_no?: number;
  parent_revision_id?: string | null;
};

export type SynthesisInput = {
  session: Session;
  events: PointingEventIngest[];
  exchanges: ExpertExchange[];
  /** Every stored revision of every entry. */
  prior: KnowledgeRevision[];
  /** The session's stored confirmations (WS3 shape; `revision_id` = WS6 revision ID). */
  confirmations: ExpertConfirmation[];
};

export type SynthesisOutput = {
  revisions: DraftKnowledgeOut[];
  workflow_markdown: string;
  gaps: Gap[];
  teach_back: string | null;
  /** Revisions a teach-back confirmation binds to; a new revision may be named as `rev-<n>`. */
  teach_back_reviewed?: KnowledgeRef[];
  flagged_for_reconfirmation?: { entry_id: string; revision_id: string; reason: string }[];
};

export interface SynthesisModule {
  id: string;
  version: string;
  synthesize(input: SynthesisInput): Promise<SynthesisOutput>;
}

/** What WS6 offers a module for one job: stored content and image-link mapping. */
export type SynthesisHost = {
  /** The module Markdown of a stored revision, or null if unreadable. */
  loadMarkdown(revision: KnowledgeRevision): Promise<string | null>;
  /** Maps an event image ref (`/api/assets/<aid>/original`) to a path relative to the entry file. */
  imageRef(ref: string, entryId: string): string;
};

export type SynthesisProvider = { info: ModuleInfo; create(host: SynthesisHost): SynthesisModule };

const ws5Provider: SynthesisProvider = {
  info: { id: SYNTHESIS_MODULE.module, version: SYNTHESIS_MODULE.version, source: "live" },
  create(host) {
    const ws5 = createWs6SynthesisModule({
      load_content: async rev => {
        const md = await host.loadMarkdown(rev as KnowledgeRevision);
        if (md === null) return null;
        try {
          return parseEntryMarkdown(md);
        } catch {
          return null; // not WS5 format (e.g. a stub draft): WS5 leaves it alone
        }
      },
      resolve_image_ref: (ref, entryId) => host.imageRef(ref, entryId),
    });
    return {
      id: ws5.id,
      version: ws5.version,
      async synthesize(input) {
        const out = await ws5.synthesize({
          // WS5 reads only the id; its Source type has no "stub" (WS5-Q1).
          session: { session_id: input.session.session_id, source: input.session.source === "fixture" ? "fixture" : "live" },
          events: input.events,
          exchanges: input.exchanges,
          // Stub revisions are not WS5 content; WS5 would skip them anyway.
          prior: input.prior.filter((r): r is KnowledgeRevision & Ws6KnowledgeRevision => r.produced_by.source !== "stub"),
          confirmations: input.confirmations,
        });
        // WS3 events carry no asset_id, so WS5 leaves it null; WS6 knows it from the stored event.
        const assetOf = new Map(input.events.flatMap(e => (e.asset_id ? [[e.event_id, e.asset_id] as const] : [])));
        return {
          revisions: out.revisions.map(r => ({
            entry_id: r.entry_id,
            markdown: r.markdown,
            evidence: {
              ...r.evidence,
              asset_ids: [
                ...new Set([...r.evidence.asset_ids, ...r.evidence.event_ids.flatMap(id => (assetOf.has(id) ? [assetOf.get(id)!] : []))]),
              ].sort(),
            },
            produced_by: r.produced_by,
            change_reason: r.change_reason,
            revision_no: r.revision_no,
            parent_revision_id: r.parent_revision_id,
          })),
          workflow_markdown: out.workflow_markdown,
          gaps: out.gaps,
          teach_back: out.teach_back,
          teach_back_reviewed: out.teach_back_reviewed,
          flagged_for_reconfirmation: out.flagged_for_reconfirmation,
        };
      },
    };
  },
};

const stubProvider: SynthesisProvider = { info: STUB_MODULE, create: createStubSynthesis };

let override: SynthesisProvider | null = null;

export function synthesisProvider(): SynthesisProvider {
  if (override) return override;
  return process.env.WS5_MODULES?.trim() === "stub" ? stubProvider : ws5Provider;
}

/** Tests inject a controllable module; pass null to restore the registry. */
export function setSynthesisProviderForTests(provider: SynthesisProvider | null): void {
  override = provider;
}

export const SYNTHESIS_PROVIDERS = { real: ws5Provider, stub: stubProvider } as const;

// --- tutor evaluation (S3) ------------------------------------------------------

/** What the tutor sees of the case: the learner view only (no evaluator material, ever). */
export type TutorCaseView = {
  case_id: string;
  title: string | null;
  trace_asset: string;
  shown_to_expert: boolean;
  source: Source;
  visible_context: string[];
};

export type TutorInput = {
  draft: LearnerDraft;
  case_view: TutorCaseView;
  /** The session's pinned, eligible revisions only. */
  knowledge: KnowledgeRevision[];
};

export type TutorResult = {
  outcome: string;
  cited: Citation[];
  feedback_text: string;
  uncertainty?: string | null;
  guiding_question?: string | null;
  escalation?: KnowledgeRef | null;
  evidence?: NonNullable<Evaluation["evidence"]>;
  guard_notes?: string[];
};

export interface TutorEvaluator {
  id: string;
  version: string;
  evaluate(input: TutorInput): Promise<TutorResult>;
}

/** Stored records the evaluator may re-read; never evaluator-only material. */
export type TutorHost = {
  allowFixture: boolean;
  loadMarkdown(revision: KnowledgeRevision): Promise<string | null>;
  revisionContext(
    revision: KnowledgeRevision,
  ): Promise<{ status: KnowledgeRevision["status"]; confirmation: Confirmation | null; revocation: Revocation | null }>;
  loadRecords(): Promise<{ events: PointingEventIngest[]; exchanges: ExpertExchange[]; current_revision_no_by_entry: Record<string, number> }>;
};

export type TutorProvider = { info: ModuleInfo; create(host: TutorHost): TutorEvaluator };

/** The real WS5 evaluator. `judge` is injectable for tests; by default WS5 builds its Anthropic judge. */
export const createWs5TutorProvider = (judge?: Judge): TutorProvider => ({
  info: { id: TUTOR_EVALUATOR.id, version: TUTOR_EVALUATOR.version, source: "live" },
  create(host) {
    const ws5 = createWs6TutorEvaluator({
      load_content: async rev => {
        const revision = rev as KnowledgeRevision;
        const md = await host.loadMarkdown(revision);
        const { status, confirmation, revocation } = await host.revisionContext(revision);
        const content = md === null ? null : ws5Content(md, revision, status, confirmation, revocation);
        if (!content) throw new Error(`revision ${revision.revision_id} is not WS5 content`);
        return content;
      },
      load_records: host.loadRecords,
      allow_fixture: host.allowFixture,
      ...(judge ? { judge } : {}),
    });
    return {
      id: ws5.id,
      version: ws5.version,
      async evaluate({ draft, case_view, knowledge }) {
        const r = await ws5.evaluate({
          draft,
          case_view,
          // WS5's Source has no "stub"; stub revisions are never WS5 content and fail load_content.
          knowledge: knowledge as (KnowledgeRevision & Ws6KnowledgeRevision)[],
        });
        return {
          outcome: r.outcome,
          cited: r.cited,
          feedback_text: r.feedback_text,
          uncertainty: r.uncertainty ?? null,
          guiding_question: r.guiding_question,
          escalation: r.escalation,
          evidence: r.evidence,
          guard_notes: r.guard_notes,
        };
      },
    };
  },
});

const ws5TutorProvider = createWs5TutorProvider();

const stubTutorProvider: TutorProvider = { info: STUB_TUTOR, create: createStubTutor };

let tutorOverride: TutorProvider | null = null;

export function tutorProvider(): TutorProvider {
  if (tutorOverride) return tutorOverride;
  return process.env.WS5_MODULES?.trim() === "real" ? ws5TutorProvider : stubTutorProvider;
}

export function setTutorProviderForTests(provider: TutorProvider | null): void {
  tutorOverride = provider;
}

export const TUTOR_PROVIDERS = { real: ws5TutorProvider, stub: stubTutorProvider } as const;

/** WS5 has no assessment module yet; WS6 builds a facts-only stub record (`assessment.ts`). */
export const STUB_ASSESSMENT: ModuleInfo = { id: "ws6-stub-assessment", version: "0.1.0", source: "stub" };

/** Reported by `/api/health.modules`. */
export function activeModules(): Record<string, ModuleInfo> {
  return { synthesis: synthesisProvider().info, tutor: tutorProvider().info, assessment: STUB_ASSESSMENT };
}
