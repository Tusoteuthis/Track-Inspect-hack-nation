// Fixed linguistic cues used by deterministic synthesis. They describe how the expert said
// something (hedged, conditional, a stop or an escalation), never what a trace means. Adding a
// domain term here would be inventing knowledge; don't.

export type CueRole = "guardrail" | "exception" | "escalation";

/** Hedges that make a statement a tendency, not a rule. Without a stated exception they become a gap. */
const TENDENCY_HEDGES = /\b(usually|normally|typically|generally|mostly|often|in most cases|most of the time)\b/gi;
/** Hedges that make a stop condition unclear. */
const UNCERTAIN_HEDGES = /\b(maybe|perhaps|probably|might|sometimes|i think|i guess)\b/gi;
/** All qualifiers preserved on an entry ("usually", "only if" …). */
const QUALIFIERS = new RegExp(
  `${TENDENCY_HEDGES.source}|${UNCERTAIN_HEDGES.source}|\\b(only if|only when|unless|except)\\b`,
  "gi"
);

const CUES: readonly { role: CueRole; pattern: RegExp }[] = [
  { role: "escalation", pattern: /\b(escalat\w*|don'?t know|do not know|not sure|unsure)\b/i },
  { role: "guardrail", pattern: /\b(never|stop|must not|do not|don'?t save)\b/i },
  { role: "exception", pattern: /\b(unless|except|only if|only when)\b/i },
];

/** Cue roles a line carries, in fixed order. Escalation implies stopping, so it replaces guardrail. */
export function cueRoles(text: string): CueRole[] {
  const roles = CUES.filter(c => c.pattern.test(text)).map(c => c.role);
  return roles.includes("escalation") ? roles.filter(r => r !== "guardrail") : roles;
}

const matches = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map(m => m[0]);

/** Qualifiers exactly as written (case kept, so they stay verbatim substrings of the quote). */
export const findQualifiers = (text: string): string[] => matches(text, QUALIFIERS);
export const findTendencyHedges = (text: string): string[] => matches(text, TENDENCY_HEDGES);
export const findUncertainHedges = (text: string): string[] => matches(text, UNCERTAIN_HEDGES);
