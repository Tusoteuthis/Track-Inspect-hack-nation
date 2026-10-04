// Swap point for WS5. The debrief and teach-back only talk to this interface. WS5 can
// replace the stand-in tracker and draft builder with its own, but it must keep the
// evidence ids (event_id, exchange_id) and leave revision ids to the client.

import type { DraftRevision, Gap, ProposeDraftParams, SessionSnapshot } from "./contracts";
import { selectGaps } from "./coverage";
import { type BuildResult, buildRevision, fallbackProposal } from "./draft";

export type SynthesisState = Pick<
  SessionSnapshot,
  "session_id" | "events" | "exchanges" | "topics" | "coverage" | "open_questions" | "revisions"
>;

export interface Synthesis {
  /** Ordered gaps: things the material does not explain yet. Covered items never appear. */
  getGaps(state: SynthesisState): Gap[];
  /**
   * The next revision. `proposal` is the step text the voice agent proposed; null means the
   * synthesis writes the text itself. `parent` is the revision being corrected.
   */
  buildDraft(
    state: SynthesisState,
    parent: DraftRevision | null,
    options: { proposal: ProposeDraftParams | null; at_utc: string; change_reason: string | null; change_exchange_ids: string[] }
  ): BuildResult;
}

/** WS3's in-memory stand-in. */
export const defaultSynthesis: Synthesis = {
  getGaps: state => selectGaps(state),
  buildDraft: (state, parent, { proposal, ...opts }) =>
    buildRevision(state, proposal ?? fallbackProposal(state), { ...opts, parent }),
};
