// DEV ONLY: WS5 end-to-end proof, from a captured expert statement to an unseen case, a caught
// wrong decision, a corrected save and the learning assessment. Real WS5 modules throughout;
// every step is labelled REAL (our module), FIXTURE (input data), STAND-IN (a partner piece that
// is not merged, mirrored locally) or LIVE (a real external call). Run from web/:
//   npx tsx lib/knowledge/dev/e2e-ws5.mts               # judge: Anthropic if ANTHROPIC_API_KEY, else stand-in
//   npx tsx lib/knowledge/dev/e2e-ws5.mts --live-tutor  # also ask the live ElevenLabs tutor agent (text simulation)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssessment, renderAssessmentMarkdown, type AssessmentEvaluation } from "../assessment";
import { isTeachable, selectEligible } from "../eligibility";
import { evaluate } from "../evaluate";
import type { Judge, TutorEvaluation } from "../evaluation-types";
import { createAnthropicJudge } from "../judge-anthropic";
import { describeScreenContext, fromPracticeState, screenContextFor } from "../observation";
import { buildTimeline } from "../timeline";
import { checkPinnedKnowledge, flagDependents } from "../trust";
import { buildEvaluationContextBlock, buildKnowledgeChangedBlock, buildSessionContextBlock, TutorContextError } from "../tutor-context";
import { buildExpertScenario, commitStandIn, createStandInJudge, E2E_FIXTURES_DIR, loadUnseenCase, revokeRevision, withRevision } from "./scenario";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const envPath = join(webDir, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
const liveTutor = process.argv.includes("--live-tutor");

const SESSION_ID = "sess-e2e-newcomer";
let clockMs = Date.parse("2026-10-04T12:00:00.000Z");
const tick = (secs: number) => new Date((clockMs += secs * 1000)).toISOString();

let step = 0;
const head = (label: string, title: string) => console.log(`\n── ${++step}. [${label}] ${title}`);
const line = (s = "") => console.log(`   ${s.replaceAll("\n", "\n   ")}`);

console.log("WS5 end-to-end: expert quote → unseen case → caught before save → corrected save → assessment");
console.log("Labels: REAL = WS5 module · FIXTURE = input data · STAND-IN = unmerged partner piece mirrored locally · LIVE = external call");
console.log("Timestamps are a scripted clock starting 2026-10-04T12:00:00Z (reproducible output).");

// 1–3. Expert side ----------------------------------------------------------------------------
head("FIXTURE", "Expert session (WS3 fixture exchanges and pointing events; placeholder wording)");
const s = buildExpertScenario();
const sx002 = s.exchanges.find(x => x.exchange_id === "sx-002")!;
line(`exchange sx-002 (event ${sx002.event_id}, ${sx002.record_state}), answer lines:`);
sx002.answer_lines.forEach(l => line(`  "${l.text}"`));
const offRecord = s.exchanges.filter(x => x.record_state === "off_record").map(x => x.exchange_id);
line(`off-record exchanges in the session: ${offRecord.join(", ")}; off-record events: ${s.ctx.events.filter(e => e.record_state === "off_record").map(e => e.event_id).join(", ")}`);

head("REAL", "Synthesis (run 1: live + debrief; run 2: the expert's teach-back correction sx-010)");
line(`run 1 → ${s.run1.entries.length} draft revisions; run 2 → ${s.run2.entries.map(e => `${e.entry_id}@${e.revision_id}`).join(", ")}`);
const guardrailRev = s.candidates.map(c => c.entry).find(e => e.entry_id === "ent-evt-001-guardrail")!;
line(`ent-evt-001-guardrail ${guardrailRev.revision_id}: expert words "${guardrailRev.expert_words[0].quote}" (exchange ${guardrailRev.expert_words[0].exchange_id})`);
line(`flagged for re-confirmation by synthesis: ${s.run2.flagged_for_reconfirmation.map(f => f.entry_id).join(", ")}`);

head("FIXTURE + STAND-IN", "Teach-back confirmed by the expert (exchange sx-011, confirmation cnf-sx-002); WS6 binding mirrored");
line(`teach-back reviewed: ${s.run2.teach_back!.reviewed.map(r => `${r.entry_id}@${r.revision_id}`).join(", ")}`);

// 4. Pin ---------------------------------------------------------------------------------------
head("REAL", "Pin eligible knowledge for the newcomer session (selectEligible)");
const { pinned, excluded } = selectEligible(s.candidates, s.ctx);
line(`pinned: ${pinned.map(e => `${e.entry_id}@${e.revision_id}`).join(", ")}`);
line(`excluded: ${excluded.map(x => `${x.entry_id}@${x.revision_id} (${x.reason})`).join(", ")}`);
const pinnedRefs = pinned.map(e => ({ entry_id: e.entry_id, revision_id: e.revision_id }));
const pinnedCandidates = s.candidates.filter(c => isTeachable(c, s.ctx).ok);
const sessionBlock = buildSessionContextBlock({ session_id: SESSION_ID, pinned_count: pinned.length, source: "fixture", screen: null });

// 5. Unseen case + screen ------------------------------------------------------------------------
const unseen = loadUnseenCase();
head("FIXTURE", `Unseen case ${unseen.case_view.case_id} (shown_to_expert=${unseen.shown_to_expert}); learner-visible context only`);
unseen.case_view.visible_context.forEach(v => line(`- ${v}`));

const judgeLabel = process.env.ANTHROPIC_API_KEY ? "LIVE" : "STAND-IN";
const judge: Judge = process.env.ANTHROPIC_API_KEY ? createAnthropicJudge() : createStandInJudge(["intervene", "ok"]);

type Ev = TutorEvaluation & { evaluation_id: string; draft_rev: number; created_at_utc: string; updated_at_utc: string };
const drafts: { draft_rev: number; decision: string; reason: string; updated_at_utc: string }[] = [];
const evaluations: Ev[] = [];

async function draftAndReview(rev: number) {
  const d = unseen.drafts[rev - 1];
  const at = tick(30);
  drafts.push({ draft_rev: rev, ...d, updated_at_utc: at });
  head("FIXTURE", `Learner draft rev ${rev}`);
  line(`decision: "${d.decision}"  reason: "${d.reason}"`);

  const screens = fromPracticeState({
    draft: { draft_revision: rev, region: unseen.learner_region },
    frame: { frame_id: `frm-e2e-${rev}`, captured_at_utc: at, draft_revision: rev },
    case_id: unseen.case_view.case_id,
    frame_size: unseen.frame_size,
    now_utc: at,
  });
  const screen = screenContextFor(screens, { draft_rev: rev, case_id: unseen.case_view.case_id });
  line(`[REAL observation] ${describeScreenContext(screens)}`);

  head(`REAL guards + ${judgeLabel} judge`, `Pre-save review of rev ${rev} (judge: ${judge.name})`);
  const created = tick(1);
  const r = await evaluate(
    { draft: { draft_rev: rev, decision: d.decision, reason: d.reason, visual_context: describeScreenContext(screen) }, case_view: unseen.case_view, knowledge: { candidates: pinnedCandidates, ctx: s.ctx } },
    judge
  );
  const ev: Ev = { ...r, evaluation_id: `ev-e2e-${rev}`, draft_rev: rev, created_at_utc: created, updated_at_utc: tick(4) };
  evaluations.push(ev);
  line(`outcome: ${r.outcome}`);
  r.cited.forEach(c => line(`cited: ${c.entry_id}@${c.revision_id} exchange ${c.exchange_ids.join(", ")} "${c.quote}"`));
  r.evidence.forEach(e => line(`expert example: event ${e.event_id} → ${e.highlighted_image_ref}`));
  if (r.guard_notes.length) line(`guard notes: ${r.guard_notes.join("; ")}`);
  line("feedback_text:");
  line(`  ${r.feedback_text.replaceAll("\n", "\n  ")}`);
  return { ev, screen };
}

async function askTutor(contextTexts: string[], learnerLines: string[]): Promise<string[]> {
  const { ElevenLabsClient } = await import("@elevenlabs/elevenlabs-js");
  const agentId = process.env.ELEVENLABS_AGENT_ID_TUTOR?.trim();
  if (!agentId || !process.env.ELEVENLABS_API_KEY) return ["(skipped: ELEVENLABS_AGENT_ID_TUTOR / ELEVENLABS_API_KEY missing)"];
  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
  const cfg = await client.conversationalAi.agents.get(agentId);
  const history: { role: "user" | "agent"; message: string; timeInCallSecs: number }[] = [{ role: "agent", message: cfg.conversationConfig.agent?.firstMessage ?? "", timeInCallSecs: 0 }];
  // Simulations cannot carry contextual updates, so the blocks are injected as user-role turns (as in the probes).
  contextTexts.forEach((t, i) => history.push({ role: "user", message: t, timeInCallSecs: i + 1 }));
  const replies: string[] = [];
  for (const [i, said] of learnerLines.entries()) {
    history.push({ role: "user", message: said, timeInCallSecs: 10 + i * 10 });
    const res = await client.conversationalAi.agents.simulateConversation(agentId, {
      simulationSpecification: { simulatedUserConfig: { firstMessage: said, language: "en", prompt: { prompt: "Reply only with 'ok'." } }, partialConversationHistory: history },
      newTurnsLimit: 3,
    });
    const turns = res.simulatedConversation.slice(history.length);
    const end = turns.findIndex(t => t.role === "user");
    const reply = (end >= 0 ? turns.slice(0, end) : turns).filter(t => t.role === "agent" && t.message).map(t => t.message).join(" ");
    replies.push(reply || "(no spoken reply)");
    history.push({ role: "agent", message: reply, timeInCallSecs: 15 + i * 10 });
  }
  return replies;
}

// 6–7. Wrong draft, caught before save ----------------------------------------------------------
const first = await draftAndReview(1);

head("STAND-IN (WS6 commit guard)", "Learner presses Save on rev 1");
const blocked = commitStandIn({ evaluation: { ...first.ev, status: "done" }, current_draft_rev: 1, knowledge_current: true });
line(blocked.ok ? "COMMITTED (unexpected)" : `blocked: ${blocked.code}`);

head("REAL", "Tutor context block for the voice agent (sendContextualUpdate, silent)");
const block1 = buildEvaluationContextBlock({ evaluation_id: first.ev.evaluation_id, draft_rev: 1, evaluation: first.ev, knowledge: { candidates: s.candidates, ctx: s.ctx }, screen: first.screen });
line(`contextId: ${block1.contextId}`);
line(block1.text);
const deliveredAt = tick(2);

if (liveTutor) {
  head("LIVE (ElevenLabs tutor agent, text simulation)", "What the tutor says");
  const replies = await askTutor([sessionBlock.text, block1.text], ["It says I can't save this. Why not?", "I'm not sure. What exactly did the expert say?"]);
  line(`learner: "It says I can't save this. Why not?"`);
  line(`tutor:   ${replies[0]}`);
  line(`learner: "I'm not sure. What exactly did the expert say?"`);
  line(`tutor:   ${replies[1] ?? ""}`);
}

// 8. Corrected draft, saved ---------------------------------------------------------------------
const second = await draftAndReview(2);
head("STAND-IN (WS6 commit guard)", "Learner presses Save on rev 2");
const saved = commitStandIn({ evaluation: { ...second.ev, status: "done" }, current_draft_rev: 2, knowledge_current: checkPinnedKnowledge(pinnedRefs, s.candidates, s.ctx).status === "current" });
const commit = { commit_id: "cm-e2e-1", draft_rev: 2, evaluation_id: second.ev.evaluation_id, at_utc: tick(5), escalated: false };
line(saved.ok ? `committed: ${commit.commit_id} (draft rev 2, evaluation ${commit.evaluation_id})` : `blocked: ${saved.code}`);

// 9. Assessment -----------------------------------------------------------------------------------
head("REAL", "Learning assessment (buildAssessment + renderAssessmentMarkdown)");
const assessEvals: AssessmentEvaluation[] = evaluations.map(e => ({
  evaluation_id: e.evaluation_id,
  draft_rev: e.draft_rev,
  status: "done",
  outcome: e.outcome,
  cited: e.cited,
  escalation: e.escalation,
  created_at_utc: e.created_at_utc,
  updated_at_utc: e.updated_at_utc,
}));
const commits = saved.ok ? [commit] : [];
const timeline = buildTimeline(drafts, assessEvals, commits, [{ evaluation_id: first.ev.evaluation_id, at_utc: deliveredAt }]);
const assessment = buildAssessment({ session_id: SESSION_ID, timeline, evaluations: assessEvals, commits, drafts, knowledge: { pinned }, source: "fixture", created_at_utc: tick(1) });
const md = renderAssessmentMarkdown(assessment);
const outDir = join(E2E_FIXTURES_DIR, "output");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, `assessment-${SESSION_ID}.md`), md);
writeFileSync(join(outDir, `assessment-${SESSION_ID}.json`), `${JSON.stringify(assessment, null, 2)}\n`);
line(`timeline: ${timeline.map(t => `${t.kind}(rev ${t.draft_rev}${t.intervention ? `, ${t.intervention}` : ""})`).join(" → ")}`);
line(`written: fixtures/ws5/e2e/output/assessment-${SESSION_ID}.md`);
line(md);

