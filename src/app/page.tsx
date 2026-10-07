"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo, Mascot, Swirls } from "@/components/brand";
import { Button, ButtonLink } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/hooks";

const SCHEDULE = [
  { t: "6:30", label: "Kick-off", kind: "kickoff" },
  { t: "6:35", label: "Focus", kind: "focus" },
  { t: "7:00", label: "Break", kind: "break" },
  { t: "7:05", label: "Focus", kind: "focus" },
  { t: "7:30", label: "Break", kind: "break" },
  { t: "7:35", label: "Focus", kind: "focus" },
  { t: "8:00", label: "Break", kind: "break" },
  { t: "8:05", label: "Focus", kind: "focus" },
] as const;

const CHAIN = ["active", "active", "active", "missed", "active", "active", "rest", "active", "active", "active", "active", "missed", "active", "today"] as const;

export default function Landing() {
  const router = useRouter();
  const hydrated = useHydrated();
  const onboarded = useStore((s) => s.profile.onboarded);
  const loadDemo = useStore((s) => s.loadDemo);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 md:px-6">
        <Logo height={30} />
        <nav className="flex items-center gap-2">
          {hydrated && onboarded ? (
            <ButtonLink href="/home" size="sm">
              Open DreamHub
            </ButtonLink>
          ) : (
            <ButtonLink href="/start" variant="secondary" size="sm">
              Log in
            </ButtonLink>
          )}
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-6 md:grid-cols-[1.1fr_1fr] md:items-center md:px-6 md:pt-10">
        <div>
          <h1 className="text-[2.6rem] leading-[1.02] font-bold tracking-[-0.03em] text-ink sm:text-6xl">
            Stop procrastinating. Start getting things done.
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg text-muted md:text-xl">
            Break overwhelming goals into small steps, set deadlines that actually stick, and work alongside other people every evening from 6:30 to 8:30.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/start" size="lg">
              🚀 Start getting things done
            </ButtonLink>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                loadDemo();
                router.push("/home");
              }}
            >
              Try the demo
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted">Free to start. No credit card.</p>
        </div>

        <div className="relative isolate overflow-hidden rounded-[18px] border-2 border-ink bg-blue p-6 text-white shadow-brut md:p-8">
          <Swirls />
          <div className="relative">
            <p className="flex items-center gap-2 font-semibold">
              <span className="live-dot inline-block size-3 rounded-full border-2 border-ink bg-[#5CFFB0]" aria-hidden />
              Focus Hour is live · 142 people focusing
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2" aria-hidden>
              {[
                ["Priya", "Stats revision", 330],
                ["You", "Literature review", 220],
                ["Tom", "800 words", 20],
                ["Sam", "Invoices", 160],
                ["Mei", "Pitch slides", 270],
                ["Ruth", "Lab report", 200],
              ].map(([n, g, h]) => (
                <div key={n as string} className="rounded-[10px] border-2 border-ink p-2.5" style={{ background: `hsl(${h} 60% 88%)`, color: "var(--dh-ink)" }}>
                  <p className="text-sm font-bold">{n}</p>
                  <p className="text-xs leading-tight opacity-80">{g}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-white/80">Block 2 of 4</p>
                <p className="text-5xl font-bold tabular-nums tracking-tight">14:32</p>
              </div>
              <Mascot mood="determined" size={92} />
            </div>
          </div>
        </div>
      </section>

      {/* How it works — a real sequence, so numbered */}
      <section id="how" className="border-y-2 border-ink bg-haze">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight md:text-4xl">From “I need to do this” to “I’m doing it”</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-4">
            {[
              ["Break it down", "Tell us the goal. We split it into steps small enough to start in five minutes."],
              ["Set a deadline", "We spread mini-deadlines across the steps and share them with your buddies."],
              ["Focus together", "Every evening at 6:30, join the Focus Hour. Cameras optional, mics muted."],
              ["Never miss twice", "Miss a day and your streak is safe. Just come back tomorrow."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-[var(--dh-radius)] border-2 border-ink bg-surface p-5 shadow-brut">
                <span className="grid size-9 place-items-center rounded-full border-2 border-ink bg-blue text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 text-lg font-semibold">{t}</h3>
                <p className="mt-1.5 text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Focus Hour */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_1.2fr] md:items-center md:px-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Every evening, 6:30 to 8:30</h2>
          <p className="mt-4 text-lg text-muted">
            No booking, no waiting to be matched. Turn up, say what you’ll finish, and work alongside everyone else. Join or leave at any break.
          </p>
          <p className="mt-3 text-lg text-muted">Can’t make it? Host your own session and invite friends, or focus solo any time.</p>
        </div>
        <div className="rounded-[var(--dh-radius)] border-2 border-ink bg-surface p-5 shadow-brut">
          <ol className="grid grid-cols-[repeat(8,minmax(0,1fr))] gap-1" aria-label="Focus Hour schedule">
            {SCHEDULE.map((s, i) => (
              <li key={i} className="flex flex-col gap-1.5">
                <span
                  className={
                    s.kind === "focus"
                      ? "h-16 rounded-[6px] border-2 border-ink bg-blue"
                      : s.kind === "break"
                        ? "h-16 rounded-[6px] border-2 border-ink bg-haze"
                        : "h-16 rounded-[6px] border-2 border-dashed border-ink bg-surface"
                  }
                  style={{ flexGrow: 1 }}
                />
                <span className="text-[11px] font-semibold leading-tight sm:text-xs">{s.label}</span>
                <span className="text-[11px] text-muted sm:text-xs">{s.t}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted">Four 25-minute blocks with 5-minute check-ins. UK time, shown in yours.</p>
        </div>
      </section>

      {/* Never miss twice */}
      <section className="border-t-2 border-ink bg-ink text-white">
        <div className="relative isolate mx-auto grid max-w-6xl gap-10 overflow-hidden px-4 py-16 md:grid-cols-2 md:items-center md:px-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Missing one day isn’t failure</h2>
            <p className="mt-4 text-lg text-white/80">
              Your streak only resets if you miss two days in a row. Miss once and tomorrow becomes a save day: your buddies get a nudge, and you get a warm way back.
            </p>
          </div>
          <div>
            <ol className="flex items-end gap-1.5" aria-label="Example streak">
              {CHAIN.map((c, i) => (
                <li
                  key={i}
                  className={
                    c === "active"
                      ? "h-10 w-5 rounded-[5px] border-2 border-white bg-sky"
                      : c === "missed"
                        ? "h-10 w-5 rounded-[5px] border-2 border-white bg-save"
                        : c === "rest"
                          ? "h-10 w-5 rounded-[5px] border-2 border-dashed border-white/60"
                          : "h-12 w-5 rounded-[5px] border-2 border-white bg-white"
                  }
                />
              ))}
            </ol>
            <p className="mt-4 text-white/80">13-day streak, with two misses saved and one rest day.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center md:px-6">
        <Mascot mood="waving" size={110} className="mx-auto" />
        <h2 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">You’re not lazy. You just need someone to start with.</h2>
        <div className="mt-8 flex justify-center">
          <ButtonLink href="/start" size="lg">
            🚀 Start getting things done
          </ButtonLink>
        </div>
      </section>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted md:px-6">
          <Logo height={20} />
          <p>For adults 18+. Sessions are never recorded.</p>
          <Link href="/start" className="font-semibold text-ink underline underline-offset-4">
            Get started
          </Link>
        </div>
      </footer>
    </div>
  );
}
