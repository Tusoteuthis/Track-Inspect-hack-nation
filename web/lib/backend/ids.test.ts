import path from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "./errors";
import { ID_RE, assertSafeId, isValidId, newId, safeJoin, type IdPrefix } from "./ids";

const BAD_IDS: unknown[] = ["../x", "a/b", "A-B", "-a", "", "a".repeat(65), "a.b", 42, null, undefined];

describe("isValidId / assertSafeId", () => {
  it.each(["a", "abc-123", "ses-20261004-x1", "0", "a".repeat(64)])("accepts %s", (id) => {
    expect(isValidId(id)).toBe(true);
    expect(() => assertSafeId(id)).not.toThrow();
  });

  it.each(BAD_IDS)("rejects %s", (id) => {
    expect(isValidId(id)).toBe(false);
    expect(() => assertSafeId(id, "session_id")).toThrow(ApiError);
    try {
      assertSafeId(id, "session_id");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).code).toBe("validation_failed");
      expect((err as ApiError).status).toBe(400);
    }
  });
});

describe("newId", () => {
  const prefixes: IdPrefix[] = ["ses", "cnf", "evl", "cmt", "rev"];

  it.each(prefixes)("produces a valid %s id with a UTC timestamp", (prefix) => {
    const id = newId(prefix, new Date(Date.UTC(2026, 9, 4, 3, 5, 9)));
    expect(id).toMatch(new RegExp(`^${prefix}-20261004030509-[a-z0-9]{6}$`));
    expect(ID_RE.test(id)).toBe(true);
  });

  it("is random across calls", () => {
    const now = new Date();
    const ids = new Set(Array.from({ length: 50 }, () => newId("ses", now)));
    expect(ids.size).toBe(50);
  });
});

describe("safeJoin", () => {
  const base = path.resolve("/tmp/ws6-base");

  it("joins valid ids under base", () => {
    expect(safeJoin(base, "sessions", "ses-1")).toBe(path.join(base, "sessions", "ses-1"));
  });

  it.each(["..", "../x", "a/b", "A", ".", ""])("rejects segment %s", (seg) => {
    expect(() => safeJoin(base, "ok", seg)).toThrow(ApiError);
  });
});
