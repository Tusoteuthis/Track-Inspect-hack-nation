import { describe, expect, it } from "vitest";
import { agentState } from "@/components/practice/TutorPanel";

describe("agentState", () => {
  it.each([
    ["connected", true, "speaking"],
    ["connected", false, "listening"],
    ["connecting", false, "waiting"],
    ["disconnected", false, "disconnected"],
    ["error", false, "disconnected"],
  ] as const)("%s (speaking=%s) → %s", (status, speaking, expected) => {
    expect(agentState(status, speaking)).toBe(expected);
  });
});
