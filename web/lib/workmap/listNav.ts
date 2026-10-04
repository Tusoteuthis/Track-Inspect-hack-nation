// Keyboard model of the Work Map process list: arrows move by one (no wrap),
// Home/End jump. Enter/Space are left to the native button.
const NEXT = new Set(["ArrowDown", "ArrowRight"]);
const PREV = new Set(["ArrowUp", "ArrowLeft"]);

/** The id to focus after `key`, or undefined when the key is not a navigation key. */
export function navigate(ids: readonly string[], activeId: string | null, key: string): string | undefined {
  if (ids.length === 0) return undefined;
  const at = activeId === null ? -1 : ids.indexOf(activeId);
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  if (at === -1 && (NEXT.has(key) || PREV.has(key))) return ids[0];
  if (NEXT.has(key)) return ids[Math.min(at + 1, ids.length - 1)];
  if (PREV.has(key)) return ids[Math.max(at - 1, 0)];
  return undefined;
}

/** The single item that takes Tab focus (roving tabindex). */
export function rovingId(ids: readonly string[], activeId: string | null, selectedId: string | null): string | null {
  if (activeId !== null && ids.includes(activeId)) return activeId;
  if (selectedId !== null && ids.includes(selectedId)) return selectedId;
  return ids[0] ?? null;
}
