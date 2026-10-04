/**
 * Module host: typed interfaces for partner logic that WS6 invokes in-process, and the registry
 * that picks the implementation. WS5 defines the semantics; WS6 only maps shapes.
 *
 * `WS5_MODULES=stub` forces the stub; anything else (or unset) uses the real WS5 module, which is
 * importable since WS5 Sprint 2 was merged. `/api/health.modules` reports what is active.
 */
import type {
  Gap,
  KnowledgeRef,
  KnowledgeRevision,
  ModuleInfo,
  PointingEventIngest,
  ProducedBy,
  Session,
} from "@/lib/contracts";
import type { ExpertConfirmation, ExpertExchange } from "@/lib/expert/contracts";
import { createWs6SynthesisModule, parseEntryMarkdown, SYNTHESIS_MODULE, type Ws6KnowledgeRevision } from "@/lib/knowledge";
import { createStubSynthesis, STUB_MODULE } from "./synthesis-stub";

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
        return {
          revisions: out.revisions.map(r => ({
            entry_id: r.entry_id,
            markdown: r.markdown,
            evidence: r.evidence,
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

/** Reported by `/api/health.modules`. */
export function activeModules(): Record<string, ModuleInfo> {
  return { synthesis: synthesisProvider().info };
}
