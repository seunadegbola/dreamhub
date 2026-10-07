"use client";

import clsx from "clsx";
import { useNow } from "@/lib/hooks";
import { focusHourBanner, FOCUS_HOUR } from "@/lib/domain/session";
import { formatClock, formatCountdown, HOUR } from "@/lib/domain/time";
import { useStore } from "@/lib/store";
import { ButtonLink, Button } from "./ui";
import { Swirls } from "./brand";
import { liveCount } from "@/lib/people";

/** The Focus Hour banner changes through the day (PRD §14). */
export function FocusHourBanner({ compact = false }: { compact?: boolean }) {
  const now = useNow(1000);
  const tz = useStore((s) => s.profile.timezone);
  const showToast = useStore((s) => s.showToast);
  const b = focusHourBanner(now);
  const local = (t: number) => formatClock(t, tz);

  let title: string;
  let sub: string;
  let action: React.ReactNode;

  switch (b.state) {
    case "later": {
      const ms = b.startsAt - now;
      title = `Focus Hour starts at ${local(b.startsAt)}`;
      sub = ms < 6 * HOUR ? `In ${formatCountdown(ms)}. Two hours of focusing alongside everyone else.` : "Every evening, two hours of focusing alongside everyone else.";
      action = (
        <Button variant="secondary" onClick={() => showToast(`We'll remind you at ${local(b.startsAt - 5 * 60_000)}.`)}>
          Remind me
        </Button>
      );
      break;
    }
    case "soon":
      title = `Focus Hour starts in ${formatCountdown(b.startsAt - now)}`;
      sub = `${liveCount(now, "soon")} people are getting ready. Join early and set your goal.`;
      action = (
        <ButtonLink href="/room/focus-hour" variant="secondary" size="lg">
          Join
        </ButtonLink>
      );
      break;
    case "live": {
      const n = liveCount(now, "live");
      title = n >= 10 ? `Focus Hour is live · ${n} people focusing` : "Focus Hour is live · join the table";
      sub =
        b.segment.kind === "break"
          ? `Break now, so it's a great moment to join. Ends at ${local(b.endsAt)}.`
          : b.segment.kind === "kickoff"
            ? `Kick-off: everyone's setting tonight's goal. Ends at ${local(b.endsAt)}.`
            : `Block ${b.segment.block} of ${FOCUS_HOUR.shape.blocks}. Join quietly any time. Ends at ${local(b.endsAt)}.`;
      action = (
        <ButtonLink href="/room/focus-hour" variant="secondary" size="lg">
          Join now
        </ButtonLink>
      );
      break;
    }
    case "done":
      title = `Back tomorrow at ${local(b.nextStartsAt)}`;
      sub = "Tonight's Focus Hour has wrapped up. You can still focus on your own.";
      action = (
        <ButtonLink href="/room/solo" variant="secondary">
          Start solo
        </ButtonLink>
      );
      break;
  }

  return (
    <section
      className={clsx(
        "relative isolate overflow-hidden rounded-[var(--dh-radius)] border-2 border-ink bg-blue text-white shadow-brut",
        compact ? "p-4" : "p-5 md:p-6",
      )}
      aria-live="polite"
    >
      <Swirls />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xl md:text-2xl font-semibold tracking-tight">
            {b.state === "live" && <span className="live-dot inline-block size-3 rounded-full bg-[#5CFFB0] border-2 border-ink" aria-hidden />}
            {title}
          </p>
          <p className="mt-1 text-white/85">{sub}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </section>
  );
}
