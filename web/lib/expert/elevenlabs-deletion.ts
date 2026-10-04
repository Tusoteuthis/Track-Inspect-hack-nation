// Deletes this session's own ElevenLabs conversations (conversations.delete, VERIFIED LIVE in the
// Sprint 0 spike: whole conversation, then 404). ElevenLabs cannot delete part of a conversation,
// so after an off-record segment the whole conversation goes. Only ids stored in the session are
// ever sent; nothing is listed or bulk-deleted. The SDK call is injected for tests.

import type { ElevenLabsDeletionReport, SessionSnapshot } from "./contracts";

export type ConversationDeleter = (conversationId: string) => Promise<unknown>;

const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Why a deletion is not allowed for this saved session, or null when it is. */
export function deletionRefusal(snap: SessionSnapshot): string | null {
  if (snap.ended_at_utc === null) return "the session is still running; delete only after it has ended and been saved";
  if (!snap.recording_segments.some(s => s.state === "off_record")) return "the session has no off-record segment, so its conversation is kept";
  if (!snap.conversation_ids.length) return "the session has no ElevenLabs conversation id";
  return null;
}

const statusOf = (e: unknown) => (typeof e === "object" && e !== null && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined);

export async function deleteSessionConversations(snap: SessionSnapshot, del: ConversationDeleter, now = new Date()): Promise<ElevenLabsDeletionReport> {
  const refusal = deletionRefusal(snap);
  if (refusal) throw new Error(refusal);
  const results: ElevenLabsDeletionReport["results"] = [];
  for (const id of [...new Set(snap.conversation_ids)]) {
    if (!CONVERSATION_ID.test(id)) {
      results.push({ conversation_id: id, status: "failed", detail: "not a valid conversation id; not sent" });
      continue;
    }
    try {
      await del(id);
      results.push({ conversation_id: id, status: "deleted", detail: null });
    } catch (e) {
      const code = statusOf(e);
      if (code === 404) results.push({ conversation_id: id, status: "not_found", detail: "already deleted or never stored (404)" });
      else results.push({ conversation_id: id, status: "failed", detail: `${code ?? "error"}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  return { session_id: snap.session_id, at_utc: now.toISOString(), results };
}
