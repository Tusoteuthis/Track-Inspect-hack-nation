// Single-key shortcuts for the companion's control rail. Keys typed into a
// field or combined with a modifier are left alone.
export type ShortcutAction = "pause" | "off_record" | "stop" | "toggle_rail";

/** Shown next to each control as the visible hint. */
export const SHORTCUT_KEYS: Record<ShortcutAction, string> = {
  pause: "P",
  off_record: "O",
  stop: "S",
  toggle_rail: "[",
};

const BY_KEY = new Map(Object.entries(SHORTCUT_KEYS).map(([action, k]) => [k.toLowerCase(), action as ShortcutAction]));
const FIELD_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export type KeyInput = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  targetTag: string;
  targetEditable: boolean;
};

export function shortcutFor(e: KeyInput): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.targetEditable || FIELD_TAGS.has(e.targetTag)) return null;
  return BY_KEY.get(e.key.toLowerCase()) ?? null;
}