// 10. Trust: revoke the cited guardrail -------------------------------------------------------------
head("STAND-IN (WS6 revoke route) + REAL", "Expert revokes the cited guardrail; propagation");
const cited = first.ev.cited[0];
if (cited) {
  const target = s.candidates.find(c => c.entry.entry_id === cited.entry_id && c.entry.revision_id === cited.revision_id)!.entry;
  const after = withRevision(s.candidates, revokeRevision(target, "expert withdrew it (demo)", tick(60)));
  const pin = checkPinnedKnowledge(pinnedRefs, after, s.ctx);
  line(`pinned session check: ${pin.status}${pin.status === "knowledge_changed" ? ` → ${pin.changed.map(c => `${c.entry_id}@${c.revision_id} (${c.reason})`).join(", ")}` : ""}`);
  line(`dependents flagged: ${flagDependents({ candidates: after, revoked: [cited], current_revision_by_entry: s.ctx.current_revision_by_entry }).map(f => `${f.entry_id} (${f.reason} via ${f.via.join(", ")})`).join(", ") || "none"}`);
  try {
    buildEvaluationContextBlock({ evaluation_id: first.ev.evaluation_id, draft_rev: 1, evaluation: first.ev, knowledge: { candidates: after, ctx: s.ctx }, screen: first.screen });
    line("tutor context block: DELIVERED (unexpected)");
  } catch (e) {
    line(`tutor context block for ${first.ev.evaluation_id}: refused (${(e as TutorContextError).message})`);
  }
  if (pin.status === "knowledge_changed") line(`sent to the tutor instead:\n${buildKnowledgeChangedBlock({ session_id: SESSION_ID, withdrawn: pin.changed }).text}`);
  const repinned = after.filter(c => isTeachable(c, s.ctx).ok);
  const retry = await evaluate(
    { draft: { draft_rev: 3, ...unseen.drafts[0], visual_context: null }, case_view: unseen.case_view, knowledge: { candidates: repinned, ctx: s.ctx } },
    process.env.ANTHROPIC_API_KEY ? judge : createStandInJudge(["uncertain"])
  );
  const outcomeNote = process.env.ANTHROPIC_API_KEY ? "" : " (scripted by the stand-in judge; only the citations are checked here)";
  line(`re-review of the wrong draft with re-pinned knowledge: outcome ${retry.outcome}${outcomeNote}; cites ${retry.cited.map(c => c.entry_id).join(", ") || "nothing"}; revoked entry cited: ${retry.cited.some(c => c.entry_id === cited.entry_id)}`);
}

