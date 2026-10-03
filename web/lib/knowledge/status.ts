// Status transitions for one knowledge revision. WS6 calls this when a confirmation or a
// revocation arrives. It only computes the status; it never edits a revision's content.
// A correction always leads to a new revision (parent_revision_id = the reviewed one).
// WS6 must also check that the confirmation's revision_id is this exact revision.

import type { ConfirmationStatus } from "@/lib/expert/contracts";
import type { EntryStatus } from "./schema";

export type StatusAction = { type: "confirmation"; result: ConfirmationStatus } | { type: "revoke" };

export type StatusTransition =
  | {
      ok: true;
      /** Status of the reviewed revision after the action. */
      status: EntryStatus;
      /** True for a correction: create rev-(n+1) as a draft; the reviewed revision is not edited. */
      new_revision_required: boolean;
    }
  | { ok: false; error: "invalid_transition"; message: string };

const to = (status: EntryStatus, new_revision_required = false): StatusTransition => ({
  ok: true,
  status,
  new_revision_required,
});

export function nextStatus(current: EntryStatus, action: StatusAction): StatusTransition {
  if (current === "revoked") {
    return {
      ok: false,
      error: "invalid_transition",
      message: "revoked is terminal; teaching this again needs a new, separately confirmed revision",
    };
  }
  if (action.type === "revoke") return to("revoked");

  switch (action.result) {
    case "confirmed":
      return to("confirmed");
    case "unresolved":
      // An expert who is no longer sure withdraws a confirmed rule from teaching.
      return to("unresolved");
    case "corrected":
      // The corrected understanding becomes a new draft revision that needs its own confirmation.
      // A confirmed revision the expert just corrected must stop teaching at once, even before
      // the new revision is confirmed or current.json moves, so it drops to unresolved.
      return to(current === "confirmed" ? "unresolved" : current, true);
  }
}
