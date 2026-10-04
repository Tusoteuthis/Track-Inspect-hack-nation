/**
 * WS5 content of a stored revision, as WS5's eligibility/tutor code expects it. Revision files are
 * immutable and carry their creation status, so WS6 injects the current status and the
 * confirmation evidence (status log + confirmations) and WS5's own revision numbering.
 */
import type { Confirmation, KnowledgeRevision, StatusTransition } from "@/lib/contracts";
import { parseEntryMarkdown, SYNTHESIS_MODULE, type KnowledgeEntryContent } from "@/lib/knowledge";

export const ws5RevisionId = (revisionNo: number) => `rev-${revisionNo}`;

/** Only revisions WS5 synthesis produced are WS5 content (stub output is not). */
export const isWs5Revision = (rev: KnowledgeRevision) => rev.produced_by.module === SYNTHESIS_MODULE.module;

export function latestConfirmation(confirmations: readonly Confirmation[], revisionId: string): Confirmation | null {
  return confirmations.filter(c => c.reviewed_revision_id === revisionId).sort((a, b) => a.at_utc.localeCompare(b.at_utc)).pop() ?? null;
}

export type Revocation = { at_utc: string; reason: string };

/** The last transition of this revision to `revoked`, from its entry's status log. */
export function revocationOf(log: readonly StatusTransition[], revisionId: string): Revocation | null {
  const t = log.filter(x => x.revision_id === revisionId && x.to === "revoked").pop();
  return t ? { at_utc: t.at_utc, reason: t.reason ?? "revoked" } : null;
}

export function ws5Content(
  markdown: string,
  rev: KnowledgeRevision,
  status: KnowledgeEntryContent["status"],
  confirmation: Confirmation | null,
  revocation: Revocation | null = null,
): KnowledgeEntryContent | null {
  if (!isWs5Revision(rev)) return null;
  try {
    const parsed = parseEntryMarkdown(markdown);
    return {
      ...parsed,
      revision_id: ws5RevisionId(rev.revision_no),
      status,
      ...(status === "revoked" ? { revoked_at_utc: revocation?.at_utc ?? rev.created_at_utc, revoked_reason: revocation?.reason ?? "revoked" } : {}),
      confirmation: confirmation && {
        confirmation_id: confirmation.confirmation_id,
        revision_id_reviewed: ws5RevisionId(rev.revision_no),
        result: confirmation.result,
        expert_response_exchange_id: confirmation.expert_response_exchange_id,
      },
    } satisfies KnowledgeEntryContent;
  } catch {
    return null;
  }
}
