import { describe, expect, it } from "vitest";
import { navigate, rovingId } from "@/lib/workmap/listNav";

const ids = ["a", "b", "c"];

describe("navigate", () => {
  it("moves down/right and up/left without wrapping", () => {
    expect(navigate(ids, "a", "ArrowDown")).toBe("b");
    expect(navigate(ids, "b", "ArrowRight")).toBe("c");
    expect(navigate(ids, "c", "ArrowDown")).toBe("c");
    expect(navigate(ids, "b", "ArrowUp")).toBe("a");
    expect(navigate(ids, "b", "ArrowLeft")).toBe("a");
    expect(navigate(ids, "a", "ArrowUp")).toBe("a");
  });

  it("jumps with Home and End", () => {
    expect(navigate(ids, "b", "Home")).toBe("a");
    expect(navigate(ids, "a", "End")).toBe("c");
  });

  it("starts at the first item when nothing valid is active", () => {
    expect(navigate(ids, null, "ArrowDown")).toBe("a");
    expect(navigate(ids, "gone", "ArrowUp")).toBe("a");
  });

  it("ignores other keys and empty lists", () => {
    expect(navigate(ids, "a", "Enter")).toBeUndefined();
    expect(navigate(ids, "a", "x")).toBeUndefined();
    expect(navigate([], null, "ArrowDown")).toBeUndefined();
  });
});

describe("rovingId", () => {
  it("prefers the active item, then the selected one, then the first", () => {
    expect(rovingId(ids, "b", "c")).toBe("b");
    expect(rovingId(ids, "gone", "c")).toBe("c");
    expect(rovingId(ids, null, "gone")).toBe("a");
    expect(rovingId([], null, null)).toBeNull();
  });
});
