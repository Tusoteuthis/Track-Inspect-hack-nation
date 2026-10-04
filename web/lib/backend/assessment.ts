/**
 * Newcomer assessment. WS5 has no assessment module yet, so WS6 writes a stub record built only
 * from stored facts (first draft, interventions, final outcome, cited entries, WS5's timeline).
 * It makes no judgement: `practice_next` stays null until WS5 fills it.
 * Files: `knowledge/assessments/<sid>.json` + `.md`. Written once per session.
 */
import { AssessmentSchema, type Assessment, type KnowledgeRef } from "@/lib/contracts";
import { buildTimeline } from "@/lib/knowledge";
import { appendBus } from "./bus";
import { ApiError } from "./errors";
import { assertSafeId, safeJoin } from "./ids";
import { listDrafts, listEvaluations, loadCommit } from "./learner-store";
import { STUB_ASSESSMENT } from "./modules";
import { assessmentsDir } from "./paths";
import { getSession } from "./sessions";
import { readJson, writeFileAtomic, writeJsonAtomic } from "./store";

const jsonFile = (sid: string) => safeJoin(assessmentsDir(), sid) + ".json";
const mdFile = (sid: string) => safeJoin(assessmentsDir(), sid) + ".md";

const GUIDANCE = new Set(["intervene", "uncertain"]);

function renderMarkdown(a: Assessment, timeline: ReturnType<typeof buildTimeline>): string {
  const lines = [
    `# Assessment — ${a.session_id}`,
    "",
    `> STUB ASSESSMENT — facts only, no judgement (${STUB_ASSESSMENT.id} ${STUB_ASSESSMENT.version}, source: ${a.source}). practice_next requires WS5.`,
    "",
    `- Initial decision: ${a.initial_decision === null ? "_none_" : JSON.stringify(a.initial_decision)}`,
    `- Final outcome: ${a.final_outcome ?? "_not committed_"}`,
    `- Assistance: ${a.assistance.length ? "" : "_none_"}`,
    ...a.assistance.map(x => `  - ${x}`),
    `- Knowledge cited: ${a.evidence_used.length ? "" : "_none_"}`,
    ...a.evidence_used.map(r => `  - ${r.entry_id} @ ${r.revision_id}`),
    "",
    "## Timeline",
    "",
    ...timeline.map(t => `- ${t.at_utc} ${t.kind} draft_rev ${t.draft_rev}${t.evaluation_id ? ` ${t.evaluation_id}` : ""}${t.outcome ? ` (${t.outcome})` : ""}${t.intervention ? ` — ${t.intervention}` : ""}${t.commit_id ? ` ${t.commit_id}` : ""}`),
    "",
  ];
  return lines.join("\n");
}

/** Builds and stores the assessment unless one exists. Call inside the session lock. */
export async function storeAssessmentLocked(sid: string, now: Date): Promise<Assessment> {
  const existing = await readJson(jsonFile(sid), AssessmentSchema);
  if (existing) return existing;
  const session = await getSession(sid);
  const [drafts, evaluations, commit] = await Promise.all([listDrafts(sid), listEvaluations(sid), loadCommit(sid)]);
  const judged = evaluations.filter(e => e.outcome !== null && (e.status === "done" || e.status === "stale"));
  const cited = new Map<string, KnowledgeRef>();
  for (const e of judged) for (const c of e.cited) cited.set(`${c.entry_id}@${c.revision_id}`, { entry_id: c.entry_id, revision_id: c.revision_id });
  const committedEval = commit ? evaluations.find(e => e.evaluation_id === commit.evaluation_id) : undefined;

  const timeline = drafts.length
    ? buildTimeline(
        drafts.map(d => ({ draft_rev: d.draft_rev, updated_at_utc: d.updated_at_utc })),
        evaluations,
        commit ? [{ commit_id: commit.commit_id, draft_rev: commit.draft_rev, evaluation_id: commit.evaluation_id, at_utc: commit.at_utc }] : [],
      )
    : [];
  const assessment: Assessment = {
    session_id: sid,
    initial_decision: drafts[0]?.decision ?? null,
    assistance: judged.filter(e => GUIDANCE.has(e.outcome!)).map(e => `${e.outcome} on draft_rev ${e.draft_rev} (${e.evaluation_id})`),
    final_outcome: committedEval?.outcome ?? null,
    evidence_used: [...cited.values()],
    practice_next: null,
    source: session.source,
    created_at_utc: now.toISOString(),
    produced_by: { module: STUB_ASSESSMENT.id, version: STUB_ASSESSMENT.version, source: STUB_ASSESSMENT.source },
    content: {
      note: "STUB assessment built from stored facts only; practice_next requires WS5.",
      interventions: judged.filter(e => e.outcome === "intervene").length,
      evaluations: evaluations.length,
      committed: commit !== null,
      commit_id: commit?.commit_id ?? null,
      escalated: commit?.escalated ?? false,
      timeline,
    },
  };
  const parsed = AssessmentSchema.parse(assessment);
  await writeJsonAtomic(jsonFile(sid), parsed);
  await writeFileAtomic(mdFile(sid), renderMarkdown(parsed, timeline));
  await appendBus(sid, "assessment.stored", {}, now);
  return parsed;
}

export async function getAssessment(sid: string): Promise<Assessment> {
  assertSafeId(sid, "session_id");
  await getSession(sid);
  const a = await readJson(jsonFile(sid), AssessmentSchema);
  if (!a) throw new ApiError("not_found", "No assessment yet (it is written on commit or session end).", { session_id: sid });
  return a;
}

