// Labelled draft fixtures for the tutor evaluation (source: "fixture", placeholder wording).
// The labels are the harness's expectations. They live here, outside lib/knowledge/, and the
// anti-cheating test fails if runtime modules reference them.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvaluationOutcome, LearnerCaseView, LearnerDraftInput } from "@/lib/knowledge/evaluation-types";

export const DRAFTS_DIR = dirname(fileURLToPath(import.meta.url));

export type DraftLabel = {
  outcome: EvaluationOutcome;
  must_cite_any?: string[];
  never_cite: string[];
  uncertain_requires?: "escalation_or_missing_context";
  policy_note?: string;
};

export type DraftFixture = {
  source: "fixture";
  draft_id: string;
  class: string;
  label: DraftLabel;
  case_view: LearnerCaseView;
  draft: LearnerDraftInput;
};

export function loadDraftFixtures(): DraftFixture[] {
  return readdirSync(DRAFTS_DIR)
    .filter(f => /^d\d+.*\.json$/.test(f))
    .sort()
    .map(f => JSON.parse(readFileSync(join(DRAFTS_DIR, f), "utf8")) as DraftFixture);
}
