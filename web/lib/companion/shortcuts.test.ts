import { describe, expect, it } from "vitest";
import { SHORTCUT_KEYS, shortcutFor } from "@/lib/companion/shortcuts";

const key = (k: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) =>
  shortcutFor({ key: k, ctrlKey: false, metaKey: false, altKey: false, targetTag: "BODY", targetEditable: false, ...extra });

describe("companion shortcuts", () => {
  it.each([
    ["p", "pause"],
    ["P", "pause"],
    ["o", "off_record"],
    ["s", "stop"],
    ["[", "toggle_rail"],
  ] as const)("%s → %s", (k, action) => {
    expect(key(k)).toBe(action);
  });

  it("ignores other keys", () => {
    expect(key("x")).toBeNull();
    expect(key("Enter")).toBeNull();
  });

  it("ignores keys with modifiers (browser shortcuts stay intact)", () => {
    expect(key("s", { metaKey: true })).toBeNull();
    expect(key("p", { ctrlKey: true })).toBeNull();
    expect(key("o", { altKey: true })).toBeNull();
  });

  it("ignores keys typed into fields", () => {
    expect(key("s", { targetTag: "INPUT" })).toBeNull();
    expect(key("s", { targetTag: "TEXTAREA" })).toBeNull();
    expect(key("s", { targetTag: "SELECT" })).toBeNull();
    expect(key("s", { targetEditable: true })).toBeNull();
  });

  it("exposes the visible hint for each action", () => {
    expect(SHORTCUT_KEYS).toEqual({ pause: "P", off_record: "O", stop: "S", toggle_rail: "[" });
  });
});
