// Input guard for the learner case. The tutor may use only what the learner can see; WS4's
// evaluator-only notes (expected answers, scoring) must never reach evaluation. We reject
// rather than strip, so a leak upstream is loud instead of silently "handled".

import type { LearnerCaseView } from "./evaluation-types";

export class EvaluatorFieldError extends Error {
  constructor(readonly path: string) {
    super(`case_view carries evaluator-only material at ${path || "case_view"}; only the learner view is allowed`);
    this.name = "EvaluatorFieldError";
  }
}

// ws5:forbidden-fields:start — the only place answer-key names may appear in lib/knowledge.
// They exist here solely to be rejected (see __tests__/anti-cheating.test.ts).
const FORBIDDEN_KEY = /^(?:expected_.*|acceptable_.*|common_wrong_.*|correct_.*|answer.*|.*_answer|evaluation_notes?|evaluator.*|scoring.*|rubric.*)$/i;
const FORBIDDEN_VALUE = /(?:^|[\\/])(?:\.runtime[\\/])?evaluator(?:[\\/]|$)|EVALUATOR_DIR/;
// ws5:forbidden-fields:end

const ALLOWED_KEYS = new Set(["case_id", "title", "visible_context", "source"]);

function scan(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (FORBIDDEN_VALUE.test(value)) throw new EvaluatorFieldError(path);
    return;
  }
  if (Array.isArray(value)) return value.forEach((v, i) => scan(v, `${path}[${i}]`));
  if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      const p = path ? `${path}.${k}` : k;
      if (FORBIDDEN_KEY.test(k)) throw new EvaluatorFieldError(p);
      scan(v, p);
    }
  }
}

/** Deep scan for evaluator keys/paths anywhere in an object. Used by adapters on raw partner input. */
export function assertNoEvaluatorMaterial(value: unknown, path = ""): void {
  scan(value, path);
}

/** Validates a learner-visible case view and returns a defensive copy. Throws on any doubt. */
export function assertLearnerCaseView(input: unknown): LearnerCaseView {
  assertNoEvaluatorMaterial(input);
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError("case_view must be an object");
  const v = input as Record<string, unknown>;
  for (const k of Object.keys(v)) {
    if (!ALLOWED_KEYS.has(k)) throw new TypeError(`case_view: unexpected field "${k}" (only the learner view is allowed)`);
  }
  if (typeof v.case_id !== "string" || !v.case_id.trim()) throw new TypeError("case_view.case_id must be a non-empty string");
  if (v.title !== null && typeof v.title !== "string") throw new TypeError("case_view.title must be a string or null");
  if (!Array.isArray(v.visible_context) || !v.visible_context.every(s => typeof s === "string")) {
    throw new TypeError("case_view.visible_context must be an array of strings");
  }
  if (v.source !== "live" && v.source !== "fixture" && v.source !== "stub") {
    throw new TypeError('case_view.source must be "live", "fixture" or "stub"');
  }
  return { case_id: v.case_id, title: v.title, visible_context: [...v.visible_context], source: v.source };
}
