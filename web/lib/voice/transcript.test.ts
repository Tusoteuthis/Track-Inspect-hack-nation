import { describe, expect, it } from "vitest";
import { appendFinal, appendTentative, type TranscriptLine } from "./transcript";

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
