// Spoken expert controls (strategy §5–§6): "just listen", "questions again", "skip that", "next".
// Detection is deterministic and conservative: "the next dip" or "I'd skip lunch" must not trigger.
// The agent can apply the same controls via set_interaction_mode / close_topic for phrasings missed here.

export type ExpertControl = "listen_only" | "questions" | "skip" | "next";

const LISTEN_ON =
  /\b(just listen|only listen|just let me (talk|explain|work)|let me just (talk|explain|work)|no (more )?questions( for now| please| right now)?|stop asking( questions)?|hold (your|the) questions)\b/i;
const LISTEN_OFF =
  /\b(you can ask (again|questions( again)?|now)|questions again|go ahead and ask|(you can )?start asking( questions)? again|ask (me )?(your )?questions now)\b/i;
const SKIP_PHRASE = /\b(skip (that|it|this)( one| question)?|let'?s skip (that|it|this)|i'?ll pass( on that)?|pass on that)\b/i;
const SKIP_ALONE = /^\W*(okay|ok|no|um|uh)?[\s,.]*(skip|pass|not now|next question)\W*$/i;
const NEXT_PHRASE = /\b(let'?s move on|moving on( to the next( one)?)?|on to the next( one)?)\b/i;
const NEXT_ALONE = /^\W*(okay|ok|so|right|good|alright|all right)?[\s,.]*(next|next one|move on)\W*$/i;

/** The control a final expert line asks for, if any (at most one; listen controls win). */
export function detectControlPhrase(text: string): ExpertControl | null {
  const t = text.trim();
  if (!t) return null;
  if (LISTEN_OFF.test(t)) return "questions";
  if (LISTEN_ON.test(t)) return "listen_only";
  if (SKIP_ALONE.test(t) || SKIP_PHRASE.test(t)) return "skip";
  if (NEXT_ALONE.test(t) || NEXT_PHRASE.test(t)) return "next";
  return null;
}

/** Tool results for the controls (the probes' mocks use the same words). */
export const CONTROL_RESULT: Record<ExpertControl, string> = {
  listen_only:
    'ok mode=listen_only. Say only "Okay, I\'ll just listen." Then ask nothing and call skip_turn on every turn until the expert invites questions again.',
  questions: 'ok mode=questions. Say only "Okay." Ask at most one question at the next natural pause, never a burst of catch-up questions.',
  skip: "ok question dropped. Never ask it again, not even reworded. Say nothing, or only \"Okay.\", and let the expert continue.",
  next: "ok topic closed. Ask nothing more about that region. Say nothing, or only \"Okay.\", and let the expert continue.",
};
