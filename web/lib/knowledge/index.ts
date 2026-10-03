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