// 11. ID chain -------------------------------------------------------------------------------------
head("SUMMARY", "ID chain from the expert's words to the learner's feedback");
if (cited) {
  line(`expert words   sx-002 "${sx002.answer_lines.find(l => l.text.includes(cited.quote))?.text ?? cited.quote}" (event ${sx002.event_id}, on_record, FIXTURE)`);
  line(`→ knowledge    ${cited.entry_id}@${cited.revision_id}, confirmed via cnf-sx-002 / sx-011, pinned for ${SESSION_ID}`);
  line(`→ unseen case  ${unseen.case_view.case_id} (never shown to the expert), draft rev 1 "${unseen.drafts[0].decision}"`);
  line(`→ evaluation   ${first.ev.evaluation_id} outcome ${first.ev.outcome}, cites ${cited.entry_id} exchange ${cited.exchange_ids.join(", ")} (judge: ${judge.name})`);
  line(`→ save         rev 1 ${blocked.ok ? "SAVED" : `blocked (${(blocked as { code: string }).code})`}`);
  line(`→ tutor block  ${block1.contextId} (expert_quote 1 = the same words)`);
  line(`→ correction   rev 2 "${unseen.drafts[1].decision}" → ${second.ev.evaluation_id} outcome ${second.ev.outcome} → ${saved.ok ? `commit ${commit.commit_id}` : "not saved"}`);
  line(`→ assessment   ${assessment.decisions.map(d => d.outcome_class).join(", ")}; practise next: ${assessment.practice_next.map(p => p.entry_id).join(", ") || "nothing"}; limitation: "${assessment.limitations[0]}"`);
}
