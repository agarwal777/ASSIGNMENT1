"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Newspaper, Search } from "lucide-react";
import { copy } from "@/lib/copy";

const ITEMS = [
  { href: "/today", label: copy.nav.today, Icon: Newspaper },
  { href: "/portfolio", label: copy.nav.portfolio, Icon: Briefcase },
  { href: "/ask", label: copy.nav.ask, Icon: Search },
] as const;

/** Three tabs: Today (Push), Portfolio (entry to Pull), Ask (Pull on demand). 56 px, safe-area aware. */
export default function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex h-14 max-w-[480px]">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link href={href} aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active ? "text-accent" : "text-ink-3"}`}>
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
