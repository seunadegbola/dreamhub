"use client";

import clsx from "clsx";
import type { DayOutcome } from "@/lib/domain/streak";
import { formatShortDate, weekday } from "@/lib/domain/time";

const LETTER = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The streak chain: one link per day. Solid = active, amber = missed but saved,
 * dashed = rest, cracked red = broken. Today is outlined and pending until it counts.
 */
export function StreakChain({
  outcomes,
  today,
  todayActive,
  days = 14,
  className,
}: {
  outcomes: { date: string; outcome: DayOutcome }[];
  today: string;
  todayActive: boolean;
  days?: number;
  className?: string;
}) {
  const past = outcomes.filter((o) => o.date < today).slice(-(days - 1));
  const items: { date: string; outcome: DayOutcome | "today" }[] = [
    ...past,
    { date: today, outcome: todayActive ? "active" : outcomes.find((o) => o.date === today)?.outcome === "rest" ? "rest" : "today" },
  ];
  return (
    <ol className={clsx("flex items-end gap-1", className)} aria-label="Last two weeks">
      {items.map((it, i) => {
        const isToday = it.date === today;
        return (
          <li key={it.date} className="flex flex-col items-center gap-1" title={`${formatShortDate(it.date)}: ${labelFor(it.outcome)}`}>
            <span
              className={clsx(
                "block h-7 w-4 sm:w-5 rounded-[5px] border-2",
                it.outcome === "active" && "border-ink bg-blue",
                it.outcome === "missed" && "border-ink bg-save",
                it.outcome === "rest" && "border-dashed border-ink/50 bg-transparent",
                it.outcome === "broken" && "border-missed bg-missed-tint",
                it.outcome === "today" && "border-ink bg-surface",
                isToday && "h-9 shadow-brut-sm",
                isToday && it.outcome === "active" && "pop",
              )}
              style={{ animationDelay: `${i * 12}ms` }}
            />
            <span className={clsx("text-[10px] leading-none", isToday ? "font-bold" : "text-muted")}>{LETTER[weekday(it.date)]}</span>
            <span className="sr-only">
              {formatShortDate(it.date)}: {labelFor(it.outcome)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function labelFor(o: DayOutcome | "today") {
  return { active: "showed up", missed: "missed, streak kept", rest: "rest day", broken: "streak reset", today: "not yet today" }[o];
}

export function StreakLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5"><i className="block h-3 w-2.5 rounded-[3px] border-[1.5px] border-ink bg-blue" />Showed up</span>
      <span className="inline-flex items-center gap-1.5"><i className="block h-3 w-2.5 rounded-[3px] border-[1.5px] border-ink bg-save" />Missed, saved</span>
      <span className="inline-flex items-center gap-1.5"><i className="block h-3 w-2.5 rounded-[3px] border-[1.5px] border-dashed border-ink/50" />Rest day</span>
      <span className="inline-flex items-center gap-1.5"><i className="block h-3 w-2.5 rounded-[3px] border-[1.5px] border-missed bg-missed-tint" />Reset</span>
    </div>
  );
}
