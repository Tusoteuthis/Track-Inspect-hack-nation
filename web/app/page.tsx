import Link from "next/link";
import { APP_NAME, APP_TAGLINE, AppLogo } from "@/components/shell/AppLogo";
import { NavIcon } from "@/components/shell/AppNav";

const OPTIONS = [
  {
    href: "/expert",
    title: "Expert session",
    text: "Companion view while the expert points at traces with the glasses and talks to the apprentice.",
  },
  {
    href: "/practice",
    title: "Newcomer practice",
    text: "Work through an unseen trace with the voice tutor and save a reviewed decision.",
  },
  {
    href: "/map",
    title: "Work Map",
    text: "Browse the confirmed workflow with the expert's evidence and words for every step.",
  },
] as const;

export default function EntryPage() {
  return (
    <section className="entry">
      {/* Lockup as in the logo: mark, wordmark, orange rule, tagline. */}
      <div className="entry-hero">
        <AppLogo size={112} />
        <div className="entry-wordmark">
          <h1>{APP_NAME}</h1>
          <span className="entry-rule" aria-hidden="true" />
          {/* Broken as in the logo; the text itself stays one sentence for screen readers. */}
          <p className="entry-tagline" aria-label={APP_TAGLINE}>
            <span aria-hidden="true">Neural Smart Perception</span>
            <span aria-hidden="true">for Critical Tasks</span>
          </p>
        </div>
      </div>
      <p className="entry-lede">Capture how experts read railway sensor traces, and teach it to the next inspector.</p>
      <div className="entry-options">
        {OPTIONS.map(option => (
          <Link key={option.href} href={option.href} className="entry-card">
            <h2>
              <NavIcon href={option.href} />
              {option.title}
            </h2>
            <p>{option.text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
