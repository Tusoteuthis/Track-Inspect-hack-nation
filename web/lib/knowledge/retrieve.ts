// Explainable retrieval over the pinned knowledge of one newcomer session: lexical overlap
// with the learner's draft and the visible case, plus a priority by kind. No embeddings,
// no LLM. Eligible guardrails and escalation rules are always returned.

import { isTeachable, wasPinnedByEligibility, type EligibilityContext } from "./eligibility";
import { collectQuotes, validateEntry, type EntryKind, type KnowledgeEntryContent, type Statement } from "./schema";

export type RetrievalQuery = {
  decision: string | null;
  reason: string | null;
  /** Text describing what the learner is looking at (e.g. a region description). */
  visual_context: string | null;
  case_observations: readonly string[];
};

export type RetrievalRequest = {
  /** The `pinned` list from selectEligible. Anything else is refused. */
  knowledge: readonly KnowledgeEntryContent[];
  query: RetrievalQuery;
  limit: number;
  /** When given, every revision is re-checked against current eligibility (catches revocations since pinning). */
  ctx?: EligibilityContext;
};

export type RetrievalHit = { entry_id: string; revision_id: string; score: number; why: string };

export class IneligibleKnowledgeError extends Error {
  constructor(readonly rejected: { entry_id: string; revision_id: string; reason: string }[]) {
    super(`retrieve() refused ineligible knowledge: ${rejected.map(r => `${r.entry_id}@${r.revision_id} (${r.reason})`).join(", ")}`);
    this.name = "IneligibleKnowledgeError";
  }
}

export const KIND_PRIORITY: Readonly<Record<EntryKind, number>> = {
  guardrail: 0.3,
  escalation: 0.3,
  exception: 0.2,
  decision: 0.1,
  step: 0,
};
const ALWAYS_INCLUDED: ReadonlySet<EntryKind> = new Set(["guardrail", "escalation"]);

const STOP_WORDS = new Set(
  "a an and are as at be but by do does for from has have i if in is it its of on or so that the then this to was were what when where which with you".split(" ")
);

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .normalize("NFKC")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(t => t.length > 1 && !STOP_WORDS.has(t))
  );
}

const statementText = (s: Statement | null) => (s ? (s.type === "expert_quote" ? s.quote : s.text) : "");

function entryText(e: KnowledgeEntryContent): string {
  return [
    statementText(e.workflow_step),
    statementText(e.observation),
    ...e.interpretation.map(statementText),
    ...e.reasoning.map(statementText),
    ...e.exceptions.flatMap(x => [statementText(x.trigger), statementText(x.action)]),
    ...collectQuotes(e).map(q => q.quote),
  ].join(" ");
}

function refuseIneligible(knowledge: readonly KnowledgeEntryContent[], ctx: EligibilityContext | undefined): void {
  const rejected: { entry_id: string; revision_id: string; reason: string }[] = [];
  for (const e of knowledge) {
    const id = { entry_id: String(e?.entry_id), revision_id: String(e?.revision_id) };
    if (!wasPinnedByEligibility(e)) rejected.push({ ...id, reason: "not pinned by selectEligible" });
    else if (e.status !== "confirmed") rejected.push({ ...id, reason: `status ${e.status}` });
    else if (!validateEntry(e).ok) rejected.push({ ...id, reason: "invalid" });
    else if (ctx) {
      const r = isTeachable({ record_type: "knowledge_entry", path: null, entry: e }, ctx);
      if (!r.ok) rejected.push({ ...id, reason: r.reason });
    }
  }
  if (rejected.length) throw new IneligibleKnowledgeError(rejected);
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Ranked, deterministic hits. Throws IneligibleKnowledgeError if any input is not eligible. */
export function retrieve({ knowledge, query, limit, ctx }: RetrievalRequest): RetrievalHit[] {
  refuseIneligible(knowledge, ctx);
  const queryTokens = tokenize(
    [query.decision ?? "", query.reason ?? "", query.visual_context ?? "", ...query.case_observations].join(" ")
  );

  const scored = knowledge.map(e => {
    const entryTokens = tokenize(entryText(e));
    const matched = [...queryTokens].filter(t => entryTokens.has(t)).sort();
    const overlap = queryTokens.size ? matched.length / queryTokens.size : 0;
    const priority = KIND_PRIORITY[e.kind];
    const always = ALWAYS_INCLUDED.has(e.kind);
    const why = [
      matched.length ? `matched ${matched.length}/${queryTokens.size} query terms: ${matched.join(", ")}` : "no query terms matched",
      `kind ${e.kind} (+${priority})`,
      ...(always ? ["always included: eligible guardrail/escalation rule"] : []),
    ].join("; ");
    return { hit: { entry_id: e.entry_id, revision_id: e.revision_id, score: round(overlap + priority), why }, always, matched: matched.length };
  });

  const byScore = (a: (typeof scored)[number], b: (typeof scored)[number]) =>
    b.hit.score - a.hit.score || a.hit.entry_id.localeCompare(b.hit.entry_id);

  const always = scored.filter(s => s.always);
  const others = scored
    .filter(s => !s.always && s.matched > 0)
    .sort(byScore)
    .slice(0, Math.max(0, limit - always.length));
  // The limit never drops a guardrail or escalation rule.
  return [...always, ...others].sort(byScore).map(s => s.hit);
}
