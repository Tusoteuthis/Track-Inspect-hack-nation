import { describe, expect, it } from "vitest";
import { appendFinal, appendTentative, tentativeTextFrom, type TranscriptLine } from "./transcript";

function idGen() {
  let n = 0;
  return () => `line-${++n}`;
}

describe("appendFinal", () => {
  it("replaces a trailing tentative line of the same role", () => {
    const nextId = idGen();
    const withTentative = appendTentative([], "Which part of the", nextId);
    const next = appendFinal(withTentative, { role: "agent", text: "Which part of the shape?" }, nextId);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: "line-1", text: "Which part of the shape?", tentative: false });
  });

  it("skips an exact repeat of the last final line", () => {
    const nextId = idGen();
    const once = appendFinal([], { role: "user", text: "This region here." }, nextId);
    const twice = appendFinal(once, { role: "user", text: "This region here." }, nextId);

    expect(twice).toBe(once);
  });

  it("appends a new line for a different role", () => {
    const nextId = idGen();
    const prev: TranscriptLine[] = appendFinal([], { role: "agent", text: "What do you see?" }, nextId);
    const next = appendFinal(prev, { role: "user", text: "A dip." }, nextId);

    expect(next.map(l => l.role)).toEqual(["agent", "user"]);
  });
});

describe("tentativeTextFrom", () => {
  it("reads the SDK's onDebug shape", () => {
    expect(tentativeTextFrom({ type: "tentative_agent_response", response: " Which part " })).toBe("Which part");
  });

  it("still reads the raw internal event shape", () => {
    const raw = {
      type: "internal_tentative_agent_response",
      tentative_agent_response_internal_event: { tentative_agent_response: "Which" },
    };
    expect(tentativeTextFrom(raw)).toBe("Which");
  });

  it("ignores other debug events and empty text", () => {
    expect(tentativeTextFrom({ type: "tentative_user_transcript", response: "x" })).toBeNull();
    expect(tentativeTextFrom({ type: "tentative_agent_response", response: "  " })).toBeNull();
  });
});
