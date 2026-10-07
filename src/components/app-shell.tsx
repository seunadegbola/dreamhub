"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Logo } from "./brand";
import { IconBuddies, IconFocus, IconHome, IconProfile, IconProgress, IconTasks } from "./icons";
import { useStore, selectStreak } from "@/lib/store";
import { useToday } from "@/lib/hooks";
import { Toast } from "./feedback";

const NAV = [
  { href: "/home", label: "Home", Icon: IconHome },
  { href: "/tasks", label: "Tasks", Icon: IconTasks },
  { href: "/focus", label: "Focus", Icon: IconFocus },
  { href: "/buddies", label: "Buddies", Icon: IconBuddies },
  { href: "/progress", label: "Progress", Icon: IconProgress },
  { href: "/profile", label: "Profile", Icon: IconProfile },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const state = useStore();
  const today = useToday();
  const streak = selectStreak(state, today);
  const isActive = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 md:px-6">
          <Link href="/home" aria-label="DreamHub home" className="shrink-0">
            <Logo height={26} />
          </Link>
          <nav aria-label="Main" className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={clsx(
                  "rounded-[8px] px-3 py-2 text-[15px] font-semibold transition-colors",
                  isActive(href) ? "bg-ink text-white" : "text-ink hover:bg-haze/50",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <Link
            href="/progress"
            className={clsx(
              "ml-auto inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-sm font-bold",
              streak.saveDay && !state.activeDays.includes(today) ? "bg-save" : "bg-haze",
            )}
            aria-label={`Streak: ${streak.current} days${streak.saveDay ? ", save day today" : ""}`}
          >
            <span aria-hidden>🔥</span>
            {streak.current}
            {streak.saveDay && !state.activeDays.includes(today) && <span className="font-semibold">· save day</span>}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pt-6 md:px-6 md:pt-8">
        {children}
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-ink bg-surface md:hidden">
        <ul className="grid grid-cols-6">
          {NAV.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={clsx("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold", isActive(href) ? "text-blue" : "text-muted")}
              >
                <span className={clsx("grid h-7 w-11 place-items-center rounded-full", isActive(href) && "bg-haze")}>
                  <Icon width={20} height={20} />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Toast />
    </div>
  );
}
