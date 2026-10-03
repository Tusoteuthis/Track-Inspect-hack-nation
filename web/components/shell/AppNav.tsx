"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/expert", label: "Expert session" },
  { href: "/review", label: "Review" },
  { href: "/map", label: "Work Map" },
  { href: "/practice", label: "Practice" },
  { href: "/summary", label: "Summary" },
  { href: "/dev", label: "Dev" },
] as const;

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Main">
      <Link href="/" className="app-nav-brand">
        Track Inspect
      </Link>
      <ul>
        {NAV_ITEMS.map(item => {
          const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              {/* Current page: aria-current + bold + underline, not colour alone. */}
              <Link href={item.href} className="nav-link" aria-current={current ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
