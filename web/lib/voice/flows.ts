// Voice flows, one ElevenLabs agent each. Shared by the token route (env lookup)
// and the client (flow picker), so keep it free of server-only imports.
export const FLOWS = {
  expert: { label: "Expert capture", envVars: ["ELEVENLABS_AGENT_ID_EXPERT"] },
  tutor: { label: "Newcomer tutor", envVars: ["ELEVENLABS_AGENT_ID_TUTOR"] },
} as const;

export type Flow = keyof typeof FLOWS;

export function isFlow(value: string): value is Flow {
  return value in FLOWS;
}
