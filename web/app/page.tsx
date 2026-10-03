import Link from "next/link";

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
      <h1>Track Inspect</h1>
      <div className="entry-options">
        {OPTIONS.map(option => (
          <Link key={option.href} href={option.href} className="entry-card">
            <h2>{option.title}</h2>
            <p>{option.text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
