"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAME, AppLogo } from "./AppLogo";
import { GridIcon } from "./PageEyebrow";

export const NAV_ITEMS = [
  { href: "/expert", label: "Expert session" },
  { href: "/review", label: "Review" },
  { href: "/map", label: "Work Map" },
  { href: "/practice", label: "Practice" },
  { href: "/summary", label: "Summary" },
  { href: "/dev", label: "Dev" },
] as const;

export type NavHref = (typeof NAV_ITEMS)[number]["href"];

/** 16px stroke icons, decorative only: every link carries its text label. */
const ICON_PATHS: Record<NavHref, string> = {
  "/expert": "M8 1.75a2.25 2.25 0 0 0-2.25 2.25v3.5a2.25 2.25 0 0 0 4.5 0V4A2.25 2.25 0 0 0 8 1.75ZM3.75 7.25a4.25 4.25 0 0 0 8.5 0M8 11.5v2.75",
  "/review": "M3 2.75h10v10.5H3zM5.5 6l1.5 1.5L10.5 4.5M5.5 10.5h5",
  "/map": "M2.5 4.25 6 2.75l4 1.5 3.5-1.5v9l-3.5 1.5-4-1.5-3.5 1.5zM6 2.75v9M10 4.25v9",
  "/practice": "M8 2.25 1.75 5.5 8 8.75l6.25-3.25zM4 6.75v3.5c0 1 1.8 2 4 2s4-1 4-2v-3.5",
  "/summary": "M2.75 13.25V8.5M6.25 13.25v-7M9.75 13.25V3.5M13.25 13.25V9.75",
  "/dev": "M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5",
};

export function NavIcon({ href }: { href: NavHref }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[href]} />
    </svg>
  );
}

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="app-nav" aria-label="Main">
      <Link href="/" className="app-nav-brand">
        <AppLogo size={30} />
        {APP_NAME}
      </Link>
      <div>
        <p className="app-nav-section" aria-hidden="true">
          <GridIcon />
          Workspace
        </p>
        <ul>
          {NAV_ITEMS.map(item => {
            const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                {/* Current page: aria-current + filled row + side bar, not colour alone. */}
                <Link href={item.href} className="nav-link" aria-current={current ? "page" : undefined}>
                  <NavIcon href={item.href} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
