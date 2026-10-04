/** Small "Workspace" label above a screen title, as in the iOS app. Decorative: the h1 carries the name. */
export function PageEyebrow({ label = "Workspace" }: { label?: string }) {
  return (
    <p className="page-eyebrow" aria-hidden="true">
      <GridIcon />
      {label}
    </p>
  );
}

export function GridIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" focusable="false">
      <rect x="2.25" y="2.25" width="4.5" height="4.5" rx="1" />
      <rect x="9.25" y="2.25" width="4.5" height="4.5" rx="1" />
      <rect x="2.25" y="9.25" width="4.5" height="4.5" rx="1" />
      <rect x="9.25" y="9.25" width="4.5" height="4.5" rx="1" />
    </svg>
  );
}
