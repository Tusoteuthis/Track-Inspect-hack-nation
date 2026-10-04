// Voice agent status shown to people, derived from the real ElevenLabs
// conversation state (status + speaking mode). Shared by tutor and companion.
export type AgentState = "listening" | "speaking" | "waiting" | "disconnected";

export function agentState(status: string, isSpeaking: boolean): AgentState {
  if (status === "connected") return isSpeaking ? "speaking" : "listening";
  if (status === "connecting") return "waiting";
  return "disconnected";
}
