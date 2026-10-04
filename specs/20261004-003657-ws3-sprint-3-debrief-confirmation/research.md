# Research / decisions

1. **Draft text comes from the `propose_draft` client tool (Option A).**
   - Rationale: the voice agent already holds the conversation. There is no server LLM key in `web/.env` (WS5 is blocked on `ANTHROPIC_API_KEY`). Client tools that return results are VERIFIED LIVE.
   - How it works: the client validates evidence ids and quotes, assigns `rev-n` and step ids, and is the only authority.
   - Fallback: a deterministic draft built from verbatim answer lines (console button and tests).
   - Alternative rejected: a server LLM route. It needs a new secret and a new dependency.

2. **Phase switch: tool result plus a `ws3-phase` contextual update** (capabilities doc, mechanism d).
   - The agent-initiated path (`signal_task_complete`, `propose_draft`) puts the phase text in the tool result, which is VERIFIED to reach the LLM.
   - The console path sends the contextual update and one `[CONTROL]` nudge, because a contextual update alone does not trigger a turn.

3. **Teach-back exchange opened by the client.**
   - When a revision is created, the reducer opens a `kind: teach_back` exchange. It waits for the agent's next final line, which is the teach-back text, verbatim.
   - The expert's next lines attach to it, so `confirm_revision` always has a concrete response exchange.
   - Reason: this does not depend on the agent remembering `begin_question` for a long monologue.

4. **Coverage exclusion.**
   - Covered items are excluded.
   - Items whose dimension was directly asked and answered on the same region are also excluded, mapped by question kind: explain→decision, reasoning→reason, context→cues, distinction→alternatives, guardrail→guardrails. This mirrors Sprint 2's "never the same kind twice on a topic".

5. **Agenda frozen at debrief start**, max 5 gaps (`DEBRIEF_MAX_GAPS`). This makes "tied to a gap missing before the debrief" checkable.

6. **Unknown/escalate.**
   - `record_coverage` accepts `status: "unknown_escalate"`. It stores `covered` with `resolution: "unknown_escalate"`, raises the row's guardrails dimension to covered, and closes the gap as `unknown`.
   - `buildDraft` guarantees a guardrail step for it.

7. **Stable step ids across revisions.**
   - An unchanged step (same kind and text) keeps its id. Changed or new steps get fresh ids.
   - The teach-back of rev-(n+1) covers only the new ids.
   - Verification: a step is `confirmed` only if the latest revision has a `confirmed` confirmation and some confirmation in its chain reviewed that step id.

8. **Immutable on disk.** The store refuses to overwrite `revisions/rev-n.json` with different content.
