// Public API of the WS5 knowledge modules (schema "ws5.v0"). WS6 hosts these behind
// web/lib/backend/modules.ts; WS7 renders entries but owns no meaning.

export * from "./schema";
export { EntryMarkdownError, HEADINGS, parseEntryMarkdown, renderEntryMarkdown } from "./markdown";
export { nextStatus, type StatusAction, type StatusTransition } from "./status";
export {
  ELIGIBILITY_ORDER,
  isTeachable,
  selectEligible,
  type EligibilityContext,
  type ExcludedRevision,
  type IneligibleReason,
  type KnowledgeCandidate,
  type PinnedKnowledge,
  type Teachability,
} from "./eligibility";
export {
  IneligibleKnowledgeError,
  KIND_PRIORITY,
  retrieve,
  type RetrievalHit,
  type RetrievalQuery,
  type RetrievalRequest,
} from "./retrieve";

// Sprint 2: synthesis, gaps, teach-back, Work Map, partner adapters.
export * from "./synthesis-types";
export { contentHash, KIND_LABEL, renderWorkflowMarkdown, synthesize } from "./synthesize";
export { findGaps, type GapInput } from "./gaps";
export { buildTeachBack, TEACH_BACK_QUESTION } from "./teach-back";
export { buildWorkMap, type WorkMapInput } from "./workmap";
export { knowledgeImageRef } from "./adapters/image-ref";
export { toWs3Gap, ws3Synthesis, type Ws3Gap, type Ws3SynthesisModule, type Ws3SynthesisState } from "./adapters/ws3-synthesis";
export {
  createWs6SynthesisModule,
  type Ws6DraftKnowledgeOut,
  type Ws6KnowledgeRevision,
  type Ws6Session,
  type Ws6SynthesisInput,
  type Ws6SynthesisModule,
  type Ws6SynthesisOptions,
  type Ws6SynthesisResult,
} from "./adapters/ws6-synthesis-module";
