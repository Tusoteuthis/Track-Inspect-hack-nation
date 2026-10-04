/**
 * The NSPCT mark: an eye in viewfinder brackets whose iris is a small network
 * (teal) around an orange pupil. The outline uses --logo-ink, so it stays
 * visible on dark surfaces. Decorative.
 */
export function AppLogo({ size = 24 }: { size?: number }) {
  return (
    <svg
      className="app-logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="var(--logo-ink, #0a1f33)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 14V6a2 2 0 0 1 2-2h10M47 4h10a2 2 0 0 1 2 2v8M59 50v8a2 2 0 0 1-2 2H47M17 60H7a2 2 0 0 1-2-2v-8" />
        <path d="M2.5 32C14 14.5 50 14.5 61.5 32 50 49.5 14 49.5 2.5 32Z" />
      </g>
      <g stroke="#0bb7ab" fill="none" strokeLinecap="round">
        <circle cx="32" cy="32" r="13.5" strokeWidth="2.6" />
        <path strokeWidth="1.6" d="M18.5 32h27M25.25 20.31l13.5 23.38M38.75 20.31l-13.5 23.38" />
      </g>
      <g fill="#0bb7ab">
        <circle cx="45.5" cy="32" r="2.6" />
        <circle cx="38.75" cy="43.69" r="2.6" />
        <circle cx="25.25" cy="43.69" r="2.6" />
        <circle cx="18.5" cy="32" r="2.6" />
        <circle cx="25.25" cy="20.31" r="2.6" />
        <circle cx="38.75" cy="20.31" r="2.6" />
      </g>
      <circle cx="32" cy="32" r="5.4" fill="#fe6b35" />
    </svg>
  );
}

/** Product name and tagline, as written in the logo. */
export const APP_NAME = "NSPCT";
export const APP_TAGLINE = "Neural Smart Perception for Critical Tasks";
