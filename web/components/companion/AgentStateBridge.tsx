"use client";

// Rendered inside <VoiceSession>: reads the real conversation state and reports
// it upward, so status can be shown outside the voice panel. Sends nothing.
import { useConversationMode, useConversationStatus } from "@elevenlabs/react";
import { useEffect } from "react";
import { agentState, type AgentState } from "@/lib/ui/agentState";

export function AgentStateBridge({ onChange }: { onChange: (state: AgentState) => void }) {
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const state = agentState(status, isSpeaking);
  useEffect(() => onChange(state), [onChange, state]);
  // On unmount the voice session is gone, which is "disconnected", not the last state.
  useEffect(() => () => onChange("disconnected"), [onChange]);
  return null;
}
