import type { z } from "zod";

export type Issue = { path: string; message: string };

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: "validation_failed"; message: string; issues: Issue[] } };

/** Joins a zod issue path with "." (numeric indices included, e.g. `answer_lines.0.text`). Root is "". */
function joinPath(path: readonly PropertyKey[]): string {
  return path.map(p => String(p)).join(".");
}

/** Wraps a zod schema into a non-throwing parser returning a `ParseResult`. */
export function makeParser<S extends z.ZodType>(schema: S): (input: unknown) => ParseResult<z.output<S>> {
  return (input: unknown) => {
    const result = schema.safeParse(input);
    if (result.success) return { ok: true, value: result.data };
    const issues: Issue[] = result.error.issues.map(i => ({ path: joinPath(i.path), message: i.message }));
    const shown = issues.slice(0, 3).map(i => (i.path ? `${i.path}: ${i.message}` : i.message));
    const more = issues.length > 3 ? ` (+${issues.length - 3} more)` : "";
    return {
      ok: false,
      error: { code: "validation_failed", message: `Validation failed: ${shown.join("; ")}${more}`, issues },
    };
  };
}
