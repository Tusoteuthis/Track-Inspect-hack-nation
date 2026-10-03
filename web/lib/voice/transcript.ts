// Turns raw ElevenLabs conversation events into transcript lines.
// `onMessage` delivers final user/agent turns; `onDebug` delivers the agent's
// tentative (still streaming) response, which a final turn later replaces.

export type TranscriptLine = {
  id: string;
  role: "user" | "agent";
  text: string;
  tentative: boolean;
  /** Epoch ms when the line was first received, for linking speech to other events. */
  at: number;
};

type ConversationMessage = { source: "user" | "ai"; message: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractMessageText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return null;
  if (typeof value.message === "string") return value.message;
  if (typeof value.text === "string") return value.text;
  return null;
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!isRecord(value)) return false;
  if (value.source !== "user" && value.source !== "ai") return false;
  return extractMessageText(value.message) !== null;
}

/** Final turn from `onMessage`, or null if the event is not a usable message. */
export function finalLineFrom(event: unknown): { role: TranscriptLine["role"]; text: string } | null {
  if (!isConversationMessage(event)) return null;
  const text = extractMessageText(event.message)?.trim();
  if (!text) return null;
  return { role: event.source === "ai" ? "agent" : "user", text };
}

/** Tentative agent text from `onDebug`, or null for any other debug event. */
export function tentativeTextFrom(event: unknown): string | null {
  if (!isRecord(event) || event.type !== "internal_tentative_agent_response") return null;
  const payload = event.tentative_agent_response_internal_event;
  if (!isRecord(payload) || typeof payload.tentative_agent_response !== "string") return null;
  return payload.tentative_agent_response.trim() || null;
}

/** Appends a final line, replacing a pending tentative line of the same role and skipping exact repeats. */
export function appendFinal(
  prev: TranscriptLine[],
  line: { role: TranscriptLine["role"]; text: string },
  nextId: () => string
): TranscriptLine[] {
  const last = prev[prev.length - 1];
  if (last?.role === line.role && last.tentative) {
    return [...prev.slice(0, -1), { ...last, text: line.text, tentative: false }];
  }
  if (last?.role === line.role && last.text === line.text) return prev;
  return [...prev, { id: nextId(), ...line, tentative: false, at: Date.now() }];
}

/** Updates (or starts) the trailing tentative agent line. */
export function appendTentative(
  prev: TranscriptLine[],
  text: string,
  nextId: () => string
): TranscriptLine[] {
  const last = prev[prev.length - 1];
  if (last?.role === "agent" && last.tentative) {
    return [...prev.slice(0, -1), { ...last, text }];
  }
  return [...prev, { id: nextId(), role: "agent", text, tentative: true, at: Date.now() }];
}
